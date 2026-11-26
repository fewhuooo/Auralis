import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getStorageItem, setStorageItem } from '../platform/storage.ts'

export const useLayoutStore = defineStore('layout', () => {
  const showDrawer = ref(false)
  const pageSlideDirection = ref<'right' | 'left' | 'up' | 'down'>('right')

  const openDrawer = () => {
    showDrawer.value = true
  }

  const closeDrawer = () => {
    showDrawer.value = false
  }

  const setSlideDirection = (dir: 'right' | 'left' | 'up' | 'down') => {
    pageSlideDirection.value = dir
    try {
      setStorageItem('__slide_dir', dir)
    } catch {
      // Ignore storage failure
    }
  }

  const getSlideDirection = (): 'right' | 'left' | 'up' | 'down' => {
    try {
      const stored = getStorageItem('__slide_dir')
      if (stored === 'left' || stored === 'right' || stored === 'up' || stored === 'down') return stored
    } catch {
      // Ignore storage failure
    }
    return pageSlideDirection.value || 'right'
  }

  const isReturning = ref(false)
  let returnTimer: ReturnType<typeof setTimeout> | null = null

  const triggerReturn = (duration = 550) => {
    if (returnTimer) clearTimeout(returnTimer)
    isReturning.value = true
    returnTimer = setTimeout(() => {
      returnTimer = null
      isReturning.value = false
    }, duration)
  }

  const isExiting = ref(false)
  const exitDirection = ref<'right' | 'left' | 'up' | 'down'>('right')
  const exitingRoute = ref('')
  let exitTimer: ReturnType<typeof setTimeout> | null = null

  const startExit = (dir: 'right' | 'left' | 'up' | 'down', duration = 140, route = '') => {
    if (exitTimer) clearTimeout(exitTimer)
    exitDirection.value = dir
    exitingRoute.value = route
    isExiting.value = true
    exitTimer = setTimeout(() => {
      exitTimer = null
      isExiting.value = false
      exitingRoute.value = ''
    }, Math.max(duration + 800, 900))
  }

  const clearExit = () => {
    if (exitTimer) {
      clearTimeout(exitTimer)
      exitTimer = null
    }
    isExiting.value = false
    exitingRoute.value = ''
  }

  const isInitialRender = ref(true)
  const activeNavIndex = ref(0)
  const activeNavPath = ref('/pages/tablet/dashboard/index')
  const aiReturnRoute = ref('')

  const setActiveNav = (idx: number, path: string) => {
    activeNavIndex.value = idx
    activeNavPath.value = path
  }

  const setReturnRoute = (route: string) => {
    if (route && !route.includes('/login')) {
      aiReturnRoute.value = route
    }
  }

  const consumeReturnRoute = (): string => {
    const next = aiReturnRoute.value
    aiReturnRoute.value = ''
    return next
  }

  return {
    showDrawer,
    openDrawer,
    closeDrawer,
    pageSlideDirection,
    setSlideDirection,
    getSlideDirection,
    isReturning,
    triggerReturn,
    isExiting,
    exitDirection,
    exitingRoute,
    startExit,
    clearExit,
    isInitialRender,
    activeNavIndex,
    activeNavPath,
    setActiveNav,
    setReturnRoute,
    consumeReturnRoute,
  }
})
