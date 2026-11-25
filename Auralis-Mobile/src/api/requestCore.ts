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
  getLoginGeneration?(): symbol
  onUnauthenticated?(generation?: symbol): void
}

function queryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  return entries.length > 0 ? `?${entries.join('&')}` : ''
}

function normalizeAuthPath(url: string): string {
  return url.split('?', 1)[0].replace(/^https?:\/\/[^/]+/i, '')
}

export function isPasswordConfirmationFailure(
  url: string,
  method: string | undefined,
  responseData: unknown,
): boolean {
  const path = normalizeAuthPath(url)
  const verb = (method || 'GET').toUpperCase()
  const confirmsPassword = (verb === 'DELETE' && path === '/api/auth/me')
    || (verb === 'PUT' && path === '/api/auth/password')
  if (!confirmsPassword || !responseData || typeof responseData !== 'object') {
    return false
  }
  const problem = responseData as { code?: unknown; detail?: unknown }
  return problem.code === 'UNAUTHENTICATED' && problem.detail === 'Invalid credentials'
}

const publicAuthRoutes = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/register/email-code',
  '/api/auth/password/reset/email-code',
  '/api/auth/password/reset',
  '/api/auth/refresh',
])

export function createRequestExecutor(dependencies: RequestExecutorDependencies) {
  const execute = <T>(
    options: CoreRequestOptions,
    retried = false,
    generation = dependencies.getLoginGeneration?.(),
  ): Promise<T> => new Promise((resolve, reject) => {
    const path = normalizeAuthPath(options.url)
    const publicAuth = publicAuthRoutes.has(path)
    const isCurrent = () => publicAuth || generation === dependencies.getLoginGeneration?.()
    const token = publicAuth ? null : dependencies.getAccessToken()
    const header: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) header.Authorization = `Bearer ${token}`

    dependencies.request({
      url: `${dependencies.apiBaseUrl}${options.url}${queryString(options.params)}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout || 15_000,
      async success(response) {
        if (!isCurrent()) {
          reject(new Error('登录状态已变化，请重试。'))
          return
        }
        const skipUnauthorizedHandling = publicAuth
          || path === '/api/auth/logout'
          || isPasswordConfirmationFailure(options.url, options.method, response.data)
        if (response.statusCode === 401 && !retried && !options.skipAuthRefresh && !skipUnauthorizedHandling) {
          try {
            const refreshed = await dependencies.refreshAccessToken()
            if (!isCurrent()) throw new Error('登录状态已变化，请重试。')
            if (refreshed) {
              resolve(await execute<T>(options, true, generation))
              return
            }
          } catch (error) {
            reject(error)
            return
          }
          dependencies.onUnauthenticated?.(generation)
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
