import { isTauriRuntime } from './tauriRuntime.ts'

export function triggerHapticFeedback(durationMs = 40): void {
  if (isTauriRuntime()) {
    void import('@tauri-apps/plugin-haptics')
      .then(({ vibrate }) => vibrate(durationMs))
      .catch(() => {})
    return
  }
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(durationMs)
  } catch {
    // Ignore unsupported vibration hardware
  }
}
