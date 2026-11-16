<template>
  <view class="flash-card-container" @click="toggleFlip">
    <view v-if="!flipped" class="card-face zen-card">
      <view class="card-header">
        <view class="subject-badge">
          <text>{{ subject || '未分类' }}</text>
        </view>
        <text class="state-indicator">问题</text>
      </view>

      <view class="card-front-body">
        <text class="front-text">{{ front }}</text>
      </view>

      <view class="card-footer">
        <LineIcon name="eye" size="28rpx" color="var(--text-muted)" />
        <text class="hint-text">轻触卡片翻看答案</text>
      </view>
    </view>

    <view v-else class="card-face card-back zen-card">
      <view class="card-header">
        <view class="subject-badge active">
          <text>{{ subject || '未分类' }}</text>
        </view>
        <text class="state-indicator answer">解析答案</text>
      </view>

      <view class="question-recap">
        <text class="recap-label">{{ front }}</text>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="card-back-scroll" @click.stop>
        <MarkdownText :content="back" />
      </scroll-view>

      <view class="card-footer">
        <text class="hint-text">根据回忆程度选择下方反馈</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'

const props = defineProps<{
  front: string
  back: string
  subject?: string
  flipped: boolean
}>()

const emit = defineEmits<{
  (event: 'update:flipped', val: boolean): void
}>()

function toggleFlip() {
  emit('update:flipped', !props.flipped)
}
</script>

<style scoped>
.flash-card-container {
  width: 100%;
  height: 100%;
  min-height: 520rpx;
}

.card-face {
  width: 100%;
  height: 100%;
  padding: 36rpx 32rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20rpx;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.subject-badge {
  padding: 8rpx 20rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.subject-badge.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-zen-sage);
}

.state-indicator {
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.state-indicator.answer {
  color: var(--color-zen-sage);
}

.card-front-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx 12rpx;
}

.front-text {
  font-size: 38rpx;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  text-align: center;
  line-height: 1.45;
  word-break: break-word;
}

.question-recap {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  background-color: var(--color-bg-primary);
  border-radius: 18rpx;
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.recap-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  line-height: 1.45;
}

.card-back-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 18rpx;
}

.card-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8rpx;
  padding-top: 20rpx;
  margin-top: 16rpx;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.hint-text {
  font-size: 22rpx;
  color: var(--text-muted);
}
</style>
