<template>
  <view class="layout-container">
    <!-- Background Drawer Layer -->
    <MobileDrawer v-model:visible="showDrawer" />

    <!-- Foreground Page Layer -->
    <view 
      class="page-layer" 
      :class="{ 
        'is-shifted': showDrawer, 
        'is-entering': isEntering,
        'has-custom-bg': customBg
      }"
      @click="handlePageClick"
    >
      <view class="click-shield" v-if="showDrawer"></view>
      <slot></slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import MobileDrawer from '@/components/MobileDrawer.vue'
import { useLayoutStore } from '@/store/useLayoutStore'

const props = defineProps({
  customBg: {
    type: Boolean,
    default: false
  },
  disableAnimation: {
    type: Boolean,
    default: false
  }
})

const layoutStore = useLayoutStore()
const { showDrawer } = storeToRefs(layoutStore)

// Reset drawer state synchronously on page mount so it doesn't persist across navigation
layoutStore.closeDrawer()

const isEntering = ref(!props.disableAnimation)

watch(() => props.disableAnimation, (newVal) => {
  if (newVal) {
    isEntering.value = false
  }
})

const handlePageClick = () => {
  if (showDrawer.value) {
    layoutStore.closeDrawer()
  }
}

onMounted(() => {
  if (!props.disableAnimation) {
    // Use a slight delay to ensure the initial 'translateX(100%)' state is painted
    // before we remove the 'is-entering' class to trigger the CSS transition slide-in.
    setTimeout(() => {
      isEntering.value = false
    }, 20)
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

.page-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: var(--color-bg-primary);
  z-index: 20;
  overflow: hidden;
  transition: transform 0.4s cubic-bezier(0.3, 1.15, 0.6, 1);
}

/* When the drawer is opened */
.page-layer.is-shifted {
  transform: translateX(100%);
}

/* Initial state on mount to simulate sliding in from right over the drawer */
.page-layer.is-entering {
  transform: translateX(100%);
  transition: none; /* No transition on initial placement */
}

.page-layer.has-custom-bg {
  background: transparent;
}

.click-shield {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 9999;
}
</style>
