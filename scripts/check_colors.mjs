import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { candidateColor } from '../src/colors.js'

const elections = ['2006', '2010', '2014', '2018', '2022', '2023']
const distance = (a, b) => Math.hypot(...[0, 2, 4].map(i => parseInt(a.slice(i + 1, i + 3), 16) - parseInt(b.slice(i + 1, i + 3), 16)))
for (const year of elections) {
  const file = year === '2023' ? '../public/data/results.json' : `../public/data/${year}/results.json`
  const data = JSON.parse(await readFile(new URL(file, import.meta.url)))
  const leaders = [...data.candidates].sort((a, b) => data.city.votes[b.id] - data.city.votes[a.id]).slice(0, 4)
  for (const [i, candidate] of leaders.entries()) {
    for (const other of leaders.slice(i + 1)) assert.ok(distance(candidateColor(candidate), candidateColor(other)) > 80, `${year} top four need unique colours`)
  }
}
assert.equal(candidateColor({ name: 'John Tory', id: 0 }), candidateColor({ name: 'John Tory', id: 99 }))
assert.equal(candidateColor({ name: 'Chloe Brown' }), candidateColor({ name: 'Chloe-Marie Brown' }))
console.log('PASS: stable candidate colours · distinct top-four colours')
