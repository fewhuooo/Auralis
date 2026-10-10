import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { watch } from 'vue'
import { useAuthStore } from '@/store/useAuthStore'
import { ApiProblemError, assertDirectDto, createApiProblemError } from '@/api/httpError'
import { getClientRuntimeConfig } from '@/config/runtime'
import { beginServiceRequest, observeServiceAvailable, observeServiceFailure } from '@/services/serviceAvailability'
import {
  AuthenticationRequiredError,
  isAccountDeletionConfirmationFailure,
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
  serviceAvailabilityRequestId?: number;
  __auralisSyncScope?: SyncRequestScopeTicket;
}

interface ServiceAvailabilityRequestConfig extends InternalAxiosRequestConfig {
  serviceAvailabilityRequestId?: number;
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

interface RefreshSessionState {
  identity: string
  generation: number
  activeFlights: number
  stopWatching: (() => void) | null
  flights: Map<string, RefreshFlight>
}

interface RefreshFlight {
  promise: Promise<string>
  scopes: Set<SyncRequestScopeTicket>
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

function scopeFrom(config: AxiosRequestConfig | InternalAxiosRequestConfig | undefined): SyncRequestScopeTicket | undefined {
  return (config as SyncScopedAxiosRequestConfig | undefined)?.__auralisSyncScope;
}

function assertScopeCurrent(scope: SyncRequestScopeTicket | undefined): void {
  if (scope && !scope.isCurrent()) throw new SyncScopeChangedError();
}

const refreshSessions = new WeakMap<object, RefreshSessionState>()

function authSessionIdentity(authStore: ReturnType<typeof useAuthStore>): string {
  return JSON.stringify([
    authStore.user?.id ?? null,
    authStore.serverDeviceId ?? null,
    authStore.sessionId ?? null,
  ])
}

function getRefreshSessionState(authStore: ReturnType<typeof useAuthStore>): RefreshSessionState {
  let state = refreshSessions.get(authStore)
  if (!state) {
    state = {
      identity: authSessionIdentity(authStore),
      generation: 0,
      activeFlights: 0,
      stopWatching: null,
      flights: new Map(),
    }
    refreshSessions.set(authStore, state)
  }

  const identity = authSessionIdentity(authStore)
  if (identity !== state.identity) {
    state.identity = identity
    state.generation += 1
  }
  if (!state.stopWatching) {
    state.stopWatching = watch(
      () => authSessionIdentity(authStore),
      (nextIdentity) => {
        if (nextIdentity !== state.identity) {
          state.identity = nextIdentity
          state.generation += 1
        }
      },
      { flush: 'sync' },
    )
  }
  return state
}

function requireReauthenticationForRefreshFailure(
  authStore: ReturnType<typeof useAuthStore>,
  activeScopes: Set<SyncRequestScopeTicket>,
  message: string,
): RefreshAuthenticationRequiredError {
  const scopeKeys = new Set(Array.from(activeScopes)
    .filter((scope) => scope.isCurrent())
    .map((scope) => scope.key))
  authStore.requireReauthentication('登录会话已失效，请重新登录。')

  const state = getRefreshSessionState(authStore)
  const failedIdentity = authSessionIdentity(authStore)
  const failedGeneration = state.generation
  return new RefreshAuthenticationRequiredError(scopeKeys, () => state.generation === failedGeneration
    && state.identity === failedIdentity
    && authSessionIdentity(authStore) === failedIdentity
    && authStore.authStatus === 'reauthentication-required'
    && authStore.requiresReauthentication, message)
}

refreshClient.interceptors.request.use((config) => {
  assertScopeCurrent(scopeFrom(config));
  return config;
});

function attachToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  assertScopeCurrent(scopeFrom(config));
  const authStore = useAuthStore()
  if (shouldBlockProtectedRequest(config.url ?? '', authStore.requiresReauthentication)) {
    throw new AuthenticationRequiredError()
  }
  if (authStore.token) config.headers.Authorization = `Bearer ${authStore.token}`
  const availabilityConfig = config as ServiceAvailabilityRequestConfig
  availabilityConfig.serviceAvailabilityRequestId = beginServiceRequest()
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

async function performRefresh(
  scope: SyncRequestScopeTicket,
  activeScopes: Set<SyncRequestScopeTicket>,
): Promise<string> {
  const authStore = useAuthStore()
  const assertCurrent = () => {
    assertScopeCurrent(scope)
    for (const activeScope of activeScopes) assertScopeCurrent(activeScope)
  }
  assertCurrent()
  const refreshToken = authStore.refreshToken
  if (!refreshToken) {
    throw requireReauthenticationForRefreshFailure(authStore, activeScopes, '登录会话已失效，请重新登录。')
  }

  try {
    const response = await refreshClient.post<AuthTokensResponse>('/api/auth/refresh', {
      refreshToken,
    }, { __auralisSyncScope: scope } as SyncScopedAxiosRequestConfig)
    assertCurrent()
    const directResponse = assertDirectDto(response.data)
    const accessToken = accessTokenFromResponse(directResponse)
    const tokens = (directResponse as AuthTokensResponse).tokens
    assertCurrent()
    authStore.token = accessToken
    authStore.refreshToken = tokens?.refreshToken as string
    return accessToken
  } catch (error) {
    assertCurrent()
    if (error instanceof SyncScopeChangedError) throw error
    const message =
      error instanceof Error ? `登录会话已失效：${error.message}` : '登录会话已失效，请重新登录。'
    throw requireReauthenticationForRefreshFailure(authStore, activeScopes, message)
  }
}

/** Shared by Axios and native-fetch SSE calls so a 401 only performs one refresh. */
export function refreshAccessToken(scope?: SyncRequestScopeTicket): Promise<string> {
  try {
    assertScopeCurrent(scope)
  } catch (error) {
    return Promise.reject(error)
  }

  const authStore = useAuthStore()
  const state = getRefreshSessionState(authStore)
  const identity = authSessionIdentity(authStore)
  const generation = state.generation
  const key = JSON.stringify([generation, identity])
  const isSessionCurrent = () => state.generation === generation
    && state.identity === identity
    && authSessionIdentity(authStore) === identity
    && authStore.authStatus === 'authenticated'
    && Boolean(authStore.token && authStore.user?.id && authStore.serverDeviceId && authStore.sessionId)
    && (!scope || scope.isCurrent())

  if (!isSessionCurrent()) return Promise.reject(new SyncScopeChangedError())

  const existing = state.flights.get(key)
  if (existing) {
    if (scope) existing.scopes.add(scope)
    if (!isSessionCurrent()) return Promise.reject(new SyncScopeChangedError())
    return existing.promise.then((token) => {
      if (!isSessionCurrent()) throw new SyncScopeChangedError()
      return token
    })
  }

  const activeScopes = new Set<SyncRequestScopeTicket>()
  if (scope) activeScopes.add(scope)
  const refreshTicket: SyncRequestScopeTicket = {
    key: Symbol('auth-refresh-session'),
    isCurrent: () => isSessionCurrent() && Array.from(activeScopes).every((activeScope) => activeScope.isCurrent()),
  }
  const flight: RefreshFlight = {
    promise: Promise.resolve().then(() => performRefresh(refreshTicket, activeScopes)),
    scopes: activeScopes,
  }
  state.flights.set(key, flight)
  state.activeFlights += 1
  flight.promise = flight.promise.finally(() => {
      if (state.flights.get(key) === flight) state.flights.delete(key)
      state.activeFlights -= 1
      if (state.activeFlights === 0) {
        state.stopWatching?.()
        state.stopWatching = null
      }
    })

  return flight.promise.then((token) => {
    if (!isSessionCurrent()) throw new SyncScopeChangedError()
    return token
  })
}

function redirectToLogin(): void {
  useAuthStore().requireReauthentication('登录会话已失效，请重新登录。')
  navigateToLogin()
}

function navigateToLogin(): void {
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
    (response) => {
      assertScopeCurrent(scopeFrom(response.config));
      observeServiceAvailable((response.config as ServiceAvailabilityRequestConfig).serviceAvailabilityRequestId)
      return assertDirectDto(response.data)
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as RetriableRequestConfig | undefined
      const syncScope = scopeFrom(originalRequest)
      try {
        assertScopeCurrent(syncScope)
      } catch (scopeError) {
        return Promise.reject(scopeError)
      }
      observeServiceFailure(originalRequest?.serviceAvailabilityRequestId, error.response?.status, error.code)
      const isDeletionConfirmationFailure = originalRequest
        ? isAccountDeletionConfirmationFailure(originalRequest.url ?? '', originalRequest.method, error.response?.data)
        : false
      if (
        error.response?.status === 401 &&
        originalRequest &&
        !originalRequest._r4Retried &&
        !originalRequest._skipAuthRefresh &&
        !isDeletionConfirmationFailure &&
        !isPublicAuthPath(originalRequest.url ?? '')
      ) {
        originalRequest._r4Retried = true
        try {
          const token = await refreshAccessToken(syncScope)
          assertScopeCurrent(syncScope)
          return instance.request(withAuthorization(originalRequest, token))
        } catch (refreshError) {
          if (refreshError instanceof RefreshAuthenticationRequiredError) {
            const matchesFailedRequest = syncScope
              ? refreshError.scopeKeys.has(syncScope.key)
              : refreshError.scopeKeys.size === 0
            if (matchesFailedRequest && refreshError.claimLoginNavigation()) navigateToLogin()
          } else if (refreshError instanceof SyncScopeChangedError) {
            return Promise.reject(refreshError)
          } else if (!syncScope || syncScope.isCurrent()) {
            redirectToLogin()
          }
          return Promise.reject(refreshError)
        }
      }

      if (error.response?.status === 401 && originalRequest && !isDeletionConfirmationFailure && !isPublicAuthPath(originalRequest.url ?? '')) {
        if (!syncScope || syncScope.isCurrent()) redirectToLogin()
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
