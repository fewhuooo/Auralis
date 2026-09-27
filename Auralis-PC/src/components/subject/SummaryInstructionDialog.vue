<template>
  <ModalShell
    :model-value="modelValue"
    size="sm"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleCancel"
  >
    <template #title>
      <div class="summary-dialog-title">
        <IconSparkles :size="18" :stroke-width="2" class="sparkle-icon" />
        <span>调整 AI 总结要求</span>
      </div>
    </template>

    <form class="summary-instruction-form" @submit.prevent="handleSubmit">
      <p class="instruction-hint">设定您希望 AI 侧重总结的维度或风格：</p>

      <!-- Preset Chips -->
      <div class="instruction-preset-chips">
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
.summary-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1c221d);
  letter-spacing: -0.01em;
}

.sparkle-icon {
  color: var(--color-zen-sage, #5b6c47);
  flex-shrink: 0;
}

.summary-instruction-form {
  display: flex;
  flex-direction: column;
}

.instruction-hint {
  margin: 0 0 10px;
  color: var(--text-secondary, #4a564c);
  font-size: 12.5px;
  line-height: 1.5;
}

.instruction-preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.preset-chip {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: rgba(110, 129, 84, 0.08);
  color: #556641;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

html.dark .preset-chip {
  background: rgba(163, 177, 155, 0.12);
  color: #b4c4aa;
}

.preset-chip:hover {
  background: rgba(110, 129, 84, 0.16);
  color: #3f4e2d;
}

html.dark .preset-chip:hover {
  background: rgba(163, 177, 155, 0.22);
  color: #d1ded8;
}

.char-count {
  display: block;
  margin: 6px 0 0;
  color: var(--text-muted, #859187);
  font-size: 11.5px;
  text-align: right;
}
</style>
