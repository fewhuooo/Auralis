export type ServerDevicePlatform = 'WEB' | 'WINDOWS' | 'MACOS' | 'IOS' | 'ANDROID' | 'HARMONY' | 'UNKNOWN'

export interface DeviceIdentity {
  clientDeviceKey: string
  deviceName: string
  platform: ServerDevicePlatform
}

export interface DeviceStorage {
  get(key: string): unknown
  set(key: string, value: string): unknown
}

export interface DeviceSystemInfo {
  platform?: string
  model?: string
  deviceModel?: string
  system?: string
}

const DEVICE_ID_KEY = 'auralis:device:id:v2'

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16)
    const value = token === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function resolvePlatform(value = ''): ServerDevicePlatform {
  const platform = value.toLowerCase()
  if (platform.includes('ios') || platform.includes('iphone') || platform.includes('ipad')) return 'IOS'
  if (platform.includes('android')) return 'ANDROID'
  if (platform.includes('windows') || platform === 'win32') return 'WINDOWS'
  if (platform.includes('mac')) return 'MACOS'
  if (platform.includes('harmony')) return 'HARMONY'
  if (platform.includes('web') || platform === 'h5') return 'WEB'
  return 'UNKNOWN'
}

function resolveDeviceName(info: DeviceSystemInfo, platform: ServerDevicePlatform): string {
  const provided = [info.model, info.deviceModel].find((value) => typeof value === 'string' && value.trim())
  const fallback = platform === 'WEB' ? 'Mobile Web' : `${platform[0]}${platform.slice(1).toLowerCase()} Device`
  return String(provided || fallback).trim().slice(0, 64)
}

export function getOrCreateDeviceIdentity(
  storage: DeviceStorage,
  systemInfo: DeviceSystemInfo,
): DeviceIdentity {
  const stored = storage.get(DEVICE_ID_KEY)
  const clientDeviceKey = isUuid(stored) ? stored : createUuid()
  if (stored !== clientDeviceKey) storage.set(DEVICE_ID_KEY, clientDeviceKey)
  const platform = resolvePlatform(systemInfo.platform || systemInfo.system)
  return {
    clientDeviceKey,
    platform,
    deviceName: resolveDeviceName(systemInfo, platform),
  }
}
