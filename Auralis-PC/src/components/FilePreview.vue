<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import { useAssetStore } from '@/store/useAssetStore'
import type { SourceFileModel } from '@/services/domainMappers'
import { resolveFileCapability, type FileCapability } from '@/utils/filePreview'
import FileViewerRenderer from '@/components/preview/FileViewerRenderer.vue'
import UnsupportedPreview from '@/components/preview/UnsupportedPreview.vue'

const props = withDefaults(defineProps<{
  file: Pick<SourceFileModel, 'id' | 'name' | 'assetId' | 'fileType'>
  compact?: boolean
}>(), {
  compact: false,
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'download'): void
  (event: 'preview-error', message: string): void
}>()

const assetStore = useAssetStore()
const previewFile = ref<File | null>(null)
const signedUrl = ref<string | null>(null)
const isLoading = ref(false)
const isRendererLoading = ref(false)
const errorMessage = ref<string | null>(null)

const capability = computed<FileCapability>(() => resolveFileCapability({
  name: props.file.name,
  type: props.file.fileType,
}))

const canPreview = computed(() => capability.value.allowedForUpload && capability.value.renderer === 'file-viewer')

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return '文件预览加载失败，请下载原文件后查看'
}

async function loadPreview(): Promise<void> {
  previewFile.value = null
  signedUrl.value = null
  errorMessage.value = null

  if (!canPreview.value) return
  if (!props.file.assetId) {
    errorMessage.value = '该资料没有可用的文件资产'
    emit('preview-error', errorMessage.value)
    return
  }

  isLoading.value = true
  try {
    const url = await assetStore.downloadUrl(props.file.assetId)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`文件下载失败（${response.status}）`)
    const blob = await response.blob()
    signedUrl.value = url
    previewFile.value = new File([blob], props.file.name, {
      type: blob.type || props.file.fileType || 'application/octet-stream',
    })
  } catch (error) {
    errorMessage.value = readableError(error)
    emit('preview-error', errorMessage.value)
  } finally {
    isLoading.value = false
  }
}

function downloadOriginal(): void {
  if (!signedUrl.value) return
  const link = document.createElement('a')
  link.href = signedUrl.value
  link.download = props.file.name
  link.rel = 'noopener'
  link.target = '_blank'
  link.click()
  emit('download')
}

function retry(): void {
  void loadPreview()
}

watch(
  () => [props.file.id, props.file.name, props.file.assetId, props.file.fileType] as const,
  () => { void loadPreview() },
  { immediate: true },
)
</script>

<template>
  <section class="file-preview" :class="{ 'is-compact': compact }" aria-label="文件预览">
    <header class="file-preview-header">
      <div class="file-preview-title-wrap">
        <span class="file-preview-eyebrow">文件预览</span>
        <h3 class="file-preview-title" :title="file.name">{{ file.name }}</h3>
      </div>
      <div class="file-preview-actions">
        <ElButton v-if="signedUrl" text size="small" @click="downloadOriginal">下载原文件</ElButton>
        <ElButton v-if="errorMessage" text size="small" @click="retry">重试</ElButton>
        <ElButton v-if="compact" text size="small" @click="emit('close')">关闭</ElButton>
      </div>
    </header>

    <div class="file-preview-body" :aria-busy="isLoading || isRendererLoading">
      <div v-if="isLoading" class="file-preview-state" role="status">
        <span class="file-preview-spinner" aria-hidden="true"></span>
        <span>正在准备预览…</span>
      </div>

      <div v-else-if="errorMessage" class="file-preview-state is-error" role="alert">
        <strong>{{ errorMessage }}</strong>
        <span>可以重试，或下载原文件查看。</span>
      </div>

      <UnsupportedPreview v-else-if="!canPreview" />

      <div v-else-if="previewFile" class="file-preview-renderer-shell">
        <FileViewerRenderer
          :file="previewFile"
          :capability="capability"
          @load-start="isRendererLoading = true"
          @load-complete="isRendererLoading = false"
          @unload-complete="isRendererLoading = false"
        />
        <div v-if="isRendererLoading" class="file-preview-loading-overlay" role="status">
          <span class="file-preview-spinner" aria-hidden="true"></span>
          <span>正在渲染文档…</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.file-preview {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--hairline, #e6e6e4);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.42);
}

.file-preview.is-compact {
  min-height: 420px;
}

.file-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.file-preview-title-wrap {
  min-width: 0;
}

.file-preview-eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted, #8a8a84);
  font-size: 12px;
}

.file-preview-title {
  max-width: 52vw;
  margin: 0;
  overflow: hidden;
  color: var(--text-primary, #1c1c1a);
  font-size: 17px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.file-preview-body {
  position: relative;
  min-height: 0;
  flex: 1;
}

.file-preview-renderer-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 460px;
}

.file-preview-state {
  display: grid;
  min-height: 320px;
  place-content: center;
  justify-items: center;
  gap: 12px;
  color: var(--text-secondary, #656560);
  font-size: 13px;
}

.file-preview-state.is-error {
  color: var(--error, #b4534b);
}

.file-preview-state.is-error span {
  color: var(--text-muted, #8a8a84);
}

.file-preview-loading-overlay {
  position: absolute;
  inset: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary, #656560);
  background: rgba(249, 249, 247, 0.78);
  pointer-events: none;
}

.file-preview-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(125, 147, 114, 0.22);
  border-top-color: var(--color-zen-sage, #7d9372);
  border-radius: 50%;
  animation: file-preview-spin 0.8s linear infinite;
}

@keyframes file-preview-spin {
  to { transform: rotate(360deg); }
}
</style>
