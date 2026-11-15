import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/useAuthStore'
import type { AuthResult } from '@/api/useAuthApi'
import { ApiProblemError, assertDirectDto, createApiProblemError } from '@/api/httpError'
import { getClientRuntimeConfig } from '@/config/runtime'
import { beginServiceRequest, observeServiceAvailable, observeServiceFailure } from '@/services/serviceAvailability'
import {
  AuthenticationRequiredError,
  isPasswordConfirmationFailure,
  isLogoutPath,
  isPublicAuthPath,
  shouldBlockProtectedRequest,
} from '@/auth/authSessionState'

interface RetriableRequestConfig extends SyncScopedAxiosRequestConfig {
  _r4Retried?: boolean;
  serviceAvailabilityRequestId?: number;
  __auralisAuthSession?: AuthRequestSession;
}

type AuthStore = ReturnType<typeof useAuthStore>

interface AuthRequestSession {
  readonly generation: symbol
  getStore(): AuthStore
  isCurrent(): boolean
}

export interface SyncRequestScopeTicket {
  readonly key: symbol;
  isCurrent(): boolean;
}

export interface SyncScopedAxiosRequestConfig extends AxiosRequestConfig {
  __auralisSyncScope?: SyncRequestScopeTicket;
}

export class SyncScopeChangedError extends Error {
  readonly code = 'SYNC_SCOPE_CHANGED';

  constructor() {
    super('SYNC_SCOPE_CHANGED');
    this.name = 'SyncScopeChangedError';
  }
}

interface RefreshFlight {
  promise: Promise<string>
  scopes: Set<SyncRequestScopeTicket>
  forLogout: boolean
}

class RefreshAuthenticationRequiredError extends AuthenticationRequiredError {
  private navigationClaimed = false;
  readonly scopeKeys: ReadonlySet<symbol>;
  readonly isFailedSessionCurrent: () => boolean;

  constructor(scopeKeys: ReadonlySet<symbol>, isFailedSessionCurrent: () => boolean, message: string) {
    super(message);
    this.name = 'RefreshAuthenticationRequiredError';
    this.scopeKeys = scopeKeys;
    this.isFailedSessionCurrent = isFailedSessionCurrent;
  }

  claimLoginNavigation(): boolean {
    if (this.navigationClaimed || !this.isFailedSessionCurrent()) return false;
    this.navigationClaimed = true;
    return true;
  }
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

function assertScopeCurrent(scope: SyncRequestScopeTicket | undefined): void {
  if (scope && !scope.isCurrent()) throw new SyncScopeChangedError();
}

function assertRequestCurrent(config: RetriableRequestConfig | undefined): void {
  assertScopeCurrent(config?.__auralisSyncScope)
  if (config?.__auralisAuthSession && !config.__auralisAuthSession.isCurrent()) {
    throw new SyncScopeChangedError()
  }
}

export function captureAuthSession(authStore: AuthStore): AuthRequestSession {
  const generation = authStore.loginGeneration
  return {
    generation,
    getStore: () => authStore,
    isCurrent: () => authStore.loginGeneration === generation,
  }
}

const refreshFlights = new Map<symbol, RefreshFlight>()

function invalidRefreshSession(
  authStore: AuthStore,
  flight: RefreshFlight,
): AuthenticationRequiredError {
  const message = '登录会话已失效，请重新登录。'
  // The explicit logout caller clears the captured session and owns navigation.
  if (flight.forLogout) return new AuthenticationRequiredError(message)
  const scopeKeys = new Set(Array.from(flight.scopes)
    .filter((scope) => scope.isCurrent())
    .map((scope) => scope.key))
  authStore.requireReauthentication(message)

  const failedGeneration = authStore.loginGeneration
  return new RefreshAuthenticationRequiredError(scopeKeys, () => authStore.loginGeneration === failedGeneration
    && authStore.requiresReauthentication, message)
}

refreshClient.interceptors.request.use((config) => {
  assertRequestCurrent(config)
  const requestConfig: RetriableRequestConfig = config
  requestConfig.serviceAvailabilityRequestId = beginServiceRequest()
  return guardDispatch(config)
});

function attachToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const requestConfig: RetriableRequestConfig = config
  assertRequestCurrent(requestConfig)
  const authStore = requestConfig.__auralisAuthSession?.getStore() ?? useAuthStore()
  const url = config.url ?? ''
  if (shouldBlockProtectedRequest(url, authStore.requiresReauthentication)) {
    throw new AuthenticationRequiredError()
  }
  if (!isPublicAuthPath(url) && authStore.token) config.headers.Authorization = `Bearer ${authStore.token}`
  requestConfig.serviceAvailabilityRequestId = beginServiceRequest()
  return requestConfig.__auralisAuthSession || requestConfig.__auralisSyncScope ? guardDispatch(config) : config
}

function guardDispatch(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  // Axios runs the last transform and calls the adapter in the same synchronous stack.
  const transforms = [config.transformRequest ?? []].flat()
  if (!transforms.includes(assertDispatchCurrent)) config.transformRequest = [...transforms, assertDispatchCurrent]
  return config
}

function assertDispatchCurrent(this: InternalAxiosRequestConfig, data: unknown): unknown {
  assertRequestCurrent(this)
  return data
}

async function performRefresh(
  session: AuthRequestSession,
  flight: RefreshFlight,
): Promise<string> {
  const authStore = session.getStore()
  const config: RetriableRequestConfig = {
    __auralisAuthSession: session,
    __auralisSyncScope: {
      key: Symbol('refresh-sync-scopes'),
      isCurrent: () => Array.from(flight.scopes).every((scope) => scope.isCurrent()),
    },
  }
  assertRequestCurrent(config)
  const refreshToken = authStore.refreshToken
  if (!refreshToken) {
    throw invalidRefreshSession(authStore, flight)
  }

  try {
    const response = await refreshClient.post<AuthResult>('/api/auth/refresh', {
      refreshToken,
    }, config)
    assertRequestCurrent(config)
    const responseConfig: RetriableRequestConfig = response.config
    observeServiceAvailable(responseConfig.serviceAvailabilityRequestId)
    const result = assertDirectDto(response.data)
    if (typeof result?.tokens?.accessToken !== 'string' || typeof result.tokens.refreshToken !== 'string'
      || typeof result.sessionId !== 'string' || !result.sessionId) {
      throw new Error('Refresh response does not contain an auth token pair and session ID')
    }
    authStore.applyRefresh(result.tokens, result.sessionId)
    return result.tokens.accessToken
  } catch (error) {
    assertRequestCurrent(config)
    if (error instanceof SyncScopeChangedError) throw error
    const axiosError = axios.isAxiosError(error) ? error : undefined
    const responseConfig: RetriableRequestConfig | undefined = axiosError?.config
    const status = axiosError?.response?.status
    observeServiceFailure(responseConfig?.serviceAvailabilityRequestId, status, axiosError?.code)
    if (status === 401) {
      throw invalidRefreshSession(authStore, flight)
    }
    throw new ApiProblemError({
      title: 'Session refresh failed',
      status: status ?? (axiosError && !axiosError.response ? 0 : 500),
      code: 'AUTH_REFRESH_UNAVAILABLE',
      detail: '暂时无法续期登录，请检查网络或稍后重试。',
    })
  }
}

/** Shared by Axios and native-fetch SSE calls so a 401 only performs one refresh. */
export function refreshAccessToken(scope?: SyncRequestScopeTicket): Promise<string> {
  if (scope && !scope.isCurrent()) return Promise.reject(new SyncScopeChangedError())
  return refreshInSession(captureAuthSession(useAuthStore()), scope)
}

export function refreshInSession(
  session: AuthRequestSession,
  scope?: SyncRequestScopeTicket,
  forLogout = false,
): Promise<string> {
  const authStore = session.getStore()
  const isSessionCurrent = () => session.isCurrent()
    && authStore.authStatus === 'authenticated'
    && Boolean(authStore.token && authStore.user?.id && authStore.serverDeviceId && authStore.sessionId)
    && (!scope || scope.isCurrent())

  if (!isSessionCurrent()) return Promise.reject(new SyncScopeChangedError())

  const flight: RefreshFlight = refreshFlights.get(session.generation) ?? {
    scopes: new Set(),
    forLogout,
    promise: Promise.resolve()
      .then(() => performRefresh(session, flight))
      .finally(() => refreshFlights.delete(session.generation)),
  }
  if (scope) flight.scopes.add(scope)
  if (forLogout) flight.forLogout = true
  refreshFlights.set(session.generation, flight)

  return flight.promise.then(
    (token) => {
      if (!isSessionCurrent()) throw new SyncScopeChangedError()
      return token
    },
    (error: unknown) => {
      if (error instanceof RefreshAuthenticationRequiredError
        && (!scope || error.scopeKeys.has(scope.key))
        && error.claimLoginNavigation()) {
        navigateToLogin()
      }
      throw error
    },
  )
}

function navigateToLogin(): void {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    const location = window.location
    const returnPath = location.pathname + (location.search ?? '') + (location.hash ?? '')
    window.location.assign(returnPath === '/' ? '/login' : `/login?redirect=${encodeURIComponent(returnPath)}`)
  }
}

function createResponseInterceptor(instance: AxiosInstance): void {
  instance.interceptors.request.use(attachToken, undefined, {
    // Axios evaluates runWhen before queuing attachToken and its dispatch checks.
    runWhen(config) {
      const requestConfig: RetriableRequestConfig = config
      if (!isPublicAuthPath(config.url ?? '')) {
        requestConfig.__auralisAuthSession ??= captureAuthSession(useAuthStore())
      }
      return true
    },
  })
  instance.interceptors.response.use(
    (response) => {
      const config: RetriableRequestConfig = response.config
      assertRequestCurrent(config)
      observeServiceAvailable(config.serviceAvailabilityRequestId)
      return assertDirectDto(response.data)
    },
    async (error: AxiosError) => {
      if (error instanceof SyncScopeChangedError) throw error
      const originalRequest: RetriableRequestConfig | undefined = error.config
      assertRequestCurrent(originalRequest)
      observeServiceFailure(originalRequest?.serviceAvailabilityRequestId, error.response?.status, error.code)
      const isConfirmationFailure = originalRequest
        ? isPasswordConfirmationFailure(originalRequest.url ?? '', originalRequest.method, error.response?.data)
        : false
      const session = originalRequest?.__auralisAuthSession
      if (error.response?.status === 401 && originalRequest && session
        && !isConfirmationFailure) {
        if (originalRequest._r4Retried) throw createApiProblemError(error)

        originalRequest._r4Retried = true
        const isLogout = isLogoutPath(originalRequest.url ?? '')
        try {
          await refreshInSession(session, originalRequest.__auralisSyncScope, isLogout)
        } catch (refreshError) {
          if (!isLogout || !(refreshError instanceof AuthenticationRequiredError)) throw refreshError
          assertRequestCurrent(originalRequest)
          return undefined
        }
        assertRequestCurrent(originalRequest)
        return instance.request(originalRequest)
      }

      throw createApiProblemError(error)
    },
  )
}

createResponseInterceptor(request)
createResponseInterceptor(aiRequest)

export { ApiProblemError }
export { request as default }
