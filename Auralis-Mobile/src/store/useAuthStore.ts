import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { components } from '@/api/generated/schema'
import { getOrCreateDeviceIdentity } from '@/api/deviceIdentity'
import { ApiProblemError, createRefreshCoordinator } from '@/api/protocol'
import { configureAuthSessionBridge } from '@/api/request'
import { useAuthApi } from '@/api/useAuthApi'
import { localDataScope } from '@/services/localDataScope'
import { purgeLegacyLocalData } from '@/services/legacyDataPurge'

type AuthResult = components['schemas']['AuthResult']
type TokenPair = components['schemas']['TokenPair']
type UserView = components['schemas']['UserView']

interface PersistedAuthSession {
  user: UserView
  tokens: TokenPair
  sessionId: string
  serverDeviceId: string
}

const AUTH_STORAGE_KEY = 'auralis:auth:v2'

function loadPersistedSession(): PersistedAuthSession | null {
  const value = uni.getStorageSync(AUTH_STORAGE_KEY)
  if (!value) return null
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed?.user?.id || !parsed?.tokens?.accessToken || !parsed?.tokens?.refreshToken
      || !parsed?.sessionId || !parsed?.serverDeviceId) {
      uni.removeStorageSync(AUTH_STORAGE_KEY)
      return null
    }
    return parsed as PersistedAuthSession
  } catch {
    return null
  }
}

function normalizeAuthResult(result: AuthResult): PersistedAuthSession {
  if (!result.user?.id || !result.user.username || !result.tokens?.accessToken
    || !result.tokens.refreshToken || !result.sessionId || !result.serverDeviceId) {
    throw new Error('Authentication response is incomplete')
  }
  return {
    user: result.user,
    tokens: result.tokens,
    sessionId: result.sessionId,
    serverDeviceId: result.serverDeviceId,
  }
}

function currentLoginRoute(): string {
  // #ifdef APP-TABLET
  return '/pages/tablet/login/index'
  // #endif
  // #ifdef APP-PHONE || MP-WEIXIN
  return '/pages/mobile/login/index'
  // #endif
  try {
    const pages = getCurrentPages()
    const route = pages.length > 0 ? pages[pages.length - 1].route || '' : ''
    if (route.startsWith('pages/tablet/')) return '/pages/tablet/login/index'
    if (route.startsWith('pages/mobile/')) return '/pages/mobile/login/index'
  } catch {
    // Ignore route lookup error outside page context
  }
  // #ifndef MP-WEIXIN
  try {
    const sysInfo = uni.getSystemInfoSync()
    const width = sysInfo.windowWidth || sysInfo.screenWidth
    const height = sysInfo.windowHeight || sysInfo.screenHeight
    if (width >= 768 && height >= 500) {
      return '/pages/tablet/login/index'
    }
  } catch {
    // Fallback to mobile login route when system info is unavailable
  }
  // #endif
  return '/pages/mobile/login/index'
}

export const useAuthStore = defineStore('auth', () => {
  const persisted = loadPersistedSession()
  const user = ref<UserView | null>(persisted?.user || null)
  const tokens = ref<TokenPair | null>(persisted?.tokens || null)
  const sessionId = ref(persisted?.sessionId || '')
  let loginGeneration = Symbol('login')
  const getLoginGeneration = () => loginGeneration
  const avatar = ref<string | null>(uni.getStorageSync('avatar') || null)

  const identity = getOrCreateDeviceIdentity({
    get: (key) => uni.getStorageSync(key),
    set: (key, value) => uni.setStorageSync(key, value),
  }, uni.getSystemInfoSync())
  const serverDeviceId = ref(persisted?.serverDeviceId || '')
  if (persisted?.user.id && serverDeviceId.value) localDataScope.activate(persisted.user.id, serverDeviceId.value)
  if (persisted?.user.id) void purgeLegacyLocalData()

  const token = computed(() => tokens.value?.accessToken || null)
  const refreshToken = computed(() => tokens.value?.refreshToken || null)
  const username = computed(() => user.value?.username || null)
  const isAuthenticated = computed(() => Boolean(token.value && user.value?.id && serverDeviceId.value))

  function persistSession(session: PersistedAuthSession): void {
    localDataScope.activate(session.user.id!, session.serverDeviceId)
    void purgeLegacyLocalData()
    user.value = session.user
    tokens.value = session.tokens
    sessionId.value = session.sessionId
    serverDeviceId.value = session.serverDeviceId
    uni.setStorageSync(AUTH_STORAGE_KEY, JSON.stringify(session))
    for (const legacyKey of ['token', 'refreshToken', 'username']) uni.removeStorageSync(legacyKey)
  }

  function clearSession(): void {
    loginGeneration = Symbol('login')
    restoreFlight = null
    user.value = null
    tokens.value = null
    sessionId.value = ''
    serverDeviceId.value = ''
    avatar.value = null
    localDataScope.deactivate()
    uni.removeStorageSync(AUTH_STORAGE_KEY)
    for (const legacyKey of ['token', 'refreshToken', 'username']) uni.removeStorageSync(legacyKey)
  }

  function requireCurrentLogin(expected: symbol): void {
    if (loginGeneration !== expected) throw new Error('登录状态已变化，请重试。')
  }

  function expireSession(expected: symbol): void {
    if (loginGeneration !== expected) return
    clearSession()
    uni.reLaunch({ url: currentLoginRoute() })
  }

  let refreshFlight: { generation: symbol; refresh: () => Promise<boolean> } | null = null

  function refreshAccessToken(): Promise<boolean> {
    const generation = loginGeneration
    if (refreshFlight?.generation !== generation) {
      const coordinator = createRefreshCoordinator(async () => {
        requireCurrentLogin(generation)
        const currentRefreshToken = refreshToken.value
        if (!currentRefreshToken) return false
        try {
          const session = normalizeAuthResult(await useAuthApi.refresh({ refreshToken: currentRefreshToken }))
          requireCurrentLogin(generation)
          persistSession(session)
          return true
        } catch (error) {
          requireCurrentLogin(generation)
          if (!(error instanceof ApiProblemError) || error.status !== 401) throw error
          return false
        }
      })
      refreshFlight = { generation, refresh: coordinator.refresh }
    }
    return refreshFlight.refresh()
  }

  configureAuthSessionBridge({
    getAccessToken: () => token.value,
    getLoginGeneration,
    refreshAccessToken,
    onUnauthenticated: (generation) => expireSession(generation),
  })

  async function login(data: { username: string; password: string }): Promise<void> {
    const generation = loginGeneration
    const session = normalizeAuthResult(await useAuthApi.login({
      ...data,
      clientDeviceKey: identity.clientDeviceKey,
      deviceName: identity.deviceName,
      platform: identity.platform,
    }))
    requireCurrentLogin(generation)
    loginGeneration = Symbol('login')
    persistSession(session)
  }

  async function register(
    data: Pick<components['schemas']['RegisterRequest'], 'username' | 'email' | 'emailCode' | 'password'>,
  ): Promise<void> {
    const generation = loginGeneration
    const session = normalizeAuthResult(await useAuthApi.register({
      username: data.username,
      email: data.email,
      emailCode: data.emailCode,
      password: data.password,
      clientDeviceKey: identity.clientDeviceKey,
      deviceName: identity.deviceName,
      platform: identity.platform,
    }))
    requireCurrentLogin(generation)
    loginGeneration = Symbol('login')
    persistSession(session)
  }

  function syncUserProfile(nextUser: UserView): void {
    user.value = nextUser
    if (tokens.value && sessionId.value && serverDeviceId.value) {
      persistSession({
        user: nextUser,
        tokens: tokens.value,
        sessionId: sessionId.value,
        serverDeviceId: serverDeviceId.value,
      })
    }
  }

  let restoreFlight: { token: symbol; generation: symbol; promise: Promise<boolean> } | null = null

  async function restoreSession(): Promise<boolean> {
    if (!token.value) return false
    const generation = loginGeneration
    if (restoreFlight?.generation === generation) {
      return restoreFlight.promise
    }
    const flightToken = Symbol('restore')
    const promise = (async () => {
      try {
        const currentUser = await useAuthApi.me()
        if (generation !== loginGeneration) return false
        if (!currentUser.id) throw new Error('Current user response is incomplete')
        user.value = currentUser
        if (tokens.value && sessionId.value) {
          if (!serverDeviceId.value) throw new Error('Session server device identity is missing')
          persistSession({ user: currentUser, tokens: tokens.value, sessionId: sessionId.value, serverDeviceId: serverDeviceId.value })
        }
        return true
      } catch (error) {
        if (generation !== loginGeneration) return false
        if (error instanceof ApiProblemError && error.status === 401) return false
        return isAuthenticated.value
      } finally {
        if (restoreFlight?.token === flightToken) {
          restoreFlight = null
        }
      }
    })()
    restoreFlight = { token: flightToken, generation, promise }
    return promise
  }

  async function logout(): Promise<void> {
    const generation = loginGeneration
    try {
      if (token.value) await useAuthApi.logout()
    } finally {
      if (generation === loginGeneration) clearSession()
    }
  }

  return {
    user,
    tokens,
    sessionId,
    serverDeviceId,
    token,
    refreshToken,
    username,
    avatar,
    isAuthenticated,
    login,
    register,
    syncUserProfile,
    restoreSession,
    refreshAccessToken,
    getLoginGeneration,
    clearSession,
    expireSession,
    logout,
  }
})
