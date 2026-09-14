<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { candidateColor } from "./colors.js";
import ElectionDropdown from "./components/ElectionDropdown.vue";

maplibregl.setWorkerUrl(workerUrl);

const mapElement = ref(null);
const data = shallowRef(null);
const geometry = shallowRef(null);
const voterStatistics = shallowRef({});
const elections = shallowRef({});
const geometries = shallowRef({});
const election = ref("2023");
const selected = ref("");
const loading = ref(true);
const dataError = ref("");
const mapError = ref("");
const mapReady = ref(false);
const mobile = ref(false);
const resultsOpen = ref(true);
const resultsCollapsed = ref(false);
const resultsOpening = ref(false);
const closingSelection = ref("");
const MAP_FADE_DURATION = 195;
const TORONTO_BOUNDS = [
  [-79.6393, 43.581],
  [-79.1152, 43.8555],
];
const TORONTO_PAN_BOUNDS = [
  [-79.7258, 43.5357],
  [-79.0287, 43.9008],
];
const MAP_PADDING = 32;
const MAP_ZOOM_OUT = Math.log2(0.95);
const electionOptions = [
  { value: "2023", label: "2023" },
  { value: "2022", label: "2022" },
  { value: "2018", label: "2018" },
  { value: "2014", label: "2014" },
  { value: "2010", label: "2010" },
  { value: "2006", label: "2006" },
  { value: "2003", label: "2003" },
  { value: "2000", label: "2000" },
  { value: "1997", label: "1997" },
];
let map;
let mapUpdate;
let disposed = false;
const color = candidateColor;
const number = (n) => n.toLocaleString("en-CA");
const percent = (votes, total) =>
  total ? `${((votes / total) * 100).toFixed(2)}%` : "—";
const areas = computed(() => geometry.value?.subdivisions?.features || []);
const reportedAreas = computed(
  () => Object.keys(data.value?.subdivisions || {}).length,
);
const scopeNote = computed(() =>
  data.value?.granularity === "citywide"
    ? "Citywide mayoral result · no polling-area data"
    : `${number(reportedAreas.value)} reporting areas · Regular election-day polls.`,
);
const displaySelection = computed(
  () => selected.value || closingSelection.value,
);
const area = computed(() =>
  areas.value.find((f) => f.id === displaySelection.value),
);
const result = computed(() =>
  displaySelection.value
    ? data.value?.subdivisions[displaySelection.value]
    : data.value?.city,
);
const voterStats = computed(() => {
  const stats = voterStatistics.value[election.value];
  return stats
    ? displaySelection.value
      ? stats.subdivisions[displaySelection.value]
      : stats.city
    : null;
});
const ranked = computed(() =>
  result.value
    ? [...data.value.candidates].sort(
        (a, b) => result.value.votes[b.id] - result.value.votes[a.id],
      )
    : [],
);
const displayed = computed(() => ranked.value.slice(0, 3));
const heading = computed(
  () => area.value?.properties.name || "Toronto, citywide",
);
const outcome = computed(() => {
  if (!result.value) return "Not reported separately";
  const names = result.value.leaders.map(
    (id) => data.value.candidates[id].name,
  );
  return names.length > 1
    ? `Tie · ${names.join(" & ")}`
    : names.length
      ? `${names[0]} ${displaySelection.value ? "leads" : "elected"}`
      : "No valid votes";
});

function paint() {
  if (!mapReady.value) return;
  const citywide = data.value?.granularity === "citywide";
  for (const feature of geometry.value?.subdivisions?.features || []) {
    const r = citywide ? data.value.city : data.value.subdivisions[feature.id];
    const id = r?.leaders[0];
    const fill =
      r?.leaders.length > 1
        ? "#6b626c"
        : id != null
          ? color(data.value.candidates[id])
          : "#c5c9c5";
    map.setFeatureState(
      { source: "subdivisions", id: feature.id },
      {
        fill,
        missing: !r?.total,
        share: r?.total ? Math.min(1, (r.votes[id] / r.total) * 1.2) : 0,
      },
    );
  }
  highlight();
}
function highlight() {
  if (!mapReady.value) return;
  map.setFilter("subdivisions-selection", [
    "==",
    ["get", "id"],
    selected.value,
  ]);
}
function setBlackOpacity(opacity) {
  if (!mapReady.value) return;
  map.setPaintProperty("subdivisions-black", "fill-opacity", opacity);
}
function resetView() {
  selected.value = "";
  fitToronto(600);
}
function fitToronto(duration) {
  if (!map) return;
  const camera = map.cameraForBounds(TORONTO_BOUNDS, { padding: MAP_PADDING });
  map.easeTo({ ...camera, zoom: camera.zoom + MAP_ZOOM_OUT, duration });
}
function reload() {
  window.location.reload();
}
function chooseElection(value) {
  if (value === election.value) return;
  election.value = value;
  data.value = elections.value[value];
  geometry.value = geometries.value[value];
  selected.value = "";
  clearTimeout(mapUpdate);
  if (!mapReady.value) return;
  setBlackOpacity(1);
  mapUpdate = setTimeout(() => {
    if (disposed) return;
    map.getSource("subdivisions").setData(
      geometry.value?.subdivisions || {
        type: "FeatureCollection",
        features: [],
      },
    );
    paint();
    setBlackOpacity(0);
  }, MAP_FADE_DURATION);
}
async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}

function updateMobile() {
  mobile.value = window.matchMedia("(max-width: 760px)").matches;
}
function toggleResults() {
  if (resultsOpen.value) {
    if (selected.value) selected.value = "";
    else resultsOpen.value = false;
  } else {
    resultsCollapsed.value = false;
    resultsOpening.value = true;
    resultsOpen.value = true;
    requestAnimationFrame(() => (resultsOpening.value = false));
  }
}
function collapseResults() {
  if (mobile.value && !resultsOpen.value) resultsCollapsed.value = true;
  closingSelection.value = "";
}

onMounted(async () => {
  updateMobile();
  window.addEventListener("resize", updateMobile);
  const stylePromise = read(
    "https://tiles.openfreemap.org/styles/positron",
  ).catch(() => {
    mapError.value =
      "Street map unavailable. Election boundaries and results still work. Reload to retry.";
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#eef0eb" },
        },
      ],
    };
  });
  try {
    const base = `${import.meta.env.BASE_URL}data/`;
    const [
      results,
      subdivisions,
      wards,
      historicalResults,
      historicalSubdivisions,
      olderResults,
      olderSubdivisions,
      legacyResults,
      legacySubdivisions,
      oldestResults,
      oldestSubdivisions,
      originalResults,
      originalSubdivisions,
      earlyResults,
      earlySubdivisions,
      earlyWards,
      earlyVoterStatistics,
      citywideResults,
      firstResults,
    ] = await Promise.all(
      [
        "results.json",
        "subdivisions.geojson",
        "wards.geojson",
        "2022/results.json",
        "2022/subdivisions.geojson",
        "2018/results.json",
        "2018/subdivisions.geojson",
        "2014/results.json",
        "2014/subdivisions.geojson",
        "2010/results.json",
        "2010/subdivisions.geojson",
        "2006/results.json",
        "2006/subdivisions.geojson",
        "2003/results.json",
        "2003/subdivisions.geojson",
        "2003/wards.geojson",
        "2003/voter-statistics.json",
        "2000/results.json",
        "1997/results.json",
      ].map((file) => read(base + file)),
    );
    if (disposed) return;
    elections.value = {
      2023: results,
      2022: historicalResults,
      2018: olderResults,
      2014: legacyResults,
      2010: oldestResults,
      2006: originalResults,
      2003: earlyResults,
      2000: citywideResults,
      1997: firstResults,
    };
    data.value = results;
    voterStatistics.value = { 2003: earlyVoterStatistics };
    geometries.value = {
      2023: { subdivisions, wards },
      2022: { subdivisions: historicalSubdivisions, wards },
      2018: { subdivisions: olderSubdivisions, wards },
      2014: { subdivisions: legacySubdivisions, wards },
      2010: { subdivisions: oldestSubdivisions, wards },
      2006: { subdivisions: originalSubdivisions, wards },
      2003: { subdivisions: earlySubdivisions, wards: earlyWards },
      2000: {
        subdivisions: earlyWards,
        wards: earlyWards,
      },
      1997: {
        subdivisions: earlyWards,
        wards: earlyWards,
      },
    };
    geometry.value = geometries.value[election.value];
  } catch {
    dataError.value =
      "Election data could not be loaded. Check your connection and reload to retry.";
    loading.value = false;
    return;
  }
  loading.value = false;
  try {
    const style = await stylePromise;
    if (disposed) return;
    map = new maplibregl.Map({
      container: mapElement.value,
      style,
      center: [-79.38, 43.71],
      zoom: 10,
      maxBounds: TORONTO_PAN_BOUNDS,
      maxZoom: 18,
      minZoom: 8,
      renderWorldCopies: false,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "Election data: City of Toronto",
      }),
      "bottom-right",
    );
    map.on("error", () => {
      mapError.value =
        "Some map resources could not load. Results remain available; reload to retry.";
    });
    map.on("style.load", () => {
      // Keep fills under roads, but put boundaries above roads and below street labels.
      const layers = map.getStyle().layers;
      const roadLayer = layers.find(
        (l) => l["source-layer"] === "transportation",
      )?.id;
      const labelLayer = layers.find((l) => l.type === "symbol")?.id;
      for (const group of ["subdivisions"]) {
        map.addSource(group, { type: "geojson", data: geometry.value[group] });
        map.addLayer(
          {
            id: `${group}-fill`,
            type: "fill",
            source: group,
            paint: {
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "missing"], true],
                "#c5c9c5",
                [
                  "interpolate",
                  ["exponential", 0.72],
                  ["number", ["feature-state", "share"], 0],
                  0,
                  "#e8ebe3",
                  1,
                  [
                    "to-color",
                    ["coalesce", ["feature-state", "fill"], "#c5c9c5"],
                  ],
                ],
              ],
              "fill-opacity": 0.88,
            },
          },
          roadLayer,
        );
        map.addLayer(
          {
            id: "subdivisions-black",
            type: "fill",
            source: group,
            paint: {
              "fill-color": "#888",
              "fill-opacity": 0,
              "fill-opacity-transition": { duration: MAP_FADE_DURATION },
            },
          },
          roadLayer,
        );
        map.addLayer(
          {
            id: `${group}-boundary`,
            type: "line",
            source: group,
            paint: {
              "line-color": "#435248",
              "line-opacity": 0.72,
              "line-width": group === "wards" ? 1.8 : 0.9,
            },
          },
          labelLayer,
        );
        map.addLayer({
          id: `${group}-selection`,
          type: "line",
          source: group,
          filter: ["==", ["get", "id"], ""],
          // A selected outline must remain visible across road casings and labels.
          paint: {
            "line-color": "#19352f",
            "line-opacity": 0.96,
            "line-width": 4,
          },
        });
        map.on("click", `${group}-fill`, (e) => {
          if (data.value?.granularity === "citywide") return;
          const id = e.features[0].properties.id;
          selected.value = selected.value === id ? "" : id;
        });
        map.on("mouseenter", `${group}-fill`, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", `${group}-fill`, () => {
          map.getCanvas().style.cursor = "";
        });
      }
      map.on("click", (e) => {
        if (
          !map.queryRenderedFeatures(e.point, { layers: ["subdivisions-fill"] })
            .length
        )
          selected.value = "";
      });
      mapReady.value = true;
      paint();
      fitToronto(0);
    });
  } catch {
    mapError.value =
      "The map could not start. Election results remain available.";
  }
});
watch(selected, (value, previous) => {
  highlight();
  if (!value && previous && mobile.value) closingSelection.value = previous;
  if (!mobile.value || resultsOpen.value === Boolean(value)) return;
  toggleResults();
});
onUnmounted(() => {
  disposed = true;
  clearTimeout(mapUpdate);
  window.removeEventListener("resize", updateMobile);
  map?.remove();
});
</script>

<template>
  <div class="app-shell">
    <main>
      <aside class="sidebar" aria-label="Election controls and results">
        <div class="sidebar-brand">
          <a class="brand" href="./" aria-label="elections.to home"
            ><span class="brand-mark" aria-hidden="true"
              ><svg viewBox="0 0 28 28"><path d="M6 14l6 6L23 7" /></svg></span
            ><span
              >elections<span class="brand-dot">.</span
              ><span class="brand-light">to</span></span
            ></a
          >
        </div>
        <div v-if="loading" class="notice" role="status">
          Loading official election results…
        </div>
        <div v-else-if="dataError" class="notice error" role="alert">
          {{ dataError }} <button @click="reload">Reload</button>
        </div>
        <template v-if="data">
          <Teleport
            :to="mobile ? '.sidebar-brand' : '.map-frame'"
            :disabled="!mobile"
          >
            <section class="controls" aria-label="Map settings">
              <ElectionDropdown
                id="election"
                label="Election"
                :options="electionOptions"
                :value="election"
                @select="chooseElection"
              />
              <p class="scope-note">
                {{ scopeNote }}
              </p>
            </section>
          </Teleport>

          <Teleport to="body" :disabled="!mobile">
            <section
              id="results"
              class="results"
              :class="{
                'is-closing': !resultsOpen && !resultsCollapsed,
                'is-opening': resultsOpening,
                'is-collapsed': resultsCollapsed,
              }"
            >
              <Transition name="results-modal" @after-leave="collapseResults">
                <div
                  v-show="resultsOpen || !mobile"
                  :aria-hidden="!resultsOpen"
                  class="results-content"
                >
                  <h3 v-if="displaySelection">{{ heading }}</h3>
                  <p class="outcome" aria-live="polite">
                    <i
                      :style="{
                        background:
                          result?.leaders.length === 1
                            ? color(data.candidates[result.leaders[0]])
                            : '#6b626c',
                      }"
                    ></i
                    >{{ outcome }}
                    <button
                      v-if="mobile"
                      class="results-toggle"
                      :aria-expanded="resultsOpen"
                      aria-label="Hide results"
                      @click="toggleResults"
                    >
                      <span aria-hidden="true">⌄</span>
                    </button>
                  </p>
                  <template v-if="result">
                    <div class="total">
                      <strong>{{ number(result.total) }}</strong
                      ><span>valid votes</span>
                    </div>
                    <p v-if="voterStats" class="result-scope">
                      {{ number(voterStats.voted) }} voted ·
                      {{ percent(voterStats.voted, voterStats.eligible) }}
                      turnout
                    </p>
                    <p v-if="displaySelection" class="result-scope">
                      Regular election-day votes only
                    </p>
                    <div class="table-heading">
                      <span>CANDIDATE</span><span>VOTES / SHARE</span>
                    </div>
                    <ol class="candidate-list">
                      <li v-for="c in displayed" :key="c.id">
                        <div class="candidate-row">
                          <span class="candidate-name"
                            ><i :style="{ background: color(c) }"></i
                            >{{ c.name }}</span
                          ><span class="candidate-numbers"
                            >{{ number(result.votes[c.id]) }}
                            <strong>{{
                              percent(result.votes[c.id], result.total)
                            }}</strong></span
                          >
                        </div>
                        <div class="vote-track">
                          <span
                            :style="{
                              width: `${result.total ? (result.votes[c.id] / result.total) * 100 : 0}%`,
                              background: color(c),
                            }"
                          ></span>
                        </div>
                      </li>
                    </ol>
                  </template>
                  <p v-else class="missing-copy">
                    This polygon has no separately reported result. It is not a
                    zero-vote area. Select its ward to see totals including
                    every voting method.
                  </p>
                </div>
              </Transition>
              <button
                v-if="mobile && !resultsOpen"
                class="results-toggle"
                :aria-expanded="resultsOpen"
                @click="toggleResults"
              >
                Results
              </button>
            </section>
          </Teleport>
        </template>
      </aside>

      <section class="map-column" aria-label="Toronto election map">
        <div class="map-frame">
          <div
            ref="mapElement"
            class="map"
            aria-label="Interactive election street map."
          ></div>
          <div class="map-topline">
            <button class="reset" :disabled="!mapReady" @click="resetView">
              <span aria-hidden="true">⌖</span> Reset view
            </button>
          </div>
          <div v-if="mapError" class="map-notice" role="alert">
            {{ mapError }} <button @click="reload">Reload</button>
          </div>
          <div v-else-if="!mapReady" class="map-loading" role="status">
            {{
              dataError ? "Map requires election data" : "Preparing your map…"
            }}
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
