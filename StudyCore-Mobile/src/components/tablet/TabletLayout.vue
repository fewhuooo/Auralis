<template>
  <view class="tablet-layout">
    <!-- Left Navigation Column: locks sidebar and AI button in exact vertical center alignment -->
    <view class="left-nav-column">
      <!-- Floating Zen Capsule Sidebar -->
      <view class="sidebar">
        <view class="logo-area" @click="navigate('/pages/tablet/dashboard/index')">
          <text class="logo-text">SC</text>
        </view>
        
        <view class="nav-menu">
          <!-- 弹性滑动胶囊背景 (垂直方向滑动) -->
          <view 
            class="active-capsule-indicator" 
            :style="{ 
              transform: `translateY(${displayIndex >= 0 ? displayIndex * 120 : 0}rpx)`,
              opacity: displayIndex >= 0 && displayIndex < navItems.length ? 1 : 0
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
              <LineIcon :name="item.icon" size="38rpx" :color="displayIndex === index ? 'var(--color-zen-graphite, #1C1C1A)' : 'var(--color-zen-stone, #A8A8A5)'" />
            </view>
            <text class="nav-label" :class="{ 'label-active': displayIndex === index }">{{ item.label }}</text>
          </view>
        </view>
        
        <view class="nav-bottom">
          <!-- Profile moved to main nav -->
        </view>
      </view>

      <!-- 左下角独立 AI 悬浮按钮 (跟侧栏胶囊在同一 flex 列中严格竖直居中对齐) -->
      <view 
        class="tablet-ai-float" 
        :class="{ 'is-active': displayIndex === -1 }"
        @click="navigate('/pages/tablet/ai-search/index')"
        title="StudyCore AI 助手"
      >
        <LineIcon name="ai" size="52rpx" color="#ffffff" />
      </view>
    </view>

    <!-- Main Content -->
    <view 
      class="main-content"
      :class="{
        'is-entering-down': isEntering && slideDir === 'down',
        'is-entering-up': isEntering && slideDir === 'up',
        'is-entering-right': isEntering && slideDir === 'right',
        'is-entering-left': isEntering && slideDir === 'left',
        'is-exiting-down': isExiting && exitDir === 'down',
        'is-exiting-up': isExiting && exitDir === 'up',
        'is-returning': isReturning
      }"
    >
      <slot></slot>
    </view>

    <!-- Modal Slot (outside main-content for fixed positioning) -->
    <slot name="modal"></slot>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const layoutStore = useLayoutStore()
const getIndexByUrl = (path: string) => {
  if (path.includes('subject-hall') || path.includes('workspace')) return 1
  if (path.includes('pomodoro')) return 2
  if (path.includes('handwriting')) return 3
  if (path.includes('profile')) return 4
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
  } catch (e) {}
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
  { path: '/pages/tablet/dashboard/index', icon: 'home', label: '仪表盘' },
  { path: '/pages/tablet/subject-hall/index', icon: 'menu', label: '学科' },
  { path: '/pages/tablet/pomodoro/index', icon: 'clock', label: '专注' },
  { path: '/pages/tablet/handwriting/index', icon: 'edit', label: '随手记' },
  { path: '/pages/tablet/profile/index', icon: 'settings', label: '设置' },
]

onMounted(() => {
  slideDir.value = layoutStore.getSlideDirection()

  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + pages[pages.length - 1].route : ''
  const targetIdx = getIndexByUrl(nowRoute)
  currentPath.value = nowRoute
  layoutStore.setActiveNav(targetIdx, nowRoute)

  // 胶囊直接稳定定位在当前页的目标位置，彻底废除 prevIdx 回弹闪回！
  displayIndex.value = targetIdx

  if (layoutStore.isInitialRender) {
    // 首次进入应用或冷启动直接静默渲染，不触发任何进场透明度与位移动画，彻底消除首屏白屏闪烁！
    isEntering.value = false
    layoutStore.isInitialRender = false
  } else {
    // 页面切换跟随动效收尾 (延迟 650ms 等待 CSS GPU 动画彻底播放完毕后再移除 class)
    setTimeout(() => {
      isEntering.value = false
    }, 650)
  }
})

const navigate = (path: string) => {
  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + pages[pages.length - 1].route : ''
  if (nowRoute === path || currentPath.value === path || isExiting.value) return

  const targetIndex = getIndexByUrl(path)
  const currentIdx = getIndexByUrl(nowRoute || currentPath.value)

  // 垂直上下切换方向
  const dir = targetIndex > currentIdx ? 'down' : 'up'
  layoutStore.setSlideDirection(dir)
  exitDir.value = dir
  isExiting.value = true

  // 侧栏胶囊立刻平滑滑动
  displayIndex.value = targetIndex
  currentPath.value = path
  layoutStore.setActiveNav(targetIndex, path)

  // 延迟 160ms 等待当前页面优雅淡出离场，再执行路由重载
  setTimeout(() => {
    uni.redirectTo({ url: path })
  }, 160)
}
</script>

<style scoped>
.tablet-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  background: var(--color-zen-ivory, #F9F9F7);
  overflow: visible;
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
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36rpx 0;
  margin-bottom: 24rpx;
  box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.04);
  transform: translateZ(0);
  will-change: transform;
}

.logo-area {
  width: 72rpx;
  height: 72rpx;
  background: var(--color-zen-graphite, #1C1C1A);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40rpx;
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.12);
  transition: transform 0.2s;
  cursor: pointer;
}
.logo-area:active {
  transform: scale(0.92);
}
.logo-text {
  color: var(--color-zen-white, #FFFFFF);
  font-weight: 800;
  font-size: 28rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
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
  border-radius: 40rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.03);
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
  border-radius: 40rpx;
  position: relative;
  z-index: 2;
}
.nav-item:hover {
  background: rgba(163, 177, 155, 0.12);
}
.nav-item:active {
  transform: scale(0.88);
}

.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 20rpx;
  font-weight: 600;
  color: var(--color-zen-stone, #A8A8A5);
  font-family: "Plus Jakarta Sans", -apple-system, sans-serif;
  transition: color 0.2s;
}
.nav-label.label-active {
  color: var(--color-zen-graphite, #1C1C1A);
  font-weight: 700;
}

.main-content {
  flex: 1;
  display: flex;
  min-width: 0;
  margin-left: 8rpx;
  position: relative;
  z-index: 1;
  height: 100%;
  background: transparent;
  opacity: 1;
  transform: translateY(0) translateX(0) scale(1);
}

/* 进场动画：改用 GPU 帧动画与 animation-fill-mode: both，在 DOM 渲染首帧直接锁定 opacity: 0！彻底消除 JS 响应延迟与过渡切换带来的闪烁！ */
.main-content.is-entering-down {
  animation: tabletEnterDown 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.main-content.is-entering-up {
  animation: tabletEnterUp 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.main-content.is-entering-right {
  animation: tabletEnterRight 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.main-content.is-entering-left {
  animation: tabletEnterLeft 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.main-content.is-exiting-down {
  animation: tabletExitDown 0.16s cubic-bezier(0.4, 0, 1, 1) both;
}
.main-content.is-exiting-up {
  animation: tabletExitUp 0.16s cubic-bezier(0.4, 0, 1, 1) both;
}

@keyframes tabletEnterDown {
  0% { opacity: 0; transform: translateY(48rpx) scale(0.985); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tabletEnterUp {
  0% { opacity: 0; transform: translateY(-48rpx) scale(0.985); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tabletEnterRight {
  0% { opacity: 0; transform: translateX(-32rpx) scale(0.985); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes tabletEnterLeft {
  0% { opacity: 0; transform: translateX(32rpx) scale(0.985); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

/* 返回时的柔和呼吸动效 */
.main-content.is-returning {
  animation: returnBreathe 0.65s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes returnBreathe {
  0% { opacity: 0; transform: scale(0.985); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes tabletExitDown {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-32rpx) scale(0.985); }
}
@keyframes tabletExitUp {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(32rpx) scale(0.985); }
}

/* 左下角独立 AI 悬浮按钮 (跟侧栏胶囊在同一 flex 列中严格竖直居中对齐) */
.tablet-ai-float {
  width: 136rpx;
  height: 136rpx;
  background-color: var(--color-zen-sage, #7D9372);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 12rpx 36rpx rgba(125, 147, 114, 0.35), 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.tablet-ai-float:hover {
  transform: translateY(-4rpx) scale(1.04);
  box-shadow: 0 16rpx 44rpx rgba(125, 147, 114, 0.45), 0 6rpx 16rpx rgba(0, 0, 0, 0.08);
}

.tablet-ai-float:active {
  transform: scale(0.92);
}

.tablet-ai-float.is-active {
  background-color: var(--color-zen-graphite, #1C1C1A);
  box-shadow: 0 16rpx 48rpx rgba(28, 28, 26, 0.35);
}
</style>
