<template>
  <ModalShell
    :model-value="visible"
    size="sm"
    :title="title"
    :aria-label="title"
    @update:model-value="handleOverlayUpdate"
    @close="handleCancel"
  >
    <template #title>
      <div class="confirm-title-wrap">
        <IconAlertTriangle v-if="type === 'danger'" :size="18" :stroke-width="2" class="title-icon danger" />
        <IconHelpCircle v-else :size="18" :stroke-width="2" class="title-icon" />
        <span>{{ title }}</span>
      </div>
    </template>

    <div class="confirm-body">
      <p class="confirm-message">{{ message }}</p>
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
.confirm-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.2px;
}

html.dark .confirm-title-wrap {
  color: var(--text-primary, #e6dfd8);
}

.title-icon {
  color: var(--color-zen-sage, #8B9A6E);
  flex-shrink: 0;
}

.title-icon.danger {
  color: var(--color-danger, #C2413E);
}

.confirm-body {
  padding: 8px 0 14px;
}

.confirm-message {
  font-size: 14.5px;
  color: var(--text-secondary, #2C2C28);
  line-height: 1.68;
  margin: 0;
}

html.dark .confirm-message {
  color: var(--text-secondary, #b0aca5);
}
</style>
