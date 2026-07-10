<template>
  <view class="app-header-container" :class="{ 'with-border': showBorder }">
    <view class="status-bar-placeholder"></view>
    <view class="app-header-bar">
      <!-- 左侧：返回箭头(可选) + 页面标题居左 -->
      <view class="header-left">
        <view v-if="showBackButton" class="icon-btn back-btn" @click="handleBack">
          <LineIcon name="back" size="40rpx" :color="color" />
        </view>
        <text v-if="title" class="header-title-left" :style="{ color: color }">{{ title }}</text>
        <slot name="left"></slot>
      </view>

      <!-- 右侧：额外功能键(如有) + 用户名 + 用户头像 -->
      <view class="header-right">
        <slot name="right">
          <view v-if="rightIcon" class="icon-btn right-action-btn" @click="handleRightClick">
            <LineIcon :name="rightIcon" size="40rpx" color="var(--color-zen-graphite)" />
          </view>
          <view class="user-profile-badge" @click="handleProfileClick">
            <text class="user-name">{{ displayName }}</text>
            <view class="avatar-wrap">
              <image class="avatar-img" :src="displayAvatar" mode="aspectFill" />
            </view>
          </view>
        </slot>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useLayoutStore } from '@/store/useLayoutStore'

const authStore = useAuthStore()
const layoutStore = useLayoutStore()

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  showBackButton: {
    type: Boolean,
    default: false
  },
  backUrl: {
    type: String,
    default: ''
  },
  rightIcon: {
    type: String,
    default: ''
  },
  showBorder: {
    type: Boolean,
    default: true
  },
  color: {
    type: String,
    default: '#A3B19B'
  }
})

const emit = defineEmits(['back-click', 'right-click', 'profile-click'])

const displayName = computed(() => authStore.username || 'Alex')
const displayAvatar = computed(() => authStore.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=250&auto=format&fit=crop')

const handleBack = () => {
  emit('back-click')
  layoutStore.triggerReturn(550)
  if (props.backUrl) {
    if (
      props.backUrl.includes('home/index') ||
      props.backUrl.includes('review/index') ||
      props.backUrl.includes('pomodoro/index') ||
      props.backUrl.includes('stats/index') ||
      props.backUrl.includes('ai-search/index')
    ) {
      uni.reLaunch({ url: props.backUrl })
    } else {
      uni.navigateTo({ url: props.backUrl })
    }
  } else {
    try {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        uni.navigateBack()
      } else {
        uni.reLaunch({ url: '/pages/mobile/home/index' })
      }
    } catch (e) {
      uni.navigateBack()
    }
  }
}

const handleRightClick = () => {
  emit('right-click')
}

const handleProfileClick = () => {
  emit('profile-click')
  // 通过右上角头像进入个人空间
  uni.navigateTo({ url: '/pages/mobile/profile/index' })
}
</script>

<style scoped>
.app-header-container {
  width: 100%;
  background: linear-gradient(180deg, rgba(226, 232, 222, 0.94) 0%, rgba(241, 244, 238, 0.88) 100%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 100;
}
.app-header-container.with-border {
  border-bottom: none;
}
.app-header-container.with-border::after {
  content: '';
  position: absolute;
  bottom: -32rpx;
  left: 0;
  right: 0;
  height: 32rpx;
  background: linear-gradient(180deg, rgba(241, 244, 238, 0.75) 0%, rgba(249, 249, 247, 0) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 100%);
  -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 100%);
  pointer-events: none;
}
.status-bar-placeholder {
  width: 100%;
  height: var(--status-bar-height, 0px);
  background-color: transparent;
}
.app-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 108rpx;
  padding: 16rpx 32rpx 6rpx;
}

/* 左侧：返回箭头与居左标题 */
.header-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex: 1;
  overflow: hidden;
}
.header-title-left {
  font-size: 42rpx;
  font-weight: 800;
  color: #7D9372;
  font-family: "Outfit", "DM Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif;
  letter-spacing: -1rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.3s;
}

/* 右侧：用户头像、用户名及额外功能键 */
.header-right {
  display: flex;
  align-items: center;
  gap: 24rpx;
  flex-shrink: 0;
}
.user-profile-badge {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 8rpx 14rpx 8rpx 20rpx;
  background-color: var(--color-zen-white);
  border: 1px solid rgba(125, 147, 114, 0.25);
  border-radius: 999rpx;
  transition: all 0.2s;
}
.user-profile-badge:active {
  transform: scale(0.96);
  background-color: var(--color-zen-surface);
}
.user-name {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-zen-graphite);
  font-family: "Outfit", "DM Sans", "PingFang SC", "Hiragino Sans GB", -apple-system, sans-serif;
  transition: color 0.3s;
}
.avatar-wrap {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--color-zen-hairline);
  background-color: var(--color-zen-surface);
}
.avatar-img {
  width: 100%;
  height: 100%;
}

/* 按钮图标 */
.icon-btn {
  width: 68rpx;
  height: 68rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  flex-shrink: 0;
}
.icon-btn:active {
  background-color: var(--color-zen-surface);
}
.right-action-btn {
  background-color: var(--color-zen-white);
  border: 1px solid var(--color-zen-hairline);
}
</style>
