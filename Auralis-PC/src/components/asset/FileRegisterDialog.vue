<template>
  <ModalShell
    :model-value="modelValue"
    :title="title"
    size="md"
    custom-class="file-register-modal"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <div
      class="file-register-body"
      @dragover.prevent="isDragover = true"
      @dragleave.prevent="isDragover = false"
      @drop.prevent="handleFileDrop"
    >
      <!-- Drag & Drop Zone -->
      <div
        class="drag-drop-zone"
        :class="{ 'is-active': isDragover, 'has-file': !!selectedFile }"
        @click="triggerFileInput"
      >
        <IconCloudUpload :size="28" :stroke-width="1.8" class="drag-icon" />
        <div class="drag-text">
          {{ selectedFile ? selectedFile.name : '拖拽文件到此处自动识别，或点击选择' }}
        </div>
        <div class="drag-hint">
          {{ hintText }}
        </div>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        style="display: none"
        :accept="acceptedExtensions.join(',')"
        @change="handleFileChange"
      />

      <!-- In-dialog Upload Progress -->
      <div v-if="isUploading" class="upload-progress-wrapper">
        <div class="upload-progress-header">
          <span aria-live="polite" class="upload-stage-text">{{ uploadStage || '正在上传文件...' }}</span>
          <span class="upload-percent-text">{{ uploadProgress }}%</span>
        </div>
        <div class="progress-bar-track">
          <div
            class="progress-bar-fill"
            :style="{ width: `${uploadProgress}%` }"
          ></div>
        </div>
      </div>

      <!-- File Name Input -->
      <div class="form-group">
        <label class="form-label">
          文件名称 <span class="required">*</span>
        </label>
        <input
          v-model="fileName"
          type="text"
          class="styled-input"
          placeholder="例如: 计算机网络.pdf"
          :disabled="isUploading"
        />
      </div>

      <!-- Subject Capsule Selection -->
      <div class="form-group">
        <label class="form-label">
          归档至 <span class="required">*</span>
        </label>
        <div class="subject-capsule-grid">
          <div
            v-for="subj in resolvedSubjects"
            :key="subj.id"
            class="subject-capsule-item"
            :class="{ 'is-active': selectedSubjectId === subj.id }"
            @click="!isUploading && (selectedSubjectId = subj.id)"
          >
            <span class="subj-capsule-name">{{ subj.name }}</span>
          </div>
          <div v-if="resolvedSubjects.length === 0" class="subject-empty-hint">
            暂无学科，请先创建学科空间
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn-secondary"
        :disabled="isUploading"
        @click="handleClose"
      >
        取消
      </button>
      <button
        type="button"
        class="btn-primary"
        :disabled="!isSubmitEnabled || isUploading"
        @click="handleSubmit"
      >
        {{ isUploading ? `${uploadStage || '上传中'} ${uploadProgress}%` : submitText }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { IconCloudUpload } from '@tabler/icons-vue'
import ModalShell from '@/components/modal/ModalShell.vue'
import { useSubjectStore } from '@/store/useSubjectStore'

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
    isUploading?: boolean
    uploadProgress?: number
    uploadStage?: string
  }>(),
  {
    title: '上传参考文件',
    submitText: '确认登记',
    hintText: '支持 PDF、DOC、DOCX、PPT、PPTX；图片和文本仅可预览',
    acceptedExtensions: () => ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.md', '.png', '.jpg', '.jpeg'],
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

const resetForm = () => {
  selectedFile.value = null
  fileName.value = ''
  isDragover.value = false
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

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      resetForm()
    }
  },
  { immediate: true }
)

const triggerFileInput = () => {
  if (props.isUploading) return
  fileInputRef.value?.click()
}

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
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
  selectedFile.value = file
  if (!fileName.value.trim() || fileName.value === file.name) {
    fileName.value = file.name
  }
  if (!selectedSubjectId.value && resolvedSubjects.value.length > 0) {
    selectedSubjectId.value = resolvedSubjects.value[0].id
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
.file-register-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Drag drop area */
.drag-drop-zone {
  border: 1.5px dashed var(--border-default);
  border-radius: var(--radius-md, 12px);
  padding: 24px 16px;
  text-align: center;
  background: var(--color-bg-primary, #F7F2EB);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.drag-drop-zone:hover,
.drag-drop-zone.is-active {
  border-color: var(--color-zen-sage, #8B9A6E);
  background: rgba(139, 154, 110, 0.08);
}

.drag-drop-zone.has-file {
  border-color: var(--color-zen-sage, #8B9A6E);
}

.drag-icon {
  margin-bottom: 8px;
  color: var(--text-muted);
}

.drag-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}

.drag-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Progress area */
.upload-progress-wrapper {
  padding: 12px;
  background: var(--bg-modifier-hover, rgba(0, 0, 0, 0.03));
  border-radius: var(--radius-md, 8px);
}

.upload-progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.upload-stage-text {
  font-weight: 500;
}

.upload-percent-text {
  font-weight: 600;
  color: var(--color-zen-sage, #8B9A6E);
}

.progress-bar-track {
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-zen-sage, #8B9A6E);
  transition: width 0.3s ease;
  border-radius: 2px;
}

/* Form inputs */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.required {
  color: #ef4444;
  margin-left: 2px;
}

.styled-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-default);
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: all 0.15s ease;
}

.styled-input:focus {
  border-color: var(--color-zen-sage, #8B9A6E);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.15);
}

/* Subject capsule grid */
.subject-capsule-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 120px;
  overflow-y: auto;
  padding: 2px;
}

.subject-capsule-item {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.subject-capsule-item:hover {
  border-color: var(--color-zen-sage, #8B9A6E);
  color: var(--text-primary);
}

.subject-capsule-item.is-active {
  border-color: var(--color-zen-sage, #8B9A6E);
  background: rgba(139, 154, 110, 0.15);
  font-weight: 600;
  color: var(--text-primary);
}

.subject-empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 0;
}

/* Footer buttons */
.btn-secondary {
  padding: 8px 16px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-default);
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-modifier-hover, rgba(0, 0, 0, 0.04));
  border-color: var(--border-strong);
}

.btn-primary {
  padding: 8px 18px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-zen-sage, #8B9A6E);
  background: var(--color-zen-sage, #8B9A6E);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-sage-dark, #76855B);
  border-color: var(--color-sage-dark, #76855B);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

html.dark .drag-drop-zone {
  background: var(--color-bg-card, #232A24);
  border-color: rgba(163, 177, 155, 0.25);
}

html.dark .styled-input {
  background: var(--color-bg-card, #232A24);
  border-color: rgba(163, 177, 155, 0.25);
}

html.dark .subject-capsule-item {
  background: var(--color-bg-card, #232A24);
  border-color: rgba(163, 177, 155, 0.25);
}

html.dark .btn-secondary {
  background: var(--color-bg-card, #232A24);
  border-color: rgba(163, 177, 155, 0.25);
}
</style>
