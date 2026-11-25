<template>
  <ElConfigProvider :locale="elementLocale">
    <Transition name="shell-fade" mode="out-in">
      <div v-if="isAuthenticatedRoute" key="auth-shell" class="app-shell">
        <AppSidebar :connection-projection="connectionProjection" @retry-sync="syncStore.flushNow().catch(() => {})" />
        <div class="app-body">
          <AppHeader />
          <main class="app-content">
            <router-view v-slot="{ Component }">
              <transition name="page-fade" mode="out-in">
                <component :is="Component" :key="route.path" />
              </transition>
            </router-view>
          </main>
        </div>

        <!-- Subtle background glow effect -->
        <div class="bg-glow bg-glow--1"></div>
        <div class="bg-glow bg-glow--2"></div>
      </div>
      <div v-else-if="!route.meta.requiresAuth" key="public-shell" class="public-shell">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </div>
    </Transition>

    <!-- Global Command Palette -->
    <SearchPalette v-if="isAuthenticatedRoute" :key="authStore.loginGeneration" />

    <!-- Kept mounted across routes for background Office extraction. -->
    <BackgroundParserHost ref="backgroundParserHost" />

    <!-- Seamless Zen Startup / Initial Sync Splash -->
    <Transition name="startup-splash-leave">
      <StartupSplashScreen v-if="showStartupSplash" :stage="startupStage" overlay />
    </Transition>

    <!-- Full-Page GPU Ambient Theme Veil (Zero Jank, Zero Lag) -->
    <div v-if="curtainClass" :key="curtainKey" :class="['theme-ambient-curtain', curtainClass]" aria-hidden="true"></div>
  </ElConfigProvider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import en from 'element-plus/es/locale/lang/en'
import ja from 'element-plus/es/locale/lang/ja'
import zhCN from 'element-plus/es/locale/lang/zh-cn'
import { locale } from '@/i18n'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { getConnectionStatusMessages } from '@/components/layout/navigationMessages'
import SearchPalette from '@/components/SearchPalette.vue'
import BackgroundParserHost from '@/components/preview/BackgroundParserHost.vue'
import StartupSplashScreen from '@/components/StartupSplashScreen.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { useChatStore } from '@/store/useChatStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useKnowledgeStore } from '@/store/useKnowledgeStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { preloadAuthenticatedRoutes } from '@/router/routePreload'
import { runStartupBootstrap, type StartupBootstrapStage } from '@/services/startupBootstrap'
import { realtimeController, type RealtimeStatus } from '@/services/realtimeController'
import { projectConnectionStatus, type ConnectionProjection } from '@/services/connectionStatusProjection'
import { autoSyncEnabled } from '@/services/desktopPreferences'
import { serviceUnavailable } from '@/services/serviceAvailability'
import { documentProcessingRuntime } from '@/services/documentProcessing/runtime'
import { setBackgroundParserHost } from '@/services/documentParser/backgroundParserHost'
import type { BackgroundParserHostHandle } from '@/services/documentParser/fileViewerBridge'

let stopWatchingAuth: (() => void) | undefined
const backgroundParserHost = ref<BackgroundParserHostHandle | null>(null)
const browserOnline = ref(typeof navigator === 'undefined' || navigator.onLine)
const route = useRoute()
const router = useRouter()
const elementLocales = { 'zh-CN': zhCN, en, ja }
const elementLocale = computed(() => elementLocales[locale.value])
const authStore = useAuthStore()
const taskStore = useTaskStore()
const subjectStore = useSubjectStore()
const knowledgeStore = useKnowledgeStore()
const pomodoroStore = usePomodoroStore()
const syncStore = useSyncStore()
const chatStore = useChatStore()
const realtimeStatus = ref<RealtimeStatus>(realtimeController.getStatus())
const showStartupSplash = ref(authStore.isAuthenticated)
const startupStage = ref<StartupBootstrapStage>('hydrating')
let bootstrapRunId = 0
let activeBootstrapGeneration: symbol | null = null
const isAuthenticatedRoute = computed(() => Boolean(route.meta.requiresAuth && authStore.isAuthenticated))
const connectionProjection = computed<ConnectionProjection>(() => projectConnectionStatus({
  online: browserOnline.value,
  syncError: syncStore.lastSyncError,
  syncErrorCode: syncStore.lastSyncErrorCode,
  serviceUnavailable: serviceUnavailable.value,
  realtime: realtimeStatus.value,
  syncing: syncStore.isSyncing,
  autoSyncPaused: !autoSyncEnabled.value,
  chatError: chatStore.lastError,
  chatErrorCode: chatStore.lastErrorCode,
}, getConnectionStatusMessages()))

const hydrateStartupData = async (): Promise<void> => {
  const results = await Promise.allSettled([
    subjectStore.loadSubjects(),
    knowledgeStore.fetchBlocks(),
    taskStore.fetchTasks(),
    pomodoroStore.initialize(),
  ])
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[App] startup local hydration deferred', result.reason)
    }
  }
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const startAuthenticatedRuntime = (): void => {
  const runId = ++bootstrapRunId
  const loginGeneration = authStore.loginGeneration
  activeBootstrapGeneration = loginGeneration
  showStartupSplash.value = true
  startupStage.value = 'hydrating'
  realtimeController.start()

  const isScopeCurrent = (): boolean => runId === bootstrapRunId
    && authStore.isAuthenticated
    && authStore.loginGeneration === loginGeneration

  void runStartupBootstrap({
    isScopeCurrent,
    isOnline: () => browserOnline.value,
    isAutoSyncEnabled: () => autoSyncEnabled.value,
    hydrateLocalData: hydrateStartupData,
    syncCloudData: () => syncStore.flushBackground(),
    preloadRoutes: preloadAuthenticatedRoutes,
    onStageChange: (stage) => {
      if (isScopeCurrent()) {
        startupStage.value = stage
      }
    },
    minDisplayMs: prefersReducedMotion() ? 0 : 700,
  }).finally(() => {
    if (runId !== bootstrapRunId) return
    showStartupSplash.value = false
    if (isScopeCurrent()) {
      void documentProcessingRuntime.start().catch((error) => console.warn('[App] document runtime start failed', error))
    }
  })
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

const curtainClass = ref<string | null>(null)
const curtainKey = ref(0)
let curtainTimer: ReturnType<typeof setTimeout> | null = null

const handleThemeChangeEvent = (event: Event): void => {
  const detail = (event as CustomEvent<{ dark: boolean; isViewTransition?: boolean }>).detail
  if (detail?.isViewTransition) return

  const isDark = detail?.dark
  curtainClass.value = isDark ? 'to-dark' : 'to-light'
  curtainKey.value++
  if (curtainTimer) clearTimeout(curtainTimer)
  curtainTimer = setTimeout(() => {
    curtainClass.value = null
    curtainTimer = null
  }, 500)
}

onMounted(() => {
  setBackgroundParserHost(backgroundParserHost.value)
  window.addEventListener('online', updateBrowserOnline)
  window.addEventListener('offline', updateBrowserOnline)
  window.addEventListener('auralis-realtime-status', handleRealtimeStatus)
  window.addEventListener('auralis:theme-change', handleThemeChangeEvent)

  if (route.matched.length === 0) {
    void router.replace(authStore.isAuthenticated ? '/' : '/login')
  }

  if (authStore.isAuthenticated) {
    startAuthenticatedRuntime()
  } else {
    showStartupSplash.value = false
    void preloadAuthenticatedRoutes()
  }

  stopWatchingAuth = watch(
    () => ({ isAuthenticated: authStore.isAuthenticated, generation: authStore.loginGeneration }),
    ({ isAuthenticated, generation }) => {
      if (isAuthenticated && generation !== activeBootstrapGeneration) {
        startAuthenticatedRuntime()
        return
      }
      if (!isAuthenticated) {
        bootstrapRunId += 1
        activeBootstrapGeneration = null
        showStartupSplash.value = false
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
  window.removeEventListener('auralis:theme-change', handleThemeChangeEvent)
  if (curtainTimer) clearTimeout(curtainTimer)
  stopWatchingAuth?.()
  stopWatchingAuth = undefined
  bootstrapRunId += 1
  activeBootstrapGeneration = null
  showStartupSplash.value = false
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
  min-width: 960px;
  min-height: 600px;
  background: var(--color-bg-secondary);
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
  background: rgba(139, 154, 110, 0.18);
  top: -200px;
  right: -100px;
}

.bg-glow--2 {
  width: 400px;
  height: 400px;
  background: rgba(139, 154, 110, 0.12);
  bottom: -100px;
  left: 20%;
}

/* Shell transition (between public login and authenticated app) */
.shell-fade-enter-active,
.shell-fade-leave-active {
  transition: opacity 0.38s cubic-bezier(0.16, 1, 0.3, 1);
}

.shell-fade-enter-from,
.shell-fade-leave-to {
  opacity: 0;
}

/* Page transition — 纯 GPU 合成层，从容舒缓呼吸感，满帧丝滑 */
.page-fade-enter-active {
  transition: 
    opacity 0.38s cubic-bezier(0.16, 1, 0.3, 1), 
    transform 0.38s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.page-fade-leave-active {
  transition: 
    opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1), 
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: opacity, transform;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.startup-splash-leave-leave-active {
  transition:
    opacity 0.42s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.startup-splash-leave-leave-to {
  opacity: 0;
  transform: scale(1.018);
}

@media (prefers-reduced-motion: reduce) {
  .startup-splash-leave-leave-active {
    transition: opacity 0.15s ease;
  }

  .startup-splash-leave-leave-to {
    transform: none;
  }
}

</style>
