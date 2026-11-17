<template>
  <view class="flash-card-stage" :class="{ 'has-deck': hasNext }">
    <view v-if="hasNext" class="deck-underlay" aria-hidden="true"></view>

    <view
      class="flash-card-container"
      role="button"
      :aria-label="flipped ? '切换回题目' : '翻看答案'"
      @click="toggleFlip"
    >
      <view v-if="!flipped" class="card-face zen-card front-face">
        <view class="card-header">
          <text class="subject-caption">{{ subject || '通用' }}</text>
          <LineIcon name="rotate" size="15px" color="var(--text-muted)" />
        </view>

        <view class="card-front-body">
          <text class="front-text">{{ front }}</text>
        </view>
      </view>

      <view v-else class="card-face zen-card back-face">
        <view class="card-header">
          <text class="subject-caption active">{{ subject || '通用' }}</text>
          <LineIcon name="rotate" size="15px" color="var(--color-sage-ink)" />
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
  hasNext?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:flipped', val: boolean): void
}>()

function toggleFlip() {
  emit('update:flipped', !props.flipped)
}
</script>

<style scoped>
.flash-card-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.flash-card-stage.has-deck {
  padding-bottom: 8px;
  box-sizing: border-box;
}

.deck-underlay {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 0;
  height: 28px;
  border-radius: 16px;
  background-color: rgba(250, 247, 242, 0.72);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  z-index: 0;
  pointer-events: none;
}

.flash-card-container {
  position: relative;
  z-index: 1;
  width: 100%;
  flex: 1;
  min-height: 280px;
  cursor: pointer;
  display: flex;
}

.card-face {
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 24px 28px;
  border-radius: 20px;
  box-shadow: var(--shadow-md);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  animation: cardReveal 0.24s var(--ease-out) both;
}

.back-face {
  border-color: rgba(139, 154, 110, 0.28);
}

@keyframes cardReveal {
  0% { opacity: 0.65; transform: translateY(4px) scale(0.985); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.subject-caption {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.subject-caption.active {
  color: var(--color-sage-ink);
}

.card-front-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 8px;
}

.front-text {
  max-width: 28ch;
  font-size: clamp(21px, 3vw, 27px);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  text-align: center;
  line-height: 1.42;
  letter-spacing: -0.025em;
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
  letter-spacing: -0.015em;
}

.card-back-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  margin-top: 16px;
}

.answer-prose {
  padding-bottom: 8px;
}
</style>
