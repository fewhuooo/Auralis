<script setup lang="ts">
import { watch } from 'vue'
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { connectRealtimeSync, disconnectRealtimeSync } from '@/api/sync'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusStore } from '@/store/useFocusStore'
import { useSyncStore } from '@/store/useSyncStore'

let activeRuntimeKey = ''
let runtimeFlight: { token: symbol; key: string; promise: Promise<void> } | null = null

async function startAuthenticatedRuntime() {
  const authStore = useAuthStore()
  if (!authStore.isAuthenticated || !authStore.user?.id || !authStore.serverDeviceId) return
  const runtimeKey = `${authStore.user.id}:${authStore.serverDeviceId}`
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
    await syncStore.triggerSync()
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

onLaunch(async () => {
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

onShow(() => {
  const authStore = useAuthStore()
  const focusStore = useFocusStore()
  if (!authStore.isAuthenticated) return
  focusStore.reconcileNow(true)
  if (runtimeFlight) return
  void useSyncStore().triggerSync().then(() => focusStore.flushPendingSessions())
  void connectRealtimeSync()
})

onHide(() => {
  disconnectRealtimeSync()
})
</script>

<style>
@import './styles/index.css';
</style>
