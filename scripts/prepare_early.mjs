import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import XLSX from "xlsx";

const cache = new URL("../.cache/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("./sources.json", import.meta.url)),
);
const finish = (votes) => {
  const total = votes.reduce((sum, vote) => sum + vote, 0);
  return {
    votes,
    total,
    leaders: total
      ? votes.flatMap((vote, i) => (vote === Math.max(...votes) ? i : []))
      : [],
  };
};
const unzip = (archive, file) =>
  execFileSync("unzip", ["-p", new URL(archive, cache).pathname, file], {
    maxBuffer: 20 * 1024 * 1024,
  });
const writeJson = async (year, file, value) => {
  const out = new URL(`../public/data/${year}/`, import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(new URL(file, out), JSON.stringify(value));
};
const displayName = (source) =>
  source
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, prefix, character) =>
      `${prefix}${character.toUpperCase()}`,
    );
const sourceName = (source) => {
  const comma = source.indexOf(",");
  return comma < 0
    ? source
    : `${source.slice(comma + 1).trim()} ${source.slice(0, comma).trim()}`;
};
const htmlText = (html) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const resultRows = (html) =>
  [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(([, row]) =>
      [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) =>
        htmlText(cell),
      ),
    )
    .filter(
      ([candidate, votes]) =>
        candidate && votes && /^\d[\d,]*$/.test(votes),
    )
    .map(([candidate, votes]) => ({
      name: candidate,
      votes: Number(votes.replaceAll(",", "")),
    }));

const prepare2003 = async () => {
  const mayorFile =
    "2003 Results/2003_Toronto_Poll_by_Poll_Mayor.xls";
  const workbook = XLSX.read(unzip("2003-results.zip", mayorFile), {
    type: "buffer",
  });
  const sheets = workbook.SheetNames.filter((sheet) =>
    /^Mayor Ward \d+$/.test(sheet),
  );
  const sheetRows = sheets.map((sheet) => ({
    sheet,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
      header: 1,
      defval: null,
    }),
  }));
  const sourceNames = [
    ...new Set(
      sheetRows.flatMap(({ rows }) =>
        rows.slice(3).map((row) => row[0]).filter(Boolean),
      ),
    ),
  ];
  const candidates = sourceNames.map((source, id) => ({
    id,
    name: sourceName(source),
    sourceName: source,
  }));
  const candidateIds = new Map(sourceNames.map((source, id) => [source, id]));
  const results = {
    candidates,
    subdivisions: {},
    wards: {},
    separate: {},
    sources: {
      "mayor.xls": manifest.urls["2003-results.zip"],
      "subdivisions.geojson": manifest.urls["subdivisions-2003.geojson"],
      "wards.geojson": manifest.urls["wards-2003.geojson"],
    },
    sha256: {
      "2003-results.zip": manifest.sha256["2003-results.zip"],
      "subdivisions-2003.geojson":
        manifest.sha256["subdivisions-2003.geojson"],
      "wards-2003.geojson": manifest.sha256["wards-2003.geojson"],
    },
    date: "2003-11-10",
  };
  for (const { sheet, rows } of sheetRows) {
    const header = rows.findIndex((row) => row[0] === "Name");
    const people = rows.slice(header + 1).filter((row) => row[0]);
    const polls = rows[header]
      .map((poll, column) => [Number(poll), column])
      .filter(([poll]) => Number.isInteger(poll) && poll > 0 && poll < 100);
    const ward = sheet.match(/\d+$/)[0].padStart(2, "0");
    const wardVotes = Array(candidates.length).fill(0);
    for (const [poll, column] of polls) {
      const votes = Array(candidates.length).fill(0);
      for (const person of people) {
        votes[candidateIds.get(person[0])] += Number(person[column]) || 0;
      }
      const key = `${ward}${String(poll).padStart(3, "0")}`;
      (poll >= 96 ? results.separate : results.subdivisions)[key] =
        finish(votes);
      votes.forEach((vote, id) => {
        wardVotes[id] += vote;
      });
    }
    results.wards[ward] = finish(wardVotes);
  }
  results.city = finish(
    candidates.map((_, id) =>
      Object.values(results.wards).reduce(
        (total, ward) => total + ward.votes[id],
        0,
      ),
    ),
  );
  const geo = JSON.parse(
    await readFile(new URL("subdivisions-2003.geojson", cache), "utf8"),
  );
  const features = geo.features.map((feature) => {
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
  if (features.some(({ id }) => !results.subdivisions[id]))
    throw new Error("2003 subdivision geometry does not join to results");
  const wards = JSON.parse(
    await readFile(new URL("wards-2003.geojson", cache), "utf8"),
  );
  const wardFeatures = wards.features.map((feature) => {
    const id = String(feature.properties.AREA_SHORT_CODE).padStart(2, "0");
    const label = feature.properties.AREA_NAME.replace(/\s*\(\d+\)$/, "");
    return {
      type: "Feature",
      id,
      properties: { id, name: `Ward ${Number(id)} · ${label}` },
      geometry: feature.geometry,
    };
  });
  if (wardFeatures.length !== 44) throw new Error("Invalid 2003 ward geometry");
  await writeJson(2003, "results.json", results);
  await writeJson(2003, "subdivisions.geojson", {
    type: "FeatureCollection",
    features,
  });
  await writeJson(2003, "wards.geojson", {
    type: "FeatureCollection",
    features: wardFeatures,
  });
};

const prepare2003VoterStats = async () => {
  const workbook = XLSX.read(
    await readFile(new URL("2003-voter-statistics.xls", cache)),
    { type: "buffer" },
  );
  const rows = XLSX.utils
    .sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
      header: 1,
      defval: null,
    })
    .slice(2)
    .filter(
      (row) => Number.isInteger(row[0]) && Number.isInteger(row[1]),
    );
  const fields = [
    "electors",
    "included",
    "additions",
    "corrections",
    "eligible",
    "voted",
  ];
  const blank = () => Object.fromEntries(fields.map((field) => [field, 0]));
  const add = (target, values) => {
    fields.forEach((field, index) => {
      target[field] += Number(values[index]) || 0;
    });
  };
  const finalize = (stats) => ({
    ...stats,
    turnout: stats.eligible ? stats.voted / stats.eligible : null,
  });
  const subdivisions = {};
  const wards = {};
  const city = blank();
  for (const row of rows) {
    const ward = String(row[0]).padStart(2, "0");
    const subdivision = String(row[1]).padStart(3, "0");
    const stats = {};
    fields.forEach((field, index) => {
      stats[field] = Number(row[index + 2]) || 0;
    });
    subdivisions[`${ward}${subdivision}`] = finalize(stats);
    wards[ward] ??= blank();
    add(wards[ward], row.slice(2));
    add(city, row.slice(2));
  }
  await writeJson(2003, "voter-statistics.json", {
    subdivisions,
    wards: Object.fromEntries(
      Object.entries(wards).map(([ward, stats]) => [ward, finalize(stats)]),
    ),
    city: finalize(city),
    sources: {
      "2003-voter-statistics.xls":
        manifest.urls["2003-voter-statistics.xls"],
    },
    sha256: {
      "2003-voter-statistics.xls":
        manifest.sha256["2003-voter-statistics.xls"],
    },
    date: "2003-11-10",
  });
};

const prepareArchivedMayor = async (year, sourceKey, date) => {
  const html = await readFile(new URL(sourceKey, cache), "utf8");
  const start =
    year === 1997 ? html.search(/<a\s+name=["']mayor["']/i) : 0;
  const next =
    year === 1997 ? html.search(/<a\s+name=["']councillor["']/i) : -1;
  const rows = resultRows(html.slice(start, next > start ? next : undefined));
  if (!rows.length) throw new Error(`No mayor results found in ${sourceKey}`);
  const votes = rows.map((row) => row.votes);
  await writeJson(year, "results.json", {
    candidates: rows.map(({ name: source, votes: _votes }, id) => ({
      id,
      name: displayName(source),
      sourceName: source,
    })),
    subdivisions: {},
    wards: {},
    separate: {},
    city: finish(votes),
    sources: { [sourceKey]: manifest.urls[sourceKey] },
    sha256: { [sourceKey]: manifest.sha256[sourceKey] },
    date,
    geography: "amalgamated",
    granularity: "citywide",
  });
};

await prepare2003();
await prepare2003VoterStats();
await prepareArchivedMayor(2000, "2000-results.html", "2000-11-13");
await prepareArchivedMayor(1997, "1997-results.html", "1997-11-10");
