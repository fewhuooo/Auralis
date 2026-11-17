<template>
  <view class="flash-card-container" @click="toggleFlip">
    <view v-if="!flipped" class="card-face zen-card front-face">
      <view class="card-header">
        <view class="ui-tag">
          <text>{{ subject || '通用' }}</text>
        </view>
        <LineIcon name="rotate" size="16px" color="var(--text-muted)" />
      </view>

      <view class="card-front-body">
        <text class="front-text">{{ front }}</text>
      </view>
    </view>

    <view v-else class="card-face zen-card back-face">
      <view class="card-header">
        <view class="ui-tag">
          <text>{{ subject || '通用' }}</text>
        </view>
        <LineIcon name="rotate" size="16px" color="var(--color-sage-dark)" />
      </view>

      <view class="question-recap">
        <text class="recap-label">{{ front }}</text>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="card-back-scroll" @click.stop>
        <view class="answer-prose">
          <MarkdownText :content="back" />
        </view>
      </scroll-view>
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
  min-height: 280px;
  cursor: pointer;
}

.card-face {
  width: 100%;
  height: 100%;
  padding: 24px 28px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  animation: cardReveal 0.2s var(--ease-out) both;
}

@keyframes cardReveal {
  0% { opacity: 0.72; transform: scale(0.985); }
  100% { opacity: 1; transform: scale(1); }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.card-front-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 8px;
}

.front-text {
  max-width: 30ch;
  font-size: clamp(20px, 2.4vw, 26px);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  text-align: center;
  line-height: 1.42;
  letter-spacing: -0.02em;
  word-break: break-word;
}

.question-recap {
  margin-top: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.recap-label {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.45;
  letter-spacing: -0.01em;
}

.card-back-scroll {
  flex: 1;
  min-height: 0;
  margin-top: 16px;
}

.answer-prose {
  padding-bottom: 8px;
}
</style>
