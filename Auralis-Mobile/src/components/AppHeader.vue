<template>
  <view class="app-header-container" :class="{ 'with-border': showBorder }">
    <view class="status-bar-placeholder"></view>
    <view class="app-header-bar" :style="headerBarStyle">
      <view class="header-left">
        <view v-if="effectiveShowBack" class="icon-btn back-btn" @click="handleBack">
          <LineIcon name="back" size="18px" color="var(--text-primary)" />
        </view>
        <view v-if="title" class="title-group">
          <text class="header-title-left">{{ title }}</text>
        </view>
        <slot name="left"></slot>
      </view>

      <view class="header-right">
        <slot name="right">
          <view v-if="rightIcon" class="icon-btn right-action-btn" @click="handleRightClick">
            <LineIcon :name="rightIcon" size="18px" color="var(--text-primary)" />
          </view>
        </slot>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  showBack: {
    type: Boolean,
    default: false,
  },
  showBackButton: {
    type: Boolean,
    default: false,
  },
  backUrl: {
    type: String,
    default: '',
  },
  rightIcon: {
    type: String,
    default: '',
  },
  showBorder: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['back-click', 'right-click'])

const layoutStore = useLayoutStore()
const effectiveShowBack = computed(() => props.showBack || props.showBackButton)

const headerBarStyle = computed(() => {
  // #ifdef MP-WEIXIN
  try {
    const info = uni.getSystemInfoSync()
    const menuRect = (uni as unknown as {
      getMenuButtonBoundingClientRect?: () => { left: number }
    }).getMenuButtonBoundingClientRect?.()
    if (menuRect && info.windowWidth > menuRect.left) {
      const reservePx = Math.max(96, Math.round(info.windowWidth - menuRect.left + 12))
      return { paddingRight: `${reservePx}px` }
    }
  } catch {
    // Fallback to default Mini Program capsule spacing
  }
  return { paddingRight: '104px' }
  // #endif
  // #ifndef MP-WEIXIN
  return {}
  // #endif
})

const topLevelRoutes = [
  '/pages/mobile/home/index',
  '/pages/mobile/review/index',
  '/pages/mobile/pomodoro/index',
  '/pages/mobile/profile/index',
]

function handleBack() {
  emit('back-click')
  layoutStore.triggerReturn(360)
  if (props.backUrl) {
    if (topLevelRoutes.some(route => props.backUrl.includes(route.replace('/pages/mobile/', '')))) {
      uni.reLaunch({ url: props.backUrl })
      return
    }
    uni.navigateTo({ url: props.backUrl })
    return
  }

  try {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      uni.navigateBack()
      return
    }
  } catch {
    // Fall back to home
  }
  uni.reLaunch({ url: '/pages/mobile/home/index' })
}

function handleRightClick() {
  emit('right-click')
}
</script>

<style scoped>
.app-header-container {
  width: 100%;
  background-color: var(--color-bg-primary);
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}

.app-header-container.with-border {
  border-bottom: 1px solid var(--border-subtle);
}

.status-bar-placeholder {
  width: 100%;
  height: var(--status-bar-height, 0px);
}

.app-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--phone-header-height);
  padding: 8px 18px;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.title-group {
  display: flex;
  align-items: center;
  min-width: 0;
}

.header-title-left {
  font-size: 19px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: var(--line-height-tight);
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.16s var(--ease-out), background-color 0.16s ease;
}

.icon-btn:active {
  transform: scale(0.92);
  background-color: var(--color-bg-secondary);
}
</style>
