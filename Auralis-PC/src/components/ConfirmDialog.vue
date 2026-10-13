<template>
  <ModalShell
    :model-value="visible"
    size="sm"
    :title="title"
    :aria-label="title"
    body-class="confirm-modal-body"
    @update:model-value="handleOverlayUpdate"
    @close="handleCancel"
  >
    <template #title>
      <span class="confirm-title">{{ title }}</span>
    </template>

    <p class="confirm-message">{{ message }}</p>

    <template #footer>
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
    </template>
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
:deep(.confirm-modal-body) {
  overflow: hidden !important;
}

.confirm-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
}

html.dark .confirm-title {
  color: var(--text-primary, #e6dfd8);
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary, #2C2C28);
  line-height: 1.6;
  margin: 0;
  word-break: break-word;
}

html.dark .confirm-message {
  color: var(--text-secondary, #b0aca5);
}
</style>
