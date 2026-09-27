<template>
  <ModalShell
    :model-value="modelValue"
    size="sm"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <template #title>
      <div class="password-dialog-title">
        <IconShieldLock :size="18" :stroke-width="2" class="shield-icon" />
        <span>修改登录密码</span>
      </div>
    </template>

    <div class="change-password-form">
      <div class="security-tip-banner">
        <IconKey :size="15" :stroke-width="1.8" />
        <span>建议设置 12 位以上包含字母与数字的高强度密码</span>
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">原密码 <span class="required">*</span></label>
        <input
          v-model="form.oldPassword"
          type="password"
          class="modal-form-input"
          placeholder="请输入当前正在使用的密码"
          autofocus
          @input="clearError"
        />
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">新密码 <span class="required">*</span></label>
        <input
          v-model="form.newPassword"
          type="password"
          class="modal-form-input"
          placeholder="12 至 200 位安全新密码"
          @input="clearError"
        />
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">确认新密码 <span class="required">*</span></label>
        <input
          v-model="form.confirmPassword"
          type="password"
          class="modal-form-input"
          placeholder="请再次输入新密码核对"
          @keydown.enter="handleSubmit"
          @input="clearError"
        />
      </div>

      <div v-if="displayError" class="modal-error-tip">
        <IconAlertCircle :size="14" :stroke-width="2" />
        <span>{{ displayError }}</span>
      </div>
    </div>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" @click="handleClose">取消</button>
      <button
        type="button"
        class="modal-btn modal-btn-primary"
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
import { IconShieldLock, IconKey, IconAlertCircle } from '@tabler/icons-vue'
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
.password-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1c221d);
  letter-spacing: -0.01em;
}

.shield-icon {
  color: var(--color-zen-sage, #5b6c47);
  flex-shrink: 0;
}

.security-tip-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 8px;
  background: rgba(110, 129, 84, 0.08);
  color: #53643D;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;
  line-height: 1.4;
}

html.dark .security-tip-banner {
  background: rgba(163, 177, 155, 0.12);
  color: #B4C4AA;
}

.change-password-form {
  display: flex;
  flex-direction: column;
}

.modal-error-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #D93838;
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(220, 56, 56, 0.08);
}
</style>
