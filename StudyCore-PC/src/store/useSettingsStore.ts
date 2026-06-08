import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const isDark = ref(typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false)
  const fontSize = ref('14px')
  const compactLayout = ref(false)

  // Apply dark mode immediately
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', isDark.value)
  }

  // Watch for changes and apply immediately
  watch(isDark, (val) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', val)
      window.dispatchEvent(new CustomEvent('sc-theme-change', { detail: { dark: val } }))
    }
  })

  watch(fontSize, (val) => {
    if (typeof document !== 'undefined') {
      const sizeNum = val.match(/\d+/)
      if (sizeNum) {
        document.documentElement.style.setProperty('--font-size-base-override', sizeNum[0] + 'px')
      }
    }
  })

  watch(compactLayout, (val) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('compact-layout', val)
    }
  })

  const toggleDark = () => {
    isDark.value = !isDark.value
  }

  return { isDark, fontSize, compactLayout, toggleDark }
}, {
  persist: true
})
