<template>
  <ModalShell
    :model-value="modelValue"
    :title="title"
    size="md"
    custom-class="file-register-modal"
    :prevent-close="isUploading"
    :before-close="() => !isUploading"
    :close-on-click-overlay="!isUploading"
    :close-on-press-escape="!isUploading"
    :show-close-button="!isUploading"
    @update:model-value="handleModelValueUpdate"
    @close="handleClose"
  >
    <div
      class="file-body"
      @dragover.prevent="isDragover = true"
      @dragleave.prevent="isDragover = false"
      @drop.prevent="handleFileDrop"
    >
      <!-- Drag & Drop Zone -->
      <div
        class="drop-zone"
        :class="{ 'is-active': isDragover, 'has-file': !!selectedFile }"
        @click="triggerFileInput"
      >
        <div class="drop-icon" :class="{ 'is-success': !!selectedFile }">
          <IconFileCheck v-if="selectedFile" :size="22" :stroke-width="1.8" />
          <IconCloudUpload v-else :size="22" :stroke-width="1.6" />
        </div>
        <div class="drop-text">
          {{ selectedFile ? selectedFile.name : '拖拽文件到此处，或点击选择' }}
        </div>
        <div class="drop-hint">
          {{ selectedFile ? '点击可更换其他文件' : hintText }}
        </div>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        style="display: none"
        :accept="acceptedExtensions.join(',')"
        @change="handleFileChange"
      />

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-progress">
        <div class="progress-header">
          <span class="stage-text">{{ isCompleted ? '导入完成' : (uploadStage || '正在导入本地文件...') }}</span>
          <span class="progress-pct">{{ displayPercent }}%</span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{ width: `${displayProgress}%` }"
          ></div>
        </div>
      </div>

      <!-- File Name -->
      <div class="modal-form-group">
        <label class="modal-form-label">
          文件名称 <span class="required">*</span>
        </label>
        <input
          v-model="fileName"
          type="text"
          class="modal-form-input"
          placeholder="例如: 计算机网络.pdf"
          :disabled="isUploading"
        />
      </div>

      <!-- Subject Selection -->
      <div class="modal-form-group">
        <label class="modal-form-label">
          归档至 <span class="required">*</span>
        </label>
        <div class="subject-grid">
          <div
            v-for="subj in resolvedSubjects"
            :key="subj.id"
            class="subject-chip"
            :class="{ 'is-active': selectedSubjectId === subj.id }"
            @click="!isUploading && (selectedSubjectId = subj.id)"
          >
            {{ subj.name }}
          </div>
          <div v-if="resolvedSubjects.length === 0" class="empty-hint">
            暂无学科，请先创建学科空间
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="modal-btn modal-btn-secondary"
        :disabled="isUploading"
        @click="handleClose"
      >
        取消
      </button>
      <button
        type="button"
        class="modal-btn modal-btn-primary"
        :disabled="!isSubmitEnabled || isUploading"
        @click="handleSubmit"
      >
        <IconRotate v-if="isUploading" :size="13" :stroke-width="2.2" class="is-spinning modal-btn-spinner" />
        {{ isUploading ? (isCompleted ? '导入完成' : '导入中...') : submitText }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { IconCloudUpload, IconFileCheck, IconRotate } from '@tabler/icons-vue'
import ModalShell from '@/components/modal/ModalShell.vue'
import { useSubjectStore } from '@/store/useSubjectStore'
import { SUPPORTED_UPLOAD_EXTENSIONS } from '@/utils/filePreview'

export interface FileRegisterSubjectItem {
  id: string
  name: string
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    submitText?: string
    hintText?: string
    acceptedExtensions?: readonly string[] | string[]
    subjects?: FileRegisterSubjectItem[]
    defaultSubjectId?: string
    initialFile?: File | null
    isUploading?: boolean
    uploadProgress?: number
    uploadStage?: string
  }>(),
  {
    title: '上传参考文件',
    submitText: '确认登记',
    hintText: '支持 PDF、DOC、DOCX、PPT、PPTX 文件',
    acceptedExtensions: () => SUPPORTED_UPLOAD_EXTENSIONS,
    subjects: undefined,
    defaultSubjectId: '',
    isUploading: false,
    uploadProgress: 0,
    uploadStage: '',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', payload: { file: File; name: string; subjectId: string }): void
  (e: 'cancel'): void
}>()

const subjectStore = useSubjectStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragover = ref(false)
const selectedFile = ref<File | null>(null)
const fileName = ref('')
const selectedSubjectId = ref('')

const resolvedSubjects = computed<FileRegisterSubjectItem[]>(() => {
  return props.subjects || subjectStore.subjects
})

const isSubmitEnabled = computed(() => {
  return !!selectedFile.value && fileName.value.trim().length > 0 && selectedSubjectId.value.length > 0
})

// 真实平滑进度步进引擎，真实反映各阶段进度
const displayProgress = ref(0)
const displayPercent = computed(() => Math.min(100, Math.round(displayProgress.value)))
const isCompleted = computed(() => {
  return (props.uploadProgress ?? 0) >= 100 && displayPercent.value >= 100
})

let animFrameId: number | null = null

const startProgressAnimation = () => {
  stopProgressAnimation()
  displayProgress.value = Math.max(0, Math.min(100, props.uploadProgress ?? 0))

  let lastTime = performance.now()

  const tick = (now: number) => {
    const dt = Math.min(50, Math.max(10, now - lastTime))
    lastTime = now

    const rawTarget = Math.max(0, Math.min(100, props.uploadProgress ?? 0))
    const current = displayProgress.value

    if (rawTarget >= 100) {
      if (current < 100) {
        // 当底层确认已完成时，平滑匀速自然滑入 100%
        const step = Math.max(2, dt * 0.25)
        displayProgress.value = Math.min(100, current + step)
        animFrameId = requestAnimationFrame(tick)
      } else {
        stopProgressAnimation()
      }
    } else {
      // 真实跟随阶段进度目标值，平滑逼近，不虚构进度
      if (current < rawTarget) {
        const step = Math.max(0.2, (rawTarget - current) * 0.15)
        displayProgress.value = Math.min(rawTarget, current + step)
      } else if (current > rawTarget) {
        displayProgress.value = rawTarget
      }
      animFrameId = requestAnimationFrame(tick)
    }
  }

  animFrameId = requestAnimationFrame(tick)
}

const stopProgressAnimation = () => {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
}

watch(
  () => props.isUploading,
  (val) => {
    if (val) {
      startProgressAnimation()
    } else {
      stopProgressAnimation()
      displayProgress.value = 0
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  stopProgressAnimation()
})

const resetForm = () => {
  selectedFile.value = null
  fileName.value = ''
  isDragover.value = false
  displayProgress.value = 0
  if (props.defaultSubjectId) {
    selectedSubjectId.value = props.defaultSubjectId
  } else if (resolvedSubjects.value.length > 0) {
    selectedSubjectId.value = resolvedSubjects.value[0].id
  } else {
    selectedSubjectId.value = ''
  }
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const triggerFileInput = () => {
  if (props.isUploading) return
  fileInputRef.value?.click()
}

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (file) {
    applyFile(file)
  }
}

const handleFileDrop = (e: DragEvent) => {
  isDragover.value = false
  if (props.isUploading) return
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    applyFile(file)
  }
}

const applyFile = (file: File) => {
  if (!fileName.value.trim() || fileName.value === selectedFile.value?.name) {
    fileName.value = file.name
  }
  selectedFile.value = file
  if (!selectedSubjectId.value && resolvedSubjects.value.length > 0) {
    selectedSubjectId.value = resolvedSubjects.value[0].id
  }
}

watch(
  () => props.modelValue,
  (visible, prevVisible) => {
    if (visible && !prevVisible) {
      resetForm()
      if (props.initialFile) applyFile(props.initialFile)
    } else if (!visible) {
      stopProgressAnimation()
      displayProgress.value = 0
    }
  },
  { immediate: true }
)

const handleModelValueUpdate = (val: boolean) => {
  if (!val && props.isUploading) return
  emit('update:modelValue', val)
  if (!val) {
    emit('cancel')
  }
}

const handleClose = () => {
  if (props.isUploading) return
  emit('update:modelValue', false)
  emit('cancel')
}

const handleSubmit = () => {
  if (!isSubmitEnabled.value || !selectedFile.value) return
  emit('submit', {
    file: selectedFile.value,
    name: fileName.value.trim(),
    subjectId: selectedSubjectId.value,
  })
}
</script>

<style scoped>
.file-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Drop zone */
.drop-zone {
  border: 2px dashed var(--modal-inset-border, rgba(0, 0, 0, 0.12));
  border-radius: var(--radius-lg, 16px);
  padding: 28px 20px;
  text-align: center;
  background: var(--modal-inset-bg, #FAF7F2);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover,
.drop-zone.is-active {
  border-color: var(--modal-accent, #8B9A6E);
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.08));
}

.drop-zone.has-file {
  border-color: var(--modal-accent, #8B9A6E);
  border-style: solid;
}

.drop-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md, 10px);
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted, #7A7A75);
  margin-bottom: 12px;
  transition: all 0.2s ease;
}

.drop-icon.is-success {
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.14));
  color: var(--modal-accent, #8B9A6E);
}

.drop-zone:hover .drop-icon {
  color: var(--modal-accent, #8B9A6E);
}

.drop-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1C1C1A);
  word-break: break-all;
  line-height: 1.4;
}

.drop-hint {
  font-size: 12.5px;
  color: var(--text-muted, #7A7A75);
  margin-top: 4px;
}

/* Progress */
.upload-progress {
  padding: 12px 14px;
  background: var(--modal-inset-bg, #FAF7F2);
  border: 1px solid var(--modal-inset-border, rgba(0, 0, 0, 0.06));
  border-radius: var(--radius-md, 10px);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
  color: var(--text-secondary, #2C2C28);
  margin-bottom: 8px;
}

.stage-text {
  font-weight: 500;
  color: var(--text-primary, #1C1C1A);
  font-size: 12.5px;
}

.progress-pct {
  font-weight: 600;
  font-size: 12.5px;
  color: var(--modal-accent, #76855B);
  font-feature-settings: "tnum";
}

.progress-track {
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--modal-accent, #8B9A6E);
  transition: width 0.08s linear;
  border-radius: 9999px;
}

.modal-btn-spinner {
  margin-right: 6px;
  vertical-align: -1px;
}

/* Subject capsule chips */
.subject-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
  padding: 2px 0;
}

.subject-chip {
  display: inline-flex;
  align-items: center;
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

.subject-chip:hover {
  border-color: var(--modal-accent, #8B9A6E);
  color: var(--modal-accent, #76855B);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.subject-chip.is-active {
  background: var(--modal-accent-subtle, rgba(139, 154, 110, 0.14));
  border-color: var(--modal-accent, #8B9A6E);
  font-weight: 600;
  color: var(--modal-accent, #76855B);
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  padding: 4px 0;
}

html.dark .drop-zone {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.12));
}

html.dark .drop-zone:hover {
  border-color: var(--modal-accent, #A3B19B);
  background: rgba(163, 177, 155, 0.08);
}

html.dark .drop-icon {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted, #8a867e);
}

html.dark .upload-progress {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
}

html.dark .subject-chip {
  background: var(--modal-inset-bg, #2e2c29);
  border-color: var(--modal-inset-border, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #e6dfd8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

html.dark .subject-chip.is-active {
  background: rgba(163, 177, 155, 0.18);
  border-color: var(--modal-accent, #A3B19B);
  color: #B4C4AA;
}
</style>
