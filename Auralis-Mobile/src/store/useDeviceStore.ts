import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getAppTarget } from '@/router/target'

export type DeviceType = 'phone' | 'tablet'

export const useDeviceStore = defineStore('device', () => {
  const initialTarget = getAppTarget()
  const deviceType = ref<DeviceType>(initialTarget)
  const isTablet = ref(initialTarget === 'tablet')

  const detect = () => {
    const target = getAppTarget()
    deviceType.value = target
    isTablet.value = target === 'tablet'
  }

  return {
    deviceType,
    isTablet,
    detect,
  }
})
