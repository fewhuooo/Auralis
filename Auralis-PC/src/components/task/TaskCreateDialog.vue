<template>
  <ModalShell
    :model-value="modelValue"
    :title="title"
    :aria-label="title"
    size="md"
    custom-class="task-create-modal"
    :prevent-close="saving"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <template #title>
      <span class="task-title">{{ title }}</span>
    </template>

    <div class="task-body">
      <!-- 任务名称 -->
      <div class="modal-form-group">
        <label class="modal-form-label">{{ t({ 'zh-CN': '任务名称', en: 'Task name', ja: 'タスク名' }) }} <span class="required">*</span></label>
        <input
          ref="nameInputRef"
          v-model="form.name"
          class="modal-form-input"
          :placeholder="t({ 'zh-CN': '请输入学习或专注任务名称...', en: 'Enter a study or focus task…', ja: '学習・集中タスクの名前を入力…' })"
          autofocus
          @keyup.enter="handleSubmit"
        />
      </div>

      <!-- 所属学科 -->
      <div v-if="!fixedSubjectId" class="modal-form-group">
        <div class="subject-header">
          <label class="modal-form-label">{{ t({ 'zh-CN': '所属学科', en: 'Subject', ja: '科目' }) }} <span class="required">*</span></label>
          <span v-if="resolvedSubjects.length > 0" class="subject-count-hint">
            {{ t({ 'zh-CN': '共 {count} 门', en: 'Subjects: {count}', ja: '全{count}科目' }, { count: resolvedSubjects.length }) }}
          </span>
        </div>
        <div class="subject-grid">
          <div
            v-for="subj in resolvedSubjects"
            :key="subj.id"
            class="subject-chip"
            :class="{ active: form.subjectId === subj.id }"
            @click="form.subjectId = subj.id"
          >
            <span class="chip-icon">
              <component
                v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)"
                :is="getSubjectIconComponent(subj.icon)"
                style="width: 1em; height: 1em;"
              />
              <span v-else>{{ getLegacySubjectIcon(subj.icon) || '📘' }}</span>
            </span>
            <span class="chip-name">{{ subj.name }}</span>
          </div>
          <div v-if="resolvedSubjects.length === 0" class="empty-hint">
            {{ t({ 'zh-CN': '暂无学科，请先创建学科空间', en: 'Create a subject first', ja: '先に科目を作成してください' }) }}
          </div>
        </div>
      </div>
      <div v-else-if="fixedSubjectName" class="modal-form-group">
        <label class="modal-form-label">{{ t({ 'zh-CN': '所属学科', en: 'Subject', ja: '科目' }) }}</label>
        <div class="fixed-badge">📘 {{ fixedSubjectName }}</div>
      </div>

      <!-- 专注时长 -->
      <div class="modal-form-group">
        <div class="duration-header">
          <label class="modal-form-label">{{ t({ 'zh-CN': '专注时长', en: 'Focus duration', ja: '集中時間' }) }}</label>
          <div class="duration-value-pill">
            <svg class="duration-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <polyline points="12 7 12 12 15 15"/>
            </svg>
            <span class="duration-pill-text">{{ t({ 'zh-CN': '{minutes} 分钟（{hours} 小时）', en: '{minutes} min ({hours} hr)', ja: '{minutes}分（{hours}時間）' }, { minutes: form.duration, hours: (form.duration / 60).toFixed(1) }) }}</span>
          </div>
        </div>

        <!-- 现代化整半小时一体化磁吸分段滑轨 -->
        <div
          ref="sliderTrackRef"
          class="duration-segmented-track"
          @mousedown="handleTrackMouseDown"
        >
          <!-- 悬浮活动手柄滑块 -->
          <div
            class="active-thumb-pill"
            :class="{ dragging: isDraggingDuration }"
            :style="thumbStyle"
          >
            <span class="active-thumb-text">{{ currentDurationOption.label }}</span>
          </div>

          <!-- 各半小时档位段标签 -->
          <div class="track-segments-row">
            <div
              v-for="(opt, idx) in durationOptions"
              :key="opt.minutes"
              class="track-segment-item"
              :class="{ active: form.duration === opt.minutes }"
              @click.stop="selectDurationIndex(idx)"
            >
              <span class="segment-label">{{ opt.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 截止时间 -->
      <div class="modal-form-group">
        <div class="due-header">
          <label class="modal-form-label">
            {{ t({ 'zh-CN': '截止时间', en: 'Due date', ja: '期限' }) }}
            <span class="optional-tag">{{ t({ 'zh-CN': '可选', en: 'Optional', ja: '任意' }) }}</span>
          </label>
          <button
            v-if="form.due"
            type="button"
            class="due-clear-btn"
            :title="t({ 'zh-CN': '清除截止时间', en: 'Clear due date', ja: '期限をクリア' })"
            @click="form.due = ''"
          >
            {{ t({ 'zh-CN': '清除', en: 'Clear', ja: 'クリア' }) }}
          </button>
        </div>
        <div class="due-picker-wrap">
          <el-date-picker
            v-model="form.due"
            type="date"
            :placeholder="t({ 'zh-CN': '请选择截止日期（可选）', en: 'Choose a due date (optional)', ja: '期限を選択（任意）' })"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            class="zen-date-picker"
            popper-class="zen-date-popper"
            :teleported="true"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" :disabled="saving" @click="handleClose">{{ t({ 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル' }) }}</button>
      <button
        type="button"
        class="modal-btn modal-btn-primary"
        :disabled="!isSubmitEnabled"
        @click="handleSubmit"
      >
        {{ saving ? t({ 'zh-CN': '保存中…', en: 'Saving…', ja: '保存中…' }) : submitText }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue'
import 'element-plus/theme-chalk/el-date-picker.css'
import 'element-plus/theme-chalk/el-date-picker-panel.css'
import ModalShell from '@/components/modal/ModalShell.vue'
import { useSubjectStore } from '@/store/useSubjectStore'
import { localDateEndOfDay } from '@/services/taskViewRules'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'

export interface TaskSubjectItem {
  id: string
  name: string
  icon?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    submitText?: string
    saving?: boolean
    subjects?: TaskSubjectItem[]
    fixedSubjectId?: string
    fixedSubjectName?: string
    defaultDuration?: number
    defaultSubjectId?: string
    defaultDue?: string
    relatedBlockId?: string
    initialDesc?: string
  }>(),
  {
    saving: false,
    subjects: undefined,
    fixedSubjectId: '',
    fixedSubjectName: '',
    defaultDuration: 60,
    defaultSubjectId: '',
    defaultDue: '',
    relatedBlockId: '',
    initialDesc: '',
  }
)

const title = computed(() => props.title ?? t({ 'zh-CN': '新建学习任务', en: 'New study task', ja: '学習タスクを作成' }))
const submitText = computed(() => props.submitText ?? t({ 'zh-CN': '添加到待办', en: 'Add to to-do list', ja: 'やることリストに追加' }))

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (
    e: 'submit',
    payload: {
      name: string
      subjectId: string
      subjectName: string
      duration: number
      due?: string
      dueAt?: string
      desc?: string
      relatedBlockId?: string
    }
  ): void
  (e: 'cancel'): void
}>()

const subjectStore = useSubjectStore()

// 专注时长相关配置：严格全整半小时
export interface DurationOption {
  minutes: number
  label: string
}

const durationOptions: DurationOption[] = [
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 90, label: '1.5h' },
  { minutes: 120, label: '2h' },
  { minutes: 150, label: '2.5h' },
  { minutes: 180, label: '3h' },
  { minutes: 240, label: '4h' },
]

const nameInputRef = ref<HTMLInputElement | null>(null)
const sliderTrackRef = ref<HTMLElement | null>(null)
const isDraggingDuration = ref(false)
const dragPositionX = ref<number | null>(null)

const form = reactive({
  name: '',
  subjectId: '',
  duration: 60,
  due: '',
  desc: '',
})

const resolvedSubjects = computed<TaskSubjectItem[]>(() => {
  return props.subjects || subjectStore.subjects
})

const isSubmitEnabled = computed(() => {
  const effectiveSubjectId = props.fixedSubjectId || form.subjectId
  return !props.saving && form.name.trim().length > 0 && effectiveSubjectId.length > 0
})

const currentDurationIndex = computed(() => {
  const idx = durationOptions.findIndex((opt) => opt.minutes === form.duration)
  return idx !== -1 ? idx : 1
})

const currentDurationOption = computed(() => {
  return durationOptions[currentDurationIndex.value] || durationOptions[1]
})

const thumbStyle = computed(() => {
  const n = durationOptions.length
  const stepPercent = 100 / n
  if (isDraggingDuration.value && dragPositionX.value !== null && sliderTrackRef.value) {
    const rect = sliderTrackRef.value.getBoundingClientRect()
    const thumbWidth = rect.width / n
    const clampedPx = Math.max(0, Math.min(rect.width - thumbWidth, dragPositionX.value - thumbWidth / 2))
    return {
      left: `${clampedPx}px`,
      width: `${thumbWidth}px`,
    }
  }
  return {
    left: `${currentDurationIndex.value * stepPercent}%`,
    width: `${stepPercent}%`,
  }
})

const normalizeDuration = (minutes: number) => {
  let closest = durationOptions[0].minutes
  let minDiff = Math.abs(minutes - closest)
  for (let i = 1; i < durationOptions.length; i++) {
    const diff = Math.abs(minutes - durationOptions[i].minutes)
    if (diff < minDiff) {
      minDiff = diff
      closest = durationOptions[i].minutes
    }
  }
  return closest
}

const resetForm = () => {
  form.name = ''
  form.duration = normalizeDuration(props.defaultDuration)
  form.due = props.defaultDue || ''
  form.desc = props.initialDesc || ''
  if (props.fixedSubjectId) {
    form.subjectId = props.fixedSubjectId
  } else if (props.defaultSubjectId) {
    form.subjectId = props.defaultSubjectId
  } else if (resolvedSubjects.value.length > 0) {
    form.subjectId = resolvedSubjects.value[0].id
  } else {
    form.subjectId = ''
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      resetForm()
      nextTick(() => {
        nameInputRef.value?.focus()
      })
    }
  },
  { immediate: true }
)

const getIndexFromEvent = (e: MouseEvent) => {
  if (!sliderTrackRef.value) return 1
  const rect = sliderTrackRef.value.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const n = durationOptions.length
  const idx = Math.min(n - 1, Math.max(0, Math.floor((offsetX / rect.width) * n)))
  return idx
}

const handleTrackMouseDown = (e: MouseEvent) => {
  isDraggingDuration.value = true
  if (sliderTrackRef.value) {
    const rect = sliderTrackRef.value.getBoundingClientRect()
    dragPositionX.value = e.clientX - rect.left
  }
  const idx = getIndexFromEvent(e)
  form.duration = durationOptions[idx].minutes
  window.addEventListener('mousemove', handleWindowMouseMove)
  window.addEventListener('mouseup', handleWindowMouseUp)
}

const handleWindowMouseMove = (e: MouseEvent) => {
  if (!isDraggingDuration.value || !sliderTrackRef.value) return
  const rect = sliderTrackRef.value.getBoundingClientRect()
  dragPositionX.value = e.clientX - rect.left
  const idx = getIndexFromEvent(e)
  form.duration = durationOptions[idx].minutes
}

const handleWindowMouseUp = () => {
  if (isDraggingDuration.value) {
    isDraggingDuration.value = false
    dragPositionX.value = null
    window.removeEventListener('mousemove', handleWindowMouseMove)
    window.removeEventListener('mouseup', handleWindowMouseUp)
  }
}

const selectDurationIndex = (idx: number) => {
  form.duration = durationOptions[idx].minutes
}

onUnmounted(() => {
  window.removeEventListener('mousemove', handleWindowMouseMove)
  window.removeEventListener('mouseup', handleWindowMouseUp)
})

const handleClose = () => {
  if (props.saving) return
  emit('update:modelValue', false)
  emit('cancel')
}

function dueAtFromInput(due?: string): string | undefined {
  return due ? (due.includes('T') ? due : localDateEndOfDay(due)?.toISOString()) : undefined
}

const handleSubmit = () => {
  if (!isSubmitEnabled.value) return
  const effectiveSubjectId = props.fixedSubjectId || form.subjectId
  const subjObj = resolvedSubjects.value.find((s) => s.id === effectiveSubjectId)
  const subjectName = props.fixedSubjectName || subjObj?.name || '综合学科'

  const due = form.due?.trim() || undefined
  const dueAt = dueAtFromInput(due)

  emit('submit', {
    name: form.name.trim(),
    subjectId: effectiveSubjectId,
    subjectName,
    duration: form.duration,
    due,
    dueAt,
    desc: form.desc.trim(),
    relatedBlockId: props.relatedBlockId || undefined,
  })
}
</script>

<style scoped>
.task-title {
  font-size: 16.5px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.02em;
}

html.dark .task-title {
  color: var(--text-primary, #e6dfd8);
}

.task-body {
  display: flex;
  flex-direction: column;
}

/* Subject capsule chips */
.subject-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 7px;
}

.subject-count-hint {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted, #7A7A75);
}

.subject-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  padding: 3px 3px 8px 3px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.subject-grid::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.subject-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6.5px 15px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.08));
  background: var(--modal-inset-bg, #FAF7F2);
  color: var(--text-primary, #1C1C1A);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.subject-chip:hover {
  border-color: var(--modal-accent, #8B9A6E);
  color: var(--modal-accent, #76855B);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.07);
  transform: translateY(-1.5px);
}

.subject-chip:active {
  transform: translateY(0) scale(0.975);
}

.subject-chip.active {
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.14));
  border-color: var(--modal-accent, #8B9A6E);
  color: var(--modal-accent, #76855B);
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.16), 0 3px 10px rgba(139, 154, 110, 0.18);
}

.chip-icon {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
}

.fixed-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6.5px 15px;
  border-radius: var(--radius-full, 9999px);
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.14));
  border: 1px solid rgba(139, 154, 110, 0.22);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--modal-accent, #8B9A6E);
  width: fit-content;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  padding: 6px 0;
}

/* Duration header and pill */
.duration-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.duration-value-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--modal-accent, #8B9A6E);
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.12));
  border: 1px solid rgba(139, 154, 110, 0.2);
  padding: 3px 12px;
  border-radius: var(--radius-full, 9999px);
  font-feature-settings: "tnum";
}

.duration-pill-icon {
  width: 13px;
  height: 13px;
  stroke: currentColor;
}

/* Modern Segmented Track Slider (Strict Half-hour) */
.duration-segmented-track {
  position: relative;
  height: 44px;
  padding: 3px;
  border-radius: var(--radius-full, 9999px);
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1.5px solid var(--modal-inset-border, rgba(0, 0, 0, 0.08));
  box-shadow: inset 0 1.5px 4px rgba(0, 0, 0, 0.04);
  user-select: none;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
  transition: border-color 0.2s ease;
}

.duration-segmented-track:hover {
  border-color: rgba(139, 154, 110, 0.35);
}

.active-thumb-pill {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: var(--radius-full, 9999px);
  background: linear-gradient(135deg, #8E9F70 0%, #738455 100%);
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.40), 0 1px 2px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  z-index: 2;
  box-sizing: border-box;
  transition: left 0.24s cubic-bezier(0.16, 1, 0.3, 1), transform 0.16s ease, box-shadow 0.16s ease;
}

.active-thumb-pill.dragging {
  cursor: grabbing;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  transform: scale(1.025);
  box-shadow: 0 6px 20px rgba(118, 135, 88, 0.52), 0 0 0 3px rgba(139, 154, 110, 0.18);
}

.active-thumb-text {
  font-size: 12.5px;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: -0.01em;
  pointer-events: none;
}

.track-segments-row {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  z-index: 1;
}

.track-segment-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border-radius: var(--radius-full, 9999px);
  transition: color 0.18s ease;
  cursor: pointer;
}

.track-segment-item.active {
  opacity: 0;
}

.segment-label {
  font-size: 12px;
  font-weight: 550;
  color: var(--text-muted, #7A7A75);
  transition: color 0.18s ease;
}

.track-segment-item:hover .segment-label {
  color: var(--text-primary, #1C1C1A);
}

/* Dark mode adjustments */
html.dark .subject-chip {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #e6dfd8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

html.dark .subject-chip.active {
  background: rgba(163, 177, 155, 0.18);
  border-color: var(--modal-accent, #A3B19B);
  color: #B4C4AA;
  box-shadow: 0 0 0 2px rgba(163, 177, 155, 0.22), 0 4px 12px rgba(0, 0, 0, 0.45);
}

html.dark .duration-value-pill {
  background: rgba(163, 177, 155, 0.14);
  color: #B4C4AA;
  border-color: rgba(163, 177, 155, 0.24);
}

html.dark .duration-segmented-track {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 1.5px 4px rgba(0, 0, 0, 0.25);
}

html.dark .duration-segmented-track:hover {
  border-color: rgba(163, 177, 155, 0.35);
}

html.dark .active-thumb-pill {
  background: linear-gradient(135deg, #9BAA80 0%, #829267 100%);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45), 0 1px 2px rgba(0, 0, 0, 0.2);
}

html.dark .active-thumb-pill.dragging {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6), 0 0 0 3px rgba(163, 177, 155, 0.22);
}

html.dark .segment-label {
  color: #9E9B95;
}

html.dark .track-segment-item:hover .segment-label {
  color: #E6DFD8;
}

/* Due Date Header and Picker */
.due-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.optional-tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted, #7A7A75);
  margin-left: 4px;
}

.due-clear-btn {
  background: transparent;
  border: none;
  font-size: 12px;
  font-weight: 500;
  color: var(--modal-accent, #8B9A6E);
  cursor: pointer;
  padding: 2px 7px;
  border-radius: var(--radius-sm, 6px);
  transition: all 0.18s ease;
}

.due-clear-btn:hover {
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.12));
  color: #768758;
}

.due-picker-wrap {
  width: 100%;
}

/* Zen Date Picker overriding Element Plus - Consistent with Asset view */
:deep(.zen-date-picker) {
  width: 100% !important;
  box-shadow: none !important;
  border: none !important;
  --el-input-border-color: transparent;
  --el-input-hover-border-color: transparent;
  --el-input-focus-border-color: transparent;
}

:deep(.zen-date-picker .el-input__wrapper) {
  width: 100% !important;
  box-sizing: border-box !important;
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.04) !important;
  border: 1px solid var(--border-default, #DDD5C7) !important;
  border-radius: var(--radius-full, 9999px) !important;
  transition: all var(--transition-fast, 0.2s) !important;
  padding-left: 14px;
  height: 40px;
}

:deep(.zen-date-picker:hover .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper:hover) {
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  border-color: rgba(139, 154, 110, 0.4) !important;
}

:deep(.zen-date-picker.is-active .el-input__wrapper),
:deep(.zen-date-picker.is-focus .el-input__wrapper),
:deep(.zen-date-picker .el-input__wrapper.is-focus) {
  background-color: var(--color-bg-tertiary, #FAF7F2) !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  border-color: #8B9A6E !important;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18) !important;
}

:deep(.zen-date-picker .el-input__inner) {
  font-size: 13px !important;
  color: var(--color-zen-graphite, #1C1C1A) !important;
  font-family: inherit !important;
}

:deep(.zen-date-picker .el-input__inner::placeholder) {
  color: var(--text-muted, #7A7A75) !important;
}

:deep(.zen-date-picker .el-input__prefix),
:deep(.zen-date-picker .el-input__suffix) {
  color: #8B9A6E !important;
}

/* Zen Date Popper overriding Element Plus */
:global(.zen-date-popper.el-popper) {
  border: 1px solid #8B9A6E !important;
  border-radius: 12px !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  box-shadow: 0 8px 24px rgba(139, 154, 110, 0.18) !important;
}

:global(.zen-date-popper .el-picker-panel) {
  border: none !important;
  border-radius: 12px !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  color: #1C1C1A !important;
}

:global(.zen-date-popper .el-date-picker__header) {
  color: #1C1C1A !important;
}

:global(.zen-date-popper .el-date-picker__header-label) {
  color: #1C1C1A !important;
  font-weight: 600 !important;
}

:global(.zen-date-popper .el-picker-panel__icon-btn) {
  color: #8B9A6E !important;
}

:global(.zen-date-popper .el-date-table th) {
  color: #7A7A75 !important;
  border-bottom: 1px solid rgba(139, 154, 110, 0.15) !important;
}

:global(.zen-date-popper .el-date-table td.available .el-date-table-cell) {
  color: #1C1C1A !important;
}

:global(.zen-date-popper .el-date-table td.current:not(.disabled) .el-date-table-cell__text) {
  background-color: #8B9A6E !important;
  color: #FFFFFF !important;
  border-radius: 50% !important;
}

:global(.zen-date-popper .el-date-table td.today .el-date-table-cell__text) {
  color: #8B9A6E !important;
  font-weight: bold !important;
}

:global(.zen-date-popper .el-date-table td:hover .el-date-table-cell__text) {
  background-color: rgba(139, 154, 110, 0.15) !important;
}

:global(.zen-date-popper .el-popper__arrow::before) {
  border-color: #8B9A6E !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
}
</style>
