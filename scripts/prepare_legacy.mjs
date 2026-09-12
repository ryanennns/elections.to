import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import XLSX from "xlsx";

const cache = new URL("../.cache/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("./sources.json", import.meta.url)),
);
const summary = (votes) => ({
  votes,
  total: votes.reduce((a, b) => a + b, 0),
  leaders: votes.length
    ? votes.reduce((best, vote, i) => (vote > votes[best] ? i : best), 0)
    : null,
});
const finish = (votes) => {
  const result = summary(votes);
  result.leaders = result.total
    ? votes.flatMap((vote, i) => (vote === votes[result.leaders] ? i : []))
    : [];
  return result;
};
const name = (source) => {
  const parts = source
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word[0].toUpperCase() + word.slice(1));
  return parts.length > 1 ? `${parts.slice(1).join(" ")} ${parts[0]}` : source;
};
const unzip = (archive, file) =>
  execFileSync("unzip", ["-p", new URL(archive, cache).pathname, file], {
    maxBuffer: 10 * 1024 * 1024,
  });
const dbf = (buffer) => {
  const fields = [];
  const header = buffer.readUInt16LE(8);
  const length = buffer.readUInt16LE(10);
  for (let at = 32; buffer[at] !== 13; at += 32)
    fields.push([
      buffer
        .subarray(at, at + 11)
        .toString("ascii")
        .replace(/\0.*$/, ""),
      buffer[at + 16],
    ]);
  return Array.from({ length: buffer.readUInt32LE(4) }, (_, record) => {
    let at = header + record * length + 1;
    return Object.fromEntries(
      fields.map(([field, width]) => {
        const value = buffer
          .subarray(at, (at += width))
          .toString("latin1")
          .trim();
        return [field, value];
      }),
    );
  });
};
const shapefile = (buffer) => {
  const features = [];
  for (let at = 100; at < buffer.length; ) {
    const words = buffer.readUInt32BE(at + 4);
    at += 8;
    const end = at + words * 2;
    if (buffer.readUInt32LE(at) === 5) {
      const parts = buffer.readUInt32LE(at + 36),
        points = buffer.readUInt32LE(at + 40);
      const starts = Array.from({ length: parts + 1 }, (_, i) =>
        i < parts ? buffer.readUInt32LE(at + 44 + i * 4) : points,
      );
      const pointAt = at + 44 + parts * 4;
      features.push(
        starts
          .slice(0, -1)
          .map((start, i) =>
            Array.from({ length: starts[i + 1] - start }, (_, j) => [
              buffer.readDoubleLE(pointAt + (start + j) * 16),
              buffer.readDoubleLE(pointAt + (start + j) * 16 + 8),
            ]),
          ),
      );
    }
    at = end;
  }
  return features;
};

for (const year of [2014, 2010, 2006]) {
  const mayorFile =
    year === 2014
      ? "MAYOR.xls"
      : year === 2006
        ? "2006 Results/2006_Toronto_Poll_by_Poll_Mayor.xls"
        : `${year}_Toronto_Poll_by_Poll_Mayor.xls`;
  const archive = unzip(`${year}-results.zip`, mayorFile);
  const workbook = XLSX.read(archive, { type: "buffer" });
  const sheets = workbook.SheetNames.filter((sheet) => /^Ward\d+$/.test(sheet));
  const first = XLSX.utils.sheet_to_json(workbook.Sheets[sheets[0]], {
    header: 1,
    defval: null,
  });
  const header = first.findIndex((row) => row[0] === "Subdivision");
  const end = first.findIndex((row, i) => i > header && /Totals$/.test(row[0]));
  const sourceNames = first.slice(header + 1, end).map((row) => row[0]);
  const candidates = sourceNames.map((sourceName, id) => ({
    id,
    name: name(sourceName),
    sourceName,
  }));
  const geometryKey =
    year === 2006 ? "subdivisions-2006.zip" : `subdivisions-${year}.geojson`;
  const results = {
    candidates,
    subdivisions: {},
    wards: {},
    separate: {},
    sources: {
      "mayor.xls": manifest.urls[`${year}-results.zip`],
      subdivisions: manifest.urls[geometryKey],
    },
    sha256: {
      [`${year}-results.zip`]: manifest.sha256[`${year}-results.zip`],
      [geometryKey]: manifest.sha256[geometryKey],
    },
    date: `${year}-10-${year === 2014 ? "27" : year === 2010 ? "25" : "23"}`,
  };
  for (const sheet of sheets) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
      header: 1,
      defval: null,
    });
    const rowHeader = rows.findIndex((row) => row[0] === "Subdivision");
    const rowEnd = rows.findIndex(
      (row, i) => i > rowHeader && /Totals$/.test(row[0]),
    );
    const polls = rows[rowHeader]
      .map((poll, col) => [poll, col])
      .filter(([poll]) => Number.isInteger(poll));
    const ward = sheet.match(/\d+/)[0].padStart(2, "0");
    const areas = polls.map(([poll, col]) =>
      finish(
        rows.slice(rowHeader + 1, rowEnd).map((row) => Number(row[col]) || 0),
      ),
    );
    results.wards[ward] = finish(
      candidates.map((_, i) =>
        areas.reduce((total, area) => total + area.votes[i], 0),
      ),
    );
    polls.forEach(
      ([poll], i) =>
        ((poll >= 96 ? results.separate : results.subdivisions)[
          `${ward}${String(poll).padStart(3, "0")}`
        ] = areas[i]),
    );
  }
  results.city = finish(
    candidates.map((_, i) =>
      Object.values(results.wards).reduce(
        (total, ward) => total + ward.votes[i],
        0,
      ),
    ),
  );
  const legacyShapes =
    year === 2006 &&
    shapefile(
      unzip("subdivisions-2006.zip", "VOTING_SUBDIVISION_2006_WGS84.shp"),
    );
  const legacyRows =
    year === 2006 &&
    dbf(unzip("subdivisions-2006.zip", "VOTING_SUBDIVISION_2006_WGS84.dbf"));
  const features =
    year === 2006
      ? legacyShapes.map((rings, i) => {
          const id = legacyRows[i].AREA_LONG.padStart(5, "0");
          return {
            type: "Feature",
            id,
            properties: {
              id,
              name: `Ward ${Number(id.slice(0, 2))} · Subdivision ${id.slice(2)}`,
            },
            geometry: { type: "Polygon", coordinates: rings },
          };
        })
      : JSON.parse(
          await readFile(new URL(`subdivisions-${year}.geojson`, cache)),
        ).features.map((feature) => {
          const id = String(feature.properties.AREA_LONG_CODE).padStart(5, "0");
          return {
            type: "Feature",
            id,
            properties: {
              id,
              name: `Ward ${Number(id.slice(0, 2))} · Subdivision ${id.slice(2)}`,
            },
            geometry: feature.geometry,
          };
        });
  const out = new URL(`../public/data/${year}/`, import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(new URL("results.json", out), JSON.stringify(results));
  await writeFile(
    new URL("subdivisions.geojson", out),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
}
