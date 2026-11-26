<template>
  <div class="app-bar-shell">
    <div class="app-bar-scrim" aria-hidden="true"></div>
    <div class="app-bar-container" role="navigation" aria-label="主导航">
      <div class="app-tabbar-float" role="tablist">
        <div
          class="active-pill-indicator"
          :class="{ 'animate-pill': isAnimatePill }"
          :style="{ transform: `translateX(${displayIndex * 100}%)` }"
        >
          <div class="pill-inner"></div>
        </div>

        <div
          v-for="(item, idx) in tabItems"
          :key="item.path"
          class="tab-item"
          role="tab"
          :aria-label="item.label"
          :aria-selected="displayIndex === idx"
          @click="switchTab(item.path)"
        >
          <LineIcon
            :name="item.icon"
            size="19px"
            :color="displayIndex === idx ? '#556B3D' : '#7A7A75'"
          />
          <span class="tab-label" :class="{ 'is-active': displayIndex === idx }">{{ item.label }}</span>
        </div>
      </div>

      <div
        class="app-ai-float"
        role="button"
        aria-label="AI 助手"
        @click="goToAi"
      >
        <LineIcon name="sparkles" size="21px" color="#FFFFFF" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { getCurrentRoutePath, redirectTo } from '@/platform/navigation'
import { useLayoutStore } from '@/store/useLayoutStore'
import { preloadRoute, scheduleSiblingPreload } from '@/utils/pagePreload'

const aiAssistantPath = '/pages/mobile/ai-search/index'
const tabItems = [
  { path: '/pages/mobile/home/index', icon: 'calendar', label: '今日' },
  { path: '/pages/mobile/learn/index', icon: 'book', label: '学习' },
  { path: '/pages/mobile/pomodoro/index', icon: 'clock', label: '专注' },
  { path: '/pages/mobile/profile/index', icon: 'avatar', label: '我的' },
]

const displayIndex = ref(0)
const isAnimatePill = ref(false)
let stopSiblingPreload: (() => void) | null = null
let pillTimer: ReturnType<typeof setTimeout> | null = null
let exitDelayTimer: ReturnType<typeof setTimeout> | null = null
let isUnmounted = false
let hasPendingExit = false

function getIndexByUrl(path: string): number {
  if (path.includes('learn/index') || path.includes('review/index')) return 1
  if (path.includes('pomodoro/index')) return 2
  if (path.includes('profile/index')) return 3
  return 0
}

function resolveCurrentRoute(): string {
  return getCurrentRoutePath()
}

onMounted(() => {
  isUnmounted = false
  const nowRoute = resolveCurrentRoute()
  isAnimatePill.value = false
  displayIndex.value = getIndexByUrl(nowRoute)
  pillTimer = setTimeout(() => {
    pillTimer = null
    isAnimatePill.value = true
  }, 50)
  stopSiblingPreload = scheduleSiblingPreload(
    [...tabItems.map(item => item.path), aiAssistantPath],
    nowRoute,
  )
})

onUnmounted(() => {
  isUnmounted = true
  if (pillTimer) {
    clearTimeout(pillTimer)
    pillTimer = null
  }
  if (exitDelayTimer) {
    clearTimeout(exitDelayTimer)
    exitDelayTimer = null
  }
  stopSiblingPreload?.()
  stopSiblingPreload = null
  if (hasPendingExit) {
    hasPendingExit = false
    useLayoutStore().clearExit()
  }
})

function navigateWithTransition(url: string, dir: 'left' | 'right', nowRoute: string) {
  const layoutStore = useLayoutStore()
  layoutStore.setSlideDirection(dir)
  layoutStore.startExit(dir, 140, nowRoute)
  hasPendingExit = true

  if (exitDelayTimer) {
    clearTimeout(exitDelayTimer)
    exitDelayTimer = null
  }
  const preloadTask = preloadRoute(url)
  const exitDelay = new Promise<void>((resolve) => {
    exitDelayTimer = setTimeout(() => {
      exitDelayTimer = null
      resolve()
    }, 140)
  })
  void Promise.all([exitDelay, preloadTask]).then(() => {
    if (isUnmounted || (Boolean(nowRoute) && resolveCurrentRoute() !== nowRoute)) {
      if (hasPendingExit) {
        hasPendingExit = false
        layoutStore.clearExit()
      }
      return
    }
    redirectTo(url, {
      complete: () => {
        hasPendingExit = false
        layoutStore.clearExit()
      },
    })
  })
}

function switchTab(url: string) {
  const nowRoute = resolveCurrentRoute()
  const layoutStore = useLayoutStore()
  if (nowRoute === url || layoutStore.isExiting) return

  const targetIndex = getIndexByUrl(url)
  const currentIdx = getIndexByUrl(nowRoute)
  const dir = targetIndex > currentIdx ? 'right' : 'left'

  isAnimatePill.value = true
  displayIndex.value = targetIndex
  navigateWithTransition(url, dir, nowRoute)
}

function goToAi() {
  const nowRoute = resolveCurrentRoute()
  const layoutStore = useLayoutStore()
  if (nowRoute === aiAssistantPath || layoutStore.isExiting) return

  if (nowRoute) layoutStore.setReturnRoute(nowRoute)
  navigateWithTransition(aiAssistantPath, 'right', nowRoute)
}
</script>

<style scoped>
.app-bar-shell {
  pointer-events: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0 auto;
  max-width: 440px;
  z-index: var(--z-index-tabbar, 800);
}

.app-bar-scrim {
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(92px + env(safe-area-inset-bottom));
  z-index: 0;
  background: linear-gradient(
    180deg,
    rgba(239, 235, 226, 0) 0%,
    rgba(239, 235, 226, 0.72) 24%,
    rgba(239, 235, 226, 0.94) 56%,
    #EFEBE2 100%
  );
}

.app-bar-container {
  pointer-events: none;
  position: relative;
  z-index: 1;
  padding: 0 20px calc(14px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
}

@media (max-width: 390px) {
  .app-bar-container {
    padding-left: 16px;
    padding-right: 16px;
  }
}

.app-tabbar-float {
  pointer-events: auto;
  flex: 1;
  min-width: 0;
  height: 56px;
  position: relative;
  background-color: rgba(252, 251, 249, 0.72);
  backdrop-filter: blur(28px) saturate(185%);
  -webkit-backdrop-filter: blur(28px) saturate(185%);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  padding: 0 5px;
  box-shadow: var(--glass-shadow);
  box-sizing: border-box;
}

.active-pill-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: calc((100% - 10px) / 4);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

.active-pill-indicator.animate-pill {
  transition: transform 0.26s var(--ease-spring);
}

.pill-inner {
  width: 92%;
  height: 44px;
  border-radius: var(--radius-full);
  background-color: rgba(139, 154, 110, 0.16);
}

.tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  position: relative;
  z-index: 2;
  cursor: pointer;
  transition: transform 0.16s var(--ease-out);
}

.tab-item:active {
  transform: scale(0.92);
}

.tab-label {
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  line-height: 1;
}

.tab-label.is-active {
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.app-ai-float {
  pointer-events: auto;
  width: 54px;
  height: 54px;
  flex-shrink: 0;
  background: var(--accent-gradient);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(118, 135, 88, 0.22);
  cursor: pointer;
  transition: transform 0.16s var(--ease-out), box-shadow 0.18s ease;
}

.app-ai-float:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(118, 135, 88, 0.30);
}

.app-ai-float:active {
  transform: scale(0.92);
}
</style>
