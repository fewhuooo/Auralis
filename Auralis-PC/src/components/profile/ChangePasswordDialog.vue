<template>
  <ModalShell
    :model-value="modelValue"
    :title="t(messages.title)"
    :aria-label="t(messages.title)"
    size="sm"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <template #title>
      <span class="pwd-title">{{ t(messages.title) }}</span>
    </template>

    <div class="change-password-form">
      <div class="security-tip">
        <IconKey :size="15" :stroke-width="1.8" />
        <span>{{ t(messages.lengthRule) }}</span>
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">{{ t(messages.currentPassword) }} <span class="required">*</span></label>
        <input
          v-model="form.oldPassword"
          type="password"
          class="modal-form-input"
          :placeholder="t(messages.currentPlaceholder)"
          autofocus
          @input="clearError"
        />
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">{{ t(messages.newPassword) }} <span class="required">*</span></label>
        <input
          v-model="form.newPassword"
          type="password"
          class="modal-form-input"
          :placeholder="t(messages.newPlaceholder)"
          @input="clearError"
        />
      </div>

      <div class="modal-form-group">
        <label class="modal-form-label">{{ t(messages.confirmPassword) }} <span class="required">*</span></label>
        <input
          v-model="form.confirmPassword"
          type="password"
          class="modal-form-input"
          :placeholder="t(messages.confirmPlaceholder)"
          @keydown.enter="handleSubmit"
          @input="clearError"
        />
      </div>

      <div v-if="displayError" class="error-tip">
        <IconAlertCircle :size="14" :stroke-width="2" />
        <span>{{ displayError }}</span>
      </div>
    </div>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" @click="handleClose">{{ t(messages.cancel) }}</button>
      <button
        type="button"
        class="modal-btn modal-btn-primary"
        :disabled="submitting"
        @click="handleSubmit"
      >
        {{ t(submitting ? messages.saving : messages.submit) }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { t, type Message } from '@/i18n'
import { IconKey, IconAlertCircle } from '@tabler/icons-vue'
import ModalShell from '@/components/modal/ModalShell.vue'

const messages = {
  title: { 'zh-CN': '修改登录密码', en: 'Change password', ja: 'パスワードを変更' },
  lengthRule: { 'zh-CN': '新密码至少 12 位，按 UTF-8 编码最多 72 字节', en: 'Use at least 12 characters and at most 72 UTF-8 bytes', ja: '12 文字以上、UTF-8 で 72 バイト以内にしてください' },
  currentPassword: { 'zh-CN': '原密码', en: 'Current password', ja: '現在のパスワード' },
  currentPlaceholder: { 'zh-CN': '请输入当前正在使用的密码', en: 'Enter your current password', ja: '現在のパスワードを入力' },
  newPassword: { 'zh-CN': '新密码', en: 'New password', ja: '新しいパスワード' },
  newPlaceholder: { 'zh-CN': '请输入新密码', en: 'Enter a new password', ja: '新しいパスワードを入力' },
  confirmPassword: { 'zh-CN': '确认新密码', en: 'Confirm new password', ja: '新しいパスワードの確認' },
  confirmPlaceholder: { 'zh-CN': '请再次输入新密码核对', en: 'Re-enter the new password', ja: '新しいパスワードを再入力' },
  cancel: { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル' },
  saving: { 'zh-CN': '保存中...', en: 'Saving…', ja: '保存中…' },
  submit: { 'zh-CN': '确认修改', en: 'Change password', ja: '変更する' },
  currentRequired: { 'zh-CN': '请输入原密码', en: 'Enter your current password', ja: '現在のパスワードを入力してください' },
  passwordMismatch: { 'zh-CN': '两次输入的新密码不一致', en: 'The new passwords do not match', ja: '新しいパスワードが一致しません' },
  passwordUnchanged: { 'zh-CN': '新密码不能与原密码相同', en: 'Choose a password different from your current one', ja: '現在とは異なるパスワードを設定してください' },
} satisfies Record<string, Message>

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

const localError = ref<Message | null>(null)

const displayError = computed(() => {
  return localError.value ? t(localError.value) : props.errorMessage
})

const clearError = () => {
  localError.value = null
}

const resetForm = () => {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  localError.value = null
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
  localError.value = null
  if (!form.oldPassword) {
    localError.value = messages.currentRequired
    return
  }
  if (form.newPassword.length < 12 || new TextEncoder().encode(form.newPassword).byteLength > 72) {
    localError.value = messages.lengthRule
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    localError.value = messages.passwordMismatch
    return
  }
  if (form.oldPassword === form.newPassword) {
    localError.value = messages.passwordUnchanged
    return
  }

  emit('submit', {
    oldPassword: form.oldPassword,
    newPassword: form.newPassword,
  })
}
</script>

<style scoped>
.pwd-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
}

html.dark .pwd-title {
  color: var(--text-primary, #e6dfd8);
}

.change-password-form {
  display: flex;
  flex-direction: column;
}

.security-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-md, 10px);
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.12));
  color: var(--modal-accent, #8B9A6E);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 20px;
  line-height: 1.5;
}

html.dark .security-tip {
  background: rgba(163, 177, 155, 0.14);
  color: #B4C4AA;
}

.error-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #C2413E;
  margin-top: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md, 10px);
  background: rgba(217, 83, 79, 0.08);
  border: 1px solid rgba(217, 83, 79, 0.18);
}

html.dark .error-tip {
  background: rgba(217, 83, 79, 0.14);
  border-color: rgba(217, 83, 79, 0.25);
  color: #F87171;
}
</style>
