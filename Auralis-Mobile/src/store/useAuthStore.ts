import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { components } from '@/api/generated/schema'
import { getOrCreateDeviceIdentity } from '@/api/deviceIdentity'
import { createRefreshCoordinator } from '@/api/protocol'
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
  const pages = getCurrentPages()
  const route = pages.length > 0 ? pages[pages.length - 1].route || '' : ''
  return route.startsWith('pages/tablet/')
    ? '/pages/tablet/login/index'
    : '/pages/mobile/login/index'
}

export const useAuthStore = defineStore('auth', () => {
  const persisted = loadPersistedSession()
  const user = ref<UserView | null>(persisted?.user || null)
  const tokens = ref<TokenPair | null>(persisted?.tokens || null)
  const sessionId = ref(persisted?.sessionId || '')
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
  const username = computed(() => user.value?.displayName || user.value?.username || null)
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
    user.value = null
    tokens.value = null
    sessionId.value = ''
    serverDeviceId.value = ''
    uni.removeStorageSync(AUTH_STORAGE_KEY)
    for (const legacyKey of ['token', 'refreshToken', 'username']) uni.removeStorageSync(legacyKey)
  }

  const refreshCoordinator = createRefreshCoordinator(async () => {
    const currentRefreshToken = refreshToken.value
    if (!currentRefreshToken) return false
    try {
      persistSession(normalizeAuthResult(await useAuthApi.refresh({ refreshToken: currentRefreshToken })))
      return true
    } catch {
      clearSession()
      return false
    }
  })

  const refreshAccessToken = () => refreshCoordinator.refresh()

  configureAuthSessionBridge({
    getAccessToken: () => token.value,
    refreshAccessToken,
    onUnauthenticated: () => {
      clearSession()
      uni.reLaunch({ url: currentLoginRoute() })
    },
  })

  async function login(data: { username: string; password: string }): Promise<void> {
    persistSession(normalizeAuthResult(await useAuthApi.login({
      ...data,
      clientDeviceKey: identity.clientDeviceKey,
      deviceName: identity.deviceName,
      platform: identity.platform,
    })))
  }

  async function register(data: { username: string; password: string; displayName?: string }): Promise<void> {
    persistSession(normalizeAuthResult(await useAuthApi.register({
      username: data.username,
      password: data.password,
      displayName: data.displayName?.trim() || data.username,
      clientDeviceKey: identity.clientDeviceKey,
      deviceName: identity.deviceName,
      platform: identity.platform,
    })))
  }

  async function restoreSession(): Promise<boolean> {
    if (!token.value) return false
    try {
      const currentUser = await useAuthApi.me()
      if (!currentUser.id) throw new Error('Current user response is incomplete')
      user.value = currentUser
      if (tokens.value && sessionId.value) {
        if (!serverDeviceId.value) throw new Error('Session server device identity is missing')
        persistSession({ user: currentUser, tokens: tokens.value, sessionId: sessionId.value, serverDeviceId: serverDeviceId.value })
      }
      return true
    } catch {
      return false
    }
  }

  async function logout(): Promise<void> {
    try {
      if (token.value) await useAuthApi.logout()
    } finally {
      clearSession()
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
    restoreSession,
    refreshAccessToken,
    logout,
  }
})
