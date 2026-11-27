import type { DeviceSystemInfo } from '../api/deviceIdentity.ts'

export function getViewportMetrics(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 390, height: 844 }
  }
  const width = window.innerWidth || globalThis.screen?.width || 390
  const height = window.innerHeight || globalThis.screen?.height || 844
  return { width, height }
}

function resolveOsName(userAgent: string, navPlatform: string): string {
  const combined = `${userAgent} ${navPlatform}`.toLowerCase()
  if (/android/i.test(combined)) return 'android'
  if (/iphone|ipad|ipod|ios/i.test(combined)) return 'ios'
  if (/win/i.test(combined)) return 'windows'
  if (/mac/i.test(combined)) return 'mac'
  return 'web'
}

export function getDeviceSystemInfo(): DeviceSystemInfo {
  const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
  const navPlatform = typeof navigator !== 'undefined' ? (navigator.platform || '') : ''
  const platform = resolveOsName(userAgent, navPlatform)
  const androidModelMatch = userAgent.match(/Android[^;]*;\s*([^)]+?)\s*(?:Build\/|\))/i)
  const model = androidModelMatch?.[1]?.trim() || undefined
  return {
    platform,
    ...(model ? { model } : {}),
    system: platform,
  }
}
