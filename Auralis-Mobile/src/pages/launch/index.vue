<template>
  <view class="launch-page">
    <view class="launch-mark">
      <BrandLogo size="48px" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useDeviceStore } from '@/store/useDeviceStore'

onMounted(async () => {
  const deviceStore = useDeviceStore()
  const authStore = useAuthStore()
  deviceStore.detect()

  let authed = Boolean(authStore.token)
  if (authed) {
    authed = await authStore.restoreSession()
  }

  let isTablet = false
  // #ifndef MP-WEIXIN
  isTablet = deviceStore.isTablet
  // #endif

  const target = authed
    ? (isTablet ? '/pages/tablet/dashboard/index' : '/pages/mobile/home/index')
    : (isTablet ? '/pages/tablet/login/index' : '/pages/mobile/login/index')

  uni.reLaunch({ url: target })
})
</script>

<style scoped>
.launch-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-primary);
}

.launch-mark {
  animation: launchBreathe 1.8s var(--ease-out) infinite alternate;
}

@keyframes launchBreathe {
  0% { opacity: 0.72; transform: scale(0.96); }
  100% { opacity: 1; transform: scale(1.03); }
}

/* #ifdef H5 */
.launch-page {
  min-height: 100dvh;
}
/* #endif */
</style>
