<script setup lang="ts">
import { watch } from 'vue'
import { ensureFeedbackHost } from '@/platform/feedback'
import { onAppHide, onAppLaunch, onAppShow } from '@/platform/lifecycle'
import { connectRealtimeSync, disconnectRealtimeSync } from '@/api/sync'
import { localDb } from '@/services/localDb'
import { cursorKeyForAuth } from '@/services/syncController'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusStore } from '@/store/useFocusStore'
import { useSyncStore } from '@/store/useSyncStore'

let activeRuntimeKey = ''
let runtimeFlight: { token: symbol; key: string; promise: Promise<void> } | null = null

async function startAuthenticatedRuntime() {
  const authStore = useAuthStore()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  if (!authStore.isAuthenticated || !userId || !serverDeviceId) return
  const runtimeKey = `${userId}:${serverDeviceId}`
  if (runtimeFlight?.key === runtimeKey) {
    return runtimeFlight.promise
  }
  if (activeRuntimeKey === runtimeKey) return

  const generation = authStore.getLoginGeneration()
  const flightToken = Symbol('runtime')
  const promise = (async () => {
    await localDb.init()
    if (generation !== authStore.getLoginGeneration()) return
    const focusStore = useFocusStore()
    focusStore.reconcileNow(false)
    const syncStore = useSyncStore()
    const existingCursor = await localDb.getMetadata(
      cursorKeyForAuth(userId, serverDeviceId),
    )
    if (generation !== authStore.getLoginGeneration()) return
    if (!existingCursor) {
      await syncStore.syncNow()
    } else {
      await syncStore.triggerSync()
    }
    if (generation !== authStore.getLoginGeneration()) return
    await focusStore.flushPendingSessions()
    if (generation !== authStore.getLoginGeneration()) return
    await connectRealtimeSync()
    if (generation === authStore.getLoginGeneration()) {
      activeRuntimeKey = runtimeKey
    }
  })().finally(() => {
    if (runtimeFlight?.token === flightToken) {
      runtimeFlight = null
    }
  })

  runtimeFlight = { token: flightToken, key: runtimeKey, promise }
  return promise
}

onAppLaunch(async () => {
  void ensureFeedbackHost()
  const authStore = useAuthStore()

  watch(
    () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId],
    ([isAuthed, userId, serverDeviceId]) => {
      const nextKey = isAuthed && userId && serverDeviceId ? `${userId}:${serverDeviceId}` : ''
      if (
        !nextKey
        || (activeRuntimeKey && activeRuntimeKey !== nextKey)
        || (runtimeFlight && runtimeFlight.key !== nextKey)
      ) {
        activeRuntimeKey = ''
        runtimeFlight = null
        disconnectRealtimeSync()
      }
      if (nextKey) {
        void startAuthenticatedRuntime()
      }
    },
    { flush: 'sync' },
  )

  if (authStore.token && await authStore.restoreSession()) {
    await startAuthenticatedRuntime()
  }
})

onAppShow(() => {
  const authStore = useAuthStore()
  const focusStore = useFocusStore()
  if (!authStore.isAuthenticated) return
  focusStore.reconcileNow(true)
  if (runtimeFlight) return
  void useSyncStore().triggerSync().then(() => focusStore.flushPendingSessions())
  void connectRealtimeSync()
})

onAppHide(() => {
  disconnectRealtimeSync()
})
</script>

<style>
@import './styles/index.css';
</style>
