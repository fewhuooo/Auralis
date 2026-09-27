<template>
  <ModalShell
    :model-value="visible"
    size="sm"
    :title="title"
    :aria-label="title"
    @update:model-value="handleOverlayUpdate"
  >
    <div class="confirm-dialog-wrapper">
      <div class="confirm-header">
        <h3 class="confirm-title">{{ title }}</h3>
        <button class="confirm-close" @click="handleCancel" title="关闭" aria-label="关闭">×</button>
      </div>
      <div class="confirm-body">
        <p class="confirm-message">{{ message }}</p>
      </div>
      <div class="confirm-footer">
        <button type="button" class="modal-btn modal-btn-secondary" @click="handleCancel">
          {{ cancelText }}
        </button>
        <button
          type="button"
          class="modal-btn"
          :class="type === 'danger' ? 'modal-btn-danger' : 'modal-btn-primary'"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </button>
      </div>
    </div>
  </ModalShell>
</template>

<script setup lang="ts">
import ModalShell from '@/components/modal/ModalShell.vue'

withDefaults(defineProps<{
  visible: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'default' | 'danger'
}>(), {
  title: '确认提示',
  confirmText: '确定',
  cancelText: '取消',
  type: 'default'
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:visible', val: boolean): void
}>()

const handleOverlayUpdate = (val: boolean) => {
  if (!val) {
    handleCancel()
  }
}

const handleCancel = () => {
  emit('cancel')
  emit('update:visible', false)
}

const handleConfirm = () => {
  emit('confirm')
  emit('update:visible', false)
}
</script>

<style scoped>
.confirm-dialog-wrapper {
  display: flex;
  flex-direction: column;
}

.confirm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
}

.confirm-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #333333);
  margin: 0;
}

.confirm-close {
  background: none;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: var(--text-muted, #888888);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all var(--transition-fast, 0.15s ease);
}

.confirm-close:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--text-primary, #333333);
}

.confirm-body {
  padding: 20px 22px;
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary, #4b5563);
  line-height: 1.6;
  margin: 0;
}

.confirm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  background: rgba(0, 0, 0, 0.02);
}

html.dark .confirm-footer {
  background: rgba(255, 255, 255, 0.02);
}

.modal-btn-danger {
  background: #ef4444;
  color: white;
  border: 1px solid transparent;
}

.modal-btn-danger:hover {
  background: #dc2626;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
}
</style>
