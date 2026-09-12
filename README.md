# Toronto votes

A static Vue 3 + Vite street map of Toronto mayoral elections from 2006 to 2023. MapLibre renders OpenFreeMap’s Positron streets above translucent election polygons. No API key or election-data service is needed at runtime.

## Run

Node 22.12+ (or 24+) and Python 3.9+:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. For deployment:

```sh
npm test
npm run build
npm run preview
```

Publish `dist/` to any static web host. Relative asset URLs support hosting under a subdirectory. Live street tiles and optional Google Fonts require an internet connection; election data is bundled. If the street style fails, the app displays election polygons on a plain background. Results remain accessible through native selectors when WebGL is unavailable.

## Data

Use the Election selector to switch between 2023, 2022, 2018, 2014, 2010, and 2006. Switching replaces the subdivision source with that election’s boundaries, then redraws every region using that election’s candidates and vote shares. Ward view is available where the current 25-ward boundaries apply (2018 onward).

`public/data/` includes all 102 candidates, 1,445 subdivision polygons, 25 wards, and results for 1,351 regular election-day subdivisions. The other 94 polygons are marked **Not reported separately**. The 100 special reporting columns are preserved in `results.json` under `separate`:

- 096: care homes and retirement residences
- 097: mail-in voting
- 098 and 099: advance voting

These columns contribute to ward and citywide totals, never to individual street polygons. Joins use a two-digit ward plus a three-digit subdivision code. Candidate arrays share the workbook’s order; exact workbook names are retained as `sourceName`. Display names put given names first.

Percentages divide candidate votes by valid votes in the selected area. They exclude declined and rejected ballots. Leading-candidate mode assigns a colour to each candidate and shades it on a fixed 0–100% vote-share scale. Candidate mode uses the same scale for the chosen candidate. Tied leaders are neutral purple-grey and identified by name in the results. Colours are illustrative, not party affiliations.

To reproduce the data with Python’s standard library:

```sh
npm run data:prepare
npm test
```

The preparation script downloads the exact resources in `scripts/sources.json` into `.cache/` and verifies their SHA-256 hashes before reading them. Existing cached files allow offline regeneration. If a source changes, preparation stops for review; it does not silently replace the pinned data. The packaged output retains source URLs and hashes.

The offline data check covers unique identifiers, complete joins, candidate-by-candidate reconciliation of every ward and voting method, 10 tied subdivisions, 94 missing subdivision results, and the official totals: **724,638 valid votes**, **269,372 for Olivia Chow**, and **235,175 for Ana Bailão**.

## Browser verification

With Google Chrome installed:

```sh
npm run build
npm run test:browser
```

The check launches its own production preview server on port 4174. It covers desktop/mobile selection, map clicks and taps, keyboard selection, both geographic views, candidate changes, all 102 result rows, ties, missing results, reset/zoom controls, and failed data/style/tile requests. Screenshots are written to `test-results/` for visual inspection of street labels and layout. Set `BROWSER_CHANNEL` to another installed Playwright Chromium channel if needed.

## Sources and attribution

- [City of Toronto official by-election results](https://www.toronto.ca/city-government/elections/election-results-reports/election-results/by-election-results/)
- [2023 Office of the Mayor workbook dataset](https://open.toronto.ca/dataset/elections-official-by-election-results/)
- [2023 voting subdivisions](https://open.toronto.ca/dataset/elections-subdivisions/)
- [25 municipal wards](https://open.toronto.ca/dataset/city-wards/) — boundaries effective August 7, 2018
- [Open Government Licence – Toronto](https://open.toronto.ca/open-data-license/)
- [OpenFreeMap](https://openfreemap.org/quick_start/), [OpenMapTiles](https://openmaptiles.org/), and [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

This is an independent election explorer, not a City of Toronto publication.
