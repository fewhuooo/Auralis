<template>
  <AppPageLayout>
    <view class="stats-page">
      <AppHeader title="学习统计" />

      <scroll-view scroll-y :show-scrollbar="false" class="content-area">
        <StudyMetrics />
        <view class="bottom-spacer"></view>
      </scroll-view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import AppPageLayout from '@/components/AppPageLayout.vue'
import AppHeader from '@/components/AppHeader.vue'
import StudyMetrics from '@/components/StudyMetrics.vue'
</script>

<style scoped>
.stats-page {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.content-area {
  flex: 1;
  height: 0;
  min-height: 0;
  padding: 24rpx;
  box-sizing: border-box;
}

.bottom-spacer {
  height: calc(180rpx + env(safe-area-inset-bottom));
}
</style>
