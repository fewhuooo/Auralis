<template>
  <view class="launch-page">
    <text class="launch-title">StudyCore</text>
  </view>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useDeviceStore } from '@/store/useDeviceStore'

onMounted(() => {
  const deviceStore = useDeviceStore()
  deviceStore.detect()

  // #ifdef MP-WEIXIN
  const target = '/pages/mobile/home/index'
  // #endif

  // #ifndef MP-WEIXIN
  const target = deviceStore.isTablet
    ? '/pages/tablet/dashboard/index'
    : '/pages/mobile/home/index'
  // #endif

  uni.reLaunch({ url: target })
})
</script>

<style scoped>
.launch-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-zen-ivory, #F9F9F7);
}

.launch-title {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-primary, #2c2a26);
}
</style>
