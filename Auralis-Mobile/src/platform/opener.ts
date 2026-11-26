export function openExternalUrl(url: string): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  return Boolean(opened)
}
