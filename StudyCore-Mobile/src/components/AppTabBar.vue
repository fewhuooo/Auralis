<template>
  <view class="app-bar-container">
    <!-- Left Pill TabBar -->
    <view class="app-tabbar-float">
      <!-- 弹性滑动小球背景 -->
      <view 
        class="active-ball-indicator" 
        :class="{ 'animate-ball': isAnimateBall }"
        :style="{ transform: `translateX(${displayIndex * 100}%)` }"
      >
        <view class="ball-inner"></view>
      </view>

      <view 
        class="tab-item" 
        @click="switchTab('/pages/mobile/home/index')"
      >
        <LineIcon name="home" size="40rpx" :color="displayIndex === 0 ? '#ffffff' : '#A8A8A5'" />
      </view>
      
      <view 
        class="tab-item" 
        @click="switchTab('/pages/mobile/review/index')"
      >
        <LineIcon name="book" size="40rpx" :color="displayIndex === 1 ? '#ffffff' : '#A8A8A5'" />
      </view>

      <view 
        class="tab-item" 
        @click="switchTab('/pages/mobile/pomodoro/index')"
      >
        <LineIcon name="clock" size="40rpx" :color="displayIndex === 2 ? '#ffffff' : '#A8A8A5'" />
      </view>
      
      <view 
        class="tab-item" 
        @click="switchTab('/pages/mobile/stats/index')"
      >
        <LineIcon name="chart" size="40rpx" :color="displayIndex === 3 ? '#ffffff' : '#A8A8A5'" />
      </view>
    </view>

    <!-- Right AI Float Button -->
    <view class="app-ai-float" @click="goToAi">
      <LineIcon name="ai" size="48rpx" color="#ffffff" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const currentPath = ref('')
const displayIndex = ref(0)
const isAnimateBall = ref(false)

const getIndexByUrl = (path: string) => {
  if (path.includes('review/index')) return 1
  if (path.includes('pomodoro/index')) return 2
  if (path.includes('stats/index')) return 3
  return 0
}

onMounted(() => {
  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + pages[pages.length - 1].route : ''
  const targetIdx = getIndexByUrl(nowRoute)
  currentPath.value = nowRoute

  // 彻底废除 prevIdx 回弹闪回！
  isAnimateBall.value = false
  displayIndex.value = targetIdx

  setTimeout(() => {
    isAnimateBall.value = true
  }, 50)
})

const switchTab = (url: string) => {
  const pages = getCurrentPages()
  const nowRoute = pages.length > 0 ? '/' + pages[pages.length - 1].route : ''
  const layoutStore = useLayoutStore()
  if (nowRoute === url || layoutStore.isExiting) return

  const targetIndex = getIndexByUrl(url)
  const currentIdx = getIndexByUrl(nowRoute)

  const dir = targetIndex > currentIdx ? 'right' : 'left'
  layoutStore.setSlideDirection(dir)
  layoutStore.startExit(dir, 160)

  isAnimateBall.value = true
  displayIndex.value = targetIndex
  currentPath.value = url

  setTimeout(() => {
    uni.redirectTo({ url })
  }, 160)
}

const goToAi = () => {
  uni.redirectTo({ url: '/pages/mobile/ai-search/index' })
}
</script>

<style scoped>
.app-bar-container {
  pointer-events: none;
}

.app-tabbar-float {
  pointer-events: auto;
  position: fixed;
  bottom: 40rpx;
  left: 30rpx;
  right: 180rpx;
  height: 112rpx;
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
  border-radius: 9999rpx;
  display: flex;
  align-items: center;
  padding: 0;
  z-index: 999;
  box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.04);
}

.active-ball-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 25%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}

.active-ball-indicator.animate-ball {
  transition: transform 0.52s cubic-bezier(0.22, 1, 0.36, 1);
}

.ball-inner {
  width: 90rpx;
  height: 90rpx;
  border-radius: 50%;
  background-color: var(--color-zen-graphite);
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.16);
}

.tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.tab-item:active {
  transform: scale(0.85);
}

.app-ai-float {
  pointer-events: auto;
  position: fixed;
  bottom: 40rpx;
  right: 30rpx;
  width: 112rpx;
  height: 112rpx;
  background-color: var(--color-zen-sage);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-zen-hairline);
  z-index: 999;
  transition: transform 0.2s;
}

.app-ai-float:active {
  transform: scale(0.95);
}
</style>
