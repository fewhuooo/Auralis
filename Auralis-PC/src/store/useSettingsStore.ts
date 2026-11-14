import { defineStore } from 'pinia'
import { ref, watch, nextTick } from 'vue'
import { updateWindowTheme } from '@/api/tauri'

const DEFAULT_FONT_SIZE = '14px'
type FontSize = '12px' | typeof DEFAULT_FONT_SIZE | '16px'

export const useSettingsStore = defineStore('settings', () => {
  const isDark = ref(typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false)
  const fontSize = ref<FontSize>(DEFAULT_FONT_SIZE)
  const compactLayout = ref(false)

  // Apply dark mode immediately
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', isDark.value)
    void updateWindowTheme(isDark.value)
  }

  let transitionTimer: ReturnType<typeof setTimeout> | null = null
  let isViewTransitioning = false

  // Watch for changes and apply immediately with coordinated transition
  watch(isDark, (val) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      if (!isViewTransitioning) {
        root.classList.add('theme-in-transition')
        root.classList.toggle('dark', val)
        if (transitionTimer) clearTimeout(transitionTimer)
        transitionTimer = setTimeout(() => {
          root.classList.remove('theme-in-transition')
          transitionTimer = null
        }, 500)
      }
      void updateWindowTheme(val)
      window.dispatchEvent(new CustomEvent('sc-theme-change', { detail: { dark: val, isViewTransition: isViewTransitioning } }))
    }
  })

  watch(fontSize, (val) => {
    if (typeof document !== 'undefined') {
      const adjustment = Number.parseInt(val, 10) - Number.parseInt(DEFAULT_FONT_SIZE, 10)
      document.documentElement.style.setProperty('--ui-font-size-adjustment', `${adjustment}px`)
    }
  }, { immediate: true, flush: 'sync' })

  watch(compactLayout, (val) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('compact-layout', val)
    }
  }, { immediate: true, flush: 'sync' })

  const setFontSize = (value: string) => {
    fontSize.value = normalizeFontSize(value)
  }

  const toggleDark = (event?: MouseEvent | { clientX: number; clientY: number }) => {
    if (typeof document === 'undefined') {
      isDark.value = !isDark.value
      return
    }

    const hasViewTransition = 'startViewTransition' in document
      && window.matchMedia('(prefers-reduced-motion: no-preference)').matches

    let x = window.innerWidth * 0.88
    let y = 24
    if (event) {
      if ('clientX' in event && typeof event.clientX === 'number' && (event.clientX > 0 || event.clientY > 0)) {
        x = event.clientX
        y = event.clientY
      } else if ('currentTarget' in event && event.currentTarget) {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
        x = rect.left + rect.width / 2
        y = rect.top + rect.height / 2
      }
    }

    document.documentElement.style.setProperty('--curtain-x', `${x}px`)
    document.documentElement.style.setProperty('--curtain-y', `${y}px`)

    if (!hasViewTransition) {
      isDark.value = !isDark.value
      return
    }

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    isViewTransitioning = true
    const transition = (document as any).startViewTransition(async () => {
      isDark.value = !isDark.value
      document.documentElement.classList.toggle('dark', isDark.value)
      await nextTick()
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`
      ]
      document.documentElement.animate(
        {
          clipPath
        },
        {
          duration: 480,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      )
    })

    transition.finished.finally(() => {
      isViewTransitioning = false
    })
  }

  return { isDark, fontSize, compactLayout, setFontSize, toggleDark }
}, {
  persist: {
    serializer: {
      serialize: JSON.stringify,
      deserialize: (value) => {
        const settings = JSON.parse(value) as { isDark?: unknown; fontSize?: unknown; compactLayout?: unknown } | null
        return {
          ...(typeof settings?.isDark === 'boolean' ? { isDark: settings.isDark } : {}),
          fontSize: normalizeFontSize(settings?.fontSize),
          compactLayout: settings?.compactLayout === true,
        }
      },
    },
  },
})

function normalizeFontSize(value: unknown): FontSize {
  return value === '12px' || value === '16px' ? value : DEFAULT_FONT_SIZE
}
