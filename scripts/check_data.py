"""One offline check for packaged geometry, joins, totals, missing areas and ties."""
import json
from pathlib import Path
from prepare_data import summary

DATA = Path(__file__).resolve().parents[1] / 'public/data'
r = json.loads((DATA / 'results.json').read_text())
assert len(r['candidates']) == 102
assert [c['id'] for c in r['candidates']] == list(range(102))
assert len({c['sourceName'] for c in r['candidates']}) == 102
for level, count in [('subdivisions', 1445), ('wards', 25)]:
    features = json.loads((DATA / f'{level}.geojson').read_text())['features']
    ids = {f['id'] for f in features}
    assert len(features) == len(ids) == count
    assert set(r[level]) <= ids
    assert len(ids - set(r[level])) == (94 if level == 'subdivisions' else 0)
    for f in features:
        assert f['id'] == f['properties']['id']
        assert len(f['id']) == (5 if level == 'subdivisions' else 2)
        assert f['geometry']['type'] in ['Polygon', 'MultiPolygon']
assert len(r['subdivisions']) == 1351
assert len(r['separate']) == 100
for group in ['subdivisions', 'wards', 'separate']:
    for key, area in r[group].items():
        votes = area['votes']
        assert len(votes) == 102 and all(type(v) is int and v >= 0 for v in votes)
        assert area['total'] == sum(votes)
        assert area['leaders'] == summary(votes)['leaders']
        if group != 'wards':
            assert key[:2] in r['wards']
            assert (int(key[2:]) in [96, 97, 98, 99]) == (group == 'separate')
for ward, area in r['wards'].items():
    polls = [p for group in ['subdivisions', 'separate'] for key, p in r[group].items() if key[:2] == ward]
    assert area['votes'] == [sum(p['votes'][i] for p in polls) for i in range(102)]
assert r['city']['votes'] == [sum(w['votes'][i] for w in r['wards'].values()) for i in range(102)]
assert sum(r['city']['votes']) == r['city']['total'] == 724638
for name, total in [('Olivia Chow', 269372), ('Ana Bailão', 235175)]:
    i = next(c['id'] for c in r['candidates'] if c['name'] == name)
    assert r['city']['votes'][i] == total
assert {key for key, p in r['subdivisions'].items() if len(p['leaders']) > 1} == {
    '04038', '05025', '06037', '06049', '09013', '10094', '12032', '16006', '16054', '25046'}
assert summary([0, 0]) == {'votes': [0, 0], 'total': 0, 'leaders': []}
assert summary([5, 5, 2])['leaders'] == [0, 1]
print('PASS: 1,351 joins · 94 missing · 25 wards · 102 candidates · 10 ties · 724,638 valid votes')

h = json.loads((DATA / '2022/results.json').read_text())
hgeo = json.loads((DATA / '2022/subdivisions.geojson').read_text())['features']
assert len(h['candidates']) == 31 and len(hgeo) == len(h['subdivisions']) == 1460
assert set(h['subdivisions']) == {f['id'] for f in hgeo}
assert h['city']['total'] == 551890
assert h['city']['votes'][next(c['id'] for c in h['candidates'] if c['name'] == 'John Tory')] == 342158
for group in ['subdivisions', 'wards', 'separate']:
    for area in h[group].values():
        assert area['total'] == sum(area['votes']) and area['leaders'] == summary(area['votes'])['leaders']
print('PASS: 2022 · 1,460 joins · 31 candidates · 551,890 valid votes')

o = json.loads((DATA / '2018/results.json').read_text())
ogeo = json.loads((DATA / '2018/subdivisions.geojson').read_text())['features']
assert len(o['candidates']) == 35 and len(ogeo) == 1181
assert set(o['subdivisions']) >= {f['id'] for f in ogeo}
assert o['city']['total'] == 755493
assert o['city']['votes'][next(c['id'] for c in o['candidates'] if c['name'] == 'John Tory')] == 479659
for group in ['subdivisions', 'wards', 'separate']:
    for area in o[group].values():
        assert area['total'] == sum(area['votes']) and area['leaders'] == summary(area['votes'])['leaders']
print('PASS: 2018 · 1,181 boundary joins · 35 candidates · 755,493 valid votes')

for year, candidates, boundaries, total, winner, votes in [
    ('2014', 65, 1207, 981054, 'John Tory', 395124),
    ('2010', 40, 1110, 813984, 'Rob Ford', 383501),
]:
    old = json.loads((DATA / year / 'results.json').read_text())
    old_geo = json.loads((DATA / year / 'subdivisions.geojson').read_text())['features']
    assert len(old['candidates']) == candidates and len(old_geo) == boundaries
    assert old['city']['total'] == total
    assert old['city']['votes'][next(c['id'] for c in old['candidates'] if c['name'] == winner)] == votes
    for area in old['subdivisions'].values():
        assert area['total'] == sum(area['votes']) and area['leaders'] == summary(area['votes'])['leaders']
print('PASS: 2010/2014 · official mayoral results and matching boundaries')

point = json.loads((DATA / '2010/subdivisions.geojson').read_text())['features'][0]['geometry']['coordinates']
while not isinstance(point[0], (int, float)):
    point = point[0]
assert -80 < point[0] < -79 and 43 < point[1] < 44

old = json.loads((DATA / '2006/results.json').read_text())
old_geo = json.loads((DATA / '2006/subdivisions.geojson').read_text())['features']
assert len(old['candidates']) == 38 and len(old_geo) == 1136
assert old['city']['total'] == 584484
assert old['city']['votes'][next(c['id'] for c in old['candidates'] if c['name'] == 'David Miller')] == 332969
assert {f['id'] for f in old_geo} <= set(old['subdivisions'])
for area in old['subdivisions'].values():
    assert area['total'] == sum(area['votes']) and area['leaders'] == summary(area['votes'])['leaders']
print('PASS: 2006 · official mayoral results and matching boundaries')
