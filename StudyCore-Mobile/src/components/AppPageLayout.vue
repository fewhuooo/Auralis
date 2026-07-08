<template>
  <view class="layout-container">
    <!-- 底层常驻顶栏背景带：处于 page-layer 之下(z-index: 1)，在页面切换时永远补足顶栏背景，绝不丢失也绝不覆盖文字 -->
    <view class="layout-header-base"></view>

    <!-- Foreground Page Layer -->
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
        'has-custom-bg': customBg
      }"
    >
      <slot></slot>
    </view>
    
    <!-- App TabBar -->
    <AppTabBar v-if="showTabBar" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import AppTabBar from '@/components/AppTabBar.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const props = defineProps({
  customBg: {
    type: Boolean,
    default: false
  },
  disableAnimation: {
    type: Boolean,
    default: false
  },
  showTabBar: {
    type: Boolean,
    default: true
  },
  animOrigin: {
    type: String,
    default: ''
  }
})

const layoutStore = useLayoutStore()
const isEntering = ref(!props.disableAnimation)
const isExiting = computed(() => layoutStore.isExiting)
const exitDir = computed(() => layoutStore.exitDirection)
const slideDir = ref<'right' | 'left' | 'up' | 'down'>(layoutStore.getSlideDirection() as any)
const animOrigin = ref<'default' | 'slide-right' | 'top-right' | 'bottom-right'>('default')

const isReturning = computed(() => layoutStore.isReturning)

watch(() => props.disableAnimation, (newVal) => {
  if (newVal) {
    isEntering.value = false
  }
})

onMounted(() => {
  slideDir.value = layoutStore.getSlideDirection() as any
  
  if (props.animOrigin) {
    animOrigin.value = props.animOrigin as any
  } else {
    try {
      const pages = getCurrentPages()
      const currentRoute = pages[pages.length - 1]?.route || ''
      if (currentRoute.includes('profile')) {
        animOrigin.value = 'slide-right'
      } else if (currentRoute.includes('ai-search')) {
        animOrigin.value = 'bottom-right'
      }
    } catch (e) {}
  }

  if (!props.disableAnimation) {
    setTimeout(() => {
      isEntering.value = false
    }, 650)
  }
})
</script>

<style scoped>
.layout-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: var(--color-bg-primary);
}

.layout-header-base {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: calc(108rpx + var(--status-bar-height, 44px) + 32rpx);
  background: linear-gradient(180deg, rgba(226, 232, 222, 0.94) 0%, rgba(241, 244, 238, 0.88) 100%);
  pointer-events: none;
  z-index: 1;
}

.page-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: transparent;
  z-index: 20;
  overflow: hidden;
  opacity: 1;
  transform: translateX(0) scale(1);
  transition: transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 进场动画：改用 GPU 帧动画与 animation-fill-mode: both，在 DOM 渲染首帧（0ms）直接锁定 opacity: 0！彻底消除闪烁！ */
.page-layer.is-entering-right {
  animation: mobileEnterRight 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.page-layer.is-entering-left {
  animation: mobileEnterLeft 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes mobileEnterRight {
  0% { opacity: 0; transform: translateX(-40rpx) scale(0.985); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes mobileEnterLeft {
  0% { opacity: 0; transform: translateX(40rpx) scale(0.985); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

/* 离场动画：点击跳转前，当前页面跟随小球滑动方向优雅淡出 */
.page-layer.is-exiting-right {
  opacity: 0;
  transform: translateX(36rpx) scale(0.985);
  transition: transform 0.16s cubic-bezier(0.4, 0, 1, 1), opacity 0.16s cubic-bezier(0.4, 0, 1, 1);
}
.page-layer.is-exiting-left {
  opacity: 0;
  transform: translateX(-36rpx) scale(0.985);
  transition: transform 0.16s cubic-bezier(0.4, 0, 1, 1), opacity 0.16s cubic-bezier(0.4, 0, 1, 1);
}

/* 个人中心：柔和从右边划入 */
.page-layer.origin-slide-right {
  transform-origin: center right;
}
.page-layer.origin-slide-right.is-entering-right,
.page-layer.origin-slide-right.is-entering-left {
  opacity: 0;
  transform: translateX(64rpx);
}

/* AI助手：从右下角出现 - 极其舒缓柔和的展开 */
.page-layer.origin-bottom-right {
  transform-origin: bottom right;
}
.page-layer.origin-bottom-right.is-entering-right,
.page-layer.origin-bottom-right.is-entering-left {
  opacity: 0;
  transform: scale(0.98) translate(12rpx, 12rpx);
}

/* 返回到上一页时，上一页的柔和呼吸进入动效 */
.page-layer.is-returning {
  animation: returnBreathe 0.65s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes returnBreathe {
  0% { opacity: 0; transform: scale(0.985); }
  100% { opacity: 1; transform: scale(1); }
}

.page-layer.has-custom-bg {
  background: transparent;
}
</style>
