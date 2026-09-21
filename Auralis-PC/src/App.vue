<template>
  <div v-if="isAuthenticatedRoute" class="app-shell">
    <AppSidebar :connection-projection="connectionProjection" />
    <div class="app-body">
      <AppHeader />
      <main class="app-content">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- Subtle background glow effect -->
    <div class="bg-glow bg-glow--1"></div>
    <div class="bg-glow bg-glow--2"></div>
  </div>
  <div v-else class="public-shell">
    <router-view />
  </div>

  <!-- Global Command Palette -->
  <SearchPalette />

  <!-- Kept mounted across routes for background Office extraction. -->
  <BackgroundParserHost ref="backgroundParserHost" />

</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import SearchPalette from '@/components/SearchPalette.vue'
import BackgroundParserHost from '@/components/preview/BackgroundParserHost.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { useChatStore } from '@/store/useChatStore'
import { useTaskStore } from '@/store/useTaskStore'
import { realtimeController, type RealtimeStatus } from '@/services/realtimeController'
import { projectConnectionStatus, type ConnectionProjection } from '@/services/connectionStatusProjection'
import { documentProcessingRuntime } from '@/services/documentProcessing/runtime'
import { setBackgroundParserHost } from '@/services/documentParser/backgroundParserHost'
import type { BackgroundParserHostHandle } from '@/services/documentParser/fileViewerBridge'

let stopWatchingAuth: (() => void) | undefined
const backgroundParserHost = ref<BackgroundParserHostHandle | null>(null)
const browserOnline = ref(typeof navigator === 'undefined' || navigator.onLine)
const route = useRoute()
const authStore = useAuthStore()
const taskStore = useTaskStore()
const syncStore = useSyncStore()
const chatStore = useChatStore()
const realtimeStatus = ref<RealtimeStatus>(realtimeController.getStatus())
const isAuthenticatedRoute = computed(() => Boolean(route.meta.requiresAuth && authStore.isAuthenticated))
const connectionProjection = computed<ConnectionProjection>(() => projectConnectionStatus({
  online: browserOnline.value,
  syncError: syncStore.lastSyncError,
  syncErrorCode: syncStore.lastSyncErrorCode,
  serviceUnavailable: false,
  realtime: realtimeStatus.value,
  syncing: syncStore.isSyncing,
  chatError: chatStore.lastError,
  chatErrorCode: chatStore.lastErrorCode,
}))

const fetchTasksOnStartup = async () => {
  try {
    await taskStore.fetchTasks()
  } catch (error) {
    console.warn('[App] task startup fetch failed', error)
  }
}

const startAuthenticatedRuntime = (): void => {
  realtimeController.start()
  void documentProcessingRuntime.start().catch((error) => console.warn('[App] document runtime start failed', error))
  void fetchTasksOnStartup()
  syncStore.requestBackgroundSync('startup')
}

const updateBrowserOnline = (): void => {
  browserOnline.value = typeof navigator === 'undefined' || navigator.onLine
}

const handleRealtimeStatus = (event: Event): void => {
  const status = (event as CustomEvent<unknown>).detail
  if (status === 'disconnected' || status === 'connecting' || status === 'connected' || status === 'reconnecting') {
    realtimeStatus.value = status
  } else {
    realtimeStatus.value = realtimeController.getStatus()
  }
}

onMounted(() => {
  setBackgroundParserHost(backgroundParserHost.value)
  window.addEventListener('online', updateBrowserOnline)
  window.addEventListener('offline', updateBrowserOnline)
  window.addEventListener('auralis-realtime-status', handleRealtimeStatus)

  if (authStore.isAuthenticated) {
    startAuthenticatedRuntime()
  }

  stopWatchingAuth = watch(
    () => authStore.isAuthenticated,
    (isAuthenticated) => {
      if (isAuthenticated) {
        startAuthenticatedRuntime()
      } else {
        realtimeController.stop()
        documentProcessingRuntime.stop()
      }
    },
  )
})

onUnmounted(() => {
  window.removeEventListener('online', updateBrowserOnline)
  window.removeEventListener('offline', updateBrowserOnline)
  window.removeEventListener('auralis-realtime-status', handleRealtimeStatus)
  stopWatchingAuth?.()
  stopWatchingAuth = undefined
  realtimeController.stop()
  setBackgroundParserHost(null)
  documentProcessingRuntime.stop()
})
</script>

<style scoped>
.app-shell {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: var(--color-bg-primary);
  flex-direction: row;
}

.public-shell {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.app-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Background ambient glow */
.bg-glow {
  position: fixed;
  border-radius: 50%;
  filter: blur(120px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

.bg-glow--1 {
  width: 600px;
  height: 600px;
  background: rgba(163, 177, 155, 0.18);
  top: -200px;
  right: -100px;
}

.bg-glow--2 {
  width: 400px;
  height: 400px;
  background: rgba(163, 177, 155, 0.12);
  bottom: -100px;
  left: 20%;
}

/* Page transition */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

</style>
