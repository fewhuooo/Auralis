<template>
  <div v-if="isAuthenticatedRoute" class="app-shell">
    <AppSidebar />
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
import { realtimeController } from '@/services/realtimeController'
import { documentProcessingRuntime } from '@/services/documentProcessing/runtime'
import { setBackgroundParserHost } from '@/services/documentParser/backgroundParserHost'
import type { BackgroundParserHostHandle } from '@/services/documentParser/fileViewerBridge'

let stopWatchingAuth: (() => void) | undefined
const backgroundParserHost = ref<BackgroundParserHostHandle | null>(null)
const route = useRoute()
const authStore = useAuthStore()
const isAuthenticatedRoute = computed(() => Boolean(route.meta.requiresAuth && authStore.isAuthenticated))

onMounted(() => {
  setBackgroundParserHost(backgroundParserHost.value)

  if (authStore.isAuthenticated) {
    realtimeController.start()
    void documentProcessingRuntime.start().catch((error) => console.warn('[App] document runtime start failed', error))
  }

  stopWatchingAuth = watch(
    () => authStore.isAuthenticated,
    (isAuthenticated) => {
      if (isAuthenticated) {
        realtimeController.start()
        void documentProcessingRuntime.start().catch((error) => console.warn('[App] document runtime start failed', error))
      } else {
        realtimeController.stop()
        documentProcessingRuntime.stop()
      }
    },
  )
})

onUnmounted(() => {
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
