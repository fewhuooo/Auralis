import { getClientRuntimeConfig } from '../config/runtime.ts'

const DEVICE_ID_KEY = 'auralis_device_id'
const MAX_DEVICE_NAME_LENGTH = 64

export type DevicePlatform = 'WEB' | 'WINDOWS'

export interface DeviceIdentity {
  clientDeviceKey: string
  deviceName: string
  platform: DevicePlatform
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(id: unknown): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim())
}

export function getOrCreateClientDeviceKey(storage?: Storage | null): string {
  const store = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null)
  if (store) {
    try {
      const existing = store.getItem(DEVICE_ID_KEY)
      if (existing && isValidUuid(existing)) {
        return existing.trim()
      }
    } catch {
      // Ignore storage read errors
    }
  }

  const newId = generateUuid()
  if (store) {
    try {
      store.setItem(DEVICE_ID_KEY, newId)
    } catch {
      // Ignore storage write errors
    }
  }
  return newId
}

export function resolveDevicePlatform(isTauri?: boolean): DevicePlatform {
  if (typeof isTauri === 'boolean') {
    return isTauri ? 'WINDOWS' : 'WEB'
  }
  try {
    const runtime = getClientRuntimeConfig()
    return runtime.isTauri ? 'WINDOWS' : 'WEB'
  } catch {
    return 'WEB'
  }
}

export function formatDeviceName(name?: string | null, isTauri?: boolean): string {
  const platform = resolveDevicePlatform(isTauri)
  const defaultName = platform === 'WINDOWS' ? 'Windows Desktop' : 'Web Browser'
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const target = trimmed.length > 0 ? trimmed : defaultName
  return target.slice(0, MAX_DEVICE_NAME_LENGTH)
}

export function getDeviceIdentity(options?: {
  storage?: Storage | null
  isTauri?: boolean
  customName?: string
}): DeviceIdentity {
  const clientDeviceKey = getOrCreateClientDeviceKey(options?.storage)
  const platform = resolveDevicePlatform(options?.isTauri)
  const deviceName = formatDeviceName(options?.customName, options?.isTauri)
  return {
    clientDeviceKey,
    deviceName,
    platform,
  }
}
