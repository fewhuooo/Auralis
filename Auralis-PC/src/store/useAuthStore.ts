import { defineStore, type PiniaPluginContext } from 'pinia'
import { ref, computed } from 'vue'
import {
  useAuthApi,
  type AuthResult,
  type UserView,
  type TokenPair,
  type LoginRequest,
  type RegisterRequest,
} from '@/api/useAuthApi'
import { getDeviceIdentity } from '@/auth/deviceIdentity'
import { isValidSession } from '@/auth/sessionValidation'
import type { AuthSessionStatus } from '@/auth/authSessionState'

export { isValidSession }

export interface LoginPayload {
  username: string
  password: string
  clientDeviceKey?: string
  deviceName?: string
  platform?: 'WEB' | 'WINDOWS' | 'MACOS' | 'IOS' | 'ANDROID' | 'HARMONY' | 'UNKNOWN'
}

export interface RegisterPayload {
  username: string
  password: string
  displayName?: string
  clientDeviceKey?: string
  deviceName?: string
  platform?: 'WEB' | 'WINDOWS' | 'MACOS' | 'IOS' | 'ANDROID' | 'HARMONY' | 'UNKNOWN'
}

export const useAuthStore = defineStore(
  'auth',
  () => {
    const user = ref<UserView | null>(null)
    const tokens = ref<TokenPair | null>(null)
    const sessionId = ref<string | null>(null)
    const serverDeviceId = ref<string | null>(null)
    const isHydrated = ref<boolean>(true)
    const showAuthModal = ref(false)
    const authStatus = ref<AuthSessionStatus>('anonymous')
    const reauthenticationReason = ref<string | null>(null)

    const token = computed({
      get: () => tokens.value?.accessToken ?? null,
      set: (val: string | null) => {
        if (tokens.value) {
          tokens.value.accessToken = val ?? undefined
        } else if (val) {
          tokens.value = { accessToken: val }
        }
      },
    })

    const refreshToken = computed({
      get: () => tokens.value?.refreshToken ?? null,
      set: (val: string | null) => {
        if (tokens.value) {
          tokens.value.refreshToken = val ?? undefined
        } else if (val) {
          tokens.value = { refreshToken: val }
        }
      },
    })

    const username = computed(() => user.value?.displayName || user.value?.username || null)
    const isAuthenticated = computed(() => Boolean(
      authStatus.value === 'authenticated'
      && tokens.value?.accessToken
      && tokens.value?.refreshToken
      && user.value?.id
      && serverDeviceId.value,
    ))
    const requiresReauthentication = computed(() => authStatus.value === 'reauthentication-required')

    function setSession(result: AuthResult | null | undefined): void {
      if (!result || !result.user || !result.tokens || !result.sessionId || !result.serverDeviceId) {
        clearSession()
        return
      }
      user.value = result.user ?? null
      tokens.value = result.tokens ?? null
      sessionId.value = result.sessionId ?? null
      serverDeviceId.value = result.serverDeviceId ?? null
      authStatus.value = 'authenticated'
      reauthenticationReason.value = null
      showAuthModal.value = false
    }

    function setTokens(tokenPair: TokenPair | null | undefined): void {
      tokens.value = tokenPair ?? null
    }

    function clearSession(): void {
      user.value = null
      tokens.value = null
      sessionId.value = null
      serverDeviceId.value = null
      authStatus.value = 'anonymous'
      reauthenticationReason.value = null
      showAuthModal.value = false
    }

    function requireReauthentication(reason = '登录会话已失效，请重新登录。'): void {
      user.value = null
      tokens.value = null
      sessionId.value = null
      serverDeviceId.value = null
      authStatus.value = 'reauthentication-required'
      reauthenticationReason.value = reason
      showAuthModal.value = true
    }

    async function login(payload: LoginPayload): Promise<AuthResult> {
      const identity = getDeviceIdentity()
      const req: LoginRequest = {
        username: payload.username.trim(),
        password: payload.password,
        clientDeviceKey: payload.clientDeviceKey || identity.clientDeviceKey,
        deviceName: payload.deviceName?.trim() || identity.deviceName,
        platform: payload.platform || identity.platform,
      }
      const result = await useAuthApi.login(req)
      setSession(result)
      return result
    }

    async function register(payload: RegisterPayload): Promise<AuthResult> {
      const identity = getDeviceIdentity()
      const req: RegisterRequest = {
        username: payload.username.trim(),
        password: payload.password,
        displayName: payload.displayName?.trim() || payload.username.trim(),
        clientDeviceKey: payload.clientDeviceKey || identity.clientDeviceKey,
        deviceName: payload.deviceName?.trim() || identity.deviceName,
        platform: payload.platform || identity.platform,
      }
      const result = await useAuthApi.register(req)
      setSession(result)
      return result
    }

    async function logout(): Promise<void> {
      try {
        if (tokens.value?.accessToken) {
          await useAuthApi.logout()
        }
      } catch (error) {
        throw error // Re-throw so the UI can provide feedback
      } finally {
        clearSession()
      }
    }

    async function fetchMe(): Promise<UserView> {
      const me = await useAuthApi.getMe()
      if (me) {
        user.value = me
      }
      return me
    }

    return {
      user,
      tokens,
      sessionId,
      serverDeviceId,
      isHydrated,
      token,
      refreshToken,
      username,
      isAuthenticated,
      showAuthModal,
      authStatus,
      requiresReauthentication,
      reauthenticationReason,
      setSession,
      setTokens,
      clearSession,
      requireReauthentication,
      login,
      register,
      logout,
      fetchMe,
    }
  },
  {
    persist: {
      key: 'auralis_auth_session',
      pick: ['user', 'tokens', 'sessionId', 'serverDeviceId'],
      afterHydrate: (ctx: PiniaPluginContext) => {
        const store = ctx.store as unknown as {
          user: UserView | null
          tokens: TokenPair | null
          sessionId: string | null
          serverDeviceId: string | null
          authStatus: AuthSessionStatus
          reauthenticationReason: string | null
          isHydrated: boolean
        }
        const wasReauthenticationRequired = store.authStatus === 'reauthentication-required'
        if (!isValidSession(store.user, store.tokens) || !store.sessionId || !store.serverDeviceId) {
          store.user = null
          store.tokens = null
          store.sessionId = null
          store.serverDeviceId = null
          store.authStatus = wasReauthenticationRequired ? 'reauthentication-required' : 'anonymous'
          store.reauthenticationReason = wasReauthenticationRequired
            ? (store.reauthenticationReason || '登录会话已失效，请重新登录。')
            : null
        } else {
          store.authStatus = 'authenticated'
          store.reauthenticationReason = null
        }
        store.isHydrated = true
      },
    },
  },
)
