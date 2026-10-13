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
import { deleteAvatarCache, getAvatarCache, saveAvatarCache } from '@/services/avatarCache'

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
    const avatarUrl = ref<string>('')
    let currentAvatarBlobUrl: string | null = null
    let currentAvatarUserId: string | null = null
    let avatarRequestGeneration = 0
    let currentLoadUser: string | null = null
    let loadAvatarPromise: Promise<string> | null = null

    function invalidateAvatarRequest(): void {
      avatarRequestGeneration += 1
      currentLoadUser = null
      loadAvatarPromise = null
    }

    function clearAvatarDisplay(): void {
      if (currentAvatarBlobUrl) {
        URL.revokeObjectURL(currentAvatarBlobUrl)
        currentAvatarBlobUrl = null
      }
      currentAvatarUserId = null
      avatarUrl.value = ''
    }

    function showAvatarBlob(userId: string, blob: Blob): string {
      if (currentAvatarBlobUrl) URL.revokeObjectURL(currentAvatarBlobUrl)
      currentAvatarBlobUrl = URL.createObjectURL(blob)
      currentAvatarUserId = userId
      avatarUrl.value = currentAvatarBlobUrl
      return currentAvatarBlobUrl
    }

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
      invalidateAvatarRequest()
      if (currentAvatarUserId && currentAvatarUserId !== result.user.id) {
        clearAvatarDisplay()
      }
      user.value = result.user ?? null
      tokens.value = result.tokens ?? null
      sessionId.value = result.sessionId ?? null
      serverDeviceId.value = result.serverDeviceId ?? null
      authStatus.value = 'authenticated'
      reauthenticationReason.value = null
      showAuthModal.value = false
      void loadAvatar()
    }

    function setTokens(tokenPair: TokenPair | null | undefined): void {
      tokens.value = tokenPair ?? null
    }

    function clearSession(): void {
      const currentUserId = user.value?.id
      invalidateAvatarRequest()
      user.value = null
      tokens.value = null
      sessionId.value = null
      serverDeviceId.value = null
      authStatus.value = 'anonymous'
      reauthenticationReason.value = null
      showAuthModal.value = false
      clearAvatarDisplay()
      if (currentUserId) void deleteAvatarCache(currentUserId)
    }

    function requireReauthentication(reason = '登录会话已失效，请重新登录。'): void {
      invalidateAvatarRequest()
      user.value = null
      tokens.value = null
      sessionId.value = null
      serverDeviceId.value = null
      authStatus.value = 'reauthentication-required'
      reauthenticationReason.value = reason
      showAuthModal.value = true
      clearAvatarDisplay()
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

    function setAvatarUrl(url: string): void {
      invalidateAvatarRequest()
      if (currentAvatarBlobUrl && currentAvatarBlobUrl !== url) URL.revokeObjectURL(currentAvatarBlobUrl)
      currentAvatarBlobUrl = null
      avatarUrl.value = url
      if (url.startsWith('blob:')) {
        currentAvatarBlobUrl = url
        currentAvatarUserId = user.value?.id ?? null
      } else {
        currentAvatarUserId = null
      }
    }

    async function loadAvatar(): Promise<string> {
      const requestedUserId = user.value?.id
      if (!tokens.value?.accessToken || !requestedUserId) {
        invalidateAvatarRequest()
        clearAvatarDisplay()
        return ''
      }

      if (currentAvatarUserId && currentAvatarUserId !== requestedUserId) clearAvatarDisplay()
      if (loadAvatarPromise && currentLoadUser === requestedUserId) return loadAvatarPromise

      const generation = ++avatarRequestGeneration
      currentLoadUser = requestedUserId
      const isCurrentRequest = () => avatarRequestGeneration === generation && user.value?.id === requestedUserId
      const request = (async () => {
        try {
          if (currentAvatarUserId !== requestedUserId || !avatarUrl.value) {
            const cachedBlob = await getAvatarCache(requestedUserId)
            if (!isCurrentRequest()) return avatarUrl.value
            if (cachedBlob) showAvatarBlob(requestedUserId, cachedBlob)
          }

          try {
            const blob = await useAuthApi.getAvatarBlob()
            if (!isCurrentRequest()) return avatarUrl.value

            if (blob && blob.size > 0) {
              showAvatarBlob(requestedUserId, blob)
              await saveAvatarCache(requestedUserId, blob)
              return avatarUrl.value
            }

            // Contract uses HTTP 404 to signal an unset avatar. An empty 200
            // response is not authoritative and must not erase the offline copy.
            return avatarUrl.value
          } catch (error: any) {
            if (!isCurrentRequest()) return avatarUrl.value

            const status = error?.status ?? error?.problem?.status ?? error?.response?.status
            if (status === 404) {
              clearAvatarDisplay()
              await deleteAvatarCache(requestedUserId)
            }

            // 网络错误和服务端故障保留已显示的本地头像。
            return avatarUrl.value
          }
        } finally {
          if (avatarRequestGeneration === generation && currentLoadUser === requestedUserId) {
            currentLoadUser = null
            loadAvatarPromise = null
          }
        }
      })()
      loadAvatarPromise = request
      return request
    }

    async function setAvatarFromBlob(blob: Blob, expectedUserId: string): Promise<string> {
      const currentUserId = user.value?.id
      if (!currentUserId || currentUserId !== expectedUserId || blob.size === 0) return avatarUrl.value

      invalidateAvatarRequest()
      const url = showAvatarBlob(currentUserId, blob)
      await saveAvatarCache(currentUserId, blob)
      return user.value?.id === currentUserId ? url : avatarUrl.value
    }

    async function clearAvatar(expectedUserId: string): Promise<void> {
      if (user.value?.id === expectedUserId || currentAvatarUserId === expectedUserId) {
        invalidateAvatarRequest()
        clearAvatarDisplay()
      }
      await deleteAvatarCache(expectedUserId)
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
      avatarUrl,
      setAvatarUrl,
      loadAvatar,
      setAvatarFromBlob,
      clearAvatar,
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
          void (ctx.store as any).loadAvatar?.()
        }
        store.isHydrated = true
      },
    },
  },
)
