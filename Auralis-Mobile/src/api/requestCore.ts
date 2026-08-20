import { ApiProblemError, assertDirectDto, parseProblemDetails } from './protocol.ts'

export interface CoreRequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: unknown
  params?: Record<string, unknown>
  timeout?: number
  skipAuthRefresh?: boolean
}

interface RequestAdapterOptions {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: unknown
  header: Record<string, string>
  timeout: number
  success(response: { statusCode: number; data?: unknown }): void
  fail(error: { errMsg?: string }): void
}

export interface RequestExecutorDependencies {
  apiBaseUrl: string
  request(options: RequestAdapterOptions): void
  getAccessToken(): string | null
  refreshAccessToken(): Promise<boolean>
  onUnauthenticated?(): void
}

function queryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  return entries.length > 0 ? `?${entries.join('&')}` : ''
}

export function createRequestExecutor(dependencies: RequestExecutorDependencies) {
  const execute = <T>(options: CoreRequestOptions, retried = false): Promise<T> => new Promise((resolve, reject) => {
    const token = dependencies.getAccessToken()
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) header.Authorization = `Bearer ${token}`

    dependencies.request({
      url: `${dependencies.apiBaseUrl}${options.url}${queryString(options.params)}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout || 15_000,
      async success(response) {
        const isRefreshRequest = options.url === '/api/auth/refresh'
        if (response.statusCode === 401 && !retried && !options.skipAuthRefresh && !isRefreshRequest) {
          try {
            if (await dependencies.refreshAccessToken()) {
              resolve(await execute<T>(options, true))
              return
            }
          } catch {
            // The normalized unauthenticated error below remains the public result.
          }
          dependencies.onUnauthenticated?.()
        }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(assertDirectDto(response.statusCode === 204 ? undefined : response.data) as T)
          return
        }
        reject(new ApiProblemError(parseProblemDetails(response.data, response.statusCode)))
      },
      fail(error) {
        reject(new Error(error.errMsg || 'Network Error'))
      },
    })
  })

  return execute
}
