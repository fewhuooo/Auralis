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
        <div class="drag-icon-circle" :class="{ 'is-success': !!selectedFile }">
          <IconFileCheck v-if="selectedFile" :size="24" :stroke-width="2" />
          <IconCloudUpload v-else :size="24" :stroke-width="1.8" />
        </div>
        <div class="drag-text">
          {{ selectedFile ? selectedFile.name : '拖拽文件到此处自动识别，或点击选择' }}
        </div>
        <div class="drag-hint">
          {{ selectedFile ? '点击可更换其他参考文件' : hintText }}
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
          <div class="upload-stage-group">
            <span class="pulse-indicator"></span>
            <span aria-live="polite" class="upload-stage-text">{{ uploadStage || '正在上传文件...' }}</span>
          </div>
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

      <!-- Subject Capsule Selection -->
      <div class="modal-form-group">
        <label class="modal-form-label">
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
        {{ isUploading ? `${uploadStage || '上传中'} ${uploadProgress}%` : submitText }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { IconCloudUpload, IconFileCheck } from '@tabler/icons-vue'
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
  (visible, prevVisible) => {
    if (visible && !prevVisible) {
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
.file-register-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* Drag drop area */
.drag-drop-zone {
  border: 2px dashed rgba(139, 154, 110, 0.35);
  border-radius: 16px;
  padding: 26px 20px;
  text-align: center;
  background: var(--color-bg-primary, #F7F2EB);
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.drag-drop-zone:hover,
.drag-drop-zone.is-active {
  border-color: var(--color-zen-sage, #8B9A6E);
  background: var(--color-sage-bg, rgba(139, 154, 110, 0.1));
  transform: translateY(-1px);
}

.drag-drop-zone.has-file {
  border-color: var(--color-zen-sage, #8B9A6E);
  background: var(--color-sage-bg, rgba(139, 154, 110, 0.08));
}

.drag-icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-sage-bg, rgba(139, 154, 110, 0.12));
  color: var(--color-zen-sage, #76855B);
  margin-bottom: 12px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.drag-icon-circle.is-success {
  background: rgba(139, 154, 110, 0.22);
  color: var(--color-zen-sage, #8B9A6E);
}

.drag-drop-zone:hover .drag-icon-circle {
  transform: scale(1.08);
}

.drag-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1C1C1A);
  word-break: break-all;
  line-height: 1.4;
}

.drag-hint {
  font-size: 12.5px;
  color: var(--text-muted, #7A7A75);
  margin-top: 6px;
}

/* Progress area */
.upload-progress-wrapper {
  padding: 16px 18px;
  background: var(--color-bg-primary, #F7F2EB);
  border: 1px solid var(--border-subtle, #E6E6E4);
  border-radius: 16px;
}

.upload-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--text-secondary, #2C2C28);
  margin-bottom: 10px;
}

.upload-stage-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-zen-sage, #8B9A6E);
  animation: pulse-dot 1.5s infinite;
}

@keyframes pulse-dot {
  0% {
    box-shadow: 0 0 0 0 rgba(139, 154, 110, 0.6);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(139, 154, 110, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(139, 154, 110, 0);
  }
}

.upload-stage-text {
  font-weight: 600;
  color: var(--text-primary, #1C1C1A);
}

.upload-percent-text {
  font-weight: 700;
  color: var(--color-zen-sage, #76855B);
  font-feature-settings: "tnum";
}

.progress-bar-track {
  height: 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--accent-gradient, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%));
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 9999px;
}

/* Subject capsule grid */
.subject-capsule-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
  padding: 4px 0;
}

.subject-capsule-item {
  display: inline-flex;
  align-items: center;
  padding: 6px 16px;
  border-radius: 9999px;
  border: 1px solid var(--border-default, #DDD5C7);
  background: var(--color-bg-primary, #F7F2EB);
  color: var(--text-primary, #1C1C1A);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.subject-capsule-item:hover {
  border-color: var(--color-zen-sage, #8B9A6E);
  color: var(--color-zen-sage, #76855B);
  transform: translateY(-1px);
}

.subject-capsule-item.is-active {
  border-color: var(--color-zen-sage, #8B9A6E);
  background: var(--color-sage-bg, rgba(139, 154, 110, 0.14));
  font-weight: 600;
  color: var(--color-zen-sage, #76855B);
  box-shadow: 0 2px 6px rgba(139, 154, 110, 0.15);
}

.subject-empty-hint {
  font-size: 12.5px;
  color: var(--text-muted, #7A7A75);
  padding: 6px 0;
}

html.dark .drag-drop-zone {
  background: var(--color-bg-tertiary, #33312e);
  border-color: rgba(163, 177, 155, 0.3);
}

html.dark .drag-drop-zone:hover {
  background: var(--color-bg-secondary, #292825);
  border-color: var(--color-zen-sage, #8B9A6E);
}

html.dark .upload-progress-wrapper {
  background: var(--color-bg-tertiary, #33312e);
  border-color: var(--border-subtle, rgba(230, 223, 216, 0.06));
}

html.dark .subject-capsule-item {
  background: var(--color-bg-tertiary, #33312e);
  border-color: var(--border-default, rgba(230, 223, 216, 0.12));
  color: var(--text-primary, #e6dfd8);
}

html.dark .subject-capsule-item.is-active {
  background: rgba(163, 177, 155, 0.2);
  border-color: var(--color-zen-sage, #8B9A6E);
  color: #B4C4AA;
}
</style>
