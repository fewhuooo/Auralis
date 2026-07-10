<template>
  <div v-if="visible" class="confirm-dialog-overlay" @click="handleCancel">
    <div class="confirm-modal" @click.stop>
      <div class="modal-header">
        <h3 class="modal-title">{{ title }}</h3>
        <button class="modal-close" @click="handleCancel">×</button>
      </div>
      <div class="modal-body">
        <p class="modal-message">{{ message }}</p>
      </div>
      <div class="modal-footer">
        <button class="footer-btn secondary-btn" @click="handleCancel">{{ cancelText }}</button>
        <button class="footer-btn danger-btn" :class="{ 'primary-btn': type !== 'danger' }" @click="handleConfirm">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {  } from 'vue'

const props = withDefaults(defineProps<{
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
.confirm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fade-in 0.2s ease;
}

.confirm-modal {
  width: 90%;
  max-width: 400px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3), var(--accent-glow);
  display: flex;
  flex-direction: column;
  animation: modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modal-enter {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
}

.modal-message {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-subtle);
  background: var(--color-bg-tertiary);
}

.footer-btn {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast);
}

.primary-btn {
  background: var(--accent-gradient);
  border: none;
  color: white;
}

.primary-btn:hover {
  box-shadow: var(--accent-glow);
}

.secondary-btn {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.secondary-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.danger-btn {
  background: #ef4444;
  border: none;
  color: white;
  border: 1px solid transparent;
}

.danger-btn:hover {
  background: #dc2626;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}
</style>
