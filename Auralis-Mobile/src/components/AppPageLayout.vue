<template>
  <div class="mobile-viewport-shell">
    <div class="layout-container" :class="{ 'has-tabbar': showTabBar }">
      <div
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
      </div>

      <AppTabBar v-if="showTabBar" />
      <slot name="overlay"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppTabBar from '@/components/AppTabBar.vue'
import { getCurrentRoutePath, reLaunch } from '@/platform/navigation'
import { useAuthStore } from '@/store/useAuthStore'
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

const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const currentRoute = ref('')
const isEntering = ref(!props.disableAnimation)
const isExiting = computed(() => (
  layoutStore.isExiting
  && (!layoutStore.exitingRoute || layoutStore.exitingRoute === currentRoute.value)
))
const exitDir = computed(() => layoutStore.exitDirection)
const slideDir = ref<'right' | 'left' | 'up' | 'down'>(layoutStore.getSlideDirection())
const animOrigin = ref<'default' | 'slide-right' | 'top-right' | 'bottom-right'>('default')
const isReturning = computed(() => layoutStore.isReturning)

watch(() => props.disableAnimation, (newVal) => {
  if (newVal) isEntering.value = false
})

onMounted(() => {
  slideDir.value = layoutStore.getSlideDirection()

  const route = getCurrentRoutePath()
  currentRoute.value = route
  if (route && !route.includes('/login') && !authStore.isAuthenticated) {
    reLaunch('/pages/mobile/login/index')
    return
  }
  if (route && !props.animOrigin) {
    if (route.includes('profile')) {
      animOrigin.value = 'slide-right'
    } else if (route.includes('ai-search')) {
      animOrigin.value = 'bottom-right'
    }
  }

  if (props.animOrigin) {
    animOrigin.value = props.animOrigin as 'default' | 'slide-right' | 'top-right' | 'bottom-right'
  }

  if (!props.disableAnimation) {
    setTimeout(() => {
      isEntering.value = false
    }, 360)
  }
})
</script>

<style scoped>
.mobile-viewport-shell {
  width: 100%;
  height: 100vh;
  background-color: var(--color-bg-secondary);
}

.layout-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(88% 42% at 88% 8%, rgba(139, 154, 110, 0.13) 0%, transparent 66%),
    radial-gradient(76% 40% at 10% 72%, rgba(200, 155, 109, 0.10) 0%, transparent 64%),
    linear-gradient(180deg, #F6F2EA 0%, #EFEBE2 100%);
}

.page-layer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(88% 42% at 88% 8%, rgba(139, 154, 110, 0.13) 0%, transparent 66%),
    radial-gradient(76% 40% at 10% 72%, rgba(200, 155, 109, 0.10) 0%, transparent 64%),
    linear-gradient(180deg, #F6F2EA 0%, #EFEBE2 100%);
  z-index: 1;
  overflow: hidden;
  opacity: 1;
  transform: none;
  transition: transform 0.36s var(--ease-out), opacity 0.36s var(--ease-out);
}

.layout-container.has-tabbar .page-layer {
  padding-bottom: 0;
  box-sizing: border-box;
}

.page-layer.is-entering-right {
  animation: mobileEnterRight 0.34s var(--ease-out) both;
}

.page-layer.is-entering-left {
  animation: mobileEnterLeft 0.34s var(--ease-out) both;
}

@keyframes mobileEnterRight {
  0% { opacity: 0; transform: translateX(-14px) scale(0.992); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes mobileEnterLeft {
  0% { opacity: 0; transform: translateX(14px) scale(0.992); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

.page-layer.is-exiting-right {
  opacity: 0;
  transform: translateX(12px) scale(0.992);
  transition: transform 0.14s cubic-bezier(0.4, 0, 1, 1), opacity 0.14s cubic-bezier(0.4, 0, 1, 1);
}

.page-layer.is-exiting-left {
  opacity: 0;
  transform: translateX(-12px) scale(0.992);
  transition: transform 0.14s cubic-bezier(0.4, 0, 1, 1), opacity 0.14s cubic-bezier(0.4, 0, 1, 1);
}

.page-layer.origin-slide-right {
  transform-origin: center right;
}

.page-layer.origin-bottom-right {
  transform-origin: bottom right;
}

.page-layer.is-returning {
  animation: returnBreathe 0.34s var(--ease-out);
}

@keyframes returnBreathe {
  0% { opacity: 0; transform: scale(0.992); }
  100% { opacity: 1; transform: scale(1); }
}

.page-layer.has-custom-bg {
  background: transparent;
}

/* #ifdef H5 */
.mobile-viewport-shell {
  height: 100dvh;
}

@media (min-width: 540px) {
  .layout-container {
    max-width: 440px;
    margin: 0 auto;
    border-left: 1px solid var(--glass-border);
    border-right: 1px solid var(--glass-border);
    box-shadow: 0 0 0 1px rgba(45, 55, 40, 0.05), 0 0 40px rgba(45, 55, 40, 0.045);
  }
}
/* #endif */
</style>
