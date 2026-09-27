<template>
  <ModalShell
    :model-value="modelValue"
    title="修改登录密码"
    size="sm"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <div class="change-password-form">
      <div class="modal-form-item">
        <label class="modal-form-label">原密码</label>
        <input
          v-model="form.oldPassword"
          type="password"
          class="settings-input modal-input"
          placeholder="请输入当前使用的密码"
          @input="clearError"
        />
      </div>

      <div class="modal-form-item">
        <label class="modal-form-label">新密码</label>
        <input
          v-model="form.newPassword"
          type="password"
          class="settings-input modal-input"
          placeholder="12 至 200 位安全新密码"
          @input="clearError"
        />
      </div>

      <div class="modal-form-item">
        <label class="modal-form-label">确认新密码</label>
        <input
          v-model="form.confirmPassword"
          type="password"
          class="settings-input modal-input"
          placeholder="再次输入新密码"
          @keydown.enter="handleSubmit"
          @input="clearError"
        />
      </div>

      <div v-if="displayError" class="modal-error-tip">{{ displayError }}</div>
    </div>

    <template #footer>
      <button type="button" class="action-btn" @click="handleClose">取消</button>
      <button
        type="button"
        class="action-btn primary"
        :disabled="submitting"
        @click="handleSubmit"
      >
        {{ submitting ? '保存中...' : '确认修改' }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import ModalShell from '@/components/modal/ModalShell.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    submitting?: boolean
    errorMessage?: string
  }>(),
  {
    submitting: false,
    errorMessage: '',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', payload: { oldPassword: string; newPassword: string }): void
  (e: 'cancel'): void
}>()

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const localError = ref('')

const displayError = computed(() => {
  return localError.value || props.errorMessage || ''
})

const clearError = () => {
  localError.value = ''
}

const resetForm = () => {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  localError.value = ''
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      resetForm()
    }
  }
)

const handleClose = () => {
  emit('update:modelValue', false)
  emit('cancel')
}

const handleSubmit = () => {
  localError.value = ''
  if (!form.oldPassword) {
    localError.value = '请输入原密码'
    return
  }
  if (!form.newPassword || form.newPassword.length < 12 || form.newPassword.length > 200) {
    localError.value = '新密码长度必须在 12 至 200 位之间'
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    localError.value = '两次输入的新密码不一致'
    return
  }
  if (form.oldPassword === form.newPassword) {
    localError.value = '新密码不能与原密码相同'
    return
  }

  emit('submit', {
    oldPassword: form.oldPassword,
    newPassword: form.newPassword,
  })
}
</script>

<style scoped>
.change-password-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #1C1C1A);
}

.modal-input {
  width: 100% !important;
  box-sizing: border-box;
}

.modal-error-tip {
  font-size: 11.5px;
  color: #C2413E;
  margin-top: 2px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.10));
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-primary, #1C1C1A);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--bg-modifier-hover, rgba(0, 0, 0, 0.04));
  border-color: var(--border-strong, rgba(0, 0, 0, 0.18));
}

.action-btn.primary {
  background: var(--color-zen-sage, #8B9A6E);
  border-color: var(--color-zen-sage, #8B9A6E);
  color: var(--color-white, #FFFFFF);
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--color-sage-dark, #76855B);
  border-color: var(--color-sage-dark, #76855B);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

html.dark .action-btn {
  background: var(--color-bg-card, #232A24);
  border-color: rgba(163, 177, 155, 0.25);
  color: var(--text-primary, #E0DFDC);
}

html.dark .action-btn:hover {
  background: rgba(163, 177, 155, 0.15);
}

html.dark .action-btn.primary {
  background: var(--color-zen-sage, #8B9A6E);
  border-color: var(--color-zen-sage, #8B9A6E);
  color: #121612;
}

html.dark .action-btn.primary:hover:not(:disabled) {
  background: #9DB07E;
  border-color: #9DB07E;
}
</style>
