const iconAliases: Record<string, string> = {
  book: '📚',
  'book-open': '📖',
  library: '📚',
  code: '💻',
  computer: '💻',
  laptop: '💻',
  atom: '⚛️',
  flask: '⚗️',
  calculator: '🧮',
  globe: '🌍',
  palette: '🎨',
  landmark: '🏛️',
  dna: '🧬',
  planet: '🪐',
  pen: '📝',
  brain: '🧠',
  settings: '⚙️',
  lightbulb: '💡',
  trophy: '🏆'
}

export const getSubjectIcon = (icon?: string | null) => {
  const value = icon?.trim()
  if (!value) return '📚'

  const alias = iconAliases[value.toLowerCase()]
  if (alias) return alias

  return /^[a-z0-9_-]+$/i.test(value) ? '📚' : value
}
