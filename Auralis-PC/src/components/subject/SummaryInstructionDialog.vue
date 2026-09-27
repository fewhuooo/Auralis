<template>
  <ModalShell
    :model-value="modelValue"
    title="调整总结要求"
    size="sm"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleCancel"
  >
    <form class="summary-instruction-form" @submit.prevent="handleSubmit">
      <p class="instruction-hint">例如：更精简、突出考试重点，或优先整理公式。</p>
      <textarea
        v-model="instruction"
        :maxlength="maxlength"
        rows="5"
        class="styled-textarea instruction-textarea"
        placeholder="填写可选要求"
        autofocus
      ></textarea>
      <div class="char-count">{{ instruction.length }} / {{ maxlength }}</div>
    </form>

    <template #footer>
      <button type="button" class="btn-cancel" @click="handleCancel">取消</button>
      <button type="button" class="btn-submit" @click="handleSubmit">生成新总结</button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ModalShell from '@/components/modal/ModalShell.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    maxlength?: number
  }>(),
  {
    maxlength: 2000,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', instruction?: string): void
  (e: 'cancel'): void
}>()

const instruction = ref('')

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      instruction.value = ''
    }
  }
)

const handleCancel = () => {
  emit('update:modelValue', false)
  emit('cancel')
}

const handleSubmit = () => {
  emit('submit', instruction.value.trim() || undefined)
  emit('update:modelValue', false)
}
</script>

<style scoped>
.summary-instruction-form {
  display: flex;
  flex-direction: column;
}

.instruction-hint {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.instruction-textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.5;
  outline: none;
  min-height: 110px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.instruction-textarea:focus {
  border-color: var(--color-primary-accent, #7D9372);
  box-shadow: 0 0 0 3px rgba(125, 147, 114, 0.15);
}

.char-count {
  display: block;
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  text-align: right;
}

.btn-cancel {
  padding: 7px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel:hover {
  background: var(--bg-modifier-hover, rgba(0, 0, 0, 0.05));
  border-color: var(--border-strong);
}

.btn-submit {
  padding: 7px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 8px);
  background: var(--color-primary-light, rgba(125, 147, 114, 0.2));
  color: var(--color-primary-accent, #7D9372);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-submit:hover {
  background: var(--color-primary-accent, #7D9372);
  color: #fff;
}

html.dark .instruction-textarea {
  background: var(--color-bg-card, #232A24);
  border-color: rgba(163, 177, 155, 0.25);
}

html.dark .btn-cancel {
  background: var(--color-bg-card, #232A24);
  border-color: rgba(163, 177, 155, 0.25);
}
</style>
