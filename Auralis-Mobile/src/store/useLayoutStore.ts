import { defineStore } from 'pinia'
import { ref } from 'vue'

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
      uni.setStorageSync('__slide_dir', dir)
    } catch {
      // Ignore storage failure
    }
  }

  const getSlideDirection = (): 'right' | 'left' | 'up' | 'down' => {
    try {
      const stored = uni.getStorageSync('__slide_dir')
      if (stored === 'left' || stored === 'right' || stored === 'up' || stored === 'down') return stored
    } catch {
      // Ignore storage failure
    }
    return pageSlideDirection.value || 'right'
  }

  const isReturning = ref(false)

  const triggerReturn = (duration = 550) => {
    isReturning.value = true
    setTimeout(() => {
      isReturning.value = false
    }, duration)
  }

  const isExiting = ref(false)
  const exitDirection = ref<'right' | 'left' | 'up' | 'down'>('right')
  const exitingRoute = ref('')

  const startExit = (dir: 'right' | 'left' | 'up' | 'down', duration = 140, route = '') => {
    exitDirection.value = dir
    exitingRoute.value = route
    isExiting.value = true
    setTimeout(() => {
      isExiting.value = false
      exitingRoute.value = ''
    }, duration + 50)
  }

  const clearExit = () => {
    isExiting.value = false
    exitingRoute.value = ''
  }

  const isInitialRender = ref(true)
  const activeNavIndex = ref(0)
  const activeNavPath = ref('/pages/tablet/dashboard/index')

  const setActiveNav = (idx: number, path: string) => {
    activeNavIndex.value = idx
    activeNavPath.value = path
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
  }
})
