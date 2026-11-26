<template>
  <div class="flash-card-stage" :class="{ 'has-deck': hasNext && showDeck !== false }">
    <div v-if="hasNext && showDeck !== false" class="deck-underlay" aria-hidden="true"></div>

    <div
      class="flash-card-container"
      role="button"
      :aria-label="flipped ? '切换回题目' : '翻看答案'"
      @click="handleCardClick"
    >
      <div class="flash-card" :class="{ 'is-flipped': flipped }">
        <div class="card-face zen-card front-face">
          <div class="card-header">
            <div class="card-header-meta">
              <span class="subject-caption">{{ subject || '通用' }}</span>
              <span v-if="statusTag" :class="['status-tag', statusTone]">{{ statusTag }}</span>
            </div>
            <LineIcon name="rotate" size="15px" color="var(--text-muted)" />
          </div>

          <div class="card-front-body">
            <span class="front-text">{{ front }}</span>
          </div>

          <div class="card-footer">
            <span class="hint-text">轻触卡片翻看答案</span>
          </div>
        </div>

        <div class="card-face zen-card back-face">
          <div class="card-header" @click.stop="handleHeaderClick">
            <div class="card-header-meta">
              <span class="subject-caption active">{{ subject || '通用' }}</span>
              <span v-if="statusTag" :class="['status-tag', statusTone]">{{ statusTag }}</span>
            </div>
            <LineIcon name="rotate" size="15px" color="var(--color-sage-ink)" />
          </div>

          <div class="question-recap">
            <span class="recap-label">{{ front }}</span>
          </div>

          <div class="card-back-scroll zen-scroll-y" @click.stop>
            <div class="answer-prose">
              <MarkdownText :content="back" />
            </div>
          </div>

          <div class="card-footer" @click.stop="handleHeaderClick">
            <span class="hint-text">轻触顶栏切回题目</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'

const props = withDefaults(defineProps<{
  front: string
  back: string
  subject?: string
  statusTag?: string
  statusTone?: 'warning' | 'sage'
  flipped: boolean
  hasNext?: boolean
  showDeck?: boolean
  suppressFlip?: boolean
}>(), {
  statusTag: '',
  statusTone: 'warning',
  showDeck: true,
  suppressFlip: false,
})

const emit = defineEmits<{
  (event: 'update:flipped', val: boolean): void
}>()

function toggleFlip() {
  if (props.suppressFlip) return
  emit('update:flipped', !props.flipped)
}

function handleCardClick() {
  toggleFlip()
}

function handleHeaderClick() {
  toggleFlip()
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
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  z-index: 0;
  pointer-events: none;
}

.flash-card-container {
  position: relative;
  z-index: 1;
  width: 100%;
  flex: 1;
  min-height: 280px;
  perspective: 1400px;
  cursor: pointer;
  display: flex;
}

.flash-card {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 280px;
  transform-style: preserve-3d;
  transition: transform 0.56s cubic-bezier(0.22, 1, 0.36, 1);
}

.flash-card.is-flipped {
  transform: rotateY(180deg);
}

.flash-card.is-flipped .front-face {
  pointer-events: none;
}

.flash-card:not(.is-flipped) .back-face {
  pointer-events: none;
}

.card-face {
  position: absolute;
  inset: 0;
  padding: 22px 24px;
  border-radius: 22px;
  box-shadow: 0 0 0 1px rgba(45, 55, 40, 0.055), 0 12px 30px rgba(45, 55, 40, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.88);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.front-face {
  z-index: 2;
}

.back-face {
  transform: rotateY(180deg);
  border-color: var(--glass-border);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.34), 0 12px 30px rgba(45, 55, 40, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.card-header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-tag {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-warning-ink);
  background-color: var(--color-warning-bg);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

.status-tag.sage {
  color: var(--color-sage-ink);
  background-color: var(--color-sage-bg);
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
  margin-top: 14px;
  padding-bottom: 12px;
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
  margin-top: 14px;
  touch-action: pan-y;
}

.answer-prose {
  padding-bottom: 8px;
}

.card-footer {
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hint-text {
  font-size: 11.5px;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
</style>
