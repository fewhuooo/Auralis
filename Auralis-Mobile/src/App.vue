<script setup lang="ts">
import { watch } from 'vue'
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { connectRealtimeSync, disconnectRealtimeSync } from '@/api/sync'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusStore } from '@/store/useFocusStore'
import { useSyncStore } from '@/store/useSyncStore'

async function startAuthenticatedRuntime() {
  await localDb.init()
  const focusStore = useFocusStore()
  focusStore.reconcileNow(false)
  const syncStore = useSyncStore()
  await syncStore.triggerSync()
  await focusStore.flushPendingSessions()
  await connectRealtimeSync()
}

onLaunch(async () => {
  const authStore = useAuthStore()

  if (authStore.token && await authStore.restoreSession()) {
    await startAuthenticatedRuntime()
  }

  watch(() => authStore.token, async (newToken) => {
    if (newToken) {
      await startAuthenticatedRuntime()
    } else {
      disconnectRealtimeSync()
    }
  })
})

onShow(() => {
  const focusStore = useFocusStore()
  focusStore.reconcileNow(true)
  if (useAuthStore().isAuthenticated) {
    void useSyncStore().triggerSync().then(() => focusStore.flushPendingSessions())
    void connectRealtimeSync()
  }
})

onHide(() => {
  disconnectRealtimeSync()
})
</script>

<style>
@import './styles/index.css';
</style>
