import { isTauriRuntime } from './tauriRuntime.ts'

export function openExternalUrl(url: string): boolean {
  if (isTauriRuntime()) {
    void import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(url))
      .catch(() => {})
    return true
  }
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  // Passing noopener/noreferrer in windowFeatures forces window.open() to return null per HTML spec.
  const opened = window.open(url, '_blank')
  if (!opened) return false
  try {
    opened.opener = null
  } catch {
    // Ignore cross-origin restrictions when severing opener
  }
  return true
}
