<template>
  <ModalShell
    :model-value="modelValue"
    title="调整 AI 总结要求"
    aria-label="调整 AI 总结要求"
    size="sm"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleCancel"
  >
    <template #title>
      <span class="summary-title">调整 AI 总结要求</span>
    </template>

    <form class="summary-form" @submit.prevent="handleSubmit">
      <p class="instruction-hint">设定您希望 AI 侧重总结的维度或风格：</p>

      <!-- Preset Chips -->
      <div class="preset-chips">
        <button
          v-for="chip in presetPrompts"
          :key="chip"
          type="button"
          class="preset-chip"
          @click="applyPreset(chip)"
        >
          {{ chip }}
        </button>
      </div>

      <textarea
        v-model="instruction"
        :maxlength="maxlength"
        rows="5"
        class="modal-form-textarea"
        placeholder="例如：突出考试重点、优先整理概念与核心公式、精简要点..."
        autofocus
      ></textarea>
      <div class="char-count">{{ instruction.length }} / {{ maxlength }}</div>
    </form>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" @click="handleCancel">取消</button>
      <button type="button" class="modal-btn modal-btn-primary" @click="handleSubmit">
        <IconSparkles :size="14" :stroke-width="2" />
        <span>生成新总结</span>
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IconSparkles } from '@tabler/icons-vue'
import ModalShell from '@/components/modal/ModalShell.vue'

const presetPrompts = [
  '突出考试重点与考点',
  '精简概念并提取公式',
  '梳理核心脉络与框架',
  '通俗白话解释关键术语'
]

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

const applyPreset = (preset: string) => {
  if (!instruction.value) {
    instruction.value = preset
  } else if (!instruction.value.includes(preset)) {
    instruction.value = `${instruction.value}；${preset}`
  }
}

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
.summary-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
}

html.dark .summary-title {
  color: var(--text-primary, #e6dfd8);
}

.summary-form {
  display: flex;
  flex-direction: column;
}

.instruction-hint {
  margin: 0 0 12px;
  color: var(--text-secondary, #2C2C28);
  font-size: 13.5px;
  line-height: 1.5;
}

html.dark .instruction-hint {
  color: var(--text-secondary, #b0aca5);
}

.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.preset-chip {
  padding: 6px 14px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.08));
  background: var(--modal-inset-bg, #FAF7F2);
  color: var(--text-primary, #1C1C1A);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.preset-chip:hover {
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.14));
  border-color: var(--modal-accent, #8B9A6E);
  color: var(--modal-accent, #76855B);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

html.dark .preset-chip {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #e6dfd8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

html.dark .preset-chip:hover {
  background: rgba(163, 177, 155, 0.14);
  border-color: var(--modal-accent, #A3B19B);
  color: #B4C4AA;
}

.char-count {
  margin: 8px 0 0;
  color: var(--text-muted, #7A7A75);
  font-size: 12px;
  text-align: right;
}
</style>
