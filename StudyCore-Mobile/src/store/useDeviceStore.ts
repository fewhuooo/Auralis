import { defineStore } from 'pinia'
import { ref } from 'vue'

export type DeviceType = 'phone' | 'tablet'

export const useDeviceStore = defineStore('device', () => {
  const deviceType = ref<DeviceType>('phone')
  const isTablet = ref(false)

  const detect = () => {
    try {
      const sysInfo = uni.getSystemInfoSync()
      // windowWidth/windowHeight = 可用视口宽高（随旋转、分屏变化）
      const width = sysInfo.windowWidth || sysInfo.screenWidth
      const height = sysInfo.windowHeight || sysInfo.screenHeight

      // 判断是否应使用平板布局：
      // 1. 宽度 >= 768（满足平板基础宽度）
      // 2. 高度 >= 500（排除手机横屏的情况，手机横屏宽度大但高度通常<500）
      // 这样可以同时兼容：平板竖屏/横屏(平板布局)、手机竖屏/横屏(手机布局)、平板窄分屏(回退到手机布局)
      const isTabletLayout = width >= 768 && height >= 500

      deviceType.value = isTabletLayout ? 'tablet' : 'phone'
      isTablet.value = isTabletLayout
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
