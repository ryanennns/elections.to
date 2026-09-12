"""Prepare pinned 2023 results with Python's standard library; no spreadsheet dependency."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
SPECIAL = {96: 'Care homes', 97: 'Mail-in', 98: 'Advance 98', 99: 'Advance 99'}


def summary(votes):
    total = sum(votes)
    return {'votes': votes, 'total': total,
            'leaders': [i for i, v in enumerate(votes) if v == max(votes)] if total else []}


def prepare():
    cache = ROOT / '.cache'
    cache.mkdir(exist_ok=True)
    manifest = json.loads((ROOT / 'scripts/sources.json').read_text())
    sources = manifest['urls']
    hashes = {}
    for name, url in sources.items():
        path = cache / name
        if not path.exists():
            path.write_bytes(urllib.request.urlopen(url, timeout=60).read())
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        if hashes[name] != manifest['sha256'][name]:
            raise ValueError(f'{name} differs from the pinned source; review before updating its hash.')
    z = zipfile.ZipFile(cache / 'mayor.xlsx')
    strings = [''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml'))]

    def sheet(number):
        rows = {}
        for row in ET.fromstring(z.read(f'xl/worksheets/sheet{number}.xml')).findall('.//s:row', NS):
            cells = {}
            for c in row:
                v = c.find('s:v', NS)
                if v is not None:
                    col = c.get('r').rstrip('0123456789')
                    cells[col] = strings[int(v.text)] if c.get('t') == 's' else v.text
            rows[int(row.get('r'))] = cells
        return rows

    names = [sheet(2)[r]['A'] for r in range(4, 106)]
    candidates = []
    for i, name in enumerate(names):
        # Workbook names are surname first; preserve the exact source spelling too.
        surname, given = name.split(' ', 1)
        if name.startswith('Allan Gru '):
            surname, given = 'Allan Gru', 'Jesse'
        elif name.startswith('Chevalier Romero '):
            surname, given = 'Chevalier Romero', 'Danny'
        candidates.append({'id': i, 'name': f'{given} {surname}', 'sourceName': name})
    results = {'candidates': candidates, 'subdivisions': {}, 'wards': {}, 'separate': {},
               'sources': sources, 'sha256': hashes, 'date': '2023-06-26'}
    for ward in range(1, 26):
        rows = sheet(ward + 1)
        assert [rows[r]['A'] for r in range(4, 106)] == names
        columns = {col: int(value) for col, value in rows[2].items() if value.isdigit()}
        total_col = next(col for col, value in rows[2].items() if value == 'Total')
        totals = [int(rows[r][total_col]) for r in range(4, 106)]
        assert all(sum(int(rows[r][c]) for c in columns) == totals[r - 4] for r in range(4, 106))
        results['wards'][f'{ward:02}'] = summary(totals)
        for col, poll in columns.items():
            votes = [int(rows[r][col]) for r in range(4, 106)]
            assert sum(votes) == int(rows[106][col])
            key = f'{ward:02}{poll:03}'
            group = 'separate' if poll in SPECIAL else 'subdivisions'
            assert key not in results[group]
            results[group][key] = summary(votes)
            if group == 'separate':
                results[group][key]['method'] = SPECIAL[poll]
    results['city'] = summary([sum(w['votes'][i] for w in results['wards'].values()) for i in range(102)])
    output = ROOT / 'public/data'
    output.mkdir(parents=True, exist_ok=True)
    for level in ['wards', 'subdivisions']:
        geo = json.loads((cache / f'{level}.geojson').read_text())
        features = []
        for f in geo['features']:
            p = f['properties']
            key = p['AREA_LONG_CODE'].zfill(2 if level == 'wards' else 5)
            label = f'Ward {int(key)} · {p["AREA_NAME"]}' if level == 'wards' else f'Ward {int(key[:2])} · Subdivision {int(key[2:]):03}'
            features.append({'type': 'Feature', 'id': key, 'properties': {'id': key, 'name': label}, 'geometry': f['geometry']})
        (output / f'{level}.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': sorted(features, key=lambda f: f['id'])}, separators=(',', ':')))
    (output / 'results.json').write_text(json.dumps(results, ensure_ascii=False, separators=(',', ':')))
    for year in [2022, 2018]:
        prepare_historical(year, cache, manifest, output)
    subprocess.run(['node', ROOT / 'scripts/prepare_legacy.mjs'], check=True)
    print('Prepared 2023 election data.')


def prepare_historical(year, cache, manifest, output):
    """Package a mayoral result and the matching subdivision boundaries."""
    archive = zipfile.ZipFile(cache / f'{year}-results.zip')
    workbook = next(name for name in archive.namelist() if name.endswith('_Mayor.xlsx'))
    z = zipfile.ZipFile(__import__('io').BytesIO(archive.read(workbook)))
    strings = [''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml'))]

    def sheet(number):
        rows = {}
        for row in ET.fromstring(z.read(f'xl/worksheets/sheet{number}.xml')).findall('.//s:row', NS):
            cells = {}
            for c in row:
                v = c.find('s:v', NS)
                if v is not None:
                    col = c.get('r').rstrip('0123456789')
                    cells[col] = strings[int(v.text)] if c.get('t') == 's' else v.text
            rows[int(row.get('r'))] = cells
        return rows

    first = sheet(2)
    end = next(row for row, cells in first.items() if row > 3 and cells.get('A', '').startswith('City Ward'))
    source_names = [first[row]['A'] for row in range(4, end)]
    candidates = []
    for i, name in enumerate(source_names):
        parts = name.split(' ', 1)
        candidates.append({'id': i, 'name': f'{parts[1]} {parts[0]}' if len(parts) == 2 else name, 'sourceName': name})
    results = {'candidates': candidates, 'subdivisions': {}, 'wards': {}, 'separate': {},
               'sources': {'mayor.xlsx': manifest['urls'][f'{year}-results.zip'], 'subdivisions.geojson': manifest['urls'][f'subdivisions-{year}.geojson']},
               'sha256': {key: manifest['sha256'][key] for key in [f'{year}-results.zip', f'subdivisions-{year}.geojson']}, 'date': f'{year}-10-22' if year == 2018 else '2022-10-24'}
    for ward in range(1, 26):
        rows = sheet(ward + 1)
        assert [rows[row]['A'] for row in range(4, end)] == source_names
        columns = {col: int(float(value)) for col, value in rows[2].items() if value.replace('.', '', 1).isdigit()}
        polls = {}
        for col, poll in columns.items():
            votes = [int(float(rows[row].get(col, 0))) for row in range(4, end)]
            polls[poll] = summary(votes)
        results['wards'][f'{ward:02}'] = summary([sum(p['votes'][i] for p in polls.values()) for i in range(len(candidates))])
        for poll, poll_result in polls.items():
            key = f'{ward:02}{poll:03}'
            group = 'separate' if poll in [96, 97, 98, 99] else 'subdivisions'
            results[group][key] = poll_result
    results['city'] = summary([sum(w['votes'][i] for w in results['wards'].values()) for i in range(len(candidates))])
    geo = json.loads((cache / f'subdivisions-{year}.geojson').read_text())
    features = []
    for f in geo['features']:
        key = f['properties']['AREA_LONG_CODE'].zfill(5)
        features.append({'type': 'Feature', 'id': key, 'properties': {'id': key, 'name': f'Ward {int(key[:2])} · Subdivision {int(key[2:]):03}'}, 'geometry': f['geometry']})
    historical = output / str(year)
    historical.mkdir(exist_ok=True)
    (historical / 'subdivisions.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': sorted(features, key=lambda f: f['id'])}, separators=(',', ':')))
    (historical / 'results.json').write_text(json.dumps(results, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    prepare()
