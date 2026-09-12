<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { candidateColor } from './colors.js'

maplibregl.setWorkerUrl(workerUrl)

const mapElement = ref(null)
const data = shallowRef(null)
const geometry = shallowRef(null)
const elections = shallowRef({})
const geometries = shallowRef({})
const election = ref('2023')
const selected = ref('')
const loading = ref(true)
const dataError = ref('')
const mapError = ref('')
const mapReady = ref(false)
const mobile = ref(false)
const resultsOpen = ref(true)
const TORONTO_BOUNDS = [[-79.9, 43.25], [-78.85, 44.15]]
let map
let disposed = false
const color = candidateColor
const number = n => n.toLocaleString('en-CA')
const percent = (votes, total) => total ? `${(votes / total * 100).toFixed(2)}%` : '—'
const areas = computed(() => geometry.value?.subdivisions.features || [])
const reportedAreas = computed(() => Object.keys(data.value?.subdivisions || {}).length)
const area = computed(() => areas.value.find(f => f.id === selected.value))
const result = computed(() => selected.value ? data.value?.subdivisions[selected.value] : data.value?.city)
const ranked = computed(() => result.value ? [...data.value.candidates].sort((a, b) => result.value.votes[b.id] - result.value.votes[a.id]) : [])
const displayed = computed(() => ranked.value.slice(0, 3))
const heading = computed(() => area.value?.properties.name || 'Toronto, citywide')
const outcome = computed(() => {
  if (!result.value) return 'Not reported separately'
  const names = result.value.leaders.map(id => data.value.candidates[id].name)
  return names.length > 1 ? `Tie · ${names.join(' & ')}` : names.length ? `${names[0]} ${selected.value ? 'leads' : 'elected'}` : 'No valid votes'
})

function paint() {
  if (!mapReady.value) return
  for (const feature of geometry.value.subdivisions.features) {
    const r = data.value.subdivisions[feature.id]
    const id = r?.leaders[0]
    const fill = r?.leaders.length > 1 ? '#6b626c' : id != null ? color(data.value.candidates[id]) : '#c5c9c5'
    map.setFeatureState({ source: 'subdivisions', id: feature.id }, { fill, missing: !r?.total, share: r?.total ? Math.min(1, r.votes[id] / r.total * 1.2) : 0 })
  }
  highlight()
}
function highlight() {
  if (!mapReady.value) return
  map.setFilter('subdivisions-selection', ['==', ['get', 'id'], selected.value])
}
function resetView() {
  selected.value = ''
  map?.fitBounds(TORONTO_BOUNDS, { padding: 35, duration: 600 })
}
function reload() { window.location.reload() }
async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return response.json()
}

function updateMobile() { mobile.value = window.matchMedia('(max-width: 760px)').matches }

onMounted(async () => {
  updateMobile()
  window.addEventListener('resize', updateMobile)
  const stylePromise = read('https://tiles.openfreemap.org/styles/positron').catch(() => {
    mapError.value = 'Street map unavailable. Election boundaries and results still work. Reload to retry.'
    return { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef0eb' } }] }
  })
  try {
    const base = `${import.meta.env.BASE_URL}data/`
    const [results, subdivisions, wards, historicalResults, historicalSubdivisions, olderResults, olderSubdivisions, legacyResults, legacySubdivisions, oldestResults, oldestSubdivisions, originalResults, originalSubdivisions] = await Promise.all(['results.json', 'subdivisions.geojson', 'wards.geojson', '2022/results.json', '2022/subdivisions.geojson', '2018/results.json', '2018/subdivisions.geojson', '2014/results.json', '2014/subdivisions.geojson', '2010/results.json', '2010/subdivisions.geojson', '2006/results.json', '2006/subdivisions.geojson'].map(file => read(base + file)))
    if (disposed) return
    elections.value = { 2023: results, 2022: historicalResults, 2018: olderResults, 2014: legacyResults, 2010: oldestResults, 2006: originalResults }
    data.value = results
    geometries.value = { 2023: { subdivisions, wards }, 2022: { subdivisions: historicalSubdivisions, wards }, 2018: { subdivisions: olderSubdivisions, wards }, 2014: { subdivisions: legacySubdivisions, wards }, 2010: { subdivisions: oldestSubdivisions, wards }, 2006: { subdivisions: originalSubdivisions, wards } }
    geometry.value = geometries.value[election.value]
  } catch {
    dataError.value = 'Election data could not be loaded. Check your connection and reload to retry.'
    loading.value = false
    return
  }
  loading.value = false
  try {
    const style = await stylePromise
    if (disposed) return
    map = new maplibregl.Map({ container: mapElement.value, style, center: [-79.38, 43.71], zoom: 10,
      maxBounds: TORONTO_BOUNDS, maxZoom: 18, minZoom: 8, renderWorldCopies: false, attributionControl: false })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Election data: City of Toronto' }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('error', () => { mapError.value = 'Some map resources could not load. Results remain available; reload to retry.' })
    map.on('style.load', () => {
      // Keep fills under roads, but put boundaries above roads and below street labels.
      const layers = map.getStyle().layers
      const roadLayer = layers.find(l => l['source-layer'] === 'transportation')?.id
      const labelLayer = layers.find(l => l.type === 'symbol')?.id
      for (const group of ['subdivisions']) {
        map.addSource(group, { type: 'geojson', data: geometry.value[group] })
        map.addLayer({ id: `${group}-fill`, type: 'fill', source: group,
          paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'missing'], true], '#c5c9c5', ['interpolate', ['exponential', 0.72], ['number', ['feature-state', 'share'], 0], 0, '#e8ebe3', 1, ['to-color', ['coalesce', ['feature-state', 'fill'], '#c5c9c5']]]], 'fill-opacity': 0.88 } }, roadLayer)
        map.addLayer({ id: `${group}-boundary`, type: 'line', source: group,
          paint: { 'line-color': '#435248', 'line-opacity': 0.72, 'line-width': group === 'wards' ? 1.8 : 0.9 } }, labelLayer)
        map.addLayer({ id: `${group}-selection`, type: 'line', source: group, filter: ['==', ['get', 'id'], ''],
          // A selected outline must remain visible across road casings and labels.
          paint: { 'line-color': '#19352f', 'line-opacity': 0.96, 'line-width': 4 } })
        map.on('click', `${group}-fill`, e => {
          const id = e.features[0].properties.id
          selected.value = selected.value === id ? '' : id
        })
        map.on('mouseenter', `${group}-fill`, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', `${group}-fill`, () => { map.getCanvas().style.cursor = '' })
      }
      map.on('click', e => {
        if (!map.queryRenderedFeatures(e.point, { layers: ['subdivisions-fill'] }).length) selected.value = ''
      })
      mapReady.value = true
      paint()
      map.fitBounds(TORONTO_BOUNDS, { padding: 35, duration: 0 })
    })
  } catch {
    mapError.value = 'The map could not start. Election results remain available.'
  }
})
watch(election, () => {
  data.value = elections.value[election.value]
  geometry.value = geometries.value[election.value]
  selected.value = ''
  if (mapReady.value) {
    map.getSource('subdivisions').setData(geometry.value.subdivisions)
    map.once('idle', paint)
  }
})
watch(selected, value => {
  highlight()
  if (value && mobile.value) resultsOpen.value = true
})
onUnmounted(() => { disposed = true; window.removeEventListener('resize', updateMobile); map?.remove() })
</script>

<template>
  <div class="app-shell">
    <main>
      <aside class="sidebar" aria-label="Election controls and results">
        <div class="sidebar-brand"><a class="brand" href="./" aria-label="elections.to home"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M6 14l6 6L23 7" /></svg></span><span>elections<span class="brand-dot">.</span><span class="brand-light">to</span></span></a></div>
        <div v-if="loading" class="notice" role="status">Loading official election results…</div>
        <div v-else-if="dataError" class="notice error" role="alert">{{ dataError }} <button @click="reload">Reload</button></div>
        <template v-if="data">
          <section class="controls" aria-label="Map settings">
            <label for="election">Election</label>
            <select id="election" v-model="election">
              <option value="2023">2023 · Mayoral by-election</option>
              <option value="2022">2022 · Municipal election</option>
              <option value="2018">2018 · Municipal election</option>
              <option value="2014">2014 · Municipal election</option>
              <option value="2010">2010 · Municipal election</option>
              <option value="2006">2006 · Municipal election</option>
            </select>
            <p class="scope-note">{{ number(reportedAreas) }} reporting areas · Regular election-day polls.</p>
          </section>

          <Teleport to="body" :disabled="!mobile">
            <section id="results" class="results" :class="{ 'is-collapsed': !resultsOpen }">
              <button v-if="mobile" class="results-toggle" :aria-expanded="resultsOpen" @click="resultsOpen = !resultsOpen">{{ resultsOpen ? 'Hide results' : 'Results' }}</button>
              <div v-show="resultsOpen || !mobile" class="results-content">
                <button v-if="selected" class="text-button clear-button" @click="selected = ''">Clear</button>
                <h3 v-if="selected">{{ heading }}</h3>
                <p class="outcome" aria-live="polite"><i :style="{ background: result?.leaders.length === 1 ? color(data.candidates[result.leaders[0]]) : '#6b626c' }"></i>{{ outcome }}</p>
                <template v-if="result">
                  <div class="total"><strong>{{ number(result.total) }}</strong><span>valid votes</span></div>
                  <p v-if="selected" class="result-scope">Regular election-day votes only</p>
                  <div class="table-heading"><span>CANDIDATE</span><span>VOTES / SHARE</span></div>
                  <ol class="candidate-list">
                    <li v-for="c in displayed" :key="c.id">
                      <div class="candidate-row"><span class="candidate-name"><i :style="{ background: color(c) }"></i>{{ c.name }}</span><span class="candidate-numbers">{{ number(result.votes[c.id]) }} <strong>{{ percent(result.votes[c.id], result.total) }}</strong></span></div>
                      <div class="vote-track"><span :style="{ width: `${result.total ? result.votes[c.id] / result.total * 100 : 0}%`, background: color(c) }"></span></div>
                    </li>
                  </ol>
                </template>
                <p v-else class="missing-copy">This polygon has no separately reported result. It is not a zero-vote area. Select its ward to see totals including every voting method.</p>
              </div>
            </section>
          </Teleport>
        </template>
      </aside>

      <section class="map-column" aria-label="Toronto election map">
        <div class="map-frame">
          <div ref="mapElement" class="map" aria-label="Interactive election street map."></div>
          <div class="map-topline"><button class="reset" :disabled="!mapReady" @click="resetView"><span aria-hidden="true">⌖</span> Reset view</button></div>
          <div v-if="mapError" class="map-notice" role="alert">{{ mapError }} <button @click="reload">Reload</button></div>
          <div v-else-if="!mapReady" class="map-loading" role="status">{{ dataError ? 'Map requires election data' : 'Preparing your map…' }}</div>
        </div>
      </section>
    </main>
  </div>
</template>
