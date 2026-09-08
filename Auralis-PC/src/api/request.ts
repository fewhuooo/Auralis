import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/useAuthStore'
import { createRefreshCoordinator } from '@/api/authRefresh'
import { ApiProblemError, assertDirectDto, createApiProblemError } from '@/api/httpError'
import { getClientRuntimeConfig } from '@/config/runtime'
import {
  AuthenticationRequiredError,
  isPublicAuthPath,
  shouldBlockProtectedRequest,
} from '@/auth/authSessionState'

interface AuthTokensResponse {
  tokens?: {
    accessToken?: unknown;
    refreshToken?: unknown;
  };
}

interface RetriableRequestConfig extends AxiosRequestConfig {
  _r4Retried?: boolean;
  _skipAuthRefresh?: boolean;
}

const runtime = getClientRuntimeConfig()

const request = axios.create({
  baseURL: runtime.apiBaseUrl,
  timeout: 10000,
  headers: { Accept: 'application/json' },
})

export const aiRequest = axios.create({
  baseURL: runtime.apiBaseUrl,
  timeout: 60000,
  headers: { Accept: 'application/json' },
})

const refreshClient = axios.create({
  baseURL: runtime.apiBaseUrl,
  timeout: 10000,
  headers: { Accept: 'application/json' },
})

function attachToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const authStore = useAuthStore()
  if (shouldBlockProtectedRequest(config.url ?? '', authStore.requiresReauthentication)) {
    throw new AuthenticationRequiredError()
  }
  if (authStore.token) config.headers.Authorization = `Bearer ${authStore.token}`
  return config
}

function accessTokenFromResponse(response: unknown): string {
  if (!response || typeof response !== 'object') throw new Error('Refresh response is empty')
  const tokens = (response as AuthTokensResponse).tokens
  if (!tokens || typeof tokens.accessToken !== 'string' || typeof tokens.refreshToken !== 'string') {
    throw new Error('Refresh response does not contain direct auth tokens')
  }
  return tokens.accessToken
}

async function performRefresh(): Promise<string> {
  const authStore = useAuthStore()
  if (!authStore.refreshToken) {
    authStore.requireReauthentication('登录会话已失效，请重新登录。')
    throw new AuthenticationRequiredError()
  }

  try {
    const response = await refreshClient.post<AuthTokensResponse>('/api/auth/refresh', {
      refreshToken: authStore.refreshToken,
    })
    const directResponse = assertDirectDto(response.data)
    const accessToken = accessTokenFromResponse(directResponse)
    const tokens = (directResponse as AuthTokensResponse).tokens
    authStore.token = accessToken
    authStore.refreshToken = tokens?.refreshToken as string
    return accessToken
  } catch (error) {
    authStore.requireReauthentication('登录会话已失效，请重新登录。')
    throw new AuthenticationRequiredError(
      error instanceof Error ? `登录会话已失效：${error.message}` : '登录会话已失效，请重新登录。',
    )
  }
}

const refreshCoordinator = createRefreshCoordinator(performRefresh)

/** Shared by Axios and native-fetch SSE calls so a 401 only performs one refresh. */
export function refreshAccessToken(): Promise<string> {
  return refreshCoordinator.refresh()
}

function redirectToLogin(): void {
  useAuthStore().requireReauthentication('登录会话已失效，请重新登录。')
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

function withAuthorization(config: AxiosRequestConfig, token: string): AxiosRequestConfig {
  config.headers = config.headers ?? {}
  if (typeof config.headers === 'object' && 'set' in config.headers && typeof config.headers.set === 'function') {
    config.headers.set('Authorization', `Bearer ${token}`)
  } else {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

function createResponseInterceptor(instance: AxiosInstance): void {
  instance.interceptors.request.use(attachToken)
  instance.interceptors.response.use(
    (response) => assertDirectDto(response.data),
    async (error: AxiosError) => {
      const originalRequest = error.config as RetriableRequestConfig | undefined
      if (
        error.response?.status === 401 &&
        originalRequest &&
        !originalRequest._r4Retried &&
        !originalRequest._skipAuthRefresh &&
        !isPublicAuthPath(originalRequest.url ?? '')
      ) {
        originalRequest._r4Retried = true
        try {
          const token = await refreshAccessToken()
          return instance.request(withAuthorization(originalRequest, token))
        } catch (refreshError) {
          redirectToLogin()
          return Promise.reject(refreshError)
        }
      }

      if (error.response?.status === 401 && originalRequest && !isPublicAuthPath(originalRequest.url ?? '')) {
        redirectToLogin()
      }

      const problem = createApiProblemError(error)
      return Promise.reject(problem)
    },
  )
}

createResponseInterceptor(request)
createResponseInterceptor(aiRequest)

export { ApiProblemError }
export { request as default }
