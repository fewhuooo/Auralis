<template>
  <view class="launch-page">
    <view class="launch-card">
      <BrandLogo size="96rpx" />
      <text class="launch-title">Auralis</text>
      <text class="launch-subtitle">正在载入工作空间…</text>
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

.launch-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
}

.launch-title {
  font-size: 42rpx;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: 1rpx;
}

.launch-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
</style>
