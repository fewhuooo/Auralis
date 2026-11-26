<template>
  <div class="auralis-feedback-host">
    <div v-if="toastState.visible" class="feedback-toast-layer" role="status" aria-live="polite">
      <div class="feedback-toast-capsule" :class="`is-${toastState.tone}`">
        <span>{{ toastState.message }}</span>
      </div>
    </div>

    <div
      v-if="loadingState.visible"
      class="feedback-loading-mask"
      role="alertdialog"
      aria-busy="true"
      aria-label="正在加载"
    >
      <div class="feedback-loading-card">
        <div class="feedback-spinner" aria-hidden="true"></div>
        <span class="feedback-loading-text">{{ loadingState.title }}</span>
      </div>
    </div>

    <div
      v-if="confirmState.visible"
      class="feedback-modal-mask"
      role="dialog"
      aria-modal="true"
      :aria-label="confirmState.title"
      @click.self="resolveConfirm(false)"
    >
      <div class="feedback-modal-card">
        <div class="feedback-modal-title">{{ confirmState.title }}</div>
        <div class="feedback-modal-content">{{ confirmState.content }}</div>
        <div class="feedback-modal-actions">
          <button
            v-if="confirmState.showCancel"
            type="button"
            class="feedback-btn is-cancel"
            @click="resolveConfirm(false)"
          >
            {{ confirmState.cancelText }}
          </button>
          <button
            type="button"
            class="feedback-btn"
            :class="confirmState.confirmTone === 'danger' ? 'is-danger' : 'is-primary'"
            @click="resolveConfirm(true)"
          >
            {{ confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="previewImageState.visible"
      class="feedback-lightbox-mask"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @click.self="closeImagePreview()"
    >
      <button
        type="button"
        class="feedback-lightbox-close"
        aria-label="关闭预览"
        @click="closeImagePreview()"
      >
        ×
      </button>
      <img
        class="feedback-lightbox-img"
        :src="previewImageState.url"
        alt="预览图片"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import {
  closeImagePreview,
  confirmState,
  loadingState,
  previewImageState,
  resolveConfirm,
  toastState,
} from './feedbackState'

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (previewImageState.visible) {
    event.preventDefault()
    event.stopImmediatePropagation()
    closeImagePreview()
    return
  }
  if (confirmState.visible) {
    event.preventDefault()
    event.stopImmediatePropagation()
    resolveConfirm(false)
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown, true)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown, true)
  }
})
</script>

<style scoped>
.feedback-toast-layer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(92px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
  padding: 0 20px;
  pointer-events: none;
  z-index: 9999;
}

.feedback-toast-capsule {
  max-width: min(88vw, 380px);
  padding: 10px 18px;
  border-radius: 9999px;
  background: var(--glass-surface-strong);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--border-default);
  box-shadow: var(--glass-shadow);
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: var(--font-weight-medium);
  line-height: 1.45;
  text-align: center;
  word-break: break-word;
  animation: feedbackFadeUp 0.18s var(--ease-out);
}

.feedback-toast-capsule.is-success {
  border-color: rgba(139, 154, 110, 0.45);
  color: var(--color-sage-ink);
}

.feedback-toast-capsule.is-error {
  border-color: rgba(201, 59, 59, 0.35);
  color: var(--color-danger);
}

.feedback-loading-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(28, 28, 26, 0.18);
  z-index: 9998;
}

.feedback-loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 120px;
  padding: 18px 22px;
  border-radius: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--border-default);
  box-shadow: var(--glass-shadow);
}

.feedback-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(139, 154, 110, 0.24);
  border-top-color: var(--color-sage-ink);
  animation: feedbackSpin 0.8s linear infinite;
}

.feedback-loading-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.feedback-modal-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(28, 28, 26, 0.32);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 9998;
}

.feedback-modal-card {
  width: min(100%, 340px);
  padding: 20px;
  border-radius: 20px;
  background: var(--color-bg-card);
  border: 1px solid var(--border-default);
  box-shadow: var(--glass-shadow);
  animation: feedbackFadeUp 0.18s var(--ease-out);
}

.feedback-modal-title {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin-bottom: 8px;
}

.feedback-modal-content {
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.feedback-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.feedback-btn {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 8px 16px;
  font-size: 13.5px;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  background: var(--color-bg-tertiary);
  color: var(--text-secondary);
}

.feedback-btn.is-primary {
  border-color: transparent;
  background: var(--accent-gradient);
  color: var(--text-inverse);
}

.feedback-btn.is-danger {
  border-color: transparent;
  background: var(--color-danger);
  color: var(--text-inverse);
}

.feedback-lightbox-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 20, 18, 0.86);
  z-index: 9999;
}

.feedback-lightbox-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.feedback-lightbox-close {
  position: fixed;
  top: calc(16px + env(safe-area-inset-top));
  right: 16px;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  background: rgba(28, 28, 26, 0.68);
  color: #ffffff;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

@keyframes feedbackFadeUp {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes feedbackSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
