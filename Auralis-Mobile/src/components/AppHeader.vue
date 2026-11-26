<template>
  <view class="app-header-container" :class="{ 'with-border': showBorder }">
    <view class="status-bar-placeholder"></view>
    <view class="app-header-bar">
      <view class="header-left">
        <view
          v-if="effectiveShowBack"
          class="icon-btn back-btn"
          role="button"
          aria-label="返回"
          @click="handleBack"
        >
          <LineIcon name="back" size="18px" color="var(--text-primary)" />
        </view>
        <view v-if="title" class="title-group">
          <text class="header-title-left">{{ title }}</text>
        </view>
        <slot name="left"></slot>
      </view>

      <view class="header-right">
        <slot name="right">
          <view
            v-if="rightIcon"
            class="icon-btn right-action-btn"
            role="button"
            :aria-label="rightAriaLabel"
            @click="handleRightClick"
          >
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
import { canNavigateBack, navigateBack, reLaunch, redirectTo } from '@/platform/navigation'
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
  rightAriaLabel: {
    type: String,
    default: '操作',
  },
  showBorder: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['back-click', 'right-click'])

const layoutStore = useLayoutStore()
const effectiveShowBack = computed(() => props.showBack || props.showBackButton)

const topLevelRoutes = [
  '/pages/mobile/home/index',
  '/pages/mobile/learn/index',
  '/pages/mobile/pomodoro/index',
  '/pages/mobile/profile/index',
]

function handleBack() {
  emit('back-click')
  layoutStore.triggerReturn(360)

  if (canNavigateBack()) {
    navigateBack()
    return
  }

  const returnTarget = layoutStore.consumeReturnRoute() || props.backUrl
  if (returnTarget) {
    if (topLevelRoutes.some(route => returnTarget.includes(route.replace('/pages/mobile/', '')))) {
      reLaunch(returnTarget)
      return
    }
    redirectTo(returnTarget)
    return
  }

  reLaunch('/pages/mobile/home/index')
}

function handleRightClick() {
  emit('right-click')
}
</script>

<style scoped>
.app-header-container {
  width: 100%;
  background-color: transparent;
  position: sticky;
  top: 0;
  z-index: var(--z-index-header, 100);
  flex-shrink: 0;
}

.app-header-container.with-border {
  background-color: rgba(246, 242, 234, 0.68);
  backdrop-filter: blur(22px) saturate(175%);
  -webkit-backdrop-filter: blur(22px) saturate(175%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 1px 0 rgba(45, 55, 40, 0.055);
}

.status-bar-placeholder {
  width: 100%;
  height: var(--status-bar-height, 0px);
  height: max(var(--status-bar-height, 0px), env(safe-area-inset-top));
}

.app-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--phone-header-height);
  padding: 14px 18px 8px;
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
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: var(--line-height-tight);
  letter-spacing: -0.025em;
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
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #FFFFFF;
  border: 1px solid #EAE6DD;
  box-shadow: 0 1px 2px rgba(72, 62, 46, 0.03);
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.16s var(--ease-out), border-color 0.16s ease, background-color 0.16s ease;
}

.icon-btn:hover {
  border-color: var(--border-accent);
}

.icon-btn:active {
  transform: scale(0.92);
  background-color: var(--color-bg-secondary);
}
</style>
