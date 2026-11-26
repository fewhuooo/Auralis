<template>
  <div class="tablet-layout">
    <div class="bg-glow bg-glow--1" aria-hidden="true"></div>
    <div class="bg-glow bg-glow--2" aria-hidden="true"></div>

    <div class="sidebar" role="navigation" aria-label="工作台导航">
      <div class="logo-area" title="回到首页" aria-label="回到首页" @click="navigate('/pages/tablet/dashboard/index')">
        <BrandLogo size="28px" />
      </div>

      <div class="nav-menu">
        <div
          class="active-capsule-indicator"
          :style="{
            transform: `translateY(${displayIndex >= 0 && displayIndex < navItems.length ? displayIndex * 52 : 0}px)`,
            opacity: displayIndex >= 0 && displayIndex < navItems.length ? 1 : 0,
          }"
        >
          <div class="nav-active-bar"></div>
          <div class="capsule-inner"></div>
        </div>

        <div
          v-for="(item, index) in navItems"
          :key="item.path"
          class="nav-item"
          :title="item.label"
          :aria-label="item.label"
          :aria-current="displayIndex === index ? 'page' : undefined"
          @click="navigate(item.path)"
        >
          <LineIcon
            :name="item.icon"
            size="20px"
            :color="displayIndex === index ? '#556B3D' : '#7A7A75'"
          />
        </div>
      </div>

      <div class="sidebar-footer">
        <div
          class="sidebar-avatar-entry"
          :class="{ 'is-active': displayIndex === -1 }"
          role="button"
          title="个人中心"
          aria-label="个人中心"
          @click="navigate('/pages/tablet/profile/index')"
        >
          <div class="sidebar-avatar">
            <span>{{ userInitial }}</span>
          </div>
          <div
            class="avatar-sync-badge"
            :class="syncBadgeClass"
            role="button"
            title="点击立即同步"
            aria-label="同步状态"
            @click.stop="syncStore.syncNow()"
          >
            <div class="avatar-sync-dot"></div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="main-content"
      :class="{
        'is-entering-down': isEntering && slideDir === 'down',
        'is-entering-up': isEntering && slideDir === 'up',
        'is-entering-right': isEntering && slideDir === 'right',
        'is-entering-left': isEntering && slideDir === 'left',
        'is-exiting-down': isExiting && exitDir === 'down',
        'is-exiting-up': isExiting && exitDir === 'up',
        'is-returning': isReturning,
      }"
    >
      <slot></slot>
    </div>

    <slot name="modal"></slot>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import { tabletHandwritingNotesEnabled } from '@/config/features'
import { getCurrentRoutePath, reLaunch, redirectTo } from '@/platform/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { useLayoutStore } from '@/store/useLayoutStore'
import { useSyncStore } from '@/store/useSyncStore'
import { preloadRoute, scheduleSiblingPreload } from '@/utils/pagePreload'

const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const syncStore = useSyncStore()

const getIndexByUrl = (path: string) => {
  if (path.includes('subject-hall') || path.includes('workspace')) return 1
  if (path.includes('pomodoro')) return 2
  if (path.includes('handwriting')) return tabletHandwritingNotesEnabled ? 3 : -2
  if (path.includes('ai-search')) return tabletHandwritingNotesEnabled ? 4 : 3
  if (path.includes('profile')) return -1
  return 0
}

const getInitialRouteInfo = () => {
  const route = getCurrentRoutePath()
  if (route) {
    return { path: route, idx: getIndexByUrl(route) }
  }
  return { path: '', idx: 0 }
}

const getStableInitialNavState = (routeInfo: { path: string; idx: number }) => {
  const storedPath = layoutStore.activeNavPath
  const storedIdx = layoutStore.activeNavIndex

  if (!routeInfo.path && storedPath) {
    return {
      path: storedPath,
      idx: typeof storedIdx === 'number' ? storedIdx : getIndexByUrl(storedPath),
    }
  }

  if (storedPath === routeInfo.path && typeof storedIdx === 'number') {
    return { path: storedPath, idx: storedIdx }
  }

  return routeInfo
}

const initialRoute = getInitialRouteInfo()
const initialNav = getStableInitialNavState(initialRoute)
const currentPath = ref(initialNav.path)
const displayIndex = ref(initialNav.idx)
const isEntering = ref(!layoutStore.isInitialRender)
const isExiting = ref(false)
const exitDir = ref<'up' | 'down' | 'left' | 'right'>('down')
const slideDir = ref<'right' | 'left' | 'up' | 'down'>(layoutStore.getSlideDirection())
const isReturning = computed(() => layoutStore.isReturning)

const userInitial = computed(() => {
  const name = (authStore.user?.displayName || authStore.username || 'U').trim()
  return name.charAt(0).toUpperCase() || 'U'
})

const syncBadgeClass = computed(() => {
  if (syncStore.isSyncing) return 'status-syncing'
  if (syncStore.lastError) return 'status-error'
  return 'status-connected'
})

const navItems = [
  { path: '/pages/tablet/dashboard/index', icon: 'home', label: '首页' },
  { path: '/pages/tablet/subject-hall/index', icon: 'book', label: '学科' },
  { path: '/pages/tablet/pomodoro/index', icon: 'clock', label: '专注' },
  ...(tabletHandwritingNotesEnabled
    ? [{ path: '/pages/tablet/handwriting/index', icon: 'edit', label: '手写' }]
    : []),
  { path: '/pages/tablet/ai-search/index', icon: 'sparkles', label: 'AI 助手' },
]

let stopSiblingPreload: (() => void) | null = null
let redirectTimer: ReturnType<typeof setTimeout> | null = null
let exitResetTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  slideDir.value = layoutStore.getSlideDirection()

  const nowRoute = getCurrentRoutePath()
  if (!nowRoute.includes('/login') && !authStore.isAuthenticated) {
    reLaunch('/pages/tablet/login/index')
    return
  }
  const targetIdx = getIndexByUrl(nowRoute)
  currentPath.value = nowRoute
  layoutStore.setActiveNav(targetIdx, nowRoute)
  displayIndex.value = targetIdx

  if (layoutStore.isInitialRender) {
    isEntering.value = false
    layoutStore.isInitialRender = false
  } else {
    setTimeout(() => {
      isEntering.value = false
    }, 360)
  }

  stopSiblingPreload = scheduleSiblingPreload(
    [...navItems.map(item => item.path), '/pages/tablet/profile/index'],
    nowRoute,
  )
})

onUnmounted(() => {
  if (redirectTimer) {
    clearTimeout(redirectTimer)
    redirectTimer = null
  }
  if (exitResetTimer) {
    clearTimeout(exitResetTimer)
    exitResetTimer = null
  }
  stopSiblingPreload?.()
  stopSiblingPreload = null
})

const navigate = (path: string) => {
  const nowRoute = getCurrentRoutePath()
  if (nowRoute === path || currentPath.value === path || isExiting.value) return

  const targetIndex = getIndexByUrl(path)
  const currentIdx = getIndexByUrl(nowRoute || currentPath.value)

  const dir = targetIndex > currentIdx ? 'down' : 'up'
  layoutStore.setSlideDirection(dir)
  exitDir.value = dir
  isExiting.value = true

  displayIndex.value = targetIndex
  currentPath.value = path
  layoutStore.setActiveNav(targetIndex, path)

  if (redirectTimer) clearTimeout(redirectTimer)
  if (exitResetTimer) clearTimeout(exitResetTimer)
  void preloadRoute(path)
  redirectTimer = setTimeout(() => { redirectTo(path) }, 160)
  exitResetTimer = setTimeout(() => {
    exitResetTimer = null
    isExiting.value = false
    if (nowRoute) {
      currentPath.value = nowRoute
      displayIndex.value = currentIdx
      layoutStore.setActiveNav(currentIdx, nowRoute)
    }
  }, 600)
}
</script>

<style scoped>
.tablet-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  background:
    radial-gradient(88% 42% at 88% 8%, rgba(139, 154, 110, 0.13) 0%, transparent 66%),
    radial-gradient(76% 40% at 10% 72%, rgba(200, 155, 109, 0.10) 0%, transparent 64%),
    linear-gradient(180deg, #F6F2EA 0%, #EFEBE2 100%);
  overflow: hidden;
  position: relative;
}

.sidebar {
  width: 68px;
  height: 100%;
  background-color: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--glass-border);
  box-shadow: 1px 0 0 rgba(45, 55, 40, 0.055), inset -1px 0 0 rgba(255, 255, 255, 0.65);
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  position: relative;
  z-index: 20;
  user-select: none;
  box-sizing: border-box;
}

.logo-area {
  width: 100%;
  padding: 20px 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(45, 55, 40, 0.06);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
  margin-bottom: 14px;
  cursor: pointer;
  transition: transform 0.2s var(--ease-out);
}

.logo-area:hover {
  transform: scale(1.06);
}

.logo-area:active {
  transform: scale(0.94);
}

.nav-menu {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
}

.active-capsule-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
  transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-active-bar {
  position: absolute;
  left: 0;
  top: 12px;
  width: 3.5px;
  height: 20px;
  background: var(--accent-gradient);
  border-radius: 0 4px 4px 0;
  box-shadow: 0 0 8px rgba(139, 154, 110, 0.55);
}

.capsule-inner {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background-color: rgba(139, 154, 110, 0.16);
}

.nav-item {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  z-index: 2;
  transition: background-color 0.18s ease, transform 0.16s var(--ease-out);
}

.nav-item:hover {
  background-color: rgba(139, 154, 110, 0.12);
}

.nav-item:active {
  transform: scale(0.94);
}

.sidebar-footer {
  width: 100%;
  padding: 14px 0 18px;
  border-top: 1px solid rgba(45, 55, 40, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.sidebar-avatar-entry {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-avatar {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13.5px;
  font-weight: 700;
  color: #FFFFFF;
  box-shadow: 0 0 0 1.5px rgba(139, 154, 110, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s ease;
}

.sidebar-avatar-entry:hover .sidebar-avatar,
.sidebar-avatar-entry.is-active .sidebar-avatar {
  transform: scale(1.06);
  box-shadow: 0 0 0 2px #8B9A6E, 0 4px 14px rgba(139, 154, 110, 0.28);
}

.avatar-sync-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.avatar-sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #8B9A6E;
}

.avatar-sync-badge.status-syncing .avatar-sync-dot {
  background-color: #C89B6D;
  animation: syncPulse 1.4s ease-in-out infinite;
}

.avatar-sync-badge.status-error .avatar-sync-dot {
  background-color: var(--color-danger);
}

@keyframes syncPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}

.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  height: 100%;
  position: relative;
  z-index: 1;
  background-color: transparent;
  overflow: hidden;
  opacity: 1;
  transform: none;
}

.main-content.is-entering-down {
  animation: tabletEnterDown 0.34s var(--ease-out) both;
}

.main-content.is-entering-up {
  animation: tabletEnterUp 0.34s var(--ease-out) both;
}

.main-content.is-entering-right {
  animation: tabletEnterRight 0.34s var(--ease-out) both;
}

.main-content.is-entering-left {
  animation: tabletEnterLeft 0.34s var(--ease-out) both;
}

.main-content.is-exiting-down {
  animation: tabletExitDown 0.16s cubic-bezier(0.4, 0, 1, 1) both;
}

.main-content.is-exiting-up {
  animation: tabletExitUp 0.16s cubic-bezier(0.4, 0, 1, 1) both;
}

@keyframes tabletEnterDown {
  0% { opacity: 0; transform: translateY(14px) scale(0.994); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes tabletEnterUp {
  0% { opacity: 0; transform: translateY(-14px) scale(0.994); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes tabletEnterRight {
  0% { opacity: 0; transform: translateX(-14px) scale(0.994); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes tabletEnterLeft {
  0% { opacity: 0; transform: translateX(14px) scale(0.994); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

.main-content.is-returning {
  animation: returnBreathe 0.34s var(--ease-out);
}

@keyframes returnBreathe {
  0% { opacity: 0; transform: scale(0.994); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes tabletExitDown {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-10px) scale(0.994); }
}

@keyframes tabletExitUp {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(10px) scale(0.994); }
}

.bg-glow {
  position: fixed;
  border-radius: 50%;
  filter: blur(110px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.3;
}

.bg-glow--1 {
  width: 480px;
  height: 480px;
  background: rgba(139, 154, 110, 0.18);
  top: -180px;
  right: -80px;
}

.bg-glow--2 {
  width: 340px;
  height: 340px;
  background: rgba(139, 154, 110, 0.12);
  bottom: -100px;
  left: 16%;
}

/* #ifdef H5 */
.tablet-layout {
  height: 100dvh;
}
/* #endif */
</style>
