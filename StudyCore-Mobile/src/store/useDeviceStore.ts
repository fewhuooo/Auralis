import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DeviceType = 'phone' | 'tablet'

export const useDeviceStore = defineStore('device', () => {
  const deviceType = ref<DeviceType>('phone')
  const isTablet = ref(false)

  const detect = () => {
    try {
      const sysInfo = uni.getSystemInfoSync()
      const screenWidth = sysInfo.screenWidth || sysInfo.windowWidth
      deviceType.value = screenWidth >= 768 ? 'tablet' : 'phone'
      isTablet.value = deviceType.value === 'tablet'
      console.log(`[DeviceStore] Detected screenWidth: ${screenWidth}, type: ${deviceType.value}`)
    } catch (e) {
      console.error('[DeviceStore] Failed to detect device type:', e)
      // Fallback
      deviceType.value = 'phone'
      isTablet.value = false
    }
  }

  return {
    deviceType,
    isTablet,
    detect
  }
})
