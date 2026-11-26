<template>
  <div class="zen-time-picker-wrap">
    <div
      class="zen-picker-trigger"
      :class="{ 'is-disabled': disabled }"
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-disabled="disabled"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
    >
      <slot />
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen"
        class="zen-picker-mask"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.self="closePicker"
      >
        <div class="zen-picker-dialog">
          <div class="zen-picker-header">
            <span class="zen-picker-title">{{ title }}</span>
            <span class="zen-time-preview num-tabular">{{ formattedDraft }}</span>
          </div>

          <div class="zen-time-columns">
            <div ref="hourColRef" class="zen-time-col zen-scroll-y" aria-label="小时">
              <button
                v-for="hour in HOURS"
                :key="hour"
                type="button"
                class="zen-time-option num-tabular"
                :class="{ 'is-active': hour === draftHour }"
                :data-val="hour"
                @click="draftHour = hour"
              >
                {{ String(hour).padStart(2, '0') }} 时
              </button>
            </div>
            <div ref="minuteColRef" class="zen-time-col zen-scroll-y" aria-label="分钟">
              <button
                v-for="minute in MINUTES"
                :key="minute"
                type="button"
                class="zen-time-option num-tabular"
                :class="{ 'is-active': minute === draftMinute }"
                :data-val="minute"
                @click="draftMinute = minute"
              >
                {{ String(minute).padStart(2, '0') }} 分
              </button>
            </div>
          </div>

          <div class="zen-picker-footer">
            <button type="button" class="zen-picker-footer-btn is-cancel" @click="closePicker">取消</button>
            <button type="button" class="zen-picker-footer-btn is-confirm" @click="confirmSelection">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatTimeHHmm, parseTimeHHmm } from '@/utils/pickerHelpers'

const HOURS = Array.from({ length: 24 }, (_, idx) => idx)
const MINUTES = Array.from({ length: 60 }, (_, idx) => idx)

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  title?: string
}>(), {
  disabled: false,
  title: '选择时间',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const draftHour = ref(9)
const draftMinute = ref(0)
const hourColRef = ref<HTMLElement | null>(null)
const minuteColRef = ref<HTMLElement | null>(null)

const formattedDraft = computed(() => formatTimeHHmm(draftHour.value, draftMinute.value))

function scrollActiveIntoView(container: HTMLElement | null) {
  const active = container?.querySelector('.zen-time-option.is-active')
  if (active && typeof (active as HTMLElement).scrollIntoView === 'function') {
    ;(active as HTMLElement).scrollIntoView({ block: 'center' })
  }
}

function openPicker() {
  if (props.disabled) return
  const parsed = parseTimeHHmm(props.modelValue)
  draftHour.value = parsed.hour
  draftMinute.value = parsed.minute
  isOpen.value = true
  void nextTick(() => {
    scrollActiveIntoView(hourColRef.value)
    scrollActiveIntoView(minuteColRef.value)
  })
}

function closePicker() {
  isOpen.value = false
}

function confirmSelection() {
  emit('update:modelValue', formattedDraft.value)
  isOpen.value = false
}

function handleEscapeCapture(event: KeyboardEvent) {
  if (!isOpen.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopImmediatePropagation()
  closePicker()
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleEscapeCapture, true)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleEscapeCapture, true)
  }
})
</script>

<style scoped>
.zen-time-picker-wrap {
  display: inline-flex;
}

.zen-picker-trigger {
  cursor: pointer;
}

.zen-picker-trigger.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.zen-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: rgba(28, 28, 26, 0.34);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.zen-picker-dialog {
  width: min(300px, 100%);
  border-radius: 20px;
  background: var(--color-bg-primary, #F7F2EB);
  border: 1px solid var(--border-default, rgba(45, 55, 40, 0.09));
  box-shadow: 0 18px 44px rgba(28, 28, 26, 0.16);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.zen-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.zen-picker-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1C1C1A);
}

.zen-time-preview {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-sage-ink, #556B3D);
  background: rgba(139, 154, 110, 0.14);
  padding: 3px 10px;
  border-radius: 9999px;
}

.zen-time-columns {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  height: 210px;
}

.zen-time-col {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle, rgba(45, 55, 40, 0.06));
  border-radius: 14px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.zen-time-option {
  width: 100%;
  min-height: 34px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1C1C1A);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
}

.zen-time-option:hover {
  background: rgba(139, 154, 110, 0.14);
}

.zen-time-option.is-active {
  background: var(--accent-gradient, linear-gradient(135deg, #8E9F70 0%, #768758 100%));
  color: #FFFFFF;
  font-weight: 600;
}

.zen-picker-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.zen-picker-footer-btn {
  height: 34px;
  padding: 0 16px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.zen-picker-footer-btn.is-cancel {
  color: var(--text-muted, #7A7A75);
  background: rgba(28, 28, 26, 0.06);
}

.zen-picker-footer-btn.is-confirm {
  color: #FFFFFF;
  background: var(--accent-gradient, linear-gradient(135deg, #8E9F70 0%, #768758 100%));
}
</style>
