<template>
  <ModalShell
    :model-value="visible"
    size="sm"
    :title="title"
    :aria-label="title"
    @update:model-value="handleOverlayUpdate"
    @close="handleCancel"
  >
    <div class="confirm-content-layout">
      <div
        class="modal-hero-badge"
        :class="type === 'danger' ? 'hero-danger' : 'hero-sage'"
      >
        <IconAlertTriangle v-if="type === 'danger'" :size="24" :stroke-width="1.8" />
        <IconHelpCircle v-else :size="24" :stroke-width="1.8" />
      </div>
      <div class="confirm-text-wrap">
        <p class="confirm-message">{{ message }}</p>
      </div>
    </div>

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
import { IconAlertTriangle, IconHelpCircle } from '@tabler/icons-vue'
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
.confirm-content-layout {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 6px 2px 10px;
}

.confirm-text-wrap {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.confirm-message {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  margin: 0;
  letter-spacing: -0.1px;
}
</style>
