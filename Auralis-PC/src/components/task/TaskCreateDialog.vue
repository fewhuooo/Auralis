<template>
  <ModalShell
    :model-value="modelValue"
    size="md"
    custom-class="task-create-modal"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <template #title>
      <div class="task-dialog-title">
        <IconCalendarPlus :size="18" :stroke-width="2" class="task-title-icon" />
        <span>{{ title }}</span>
      </div>
    </template>

    <div class="task-modal-body">
      <!-- 任务名称 -->
      <div class="modal-form-group">
        <label class="modal-form-label">任务名称 <span class="required">*</span></label>
        <input
          ref="nameInputRef"
          v-model="form.name"
          class="modal-form-input"
          placeholder="请输入学习或专注任务名称..."
          autofocus
          @keyup.enter="handleSubmit"
        />
      </div>

      <!-- 所属学科（有固定学科时可隐藏或仅展示标签） -->
      <div v-if="!fixedSubjectId" class="modal-form-group">
        <label class="modal-form-label">所属学科 <span class="required">*</span></label>
        <div class="subject-capsule-grid">
          <div
            v-for="subj in resolvedSubjects"
            :key="subj.id"
            class="subject-capsule-item"
            :class="{ active: form.subjectId === subj.id }"
            :style="form.subjectId === subj.id ? { borderColor: themeColor, background: themeColor + '22' } : {}"
            @click="form.subjectId = subj.id"
          >
            <span class="subj-capsule-icon">
              <component
                v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)"
                :is="getSubjectIconComponent(subj.icon)"
                style="width: 1em; height: 1em;"
              />
              <span v-else>{{ getLegacySubjectIcon(subj.icon) || '📘' }}</span>
            </span>
            <span class="subj-capsule-name">{{ subj.name }}</span>
          </div>
          <div v-if="resolvedSubjects.length === 0" class="subject-empty-hint">
            暂无学科，请先创建学科空间
          </div>
        </div>
      </div>
      <div v-else-if="fixedSubjectName" class="modal-form-group">
        <label class="modal-form-label">所属学科</label>
        <div class="fixed-subject-badge">
          <span>📘 {{ fixedSubjectName }}</span>
        </div>
      </div>

      <!-- 专注时长 -->
      <div class="modal-form-group">
        <div class="duration-header">
          <label class="modal-form-label">专注时长</label>
          <span class="duration-badge">{{ form.duration }} 分钟 ({{ (form.duration / 60).toFixed(1) }}h)</span>
        </div>
        <div
          ref="durationBarRef"
          class="duration-long-bar-btn"
          @mousedown="startDurationDrag"
          @mousemove="onDurationDrag"
          @mouseup="endDurationDrag"
          @mouseleave="endDurationDrag"
          @click="onDurationBarClick"
        >
          <!-- 进度填充 -->
          <div
            class="duration-bar-fill"
            :style="{ width: Math.min(100, Math.max(0, ((form.duration - 30) / (240 - 30)) * 100)) + '%' }"
          ></div>
          <!-- 长条刻度与选项文字 -->
          <div class="duration-bar-steps">
            <span
              v-for="step in durationSteps"
              :key="step"
              class="duration-step-item"
              :class="{ active: form.duration >= step }"
              @click.stop="form.duration = step"
            >
              {{ step < 60 ? step + 'm' : (step / 60) + 'h' }}
            </span>
          </div>
          <!-- 拖动滑块手柄 -->
          <div
            class="duration-bar-thumb"
            :style="{ left: Math.min(100, Math.max(0, ((form.duration - 30) / (240 - 30)) * 100)) + '%' }"
          >
            <span>{{ form.duration }}m</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="modal-btn modal-btn-secondary" @click="handleClose">取消</button>
      <button
        type="button"
        class="modal-btn modal-btn-primary"
        :disabled="!isSubmitEnabled"
        @click="handleSubmit"
      >
        {{ submitText }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { IconCalendarPlus } from '@tabler/icons-vue'
import ModalShell from '@/components/modal/ModalShell.vue'
import { useSubjectStore } from '@/store/useSubjectStore'
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
    subjects?: TaskSubjectItem[]
    fixedSubjectId?: string
    fixedSubjectName?: string
    defaultDuration?: number
    defaultSubjectId?: string
    relatedBlockId?: string
    initialDesc?: string
  }>(),
  {
    title: '新建学习任务',
    submitText: '添加到待办',
    subjects: undefined,
    fixedSubjectId: '',
    fixedSubjectName: '',
    defaultDuration: 60,
    defaultSubjectId: '',
    relatedBlockId: '',
    initialDesc: '',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (
    e: 'submit',
    payload: {
      name: string
      subjectId: string
      subjectName: string
      duration: number
      desc?: string
      relatedBlockId?: string
    }
  ): void
  (e: 'cancel'): void
}>()

const subjectStore = useSubjectStore()
const themeColor = '#7D9372'
const durationSteps = [30, 60, 90, 120, 180, 240]

const nameInputRef = ref<HTMLInputElement | null>(null)
const durationBarRef = ref<HTMLElement | null>(null)
let isDraggingDuration = false

const form = reactive({
  name: '',
  subjectId: '',
  duration: 60,
  desc: '',
})

const resolvedSubjects = computed<TaskSubjectItem[]>(() => {
  return props.subjects || subjectStore.subjects
})

const isSubmitEnabled = computed(() => {
  const effectiveSubjectId = props.fixedSubjectId || form.subjectId
  return form.name.trim().length > 0 && effectiveSubjectId.length > 0
})

const resetForm = () => {
  form.name = ''
  form.duration = props.defaultDuration
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

const calculateDurationFromEvent = (e: MouseEvent) => {
  if (!durationBarRef.value) return 60
  const rect = durationBarRef.value.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const percent = offsetX / rect.width
  const minVal = 30
  const maxVal = 240
  const rawVal = minVal + percent * (maxVal - minVal)
  let closest = durationSteps[0]
  let minDiff = Math.abs(rawVal - closest)
  for (let i = 1; i < durationSteps.length; i++) {
    const diff = Math.abs(rawVal - durationSteps[i])
    if (diff < minDiff) {
      minDiff = diff
      closest = durationSteps[i]
    }
  }
  return closest
}

const startDurationDrag = (e: MouseEvent) => {
  isDraggingDuration = true
  form.duration = calculateDurationFromEvent(e)
}

const onDurationDrag = (e: MouseEvent) => {
  if (!isDraggingDuration) return
  form.duration = calculateDurationFromEvent(e)
}

const endDurationDrag = () => {
  isDraggingDuration = false
}

const onDurationBarClick = (e: MouseEvent) => {
  form.duration = calculateDurationFromEvent(e)
}

const handleClose = () => {
  emit('update:modelValue', false)
  emit('cancel')
}

const handleSubmit = () => {
  if (!isSubmitEnabled.value) return
  const effectiveSubjectId = props.fixedSubjectId || form.subjectId
  const subjObj = resolvedSubjects.value.find((s) => s.id === effectiveSubjectId)
  const subjectName = props.fixedSubjectName || subjObj?.name || '综合学科'

  emit('submit', {
    name: form.name.trim(),
    subjectId: effectiveSubjectId,
    subjectName,
    duration: form.duration,
    desc: form.desc.trim(),
    relatedBlockId: props.relatedBlockId || undefined,
  })
}
</script>

<style scoped>
.task-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.task-title-icon {
  color: var(--color-zen-sage, #8B9A6E);
}

.task-modal-body {
  display: flex;
  flex-direction: column;
}

/* Subject capsule grid */
.subject-capsule-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
  padding: 2px;
}

.subject-capsule-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-radius: 9999px;
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.08));
  background: var(--color-bg-primary, #FFFFFF);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.subject-capsule-item:hover {
  border-color: var(--color-zen-sage, #8B9A6E);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.subject-capsule-item.active {
  font-weight: 650;
  color: var(--text-primary);
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.2);
}

.subj-capsule-icon {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
}

.fixed-subject-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 9999px;
  border: 1px solid rgba(139, 154, 110, 0.25);
  background: rgba(139, 154, 110, 0.1);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-zen-sage, #76855B);
  width: fit-content;
}

.subject-empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 0;
}

/* Duration bar */
.duration-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.duration-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-zen-sage, #76855B);
  background: rgba(139, 154, 110, 0.14);
  padding: 3px 10px;
  border-radius: 9999px;
  border: 1px solid rgba(139, 154, 110, 0.2);
  font-feature-settings: "tnum";
}

.duration-long-bar-btn {
  position: relative;
  height: 42px;
  border-radius: 21px;
  background: var(--color-bg-primary, #FFFFFF);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  overflow: visible;
  user-select: none;
  display: flex;
  align-items: center;
}

.duration-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: linear-gradient(90deg, rgba(158, 173, 128, 0.35) 0%, rgba(139, 154, 110, 0.5) 100%);
  border-radius: 21px;
  pointer-events: none;
  transition: width 0.12s linear;
}

.duration-bar-steps {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 1;
}

.duration-step-item {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  transition: color 0.15s ease;
}

.duration-step-item.active {
  color: var(--text-primary);
  font-weight: 700;
}

.duration-bar-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 26px;
  border-radius: 13px;
  background: linear-gradient(135deg, #9CAD7D 0%, #839366 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10.5px;
  font-weight: 750;
  box-shadow: 0 2px 8px rgba(131, 147, 102, 0.45);
  pointer-events: none;
  z-index: 2;
}

html.dark .subject-capsule-item {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
}

html.dark .duration-long-bar-btn {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

html.dark .duration-badge {
  background: rgba(163, 177, 155, 0.18);
  color: #B4C4AA;
  border-color: rgba(163, 177, 155, 0.3);
}
</style>
