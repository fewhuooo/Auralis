export type MobilePlatform = 'h5' | 'mp-weixin' | 'app' | 'tablet'

export interface RuntimeConfig {
  apiBaseUrl: string
  websocketBaseUrl: string
  platform: MobilePlatform
}

type RuntimeEnvironment = Record<string, unknown>

function requiredString(env: RuntimeEnvironment, key: string): string {
  const value = env[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} must be configured`)
  }
  return value.trim().replace(/\/+$/, '')
}

function validateBaseUrl(value: string, protocols: string[], label: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be an absolute URL`)
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${label} must use ${protocols.join(' or ')}`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query, or fragment`)
  }
  return value
}

export function resolveRuntimeConfig(
  env: RuntimeEnvironment,
  platform: MobilePlatform,
): RuntimeConfig {
  const apiBaseUrl = validateBaseUrl(
    requiredString(env, 'VITE_API_BASE_URL'),
    platform === 'mp-weixin' ? ['https:'] : ['https:', 'http:'],
    platform === 'mp-weixin' ? 'VITE_API_BASE_URL (HTTPS)' : 'VITE_API_BASE_URL',
  )
  const websocketBaseUrl = validateBaseUrl(
    requiredString(env, 'VITE_WS_BASE_URL'),
    platform === 'mp-weixin' ? ['wss:'] : ['wss:', 'ws:'],
    platform === 'mp-weixin' ? 'VITE_WS_BASE_URL (WSS)' : 'VITE_WS_BASE_URL',
  )
  return { apiBaseUrl, websocketBaseUrl, platform }
}

export function resolveWebsocketUrl(pathOrUrl: string, config: RuntimeConfig): string {
  if (/^wss?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${config.websocketBaseUrl}${path}`
}

function currentPlatform(): MobilePlatform {
  const platform = String(import.meta.env.UNI_PLATFORM || '').toLowerCase()
  if (platform === 'mp-weixin') return 'mp-weixin'
  if (platform === 'app' || platform === 'app-plus') return 'app'
  return 'h5'
}

export function getRuntimeConfig(): RuntimeConfig {
  return resolveRuntimeConfig(import.meta.env as RuntimeEnvironment, currentPlatform())
}
