<template>
  <view class="layout-container" :class="{ 'has-tabbar': showTabBar }">
    <view
      class="page-layer"
      :class="{
        'is-entering-right': isEntering && slideDir === 'right',
        'is-entering-left': isEntering && slideDir === 'left',
        'is-exiting-right': isExiting && exitDir === 'right',
        'is-exiting-left': isExiting && exitDir === 'left',
        'origin-slide-right': animOrigin === 'slide-right' || animOrigin === 'top-right',
        'origin-bottom-right': animOrigin === 'bottom-right',
        'is-returning': isReturning,
        'has-custom-bg': customBg,
      }"
    >
      <slot></slot>
    </view>

    <AppTabBar v-if="showTabBar" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppTabBar from '@/components/AppTabBar.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const props = defineProps({
  customBg: {
    type: Boolean,
    default: false,
  },
  disableAnimation: {
    type: Boolean,
    default: false,
  },
  showTabBar: {
    type: Boolean,
    default: true,
  },
  animOrigin: {
    type: String,
    default: '',
  },
})

const layoutStore = useLayoutStore()
const isEntering = ref(!props.disableAnimation)
const isExiting = computed(() => layoutStore.isExiting)
const exitDir = computed(() => layoutStore.exitDirection)
const slideDir = ref<'right' | 'left' | 'up' | 'down'>(layoutStore.getSlideDirection())
const animOrigin = ref<'default' | 'slide-right' | 'top-right' | 'bottom-right'>('default')
const isReturning = computed(() => layoutStore.isReturning)

watch(() => props.disableAnimation, (newVal) => {
  if (newVal) isEntering.value = false
})

onMounted(() => {
  slideDir.value = layoutStore.getSlideDirection()

  if (props.animOrigin) {
    animOrigin.value = props.animOrigin as 'default' | 'slide-right' | 'top-right' | 'bottom-right'
  } else {
    try {
      const pages = getCurrentPages()
      const currentRoute = pages[pages.length - 1]?.route || ''
      if (currentRoute.includes('profile')) {
        animOrigin.value = 'slide-right'
      } else if (currentRoute.includes('ai-search')) {
        animOrigin.value = 'bottom-right'
      }
    } catch {
      // Ignore runtime route inspection failure
    }
  }

  if (!props.disableAnimation) {
    setTimeout(() => {
      isEntering.value = false
    }, 520)
  }
})
</script>

<style scoped>
.layout-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

.page-layer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary);
  z-index: 20;
  overflow: hidden;
  opacity: 1;
  transform: translateX(0) scale(1);
  transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}

.layout-container.has-tabbar .page-layer {
  padding-bottom: calc(164rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.page-layer.is-entering-right {
  animation: mobileEnterRight 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.page-layer.is-entering-left {
  animation: mobileEnterLeft 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes mobileEnterRight {
  0% { opacity: 0; transform: translateX(-28rpx) scale(0.99); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes mobileEnterLeft {
  0% { opacity: 0; transform: translateX(28rpx) scale(0.99); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

.page-layer.is-exiting-right {
  opacity: 0;
  transform: translateX(24rpx) scale(0.99);
  transition: transform 0.14s cubic-bezier(0.4, 0, 1, 1), opacity 0.14s cubic-bezier(0.4, 0, 1, 1);
}

.page-layer.is-exiting-left {
  opacity: 0;
  transform: translateX(-24rpx) scale(0.99);
  transition: transform 0.14s cubic-bezier(0.4, 0, 1, 1), opacity 0.14s cubic-bezier(0.4, 0, 1, 1);
}

.page-layer.origin-slide-right {
  transform-origin: center right;
}

.page-layer.origin-bottom-right {
  transform-origin: bottom right;
}

.page-layer.is-returning {
  animation: returnBreathe 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes returnBreathe {
  0% { opacity: 0; transform: scale(0.99); }
  100% { opacity: 1; transform: scale(1); }
}

.page-layer.has-custom-bg {
  background-color: transparent;
}
</style>
