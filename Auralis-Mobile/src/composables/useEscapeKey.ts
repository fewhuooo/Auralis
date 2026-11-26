import { onMounted, onUnmounted } from 'vue'
import { registerBackHandler } from '../platform/backButton.ts'

export function useEscapeKey(isActive: () => boolean, onEscape: () => void): void {
  let unregisterBack: (() => void) | null = null

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (!isActive()) return
    event.preventDefault()
    onEscape()
  }

  onMounted(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown)
    }
    unregisterBack = registerBackHandler(() => {
      if (!isActive()) return false
      onEscape()
      return true
    })
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown)
    }
    unregisterBack?.()
    unregisterBack = null
  })
}
