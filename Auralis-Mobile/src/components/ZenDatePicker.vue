<template>
  <div class="zen-date-picker-wrap">
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
            <button type="button" class="zen-picker-close" aria-label="关闭" @click="closePicker">×</button>
          </div>

          <div class="zen-cal-nav">
            <button type="button" class="zen-cal-arrow" aria-label="上个月" @click="moveMonth(-1)">‹</button>
            <span class="zen-cal-month num-tabular">{{ viewYear }}年{{ String(viewMonth).padStart(2, '0') }}月</span>
            <button type="button" class="zen-cal-arrow" aria-label="下个月" @click="moveMonth(1)">›</button>
          </div>

          <div class="zen-cal-weekdays">
            <span v-for="label in WEEKDAY_LABELS" :key="label" class="zen-cal-weekday">{{ label }}</span>
          </div>

          <div class="zen-cal-grid">
            <button
              v-for="cell in calendarCells"
              :key="cell.key"
              type="button"
              class="zen-cal-cell num-tabular"
              :class="{
                'is-muted': !cell.inMonth,
                'is-today': cell.key === todayDateKey,
                'is-selected': cell.key === selectedKey,
              }"
              @click="selectDate(cell.key)"
            >
              {{ cell.day }}
            </button>
          </div>

          <div class="zen-picker-footer">
            <button
              v-if="clearable && modelValue"
              type="button"
              class="zen-picker-footer-btn is-muted"
              @click="selectDate('')"
            >
              清除
            </button>
            <button type="button" class="zen-picker-footer-btn is-accent" @click="selectDate(todayDateKey)">
              今天
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { toLocalDateKey } from '@/utils/dateKey'
import { buildCalendarCells, parseDateKeyParts, shiftMonth } from '@/utils/pickerHelpers'

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const props = withDefaults(defineProps<{
  modelValue: string
  fallbackDate?: string
  disabled?: boolean
  title?: string
  clearable?: boolean
}>(), {
  fallbackDate: '',
  disabled: false,
  title: '选择日期',
  clearable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const todayDateKey = computed(() => toLocalDateKey(new Date()))
const selectedKey = computed(() => props.modelValue || props.fallbackDate || '')

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth() + 1)

const calendarCells = computed(() => buildCalendarCells(viewYear.value, viewMonth.value))

function openPicker() {
  if (props.disabled) return
  const seed = parseDateKeyParts(props.modelValue || props.fallbackDate || todayDateKey.value)
  if (seed) {
    viewYear.value = seed.year
    viewMonth.value = seed.month
  }
  isOpen.value = true
}

function closePicker() {
  isOpen.value = false
}

function moveMonth(delta: number) {
  const next = shiftMonth(viewYear.value, viewMonth.value, delta)
  viewYear.value = next.year
  viewMonth.value = next.month
}

function selectDate(nextKey: string) {
  emit('update:modelValue', nextKey)
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
.zen-date-picker-wrap {
  width: 100%;
}

.zen-picker-trigger {
  width: 100%;
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
  width: min(340px, 100%);
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

.zen-picker-close {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: rgba(28, 28, 26, 0.06);
  color: var(--text-muted, #7A7A75);
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.zen-cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
}

.zen-cal-arrow {
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle, rgba(45, 55, 40, 0.06));
  color: var(--text-primary, #1C1C1A);
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.zen-cal-month {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1C1C1A);
}

.zen-cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
}

.zen-cal-weekday {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-muted, #7A7A75);
  padding: 2px 0;
}

.zen-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.zen-cal-cell {
  height: 36px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1C1C1A);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.zen-cal-cell:hover {
  background: rgba(139, 154, 110, 0.14);
}

.zen-cal-cell.is-muted {
  color: var(--color-zen-stone, #A8A8A5);
}

.zen-cal-cell.is-today {
  border: 1px solid rgba(139, 154, 110, 0.45);
  color: var(--color-sage-ink, #556B3D);
  font-weight: 600;
}

.zen-cal-cell.is-selected {
  background: var(--accent-gradient, linear-gradient(135deg, #8E9F70 0%, #768758 100%));
  color: #FFFFFF;
  border-color: transparent;
  font-weight: 600;
}

.zen-picker-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.zen-picker-footer-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.zen-picker-footer-btn.is-muted {
  color: var(--text-muted, #7A7A75);
  background: rgba(28, 28, 26, 0.06);
}

.zen-picker-footer-btn.is-accent {
  color: var(--color-sage-ink, #556B3D);
  background: rgba(139, 154, 110, 0.16);
}
</style>
