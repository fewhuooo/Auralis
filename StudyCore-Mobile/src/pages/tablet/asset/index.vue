<template>
  <TabletLayout>
    <view class="t-asset">
      <view class="header">
        <text class="page-title">资产管理</text>
      </view>
      <view class="content">
        <text class="placeholder">复刻 PC 端 Asset 功能区 (详见源码)</text>
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import TabletLayout from '@/components/tablet/TabletLayout.vue'
</script>

<style scoped>
.t-asset {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 60rpx;
  box-sizing: border-box;
}
.header { margin-bottom: 60rpx; }
.page-title { font-size: 48rpx; font-weight: 800; }
.content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed var(--border-default);
  border-radius: var(--radius-lg);
}
.placeholder { color: var(--text-muted); }
</style>
