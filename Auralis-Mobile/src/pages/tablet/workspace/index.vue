<template>
  <TabletLayout>
    <view class="t-workspace">
      <WorkspaceSourceRail
        :subject-name="subjectName"
        :subject-icon="activeSubject?.icon"
        :sources="sources"
        :selected-source-id="selectedSourceId"
        :loading-sources="loadingSources"
        :sources-error="sourcesError"
        :uploading="uploading"
        @back="goBack"
        @upload="handleUploadFile"
        @refresh="reloadAll"
        @select-overview="selectOverview"
        @select-source="selectSource"
        @delete-source="handleDeleteSource"
      />

      <WorkspaceCenterReader
        v-model:active-tab="activeTab"
        :subject-id="subjectId"
        :subject-name="subjectName"
        :selected-source="selectedSource"
        :ai-panel-visible="aiPanelVisible"
        :preview-url="previewUrl"
        :preview-mime-type="previewMimeType"
        :preview-original-name="previewOriginalName"
        :preview-loading="previewLoading"
        :preview-error="previewError"
        :overview="overview"
        :overview-loading="overviewLoading"
        :overview-error="overviewError"
        :subject-blocks="subjectBlocks"
        @toggle-ai-panel="aiPanelVisible = !aiPanelVisible"
        @retry-preview="loadSourcePreview"
        @refresh-overview="loadOverview"
        @create-block="openCreateBlockModal"
        @edit-block="openEditBlockModal"
        @delete-block="handleDeleteBlock"
      />

      <WorkspaceAiPanel
        v-if="aiPanelVisible"
        :subject-id="subjectId"
        :subject-name="subjectName"
        :selected-source="selectedSource"
      />
    </view>

    <template #modal>
      <view v-if="showBlockModal" class="zen-modal-mask" @click="closeBlockModal">
        <view class="zen-modal-body block-modal-card" @click.stop>
          <view class="modal-header">
            <text class="modal-title">{{ editingBlockId ? '编辑知识块' : '新建知识块' }}</text>
            <view class="ui-icon-btn sm" role="button" aria-label="关闭" @click="closeBlockModal">
              <LineIcon name="close" size="14px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-body">
            <view class="field-group">
              <text class="zen-field-label">标题</text>
              <input
                v-model="blockDraft.title"
                class="ui-input"
                maxlength="80"
                placeholder="例如：拉格朗日中值定理的辅助函数构造"
              />
            </view>

            <view class="field-group">
              <text class="zen-field-label">关联资料</text>
              <input
                v-model="blockDraft.source"
                class="ui-input"
                maxlength="80"
                placeholder="自主整理或关联资料名称"
              />
              <view v-if="sources.length > 0" class="source-chip-row">
                <view
                  class="chip-item sm"
                  :class="{ active: blockDraft.source === '自主整理' }"
                  role="button"
                  @click="blockDraft.source = '自主整理'"
                >
                  <text>自主整理</text>
                </view>
                <view
                  v-for="src in sources"
                  :key="src.id"
                  class="chip-item sm"
                  :class="{ active: blockDraft.source === (src.title || '') }"
                  role="button"
                  @click="blockDraft.source = src.title || ''"
                >
                  <text class="source-chip-text">{{ src.title || '未命名资料' }}</text>
                </view>
              </view>
            </view>

            <view class="field-group">
              <text class="zen-field-label">正文</text>
              <textarea
                v-model="blockDraft.preview"
                class="ui-textarea"
                :maxlength="4000"
                placeholder="Markdown 正文（支持 $...$ 公式）"
              />
            </view>
          </view>

          <view class="modal-footer">
            <button class="ui-btn ui-btn-ghost" :disabled="submittingBlock" @click="closeBlockModal">取消</button>
            <button class="ui-btn ui-btn-primary" :disabled="submittingBlock" @click="submitBlockModal">
              {{ submittingBlock ? '保存中…' : '保存' }}
            </button>
          </view>
        </view>
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import WorkspaceSourceRail from '@/components/tablet/workspace/WorkspaceSourceRail.vue'
import WorkspaceCenterReader, { type WorkspaceTabKey } from '@/components/tablet/workspace/WorkspaceCenterReader.vue'
import WorkspaceAiPanel from '@/components/tablet/workspace/WorkspaceAiPanel.vue'
import { assetApi } from '@/api/assetApi'
import { overviewApi, type OverviewResultView } from '@/api/overviewApi'
import { sourceApi, type SourceView } from '@/api/sourceApi'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore, type KnowledgeBlock } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { pickLocalDocument, uploadSubjectFile } from '@/utils/filePicker'

const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const blockStore = useBlockStore()

const subjectId = ref('')
const activeTab = ref<WorkspaceTabKey>('overview')
const aiPanelVisible = ref(true)

const sources = ref<SourceView[]>([])
const loadingSources = ref(false)
const sourcesError = ref('')
const selectedSourceId = ref<string | null>(null)
const uploading = ref(false)

const previewUrl = ref('')
const previewMimeType = ref('')
const previewOriginalName = ref('')
const previewLoading = ref(false)
const previewError = ref('')

const overview = ref<OverviewResultView | null>(null)
const overviewLoading = ref(false)
const overviewError = ref('')

const showBlockModal = ref(false)
const editingBlockId = ref<string | null>(null)
const submittingBlock = ref(false)
const blockDraft = ref({ title: '', source: '', preview: '' })

let sourceReqToken = 0
let previewReqToken = 0
let overviewReqToken = 0

const activeSubject = computed(() => subjectStore.subjects.find(item => item.id === subjectId.value) || null)
const subjectName = computed(() => activeSubject.value?.name || '学科工作台')
const selectedSource = computed(() => {
  if (!selectedSourceId.value) return null
  return sources.value.find(item => item.id === selectedSourceId.value) || null
})

const subjectBlocks = computed(() => blockStore.recentBlocks.filter((item) => {
  if (item.subjectId && subjectId.value) return item.subjectId === subjectId.value
  return item.subject === subjectName.value
}))

function goBack() {
  uni.redirectTo({ url: '/pages/tablet/subject-hall/index' })
}

function captureFence() {
  return {
    generation: authStore.getLoginGeneration(),
    userId: authStore.user?.id,
    serverDeviceId: authStore.serverDeviceId,
    subjectId: subjectId.value,
    sourceId: selectedSourceId.value,
  }
}

function isFenceValid(fence: ReturnType<typeof captureFence>, checkSource = true): boolean {
  if (fence.generation !== authStore.getLoginGeneration()) return false
  if (fence.userId !== authStore.user?.id) return false
  if (fence.serverDeviceId !== authStore.serverDeviceId) return false
  if (fence.subjectId !== subjectId.value) return false
  if (checkSource && fence.sourceId !== selectedSourceId.value) return false
  return true
}

function clearPreview() {
  previewReqToken++
  previewUrl.value = ''
  previewMimeType.value = ''
  previewOriginalName.value = ''
  previewLoading.value = false
  previewError.value = ''
}

async function loadSources() {
  if (!subjectId.value) return
  const token = ++sourceReqToken
  const fence = captureFence()
  loadingSources.value = true
  sourcesError.value = ''
  try {
    const list = await sourceApi.listAllBySubject(subjectId.value)
    if (token !== sourceReqToken || !isFenceValid(fence, false)) return
    sources.value = list
    if (selectedSourceId.value && !list.some(item => item.id === selectedSourceId.value)) {
      selectedSourceId.value = null
      if (activeTab.value === 'preview') activeTab.value = 'overview'
      clearPreview()
    }
  } catch (error) {
    if (token !== sourceReqToken || !isFenceValid(fence, false)) return
    sourcesError.value = error instanceof Error && error.message ? error.message : '资料列表加载失败'
  } finally {
    if (token === sourceReqToken) loadingSources.value = false
  }
}

async function loadSourcePreview() {
  const source = selectedSource.value
  if (!source) {
    clearPreview()
    return
  }
  if (!source.assetId) {
    clearPreview()
    return
  }
  const token = ++previewReqToken
  const fence = captureFence()
  previewLoading.value = true
  previewError.value = ''
  previewUrl.value = ''
  try {
    const res = await assetApi.downloadUrl(source.assetId)
    if (token !== previewReqToken || !isFenceValid(fence)) return
    previewUrl.value = res.url || ''
    previewMimeType.value = res.mimeType || ''
    previewOriginalName.value = res.originalName || source.title || ''
    if (!previewUrl.value) {
      previewError.value = '暂未获取到有效预览地址，请确认附件已上传完毕'
    }
  } catch (error) {
    if (token !== previewReqToken || !isFenceValid(fence)) return
    previewError.value = error instanceof Error && error.message ? error.message : '预览地址获取失败'
  } finally {
    if (token === previewReqToken) previewLoading.value = false
  }
}

async function loadOverview() {
  if (!subjectId.value) return
  const source = selectedSource.value
  if (source && source.ingestionStatus !== 'READY') {
    overviewReqToken++
    overviewLoading.value = false
    overviewError.value = ''
    overview.value = null
    return
  }
  const token = ++overviewReqToken
  const fence = captureFence()
  overviewLoading.value = true
  overviewError.value = ''
  try {
    const result = source?.id
      ? await overviewApi.getSource(source.id, source.ingestionRevision)
      : await overviewApi.getSubject(subjectId.value)
    if (token !== overviewReqToken || !isFenceValid(fence)) return
    overview.value = result
  } catch (error) {
    if (token !== overviewReqToken || !isFenceValid(fence)) return
    overview.value = null
    overviewError.value = error instanceof Error && error.message ? error.message : '大纲与总结加载失败'
  } finally {
    if (token === overviewReqToken) overviewLoading.value = false
  }
}

function selectOverview() {
  selectedSourceId.value = null
  if (activeTab.value === 'preview') activeTab.value = 'overview'
  clearPreview()
  void loadOverview()
}

function selectSource(source: SourceView) {
  if (!source.id) return
  selectedSourceId.value = source.id
  activeTab.value = 'preview'
  void loadSourcePreview()
  void loadOverview()
}

async function handleUploadFile() {
  if (!subjectId.value || uploading.value) return
  const fence = captureFence()
  try {
    const picked = await pickLocalDocument()
    if (!picked || !isFenceValid(fence, false)) return
    uploading.value = true
    const created = await uploadSubjectFile({ subjectId: fence.subjectId, file: picked })
    if (!isFenceValid(fence, false)) return
    await Promise.all([loadSources(), subjectStore.loadSubjects()])
    if (!isFenceValid(fence, false)) return
    uni.showToast({ title: '已上传，等待解析', icon: 'none' })
    if (created.id) {
      selectedSourceId.value = created.id
      activeTab.value = 'preview'
      void loadSourcePreview()
      void loadOverview()
    }
  } catch (error) {
    if (!isFenceValid(fence, false)) return
    const msg = error instanceof Error && error.message ? error.message : '上传失败'
    uni.showToast({ title: msg, icon: 'none' })
  } finally {
    uploading.value = false
  }
}

function handleDeleteSource(source: SourceView) {
  if (!source.id) return
  const fence = captureFence()
  uni.showModal({
    title: '删除资料',
    content: `确定删除《${source.title || '未命名资料'}》吗？`,
    confirmColor: '#C93B3B',
    success: async (res) => {
      if (!res.confirm || !source.id || !isFenceValid(fence, false)) return
      try {
        await sourceApi.delete(source.id, source.version ?? 0)
        if (!isFenceValid(fence, false)) return
        if (selectedSourceId.value === source.id) {
          selectedSourceId.value = null
          if (activeTab.value === 'preview') activeTab.value = 'overview'
          clearPreview()
        }
        await Promise.all([loadSources(), subjectStore.loadSubjects(), loadOverview()])
        if (!isFenceValid(fence, false)) return
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (error) {
        if (!isFenceValid(fence, false)) return
        const msg = error instanceof Error && error.message ? error.message : '删除资料失败'
        uni.showToast({ title: msg, icon: 'none' })
      }
    },
  })
}

function openCreateBlockModal() {
  editingBlockId.value = null
  blockDraft.value = {
    title: '',
    source: selectedSource.value?.title || '自主整理',
    preview: '',
  }
  showBlockModal.value = true
}

function openEditBlockModal(block: KnowledgeBlock) {
  editingBlockId.value = block.id
  blockDraft.value = {
    title: block.title,
    source: block.source || '',
    preview: block.preview,
  }
  showBlockModal.value = true
}

function closeBlockModal() {
  if (submittingBlock.value) return
  showBlockModal.value = false
}

useEscapeKey(() => showBlockModal.value, closeBlockModal)

async function submitBlockModal() {
  if (submittingBlock.value || !subjectId.value) return
  const title = blockDraft.value.title.trim()
  const preview = blockDraft.value.preview.trim()
  const source = blockDraft.value.source.trim() || '自主整理'
  if (!title) {
    uni.showToast({ title: '请输入知识块标题', icon: 'none' })
    return
  }
  if (!preview) {
    uni.showToast({ title: '请输入知识块内容', icon: 'none' })
    return
  }

  const fence = captureFence()
  submittingBlock.value = true
  try {
    if (editingBlockId.value) {
      const existing = subjectBlocks.value.find(item => item.id === editingBlockId.value)
      if (!existing) throw new Error('未找到待更新的知识块')
      await blockStore.updateBlock({
        ...existing,
        title,
        source,
        preview,
        subject: subjectName.value,
        subjectId: fence.subjectId,
      })
      if (!isFenceValid(fence, false)) return
      uni.showToast({ title: '知识块已更新', icon: 'none' })
    } else {
      await blockStore.addBlock({
        title,
        source,
        preview,
        subject: subjectName.value,
        subjectId: fence.subjectId,
        sourceFileId: selectedSource.value?.id,
        color: '#8B9A6E',
      })
      if (!isFenceValid(fence, false)) return
      uni.showToast({ title: '已创建知识块', icon: 'none' })
    }
    showBlockModal.value = false
    editingBlockId.value = null
    blockDraft.value = { title: '', source: '', preview: '' }
    activeTab.value = 'blocks'
  } catch (error) {
    if (!isFenceValid(fence, false)) return
    const msg = error instanceof Error && error.message ? error.message : '保存知识块失败'
    uni.showToast({ title: msg, icon: 'none' })
  } finally {
    submittingBlock.value = false
  }
}

function handleDeleteBlock(block: KnowledgeBlock) {
  const fence = captureFence()
  uni.showModal({
    title: '删除知识块',
    content: `确定删除知识块“${block.title}”吗？`,
    confirmColor: '#C93B3B',
    success: async (res) => {
      if (!res.confirm || !isFenceValid(fence, false)) return
      await blockStore.removeBlock(block.id)
      if (!isFenceValid(fence, false)) return
      uni.showToast({ title: '已删除知识块', icon: 'none' })
    },
  })
}

async function reloadAll() {
  if (!subjectId.value) return
  await Promise.all([
    subjectStore.loadSubjects(),
    blockStore.fetchBlocks(undefined, subjectId.value),
    loadSources(),
  ])
  await loadOverview()
  if (selectedSource.value) {
    void loadSourcePreview()
  }
}

onLoad((options) => {
  const incomingId = typeof options?.id === 'string' && options.id
    ? options.id
    : (typeof options?.subjectId === 'string' && options.subjectId ? options.subjectId : '')
  if (incomingId) {
    subjectId.value = incomingId
    subjectStore.setActiveSubject(incomingId)
  }
  const panel = options?.panel || options?.tab
  if (panel === 'overview' || panel === 'blocks' || panel === 'review') {
    activeTab.value = panel
  }
})

onMounted(async () => {
  const fence = captureFence()
  await subjectStore.loadSubjects()
  if (fence.generation !== authStore.getLoginGeneration()) return
  if (!subjectId.value) {
    const fallbackId = subjectStore.activeSubjectId || subjectStore.subjects[0]?.id || ''
    if (!fallbackId) {
      uni.redirectTo({ url: '/pages/tablet/subject-hall/index' })
      return
    }
    subjectId.value = fallbackId
    subjectStore.setActiveSubject(fallbackId)
  }
  await reloadAll()
})
</script>

<style scoped>
.t-workspace {
  width: 100%;
  height: 100%;
  background: var(--color-bg-secondary);
  padding: 14px;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  gap: 12px;
  overflow: hidden;
}

.block-modal-card {
  max-width: 480px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-primary);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-group {
  display: flex;
  flex-direction: column;
}

.source-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.chip-item.sm {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  font-size: 11.5px;
  color: var(--text-secondary);
  cursor: pointer;
}

.chip-item.sm.active {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-semibold);
}

.source-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 900px) {
  .t-workspace {
    flex-direction: column;
    overflow-y: auto;
    height: auto;
    min-height: 100%;
  }
}
</style>
