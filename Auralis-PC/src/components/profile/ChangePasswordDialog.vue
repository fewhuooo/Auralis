<template>
  <ModalShell
    :model-value="modelValue"
    title="修改登录密码"
    aria-label="修改登录密码"
    size="sm"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <template #title>
      <span class="pwd-title">修改登录密码</span>
    </template>

    <div class="change-password-form">
      <div class="security-tip">
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

      <div v-if="displayError" class="error-tip">
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
import { IconKey, IconAlertCircle } from '@tabler/icons-vue'
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
