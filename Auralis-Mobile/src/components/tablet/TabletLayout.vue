<template>
  <view class="tablet-layout">
    <view class="left-nav-column">
      <view class="sidebar">
        <view class="logo-area" @click="navigate('/pages/tablet/dashboard/index')">
          <BrandLogo size="72rpx" />
        </view>

        <view class="nav-menu">
          <view
            class="active-capsule-indicator"
            :style="{
              transform: `translateY(${displayIndex >= 0 ? displayIndex * 120 : 0}rpx)`,
              opacity: displayIndex >= 0 && displayIndex < navItems.length ? 1 : 0,
            }"
          >
            <view class="capsule-inner"></view>
          </view>

          <view
            v-for="(item, index) in navItems"
            :key="item.path"
            class="nav-item"
            @click="navigate(item.path)"
          >
            <view class="icon-wrap">
              <LineIcon
                :name="item.icon"
                size="38rpx"
                :color="displayIndex === index ? '#8B9A6E' : '#7A7A75'"
              />
            </view>
            <text class="nav-label" :class="{ 'label-active': displayIndex === index }">{{ item.label }}</text>
          </view>
        </view>

        <view class="nav-bottom"></view>
      </view>

      <view
        class="tablet-ai-float"
        :class="{ 'is-active': displayIndex === -1 }"
        @click="navigate('/pages/tablet/ai-search/index')"
        title="Auralis AI 助手"
      >
        <LineIcon name="sparkles" size="46rpx" color="#FFFFFF" />
      </view>
    </view>

    <view
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
    </view>

    <slot name="modal"></slot>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BrandLogo from '@/components/BrandLogo.vue'
import LineIcon from '@/components/LineIcon.vue'
import { tabletHandwritingNotesEnabled } from '@/config/features'
import { useLayoutStore } from '@/store/useLayoutStore'

const layoutStore = useLayoutStore()

const getIndexByUrl = (path: string) => {
  if (path.includes('subject-hall') || path.includes('workspace')) return 1
  if (path.includes('pomodoro')) return 2
  if (path.includes('handwriting')) return tabletHandwritingNotesEnabled ? 3 : -2
  if (path.includes('profile')) return tabletHandwritingNotesEnabled ? 4 : 3
  if (path.includes('ai-search')) return -1
  return 0
}

const getInitialRouteInfo = () => {
  try {
    const pages = getCurrentPages()
    if (pages && pages.length > 0) {
      const route = '/' + (pages[pages.length - 1].route || '')
      return { path: route, idx: getIndexByUrl(route) }
    }
  } catch {
    // Ignore route lookup error
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

const navItems = [
  { path: '/pages/tablet/dashboard/index', icon: 'home', label: '首页' },
  { path: '/pages/tablet/subject-hall/index', icon: 'book', label: '学科' },
  { path: '/pages/tablet/pomodoro/index', icon: 'clock', label: '专注' },
  ...(tabletHandwritingNotesEnabled
    ? [{ path: '/pages/tablet/handwriting/index', icon: 'edit', label: '随手记' }]
    : []),
  { path: '/pages/tablet/profile/index', icon: 'avatar', label: '我的' },
]

onMounted(() => {
  slideDir.value = layoutStore.getSlideDirection()

  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + pages[pages.length - 1].route : ''
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
    }, 520)
  }
})

const navigate = (path: string) => {
  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + pages[pages.length - 1].route : ''
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

  setTimeout(() => { uni.redirectTo({ url: path }) }, 160)
}
</script>

<style scoped>
.tablet-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  background-color: var(--color-bg-page);
  overflow: hidden;
  position: relative;
}

.left-nav-column {
  width: var(--tablet-sidebar-width, 136rpx);
  height: calc(100vh - 48rpx);
  margin: 24rpx 16rpx 24rpx 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  z-index: 100;
}

.sidebar {
  width: 100%;
  flex: 1;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32rpx 0;
  margin-bottom: 24rpx;
  box-shadow: var(--shadow-sm);
  transform: translateZ(0);
  will-change: transform;
}

.logo-area {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 36rpx;
  transition: transform 0.16s ease;
  cursor: pointer;
}

.logo-area:active {
  transform: scale(0.92);
}

.nav-menu {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  width: 100%;
  align-items: center;
  position: relative;
}

.active-capsule-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 104rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
  transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateZ(0);
  will-change: transform;
}

.capsule-inner {
  width: 104rpx;
  height: 104rpx;
  border-radius: 32rpx;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
}

.nav-bottom {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  width: 100%;
  align-items: center;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
  width: 104rpx;
  height: 104rpx;
  border-radius: 32rpx;
  position: relative;
  z-index: 2;
}

.nav-item:hover {
  background-color: var(--color-sage-bg);
}

.nav-item:active {
  transform: scale(0.92);
}

.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 20rpx;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  font-family: var(--font-family-base);
  transition: color 0.2s ease;
}

.nav-label.label-active {
  color: var(--color-zen-sage);
  font-weight: var(--font-weight-bold);
}

.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  margin: 24rpx 24rpx 24rpx 8rpx;
  position: relative;
  z-index: 1;
  height: calc(100vh - 48rpx);
  background-color: var(--color-bg-primary);
  border-radius: 40rpx;
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  opacity: 1;
  transform: translateY(0) translateX(0) scale(1);
}

.main-content.is-entering-down {
  animation: tabletEnterDown 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.main-content.is-entering-up {
  animation: tabletEnterUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.main-content.is-entering-right {
  animation: tabletEnterRight 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.main-content.is-entering-left {
  animation: tabletEnterLeft 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.main-content.is-exiting-down {
  animation: tabletExitDown 0.16s cubic-bezier(0.4, 0, 1, 1) both;
}

.main-content.is-exiting-up {
  animation: tabletExitUp 0.16s cubic-bezier(0.4, 0, 1, 1) both;
}

@keyframes tabletEnterDown {
  0% { opacity: 0; transform: translateY(32rpx) scale(0.99); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes tabletEnterUp {
  0% { opacity: 0; transform: translateY(-32rpx) scale(0.99); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes tabletEnterRight {
  0% { opacity: 0; transform: translateX(-28rpx) scale(0.99); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes tabletEnterLeft {
  0% { opacity: 0; transform: translateX(28rpx) scale(0.99); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

.main-content.is-returning {
  animation: returnBreathe 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes returnBreathe {
  0% { opacity: 0; transform: scale(0.99); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes tabletExitDown {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-24rpx) scale(0.99); }
}

@keyframes tabletExitUp {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(24rpx) scale(0.99); }
}

.tablet-ai-float {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: var(--accent-gradient);
  box-shadow: var(--shadow-md), 0 8rpx 24rpx rgba(139, 154, 110, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
}

.tablet-ai-float:hover {
  transform: scale(1.05);
}

.tablet-ai-float:active {
  transform: scale(0.92);
}

.tablet-ai-float.is-active {
  box-shadow: 0 0 0 6rpx var(--color-sage-bg), var(--shadow-md);
}
</style>
