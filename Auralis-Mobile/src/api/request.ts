import { getRuntimeConfig } from '@/config/runtime'
import { sendHttpRequest } from '@/platform/http'
import { createRequestExecutor, type CoreRequestOptions } from './requestCore'

export interface AuthSessionBridge {
  getAccessToken(): string | null
  getLoginGeneration(): symbol
  refreshAccessToken(): Promise<boolean>
  onUnauthenticated(generation: symbol): void
}

const anonymousGeneration = Symbol('anonymous')
let authSessionBridge: AuthSessionBridge = {
  getAccessToken: () => null,
  getLoginGeneration: () => anonymousGeneration,
  refreshAccessToken: async () => false,
  onUnauthenticated: () => undefined,
}

export function configureAuthSessionBridge(bridge: AuthSessionBridge): void {
  authSessionBridge = bridge
}

export interface RequestOptions extends CoreRequestOptions {}

export function request<T = unknown>(options: RequestOptions): Promise<T> {
  const config = getRuntimeConfig()
  const execute = createRequestExecutor({
    apiBaseUrl: config.apiBaseUrl,
    request: sendHttpRequest,
    getAccessToken: () => authSessionBridge.getAccessToken(),
    getLoginGeneration: () => authSessionBridge.getLoginGeneration(),
    refreshAccessToken: () => authSessionBridge.refreshAccessToken(),
    onUnauthenticated: (generation) => authSessionBridge.onUnauthenticated(generation ?? anonymousGeneration),
  })
  return execute<T>(options)
}

export const mobileRequest = {
  request,
  get<T = unknown>(url: string, params?: Record<string, unknown>) {
    return request<T>({ url, method: 'GET', params })
  },
  post<T = unknown>(url: string, data?: unknown, options: Partial<RequestOptions> = {}) {
    return request<T>({ ...options, url, method: 'POST', data })
  },
  put<T = unknown>(url: string, data?: unknown, options: Partial<RequestOptions> = {}) {
    return request<T>({ ...options, url, method: 'PUT', data })
  },
  delete<T = unknown>(url: string, data?: unknown, params?: Record<string, unknown>) {
    return request<T>({ url, method: 'DELETE', data, params })
  },
}

export default mobileRequest
