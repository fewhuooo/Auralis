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
  _skipAuthRefresh?: boolean;
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

function requireReauthenticationForRefreshFailure(
  authStore: AuthStore,
  activeScopes: Set<SyncRequestScopeTicket>,
  message: string,
): RefreshAuthenticationRequiredError {
  const scopeKeys = new Set(Array.from(activeScopes)
    .filter((scope) => scope.isCurrent())
    .map((scope) => scope.key))
  authStore.requireReauthentication('登录会话已失效，请重新登录。')

  const failedGeneration = authStore.loginGeneration
  return new RefreshAuthenticationRequiredError(scopeKeys, () => authStore.loginGeneration === failedGeneration
    && authStore.requiresReauthentication, message)
}

refreshClient.interceptors.request.use((config) => {
  assertRequestCurrent(config)
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
  if (authStore.token) config.headers.Authorization = `Bearer ${authStore.token}`
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
  activeScopes: Set<SyncRequestScopeTicket>,
): Promise<string> {
  const authStore = session.getStore()
  const config: RetriableRequestConfig = {
    __auralisAuthSession: session,
    __auralisSyncScope: {
      key: Symbol('refresh-sync-scopes'),
      isCurrent: () => Array.from(activeScopes).every((scope) => scope.isCurrent()),
    },
  }
  assertRequestCurrent(config)
  const refreshToken = authStore.refreshToken
  if (!refreshToken) {
    throw requireReauthenticationForRefreshFailure(authStore, activeScopes, '登录会话已失效，请重新登录。')
  }

  try {
    const response = await refreshClient.post<AuthResult>('/api/auth/refresh', {
      refreshToken,
    }, config)
    assertRequestCurrent(config)
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
    const message =
      error instanceof Error ? `登录会话已失效：${error.message}` : '登录会话已失效，请重新登录。'
    throw requireReauthenticationForRefreshFailure(authStore, activeScopes, message)
  }
}

/** Shared by Axios and native-fetch SSE calls so a 401 only performs one refresh. */
export function refreshAccessToken(scope?: SyncRequestScopeTicket): Promise<string> {
  if (scope && !scope.isCurrent()) return Promise.reject(new SyncScopeChangedError())
  return refreshInSession(captureAuthSession(useAuthStore()), scope)
}

export async function refreshChatAccessToken(session: AuthRequestSession): Promise<string> {
  try {
    return await refreshInSession(session)
  } catch (error) {
    if (error instanceof RefreshAuthenticationRequiredError && error.claimLoginNavigation()) navigateToLogin()
    throw error
  }
}

function refreshInSession(session: AuthRequestSession, scope?: SyncRequestScopeTicket): Promise<string> {
  const authStore = session.getStore()
  const isSessionCurrent = () => session.isCurrent()
    && authStore.authStatus === 'authenticated'
    && Boolean(authStore.token && authStore.user?.id && authStore.serverDeviceId && authStore.sessionId)
    && (!scope || scope.isCurrent())

  if (!isSessionCurrent()) return Promise.reject(new SyncScopeChangedError())

  const existing = refreshFlights.get(session.generation)
  const activeScopes = existing?.scopes ?? new Set<SyncRequestScopeTicket>()
  if (scope) activeScopes.add(scope)
  const promise = existing?.promise ?? Promise.resolve()
    .then(() => performRefresh(session, activeScopes))
    .finally(() => refreshFlights.delete(session.generation))
  if (!existing) refreshFlights.set(session.generation, { promise, scopes: activeScopes })

  return promise.then((token) => {
    if (!isSessionCurrent()) throw new SyncScopeChangedError()
    return token
  })
}

function redirectToLogin(authStore: AuthStore): void {
  authStore.requireReauthentication('登录会话已失效，请重新登录。')
  navigateToLogin()
}

function navigateToLogin(): void {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
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
        && !isConfirmationFailure && !isLogoutPath(originalRequest.url ?? '')) {
        if (originalRequest._r4Retried || originalRequest._skipAuthRefresh) {
          assertRequestCurrent(originalRequest)
          redirectToLogin(session.getStore())
          throw createApiProblemError(error)
        }

        originalRequest._r4Retried = true
        const syncScope = originalRequest.__auralisSyncScope
        try {
          await refreshInSession(session, syncScope)
          assertRequestCurrent(originalRequest)
          return instance.request(originalRequest)
        } catch (refreshError) {
          if (refreshError instanceof RefreshAuthenticationRequiredError) {
            const matchesFailedRequest = syncScope
              ? refreshError.scopeKeys.has(syncScope.key)
              : refreshError.scopeKeys.size === 0
            if (matchesFailedRequest && refreshError.claimLoginNavigation()) navigateToLogin()
          } else if (!(refreshError instanceof SyncScopeChangedError)) {
            assertRequestCurrent(originalRequest)
            redirectToLogin(session.getStore())
          }
          throw refreshError
        }
      }

      throw createApiProblemError(error)
    },
  )
}

createResponseInterceptor(request)
createResponseInterceptor(aiRequest)

export { ApiProblemError }
export { request as default }
