const palette = {
  'David Miller': '#18827b', 'Jane Pitfield': '#c74655', 'Stephen Ledrew': '#8e3f9a', 'Michael Alexander': '#aa7914',
  'Rob Ford': '#c74843', 'George Smitherman': '#286ca8', 'Joe Pantalone': '#8e3f9a', 'Rocco Rossi': '#c39b15',
  'John Tory': '#286ca8', 'Doug Ford': '#8e3f9a', 'Jennifer Keesmaat': '#d16a24', 'Gil Penalosa': '#aa7914',
  'Ari Goldkind': '#35834e', 'Faith Goldy': '#8e3f9a', 'Saron Gebresellassi': '#35834e',
  'Chloe-Marie Brown': '#b14478', 'Blake Acton': '#35834e',
  'Olivia Chow': '#cf642f', 'Ana Bailão': '#147a4b', 'Mark Saunders': '#346bb0',
  'Anthony Furey': '#8e3f9a', 'Chloe Brown': '#b14478',
}

export function candidateColor({ name }) {
  if (palette[name]) return palette[name]
  const hue = [...name].reduce((hash, char) => (hash * 31 + char.codePointAt(0)) >>> 0, 0) % 360
  return `hsl(${hue} 45% 40%)`
}
