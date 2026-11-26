<template>
  <div v-if="visible" class="zen-modal-mask upload-modal-mask" @click="handleClose">
    <div
      class="upload-modal-card"
      role="dialog"
      aria-modal="true"
      aria-label="上传参考文件"
      @click.stop
    >
      <div class="modal-header">
        <span class="modal-title">上传参考文件</span>
        <div
          v-if="!uploading"
          class="modal-close-btn"
          role="button"
          aria-label="关闭"
          @click="handleClose"
        >
          <LineIcon name="close" size="15px" color="var(--text-muted)" />
        </div>
      </div>

      <div class="modal-body">
        <!-- #ifdef H5 -->
        <div
          class="drop-zone"
          :class="{ 'is-active': isDragover, 'has-file': Boolean(selectedFile) }"
          role="button"
          tabindex="0"
          aria-label="选择或拖拽上传文件"
          @click="triggerH5FileInput"
          @keydown.enter.prevent="triggerH5FileInput"
          @dragover.prevent="!uploading && (isDragover = true)"
          @dragleave.prevent="isDragover = false"
          @drop.prevent="handleH5Drop"
        >
          <div class="drop-icon" :class="{ 'is-success': Boolean(selectedFile) }">
            <LineIcon
              :name="selectedFile ? 'check' : 'upload'"
              size="22px"
              :color="selectedFile ? '#76855B' : 'var(--text-muted)'"
            />
          </div>
          <div class="drop-text">
            {{ selectedFile ? selectedFile.name : '拖拽文件到此处，或点击选择' }}
          </div>
          <div class="drop-hint">
            {{ selectedFileHint }}
          </div>
        </div>
        <!-- #endif -->

        <!-- #ifndef H5 -->
        <div
          class="drop-zone"
          :class="{ 'has-file': Boolean(selectedFile) }"
          role="button"
          aria-label="选择上传文件"
          @click="triggerNativePicker"
        >
          <div class="drop-icon" :class="{ 'is-success': Boolean(selectedFile) }">
            <LineIcon
              :name="selectedFile ? 'check' : 'upload'"
              size="22px"
              :color="selectedFile ? '#76855B' : 'var(--text-muted)'"
            />
          </div>
          <span class="drop-text">{{ selectedFile ? selectedFile.name : '点击选择本地文件' }}</span>
          <span class="drop-hint">{{ selectedFileHint }}</span>
        </div>
        <!-- #endif -->

        <div v-if="uploading" class="upload-progress">
          <div class="progress-header">
            <span class="stage-text">{{ uploadStage || '正在上传本地文件...' }}</span>
            <span class="progress-pct num-tabular">{{ clampedProgress }}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${clampedProgress}%` }"></div>
          </div>
        </div>

        <div class="modal-form-group">
          <div class="modal-form-label">
            <span>文件名称</span>
            <span class="required">*</span>
          </div>
          <input
            v-model="fileName"
            class="modal-form-input"
            maxlength="120"
            placeholder="例如: 计算机网络.pdf"
            :disabled="uploading"
          />
        </div>

        <div class="modal-form-group">
          <div class="modal-form-label">
            <span>归档至</span>
            <span class="required">*</span>
          </div>
          <div v-if="subjects.length > 0" class="subject-grid">
            <div
              v-for="subj in subjects"
              :key="subj.id"
              class="subject-chip"
              :class="{ 'is-active': selectedSubjectId === subj.id }"
              role="button"
              @click="!uploading && (selectedSubjectId = subj.id)"
            >
              <span class="subject-chip-text">{{ subj.name }}</span>
            </div>
          </div>
          <span v-else class="empty-hint">暂无学科，请先创建学科空间</span>
        </div>

        <span v-if="activeError" class="modal-error" role="alert">{{ activeError }}</span>
      </div>

      <div class="modal-footer">
        <button
          type="button"
          class="modal-btn modal-btn-secondary"
          :disabled="uploading"
          @click="handleClose"
        >取消</button>
        <button
          type="button"
          class="modal-btn modal-btn-primary"
          :disabled="!canSubmit || uploading"
          @click="handleSubmit"
        >{{ uploading ? '导入中...' : '确认登记' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import type { LocalUploadFile } from '@/services/assetUpload'
import {
  SUPPORTED_UPLOAD_EXTENSIONS,
  pickLocalDocument,
  validateUploadFile,
} from '@/utils/filePicker'
// #ifdef H5
import { normalizeBrowserFile } from '@/utils/filePicker'
// #endif
import { formatBytes } from '@/utils/sourceFormat'

export interface UploadSubjectOption {
  id: string
  name: string
}

const props = defineProps<{
  visible: boolean
  subjects: UploadSubjectOption[]
  defaultSubjectId: string
  uploading: boolean
  uploadProgress: number
  uploadStage: string
  errorMessage: string
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', payload: { file: LocalUploadFile; title: string; subjectId: string }): void
  (event: 'clear-error'): void
}>()

const isDragover = ref(false)
const selectedFile = ref<LocalUploadFile | null>(null)
const fileName = ref('')
const selectedSubjectId = ref('')
const localError = ref('')

const clampedProgress = computed(() => {
  const value = Math.round(props.uploadProgress || 0)
  return Math.max(0, Math.min(100, value))
})

const activeError = computed(() => localError.value || props.errorMessage)

const selectedFileHint = computed(() => {
  if (!selectedFile.value) {
    return '支持 PDF、DOC、DOCX、PPT、PPTX 文件'
  }
  const sizeLabel = formatBytes(selectedFile.value.size)
  return sizeLabel ? `${sizeLabel} · 点击可更换其他文件` : '点击可更换其他文件'
})

const hasValidSubject = computed(() => props.subjects.some(item => item.id === selectedSubjectId.value))

const canSubmit = computed(() => (
  Boolean(selectedFile.value)
  && fileName.value.trim().length > 0
  && hasValidSubject.value
))

function resolveInitialSubjectId(): string {
  if (props.defaultSubjectId && props.subjects.some(item => item.id === props.defaultSubjectId)) {
    return props.defaultSubjectId
  }
  return props.subjects[0]?.id || ''
}

function resetForm() {
  selectedFile.value = null
  fileName.value = ''
  isDragover.value = false
  localError.value = ''
  selectedSubjectId.value = resolveInitialSubjectId()
}

watch(
  () => props.visible,
  (visible, prevVisible) => {
    if (visible && !prevVisible) {
      resetForm()
    }
  },
  { immediate: true },
)

watch(
  () => [props.defaultSubjectId, props.subjects] as const,
  () => {
    if (props.visible && !hasValidSubject.value) {
      selectedSubjectId.value = resolveInitialSubjectId()
    }
  },
)

function applyChosenFile(candidate: LocalUploadFile) {
  localError.value = ''
  emit('clear-error')
  try {
    validateUploadFile(candidate)
  } catch (error) {
    localError.value = error instanceof Error && error.message ? error.message : '不支持的文件格式'
    return
  }

  const prevName = selectedFile.value?.name
  selectedFile.value = candidate
  if (!fileName.value.trim() || fileName.value === prevName) {
    fileName.value = candidate.name
  }
  if (!selectedSubjectId.value) {
    selectedSubjectId.value = resolveInitialSubjectId()
  }
}

// #ifdef H5
function triggerH5FileInput() {
  if (props.uploading || typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = SUPPORTED_UPLOAD_EXTENSIONS.join(',')
  input.onchange = () => {
    const rawFile = input.files?.[0]
    if (!rawFile) return
    applyChosenFile(normalizeBrowserFile(rawFile))
  }
  input.click()
}

function handleH5Drop(event: DragEvent) {
  isDragover.value = false
  if (props.uploading) return
  const rawFile = event.dataTransfer?.files?.[0]
  if (!rawFile) return
  applyChosenFile(normalizeBrowserFile(rawFile))
}
// #endif

// #ifndef H5
async function triggerNativePicker() {
  if (props.uploading) return
  try {
    const picked = await pickLocalDocument()
    if (picked) {
      applyChosenFile(picked)
    }
  } catch (error) {
    localError.value = error instanceof Error && error.message ? error.message : '选择文件失败'
  }
}
// #endif

function handleClose() {
  if (props.uploading) return
  emit('close')
}

function handleSubmit() {
  if (props.uploading || !selectedFile.value) return
  const trimmedTitle = fileName.value.trim()
  if (!trimmedTitle) {
    localError.value = '请输入文件名称'
    return
  }
  if (!hasValidSubject.value) {
    localError.value = '请选择归档学科'
    return
  }
  try {
    validateUploadFile(selectedFile.value)
  } catch (error) {
    localError.value = error instanceof Error && error.message ? error.message : '文件校验失败'
    return
  }
  localError.value = ''
  emit('submit', {
    file: selectedFile.value,
    title: trimmedTitle,
    subjectId: selectedSubjectId.value,
  })
}
</script>

<style scoped>
.upload-modal-mask {
  background-color: rgba(28, 28, 26, 0.42);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  padding: 24px;
}

.upload-modal-card {
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 48px);
  background: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow:
    0 24px 64px -12px rgba(0, 0, 0, 0.13),
    0 8px 24px -6px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  animation: uiModalIn 0.22s var(--ease-out) both;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 28px 12px;
  flex-shrink: 0;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.18s ease, transform 0.2s var(--ease-out);
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.05);
}

.modal-body {
  padding: 8px 28px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.drop-zone {
  border: 2px dashed rgba(0, 0, 0, 0.12);
  border-radius: var(--radius-lg);
  padding: 28px 20px;
  text-align: center;
  background: var(--color-bg-tertiary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: border-color 0.2s var(--ease-out), background-color 0.2s var(--ease-out);
}

.drop-zone:hover,
.drop-zone.is-active {
  border-color: var(--color-zen-sage);
  background: rgba(139, 154, 110, 0.08);
}

.drop-zone.has-file {
  border-color: var(--color-zen-sage);
  border-style: solid;
}

.drop-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: background-color 0.2s ease;
}

.drop-icon.is-success {
  background: rgba(139, 154, 110, 0.14);
}

.drop-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.4;
}

.drop-hint {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.upload-progress {
  padding: 12px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-md);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.stage-text {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-primary);
}

.progress-pct {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-sage-dark);
}

.progress-track {
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-zen-sage);
  border-radius: var(--radius-full);
  transition: width 0.14s linear;
}

.modal-form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-form-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.modal-form-label .required {
  color: #D14343;
  font-weight: 700;
}

.modal-form-input {
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  font-size: 13.5px;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04), 0 0.5px 1.5px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), background-color 0.2s ease;
}

/* #ifdef H5 */
.modal-form-input:focus {
  outline: none;
  border-color: var(--color-zen-sage);
  background: #FDFBF8;
  box-shadow: 0 0 0 3.5px rgba(139, 154, 110, 0.14), 0 2px 8px rgba(139, 154, 110, 0.12);
}
/* #endif */

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
  border-radius: var(--radius-full);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.18s var(--ease-out);
  max-width: 100%;
}

.subject-chip:hover {
  border-color: var(--color-zen-sage);
  color: var(--color-sage-dark);
  transform: translateY(-1px);
}

.subject-chip.is-active {
  background: rgba(139, 154, 110, 0.14);
  border-color: var(--color-zen-sage);
  font-weight: 600;
  color: var(--color-sage-dark);
}

.subject-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 0;
}

.modal-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 28px 24px;
  flex-shrink: 0;
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 20px;
  margin: 0;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border: none;
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.2s var(--ease-out);
}

.modal-btn::after {
  border: none;
}

.modal-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.modal-btn-secondary {
  background: rgba(0, 0, 0, 0.035);
  border: 1px solid rgba(0, 0, 0, 0.09);
  color: var(--text-primary);
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
}

.modal-btn-secondary:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.065);
  border-color: rgba(0, 0, 0, 0.16);
}

.modal-btn-primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.32), 0 1px 2px rgba(0, 0, 0, 0.06);
}

.modal-btn-primary:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(118, 135, 88, 0.42), 0 2px 4px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}
</style>
