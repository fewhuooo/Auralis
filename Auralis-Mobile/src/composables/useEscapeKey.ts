import { onMounted, onUnmounted } from 'vue'

export function useEscapeKey(isActive: () => boolean, onEscape: () => void): void {
  // #ifdef H5
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
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })
  // #endif
}
