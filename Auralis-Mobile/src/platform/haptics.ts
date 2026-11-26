export function triggerHapticFeedback(durationMs = 40): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(durationMs)
  } catch {
    // Ignore unsupported vibration hardware
  }
}
