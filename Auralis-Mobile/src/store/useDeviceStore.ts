import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DeviceType = 'phone' | 'tablet'

export interface DeviceSystemInfo {
  deviceType?: string
  windowWidth?: number
  screenWidth?: number
  windowHeight?: number
  screenHeight?: number
}

/** Resolves phone vs tablet layout from system info, honoring pad deviceType in portrait. */
export function resolveDeviceType(sysInfo: DeviceSystemInfo): DeviceType {
  if (String(sysInfo.deviceType || '').toLowerCase() === 'pad') {
    return 'tablet'
  }
  const width = sysInfo.windowWidth || sysInfo.screenWidth || 0
  const height = sysInfo.windowHeight || sysInfo.screenHeight || 0
  return width >= 768 && height >= 500 ? 'tablet' : 'phone'
}

export const useDeviceStore = defineStore('device', () => {
  const deviceType = ref<DeviceType>('phone')
  const isTablet = ref(false)

  const detect = () => {
    // #ifdef APP-PHONE
    deviceType.value = 'phone'
    isTablet.value = false
    return
    // #endif

    // #ifdef APP-TABLET
    deviceType.value = 'tablet'
    isTablet.value = true
    return
    // #endif

    try {
      const sysInfo = uni.getSystemInfoSync()
      const resolved = resolveDeviceType(sysInfo)
      deviceType.value = resolved
      isTablet.value = resolved === 'tablet'
      const width = sysInfo.windowWidth || sysInfo.screenWidth
      const height = sysInfo.windowHeight || sysInfo.screenHeight
      console.log(`[DeviceStore] window: ${width}x${height}, type: ${deviceType.value}`)
    } catch (e) {
      console.error('[DeviceStore] Failed to detect device type:', e)
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
