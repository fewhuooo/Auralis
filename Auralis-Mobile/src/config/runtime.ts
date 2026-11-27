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

function isValidAuthority(authority: string): boolean {
  if (authority.startsWith('[')) {
    const ipv6Match = /^\[([0-9a-fA-F:]+)\](?::(\d+))?$/.exec(authority)
    if (!ipv6Match || !ipv6Match[1].includes(':')) return false
    if (ipv6Match[2] === undefined) return true
    const portNum = Number(ipv6Match[2])
    return portNum >= 1 && portNum <= 65535
  }
  const hostMatch = /^([a-zA-Z0-9.-]+)(?::(\d+))?$/.exec(authority)
  if (!hostMatch) return false
  const host = hostMatch[1]
  if (!host || host.startsWith('.') || host.endsWith('.') || host.includes('..')) {
    return false
  }
  if (hostMatch[2] === undefined) return true
  const portNum = Number(hostMatch[2])
  return portNum >= 1 && portNum <= 65535
}

function validateBaseUrl(value: string, protocols: string[], label: string): string {
  if (/\s/.test(value)) {
    throw new Error(`${label} must be an absolute URL`)
  }
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/.exec(value)
  if (!match) {
    throw new Error(`${label} must be an absolute URL`)
  }
  const protocol = match[1].toLowerCase()
  const authority = match[2]
  const query = match[4] ?? ''
  const hash = match[5] ?? ''
  if (authority.includes('@') || query || hash) {
    throw new Error(`${label} must not contain credentials, query, or fragment`)
  }
  if (!isValidAuthority(authority)) {
    throw new Error(`${label} must be an absolute URL`)
  }
  if (!protocols.includes(protocol)) {
    throw new Error(`${label} must use ${protocols.join(' or ')}`)
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
