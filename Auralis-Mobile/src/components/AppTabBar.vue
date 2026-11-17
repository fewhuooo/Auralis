<template>
  <view class="app-bar-container">
    <view class="app-tabbar-float">
      <view
        class="active-pill-indicator"
        :class="{ 'animate-pill': isAnimatePill }"
        :style="{ transform: `translateX(${displayIndex * 100}%)` }"
      >
        <view class="pill-inner"></view>
      </view>

      <view
        v-for="(item, idx) in tabItems"
        :key="item.path"
        class="tab-item"
        @click="switchTab(item.path)"
      >
        <LineIcon
          :name="item.icon"
          size="19px"
          :color="displayIndex === idx ? '#556B3D' : '#7A7A75'"
        />
        <text class="tab-label" :class="{ 'is-active': displayIndex === idx }">{{ item.label }}</text>
      </view>
    </view>

    <view class="app-ai-float" @click="goToAi">
      <LineIcon name="sparkles" size="21px" color="#FFFFFF" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const tabItems = [
  { path: '/pages/mobile/home/index', icon: 'calendar', label: '今日' },
  { path: '/pages/mobile/review/index', icon: 'book', label: '学习' },
  { path: '/pages/mobile/pomodoro/index', icon: 'clock', label: '专注' },
  { path: '/pages/mobile/profile/index', icon: 'avatar', label: '我的' },
]

const displayIndex = ref(0)
const isAnimatePill = ref(false)

function getIndexByUrl(path: string): number {
  if (path.includes('review/index')) return 1
  if (path.includes('pomodoro/index')) return 2
  if (path.includes('profile/index')) return 3
  return 0
}

onMounted(() => {
  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + (pages[pages.length - 1].route || '') : ''
  isAnimatePill.value = false
  displayIndex.value = getIndexByUrl(nowRoute)
  setTimeout(() => {
    isAnimatePill.value = true
  }, 50)
})

function switchTab(url: string) {
  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + (pages[pages.length - 1].route || '') : ''
  const layoutStore = useLayoutStore()
  if (nowRoute === url || layoutStore.isExiting) return

  const targetIndex = getIndexByUrl(url)
  const currentIdx = getIndexByUrl(nowRoute)
  const dir = targetIndex > currentIdx ? 'right' : 'left'
  layoutStore.setSlideDirection(dir)
  layoutStore.startExit(dir, 140)

  isAnimatePill.value = true
  displayIndex.value = targetIndex

  setTimeout(() => {
    uni.redirectTo({ url })
  }, 140)
}

function goToAi() {
  uni.redirectTo({ url: '/pages/mobile/ai-search/index' })
}
</script>

<style scoped>
.app-bar-container {
  pointer-events: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(14px + env(safe-area-inset-bottom));
  margin: 0 auto;
  max-width: 440px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 999;
  box-sizing: border-box;
}

.app-tabbar-float {
  pointer-events: auto;
  flex: 1;
  min-width: 0;
  height: 56px;
  position: relative;
  background-color: var(--glass-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  padding: 0 5px;
  box-shadow: var(--shadow-md);
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
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
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
  box-shadow: var(--shadow-md), var(--accent-glow);
  cursor: pointer;
  transition: transform 0.16s var(--ease-out), box-shadow 0.18s ease;
}

.app-ai-float:active {
  transform: scale(0.92);
}
</style>
