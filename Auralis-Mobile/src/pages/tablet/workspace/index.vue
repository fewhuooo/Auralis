<template>
  <TabletLayout>
    <view class="t-workspace">
      <!-- 1. PC 同源左侧一级窄条导轨 (72px) -->
      <aside class="tier1-strip zen-panel" aria-label="工作区导轨">
        <view class="tier1-top">
          <view class="tier1-btn" role="button" aria-label="返回学科大厅" @click="goBack">
            <LineIcon name="chevron-left" size="19px" color="currentColor" />
            <text class="tier1-btn-text">返回</text>
          </view>

          <view
            class="tier1-btn"
            :class="{ 'is-active': centerView === 'preview' || centerView === 'subject-overview' || centerView === 'onboarding' }"
            role="button"
            aria-label="学习资料"
            @click="handleFilesRailClick"
          >
            <LineIcon name="file-text" size="19px" color="currentColor" />
            <text class="tier1-btn-text">资料</text>
          </view>

          <view
            class="tier1-btn"
            :class="{ 'is-active': centerView === 'blocks' }"
            role="button"
            aria-label="知识库"
            @click="openCenterSection('blocks')"
          >
            <LineIcon name="grid" size="19px" color="currentColor" />
            <text class="tier1-btn-text">知识库</text>
          </view>

          <view
            class="tier1-btn"
            :class="{ 'is-active': centerView === 'review' }"
            role="button"
            aria-label="学科复习"
            @click="openCenterSection('review')"
          >
            <LineIcon name="history" size="19px" color="currentColor" />
            <text class="tier1-btn-text">复习</text>
          </view>

          <view
            class="tier1-btn"
            :class="{ 'is-active': centerView === 'stats' }"
            role="button"
            aria-label="学科统计"
            @click="openCenterSection('stats')"
          >
            <LineIcon name="chart" size="19px" color="currentColor" />
            <text class="tier1-btn-text">统计</text>
          </view>
        </view>

        <view class="tier1-bottom">
          <view class="subject-mini-icon" :title="subjectName" aria-hidden="true">
            <LineIcon :name="`subj-${safeSubjectIcon}`" size="20px" color="#FFFFFF" />
          </view>
        </view>
      </aside>

      <!-- 2. 可折叠学习资料与学科总览抽屉 -->
      <WorkspaceSourceRail
        :open="tier2Open"
        :sources="sources"
        :selected-source-id="selectedSourceId"
        :loading-sources="loadingSources"
        :sources-error="sourcesError"
        :uploading="uploading"
        :subject-overview-active="centerView === 'subject-overview'"
        :subject-overview="subjectOverview"
        :subject-overview-loading="subjectOverviewLoading"
        :subject-overview-error="subjectOverviewError"
        @upload="openUploadModal"
        @refresh-sources="loadSources"
        @select-source="selectSource"
        @delete-source="handleDeleteSource"
        @select-subject-overview="openSubjectOverview"
      />

      <!-- 3. 右侧主工作区（预览/总结/大纲 / 学科总览 / 知识库 / 复习 / 统计） -->
      <WorkspaceCenterReader
        :center-view="centerView"
        :tier2-open="tier2Open"
        :initializing="workspaceBooting"
        :subject-id="subjectId"
        :subject-name="subjectName"
        :subject-icon="activeSubject?.icon"
        :subject-description="activeSubject?.description"
        :selected-source="selectedSource"
        :sources-count="sources.length"
        :preview-url="previewUrl"
        :preview-buffer="previewBuffer"
        :preview-asset-id="previewAssetId"
        :preview-mime-type="previewMimeType"
        :preview-original-name="previewOriginalName"
        :preview-loading="previewLoading"
        :preview-error="previewError"
        :subject-overview="subjectOverview"
        :subject-overview-loading="subjectOverviewLoading"
        :subject-overview-error="subjectOverviewError"
        :file-overviews="fileOverviews"
        :file-overview-loading="fileOverviewLoading"
        :file-overview-errors="fileOverviewErrors"
        :subject-blocks="subjectBlocks"
        :sources="sources"
        @toggle-tier2="handleToggleTier2Collapse"
        @upload="openUploadModal"
        @retry-preview="loadSourcePreview(true)"
        @refresh-subject-overview="loadSubjectOverview"
        @refresh-file-overview="refreshFileOverview"
        @ensure-file-overview="ensureFileOverview"
        @view-block="openBlockDetail"
        @create-block="openCreateBlockModal"
        @delete-block="handleDeleteBlock"
        @open-files-drawer="openFilesDrawer"
        @open-review="openCenterSection('review')"
      />
    </view>

    <template #modal>
      <!-- 右下角 AI 伴读悬浮启动胶囊 -->
      <view
        v-if="!aiPanelVisible"
        class="ai-fab-pill"
        role="button"
        aria-label="打开 AI 伴读浮窗"
        @click="openAiFloating"
      >
        <LineIcon name="sparkles" size="16px" color="#FFFFFF" />
        <text class="ai-fab-label">AI 伴读</text>
        <view v-if="aiTyping" class="ai-fab-live-dot" aria-hidden="true"></view>
      </view>

      <!-- 非阻塞 AI 伴读浮窗（懒挂载 + 保活不销毁流式状态） -->
      <view
        v-if="aiPanelMounted"
        v-show="aiPanelVisible"
        class="ai-floating-shell"
        :class="{ 'is-expanded': aiExpanded, 'is-dragging': isDraggingFloating }"
        :style="floatingShellStyle"
      >
        <WorkspaceAiPanel
          :subject-id="subjectId"
          :subject-name="subjectName"
          :selected-source="selectedSource"
          :floating="true"
          :expanded="aiExpanded"
          @close="aiPanelVisible = false"
          @toggle-expand="toggleAiExpanded"
          @header-pointerdown="startMouseDrag"
          @header-touchstart="startTouchDrag"
          @typing-change="aiTyping = $event"
          @request-save-block="handleRequestSaveBlock"
        />
      </view>

      <!-- AI 回答存为知识块弹窗（置于独立模态层，避免受浮窗 transform 限制） -->
      <SaveKnowledgeBlockModal
        :visible="showSaveAiBlockModal"
        :default-subject-id="subjectId"
        :initial-title="saveAiBlockSeedTitle"
        :initial-preview="saveAiBlockSeedContent"
        @close="showSaveAiBlockModal = false"
        @saved="showSaveAiBlockModal = false"
      />

      <!-- PC 同源资料上传弹窗 -->
      <WorkspaceUploadModal
        :visible="showUploadModal"
        :subjects="uploadSubjectOptions"
        :default-subject-id="subjectId"
        :uploading="uploading"
        :upload-progress="uploadProgress"
        :upload-stage="uploadStage"
        :error-message="uploadError"
        @close="closeUploadModal"
        @submit="handleSubmitUpload"
        @clear-error="uploadError = ''"
      />

      <!-- 知识块详情阅读弹窗 -->
      <view v-if="viewingBlock" class="zen-modal-mask" @click="closeBlockDetail">
        <view
          class="zen-modal-body block-detail-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="viewingBlock.title"
          @click.stop
        >
          <view class="modal-header">
            <view class="detail-head-meta">
              <text class="modal-title">{{ viewingBlock.title }}</text>
              <text class="detail-sub-meta num-tabular">
                {{ resolveBlockSourceLabel(viewingBlock, sources) }} · {{ formatShortDateTime(viewingBlock.time) }}
              </text>
            </view>
            <view class="ui-icon-btn sm" role="button" aria-label="关闭" @click="closeBlockDetail">
              <LineIcon name="close" size="14px" color="var(--text-muted)" />
            </view>
          </view>

          <scroll-view scroll-y :show-scrollbar="false" class="detail-body-scroll">
            <view class="detail-markdown-box">
              <MarkdownText :content="viewingBlock.preview || '暂无正文内容'" />
            </view>
          </scroll-view>

          <view class="modal-footer detail-footer">
            <button class="ui-btn ui-btn-danger sm" @click="handleDeleteBlock(viewingBlock)">删除</button>
            <view class="detail-footer-right">
              <button class="ui-btn ui-btn-secondary sm" @click="copyViewingBlock">复制</button>
              <button class="ui-btn ui-btn-primary sm" @click="editViewingBlock">编辑</button>
            </view>
          </view>
        </view>
      </view>

      <!-- 新建 / 编辑知识块弹窗 -->
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
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import SaveKnowledgeBlockModal from '@/components/SaveKnowledgeBlockModal.vue'
import WorkspaceSourceRail from '@/components/tablet/workspace/WorkspaceSourceRail.vue'
import WorkspaceCenterReader, {
  type WorkspaceCenterView,
} from '@/components/tablet/workspace/WorkspaceCenterReader.vue'
import WorkspaceAiPanel from '@/components/tablet/workspace/WorkspaceAiPanel.vue'
import WorkspaceUploadModal from '@/components/tablet/workspace/WorkspaceUploadModal.vue'
import { assetApi } from '@/api/assetApi'
import { overviewApi, type OverviewResultView } from '@/api/overviewApi'
import { sourceApi, type SourceView } from '@/api/sourceApi'
import { useEscapeKey } from '@/composables/useEscapeKey'
import type { LocalUploadFile } from '@/services/assetUpload'
import { localDataScope } from '@/services/localDataScope'
import { localDb } from '@/services/localDb'
// #ifdef H5
import { deleteCachedDocument, getCachedDocument } from '@/services/localDocumentCache'
// #endif
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore, type KnowledgeBlock } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import { uploadSubjectFile, validateUploadFile } from '@/utils/filePicker'
import { resolveBlockSourceLabel, resolveEditedBlockSourceLink } from '@/utils/blockSyncMapper'
import { copyTextWithFallback } from '@/utils/mobileLearning'
import { formatShortDateTime } from '@/utils/sourceFormat'
import { isSubjectIconKey } from '@/utils/subjectIcon'

const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const blockStore = useBlockStore()
const syncStore = useSyncStore()

const subjectId = ref('')
const requestedPanel = ref('')
const workspaceBooting = ref(true)
const tier2Open = ref(true)
const centerView = ref<WorkspaceCenterView>('onboarding')

const sources = ref<SourceView[]>([])
const loadingSources = ref(false)
const sourcesError = ref('')
const selectedSourceId = ref<string | null>(null)
const uploading = ref(false)
const showUploadModal = ref(false)
const uploadProgress = ref(0)
const uploadStage = ref('')
const uploadError = ref('')

const previewUrl = ref('')
const previewBuffer = shallowRef<ArrayBuffer | null>(null)
const previewMimeType = ref('')
const previewOriginalName = ref('')
const previewLoading = ref(false)
const previewError = ref('')

const subjectOverview = ref<OverviewResultView | null>(null)
const subjectOverviewLoading = ref(false)
const subjectOverviewError = ref('')
const fileOverviews = ref<Record<string, OverviewResultView | null>>({})
const fileOverviewLoading = ref<Record<string, boolean>>({})
const fileOverviewErrors = ref<Record<string, string>>({})

const viewingBlockId = ref('')
const showBlockModal = ref(false)
const editingBlockId = ref<string | null>(null)
const editingInitialSourceLabel = ref('')
const submittingBlock = ref(false)
const blockDraft = ref({ title: '', source: '', preview: '' })
const subjectsHydrated = ref(false)

const aiPanelMounted = ref(false)
const aiPanelVisible = ref(false)
const aiExpanded = ref(false)
const aiTyping = ref(false)
const dragX = ref(0)
const dragY = ref(0)
const isDraggingFloating = ref(false)
const showSaveAiBlockModal = ref(false)
const saveAiBlockSeedTitle = ref('')
const saveAiBlockSeedContent = ref('')

let sourceReqToken = 0
let previewReqToken = 0
let subjectOverviewReqToken = 0
let fileOverviewReqSeq = 0
let userChangedTier2 = false
let userChangedCenterView = false
const fileOverviewTokens: Record<string, number> = {}

let dragStartClientX = 0
let dragStartClientY = 0
let dragStartOffsetX = 0
let dragStartOffsetY = 0
let dragMinX = -480
let dragMaxX = 0
let dragMinY = -480
let dragMaxY = 0
let dragMode: 'mouse' | 'touch' | null = null

const activeSubject = computed(() => subjectStore.subjects.find(item => item.id === subjectId.value) || null)
const subjectName = computed(() => activeSubject.value?.name || '学科工作台')
const uploadSubjectOptions = computed(() => subjectStore.subjects.map(item => ({ id: item.id, name: item.name })))
const safeSubjectIcon = computed(() => (
  activeSubject.value?.icon && isSubjectIconKey(activeSubject.value.icon) ? activeSubject.value.icon : 'book'
))

const selectedSource = computed(() => {
  if (!selectedSourceId.value) return null
  return sources.value.find(item => item.id === selectedSourceId.value) || null
})
const previewAssetId = computed(() => selectedSource.value?.assetId || '')

const subjectBlocks = computed(() => blockStore.recentBlocks.filter((item) => {
  if (item.is_deleted) return false
  if (item.subjectId && subjectId.value) return item.subjectId === subjectId.value
  return item.subject === subjectName.value
}))

const viewingBlock = computed(() => (
  viewingBlockId.value
    ? subjectBlocks.value.find(item => item.id === viewingBlockId.value) || null
    : null
))

const floatingShellStyle = computed(() => {
  if (aiExpanded.value || (dragX.value === 0 && dragY.value === 0)) return undefined
  return { transform: `translate3d(${dragX.value}px, ${dragY.value}px, 0)` }
})

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
  previewBuffer.value = null
  previewMimeType.value = ''
  previewOriginalName.value = ''
  previewLoading.value = false
  previewError.value = ''
}

function handleFilesRailClick() {
  userChangedTier2 = true
  userChangedCenterView = true
  if (
    centerView.value === 'preview'
    || centerView.value === 'subject-overview'
    || centerView.value === 'onboarding'
  ) {
    tier2Open.value = !tier2Open.value
    return
  }
  centerView.value = selectedSource.value ? 'preview' : 'onboarding'
  tier2Open.value = true
  if (selectedSource.value && !previewUrl.value && !previewBuffer.value && !previewLoading.value && !previewError.value) {
    void loadSourcePreview()
  }
}

function handleToggleTier2Collapse() {
  userChangedTier2 = true
  tier2Open.value = !tier2Open.value
}

function openFilesDrawer() {
  userChangedTier2 = true
  userChangedCenterView = true
  centerView.value = selectedSource.value ? 'preview' : 'onboarding'
  tier2Open.value = true
  if (selectedSource.value && !previewUrl.value && !previewBuffer.value && !previewLoading.value && !previewError.value) {
    void loadSourcePreview()
  }
}

function openCenterSection(view: 'blocks' | 'review' | 'stats') {
  userChangedCenterView = true
  userChangedTier2 = true
  centerView.value = view
  tier2Open.value = false
}

function openSubjectOverview() {
  userChangedCenterView = true
  centerView.value = 'subject-overview'
  if (!subjectOverview.value && !subjectOverviewLoading.value) {
    void loadSubjectOverview()
  }
}

function ensureFileOverview(source: SourceView) {
  if (!source.id || source.ingestionStatus !== 'READY' || fileOverviewLoading.value[source.id]) {
    return
  }
  const existing = fileOverviews.value[source.id]
  const revisionMismatch = Boolean(source.ingestionRevision) && existing?.ingestionRevision !== source.ingestionRevision
  if (!existing || revisionMismatch) {
    void loadFileOverview(source)
  }
}

async function refreshFileOverview(source: SourceView) {
  if (!source.id) return
  if (source.ingestionStatus !== 'READY') {
    const fence = captureFence()
    await loadSources()
    if (!isFenceValid(fence, false)) return
    const latest = sources.value.find(item => item.id === source.id)
    await loadFileOverview(latest || source)
    return
  }
  await loadFileOverview(source)
}

function reconcileSelectedSource(list: SourceView[]) {
  if (selectedSourceId.value && !list.some(item => item.id === selectedSourceId.value)) {
    selectedSourceId.value = null
    clearPreview()
    if (centerView.value === 'preview') {
      centerView.value = 'onboarding'
    }
  }
}

async function loadSources() {
  if (!subjectId.value) return
  const token = ++sourceReqToken
  const fence = captureFence()
  loadingSources.value = true
  sourcesError.value = ''
  try {
    try {
      const cached = await localDb.getSourceViews(fence.subjectId)
      if (token !== sourceReqToken || !isFenceValid(fence, false)) return
      if (cached.length > 0 && sources.value.length === 0) {
        sources.value = cached
      }
    } catch {
      // Ignore local source cache failure and proceed to network fetch.
    }

    const list = await sourceApi.listAllBySubject(fence.subjectId)
    if (token !== sourceReqToken || !isFenceValid(fence, false)) return
    sources.value = list
    await localDb.replaceSubjectSources(fence.subjectId, list).catch(() => {})
    if (token !== sourceReqToken || !isFenceValid(fence, false)) return
    reconcileSelectedSource(list)
  } catch (error) {
    if (token !== sourceReqToken || !isFenceValid(fence, false)) return
    sourcesError.value = error instanceof Error && error.message ? error.message : '资料列表加载失败'
  } finally {
    if (token === sourceReqToken) loadingSources.value = false
  }
}

async function loadSourcePreview(bypassCache = false) {
  const source = selectedSource.value
  if (!source || !source.assetId) {
    clearPreview()
    return
  }
  const token = ++previewReqToken
  const fence = captureFence()
  const activeScope = localDataScope.current()
  previewLoading.value = true
  previewError.value = ''
  previewUrl.value = ''
  previewBuffer.value = null
  try {
    // #ifdef H5
    if (bypassCache) {
      await deleteCachedDocument(activeScope, source.assetId)
      if (token !== previewReqToken || !isFenceValid(fence)) return
    } else {
      const cached = await getCachedDocument(activeScope, source.assetId)
      if (token !== previewReqToken || !isFenceValid(fence)) return
      if (cached) {
        previewBuffer.value = cached.buffer
        previewMimeType.value = cached.mimeType || ''
        previewOriginalName.value = cached.originalName || source.title || ''
        return
      }
    }
    // #endif

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

async function loadSubjectOverview() {
  if (!subjectId.value) return
  const token = ++subjectOverviewReqToken
  const fence = captureFence()
  subjectOverviewLoading.value = true
  subjectOverviewError.value = ''
  try {
    try {
      const cached = await localDb.getSubjectOverviewCache(fence.subjectId)
      if (token !== subjectOverviewReqToken || !isFenceValid(fence, false)) return
      if (cached && !subjectOverview.value) {
        subjectOverview.value = cached
      }
    } catch {
      // Ignore local overview cache failure and fall back to remote request.
    }

    const result = await overviewApi.getSubject(fence.subjectId)
    if (token !== subjectOverviewReqToken || !isFenceValid(fence, false)) return
    subjectOverview.value = result
    if (result) {
      void localDb.saveSubjectOverviewCache(fence.subjectId, result).catch(() => {})
    } else {
      void localDb.deleteSubjectOverviewCache(fence.subjectId).catch(() => {})
    }
  } catch (error) {
    if (token !== subjectOverviewReqToken || !isFenceValid(fence, false)) return
    subjectOverviewError.value = error instanceof Error && error.message ? error.message : '学科总览加载失败'
  } finally {
    if (token === subjectOverviewReqToken) subjectOverviewLoading.value = false
  }
}

async function loadFileOverview(source: SourceView) {
  const srcId = source.id
  if (!srcId) return
  if (source.ingestionStatus !== 'READY') {
    fileOverviewLoading.value = { ...fileOverviewLoading.value, [srcId]: false }
    fileOverviewErrors.value = { ...fileOverviewErrors.value, [srcId]: '' }
    fileOverviews.value = { ...fileOverviews.value, [srcId]: null }
    return
  }
  const token = ++fileOverviewReqSeq
  fileOverviewTokens[srcId] = token
  const fence = captureFence()
  fileOverviewLoading.value = { ...fileOverviewLoading.value, [srcId]: true }
  fileOverviewErrors.value = { ...fileOverviewErrors.value, [srcId]: '' }
  try {
    try {
      const cached = await localDb.getSourceOverviewCache(srcId, source.ingestionRevision)
      if (token !== fileOverviewTokens[srcId] || !isFenceValid(fence, false)) return
      const currentOverview = fileOverviews.value[srcId]
      const revisionStale = Boolean(source.ingestionRevision) && currentOverview?.ingestionRevision !== source.ingestionRevision
      if (cached && (!currentOverview || revisionStale)) {
        fileOverviews.value = { ...fileOverviews.value, [srcId]: cached }
      }
    } catch {
      // Ignore local file overview cache failure and fall back to remote request.
    }

    const result = await overviewApi.getSource(srcId, source.ingestionRevision)
    if (token !== fileOverviewTokens[srcId] || !isFenceValid(fence, false)) return
    fileOverviews.value = { ...fileOverviews.value, [srcId]: result }
    if (result) {
      void localDb.saveSourceOverviewCache(srcId, fence.subjectId, source.ingestionRevision, result).catch(() => {})
    } else {
      void localDb.deleteSourceOverviewCache(srcId).catch(() => {})
    }
  } catch (error) {
    if (token !== fileOverviewTokens[srcId] || !isFenceValid(fence, false)) return
    fileOverviewErrors.value = {
      ...fileOverviewErrors.value,
      [srcId]: error instanceof Error && error.message ? error.message : '大纲加载失败',
    }
  } finally {
    if (token === fileOverviewTokens[srcId]) {
      fileOverviewLoading.value = { ...fileOverviewLoading.value, [srcId]: false }
    }
  }
}

async function loadAllOverviews() {
  const fence = captureFence()
  await loadSubjectOverview()
  if (!isFenceValid(fence, false)) return
  const readySources = sources.value.filter(item => item.id && item.ingestionStatus === 'READY')
  const batchSize = 4
  for (let i = 0; i < readySources.length; i += batchSize) {
    if (!isFenceValid(fence, false)) return
    await Promise.all(readySources.slice(i, i + batchSize).map(src => loadFileOverview(src)))
  }
}

function selectSource(source: SourceView) {
  if (!source.id) return
  const sourceChanged = selectedSourceId.value !== source.id
  userChangedCenterView = true
  selectedSourceId.value = source.id
  centerView.value = 'preview'
  if (sourceChanged) {
    clearPreview()
  }
  void loadSourcePreview()
  ensureFileOverview(source)
}

function openUploadModal() {
  if (!subjectId.value) return
  uploadError.value = ''
  uploadProgress.value = 0
  uploadStage.value = ''
  showUploadModal.value = true
}

function closeUploadModal() {
  if (uploading.value) return
  showUploadModal.value = false
  uploadError.value = ''
}

async function handleSubmitUpload(payload: { file: LocalUploadFile; title: string; subjectId: string }) {
  if (uploading.value || !payload.subjectId) return
  try {
    validateUploadFile(payload.file)
  } catch (error) {
    uploadError.value = error instanceof Error && error.message ? error.message : '不支持的文件格式'
    return
  }

  const fence = captureFence()
  uploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0
  uploadStage.value = '准备上传...'
  try {
    const created = await uploadSubjectFile({
      subjectId: payload.subjectId,
      file: payload.file,
      title: payload.title,
      onProgress: (percent, stage) => {
        if (!isFenceValid(fence, false)) return
        uploadProgress.value = percent
        uploadStage.value = stage
      },
    })
    if (!isFenceValid(fence, false)) return

    if (payload.subjectId === fence.subjectId) {
      await loadSources()
      if (!isFenceValid(fence, false)) return
      await subjectStore.loadSubjects()
      if (!isFenceValid(fence, false)) return
      if (created.id) {
        selectedSourceId.value = created.id
        centerView.value = 'preview'
        void loadSourcePreview()
      }
    } else {
      const targetList = await sourceApi.listAllBySubject(payload.subjectId).catch(() => null)
      if (!isFenceValid(fence, false)) return
      if (targetList) {
        await localDb.replaceSubjectSources(payload.subjectId, targetList).catch(() => {})
      }
      await subjectStore.loadSubjects()
      if (!isFenceValid(fence, false)) return
    }

    uploadProgress.value = 100
    uploadStage.value = '导入完成'
    showUploadModal.value = false
    const targetSubjectName = subjectStore.subjects.find(item => item.id === payload.subjectId)?.name
    const toastTitle = payload.subjectId === fence.subjectId || !targetSubjectName
      ? '已上传，等待解析'
      : `已上传至《${targetSubjectName}》`
    uni.showToast({ title: toastTitle, icon: 'none' })
  } catch (error) {
    if (!isFenceValid(fence, false)) return
    uploadProgress.value = 0
    uploadStage.value = ''
    uploadError.value = error instanceof Error && error.message ? error.message : '上传失败，请重试'
  } finally {
    uploading.value = false
  }
}

function handleDeleteSource(source: SourceView) {
  if (!source.id) return
  const fence = captureFence()
  const activeScope = localDataScope.current()
  uni.showModal({
    title: '删除资料',
    content: `确定删除《${source.title || '未命名资料'}》吗？`,
    confirmColor: '#C93B3B',
    success: async (res) => {
      if (!res.confirm || !source.id || !isFenceValid(fence, false)) return
      try {
        await sourceApi.delete(source.id, source.version ?? 0)
        if (!isFenceValid(fence, false)) return
        await localDb.deleteSourceFile(source.id).catch(() => {})
        if (!isFenceValid(fence, false)) return
        // #ifdef H5
        if (source.assetId) {
          void deleteCachedDocument(activeScope, source.assetId)
        }
        // #endif
        if (selectedSourceId.value === source.id) {
          selectedSourceId.value = null
          clearPreview()
          if (centerView.value === 'preview') centerView.value = 'onboarding'
        }
        await loadSources()
        if (!isFenceValid(fence, false)) return
        await Promise.all([subjectStore.loadSubjects(), loadSubjectOverview()])
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

function openBlockDetail(block: KnowledgeBlock) {
  viewingBlockId.value = block.id
}

function closeBlockDetail() {
  viewingBlockId.value = ''
}

async function copyViewingBlock() {
  if (!viewingBlock.value) return
  const text = viewingBlock.value.preview?.trim()
    ? `${viewingBlock.value.title}\n\n${viewingBlock.value.preview}`
    : viewingBlock.value.title
  const ok = await copyTextWithFallback(text)
  uni.showToast({ title: ok ? '已复制' : '复制失败，请手动复制', icon: 'none' })
}

function editViewingBlock() {
  const block = viewingBlock.value
  if (!block) return
  viewingBlockId.value = ''
  openEditBlockModal(block)
}

function openCreateBlockModal() {
  editingBlockId.value = null
  editingInitialSourceLabel.value = ''
  blockDraft.value = {
    title: '',
    source: selectedSource.value?.title || '自主整理',
    preview: '',
  }
  showBlockModal.value = true
}

function openEditBlockModal(block: KnowledgeBlock) {
  editingBlockId.value = block.id
  const resolvedLabel = resolveBlockSourceLabel(block, sources.value)
  editingInitialSourceLabel.value = resolvedLabel
  blockDraft.value = {
    title: block.title,
    source: resolvedLabel,
    preview: block.preview,
  }
  showBlockModal.value = true
}

function closeBlockModal() {
  if (submittingBlock.value) return
  showBlockModal.value = false
  editingInitialSourceLabel.value = ''
}

async function submitBlockModal() {
  if (submittingBlock.value || !subjectId.value) return
  const title = blockDraft.value.title.trim()
  const preview = blockDraft.value.preview.trim()
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
      const resolvedLink = resolveEditedBlockSourceLink({
        draftSource: blockDraft.value.source,
        initialSourceLabel: editingInitialSourceLabel.value,
        existingSource: existing.source,
        existingSourceFileId: existing.sourceFileId,
        sources: sources.value,
      })
      await blockStore.updateBlock({
        ...existing,
        title,
        source: resolvedLink.source,
        preview,
        subject: subjectName.value,
        subjectId: fence.subjectId,
        sourceFileId: resolvedLink.sourceFileId,
      })
      if (!isFenceValid(fence, false)) return
      uni.showToast({ title: '知识块已更新', icon: 'none' })
    } else {
      const resolvedLink = resolveEditedBlockSourceLink({
        draftSource: blockDraft.value.source,
        initialSourceLabel: '',
        sources: sources.value,
      })
      await blockStore.addBlock({
        title,
        source: resolvedLink.source,
        preview,
        subject: subjectName.value,
        subjectId: fence.subjectId,
        sourceFileId: resolvedLink.sourceFileId,
        color: '#8B9A6E',
      })
      if (!isFenceValid(fence, false)) return
      uni.showToast({ title: '已创建知识块', icon: 'none' })
    }
    showBlockModal.value = false
    editingBlockId.value = null
    editingInitialSourceLabel.value = ''
    blockDraft.value = { title: '', source: '', preview: '' }
    centerView.value = 'blocks'
  } catch (error) {
    if (!isFenceValid(fence, false)) return
    const msg = error instanceof Error && error.message ? error.message : '保存知识块失败'
    uni.showToast({ title: msg, icon: 'none' })
  } finally {
    if (fence.generation === authStore.getLoginGeneration() && fence.userId === authStore.user?.id) {
      submittingBlock.value = false
    }
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
      try {
        await blockStore.removeBlock(block.id)
        if (!isFenceValid(fence, false)) return
        if (viewingBlockId.value === block.id) viewingBlockId.value = ''
        uni.showToast({ title: '已删除知识块', icon: 'none' })
      } catch (error) {
        if (!isFenceValid(fence, false)) return
        const msg = error instanceof Error && error.message ? error.message : '删除知识块失败'
        uni.showToast({ title: msg, icon: 'none' })
      }
    },
  })
}

function openAiFloating() {
  aiPanelMounted.value = true
  aiPanelVisible.value = true
}

function toggleAiExpanded() {
  aiExpanded.value = !aiExpanded.value
  dragX.value = 0
  dragY.value = 0
}

function computeDragBounds() {
  if (typeof window === 'undefined') return
  const vw = window.innerWidth || 1024
  const vh = window.innerHeight || 768
  const panelWidth = Math.min(400, vw - 32)
  const panelHeight = Math.max(420, Math.min(Math.round(vh * 0.74), 660))
  const margin = 12
  dragMinX = -(vw - 22 - panelWidth - margin)
  dragMaxX = 22 - margin
  dragMinY = -(vh - 22 - panelHeight - margin)
  dragMaxY = 22 - margin
  if (dragMinX > dragMaxX) dragMinX = dragMaxX
  if (dragMinY > dragMaxY) dragMinY = dragMaxY
}

function applyDragDelta(clientX: number, clientY: number) {
  const nextX = dragStartOffsetX + (clientX - dragStartClientX)
  const nextY = dragStartOffsetY + (clientY - dragStartClientY)
  dragX.value = Math.min(dragMaxX, Math.max(dragMinX, nextX))
  dragY.value = Math.min(dragMaxY, Math.max(dragMinY, nextY))
}

function onWindowMouseMove(event: MouseEvent) {
  if (dragMode !== 'mouse') return
  applyDragDelta(event.clientX, event.clientY)
}

function onWindowTouchMove(event: TouchEvent) {
  if (dragMode !== 'touch') return
  const touch = event.touches[0]
  if (!touch) return
  applyDragDelta(touch.clientX, touch.clientY)
}

function stopDragging() {
  if (!dragMode) return
  dragMode = null
  isDraggingFloating.value = false
  if (typeof window !== 'undefined') {
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', stopDragging)
    window.removeEventListener('touchmove', onWindowTouchMove)
    window.removeEventListener('touchend', stopDragging)
    window.removeEventListener('touchcancel', stopDragging)
  }
}

function startMouseDrag(rawEvent: unknown) {
  if (aiExpanded.value || typeof window === 'undefined') return
  const ev = rawEvent as { clientX?: number; clientY?: number }
  if (typeof ev?.clientX !== 'number' || typeof ev?.clientY !== 'number') return
  computeDragBounds()
  dragMode = 'mouse'
  isDraggingFloating.value = true
  dragStartClientX = ev.clientX
  dragStartClientY = ev.clientY
  dragStartOffsetX = dragX.value
  dragStartOffsetY = dragY.value
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', stopDragging)
}

function startTouchDrag(rawEvent: unknown) {
  if (aiExpanded.value || typeof window === 'undefined') return
  const ev = rawEvent as { touches?: Array<{ clientX?: number; clientY?: number }> }
  const touch = ev?.touches?.[0]
  if (!touch || typeof touch.clientX !== 'number' || typeof touch.clientY !== 'number') return
  computeDragBounds()
  dragMode = 'touch'
  isDraggingFloating.value = true
  dragStartClientX = touch.clientX
  dragStartClientY = touch.clientY
  dragStartOffsetX = dragX.value
  dragStartOffsetY = dragY.value
  window.addEventListener('touchmove', onWindowTouchMove, { passive: true })
  window.addEventListener('touchend', stopDragging)
  window.addEventListener('touchcancel', stopDragging)
}

function handleWindowResize() {
  dragX.value = 0
  dragY.value = 0
}

function handleRequestSaveBlock(payload: { title: string; preview: string }) {
  saveAiBlockSeedTitle.value = payload.title
  saveAiBlockSeedContent.value = payload.preview
  showSaveAiBlockModal.value = true
}

useEscapeKey(() => showUploadModal.value && !uploading.value, closeUploadModal)
useEscapeKey(() => showBlockModal.value && !showSaveAiBlockModal.value && !showUploadModal.value, closeBlockModal)
useEscapeKey(
  () => Boolean(viewingBlock.value) && !showBlockModal.value && !showSaveAiBlockModal.value && !showUploadModal.value,
  closeBlockDetail,
)
useEscapeKey(
  () => aiPanelVisible.value && !showBlockModal.value && !viewingBlock.value && !showSaveAiBlockModal.value && !showUploadModal.value,
  () => { aiPanelVisible.value = false },
)

async function reloadAll() {
  if (!subjectId.value) return
  const fence = captureFence()
  await Promise.all([
    subjectStore.loadSubjects(),
    blockStore.fetchBlocks(undefined, subjectId.value),
    loadSources(),
  ])
  if (!isFenceValid(fence, false)) return
  subjectsHydrated.value = true
  if (
    authStore.isAuthenticated
    && !syncStore.isResettingOffline
    && !subjectStore.subjects.some(item => item.id === subjectId.value)
  ) {
    goBack()
    return
  }

  const panel = requestedPanel.value
  if (!userChangedTier2) {
    if (panel === 'blocks' || panel === 'review' || panel === 'stats') {
      tier2Open.value = false
    } else {
      tier2Open.value = true
    }
  }

  if (!userChangedCenterView) {
    if (panel === 'blocks' || panel === 'review' || panel === 'stats') {
      centerView.value = panel
    } else if (panel === 'overview') {
      centerView.value = 'subject-overview'
    } else if (sources.value.length > 0 && sources.value[0].id) {
      if (!selectedSourceId.value) {
        selectedSourceId.value = sources.value[0].id
      }
      centerView.value = 'preview'
      void loadSourcePreview()
    } else {
      selectedSourceId.value = null
      centerView.value = 'onboarding'
    }
  } else if (!selectedSourceId.value && sources.value.length > 0 && sources.value[0].id) {
    selectedSourceId.value = sources.value[0].id
  }

  void loadAllOverviews()
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
  if (typeof panel === 'string') {
    requestedPanel.value = panel
    if (panel === 'blocks' || panel === 'review' || panel === 'stats') {
      workspaceBooting.value = false
      centerView.value = panel
      tier2Open.value = false
    } else if (panel === 'overview') {
      workspaceBooting.value = false
      centerView.value = 'subject-overview'
      tier2Open.value = true
    }
  }
})

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize)
  }
  const fence = captureFence()
  try {
    await subjectStore.loadSubjects()
    if (fence.generation !== authStore.getLoginGeneration()) return
    subjectsHydrated.value = true
    if (!subjectId.value) {
      const fallbackId = subjectStore.activeSubjectId || subjectStore.subjects[0]?.id || ''
      if (!fallbackId) {
        uni.redirectTo({ url: '/pages/tablet/subject-hall/index' })
        return
      }
      subjectId.value = fallbackId
      subjectStore.setActiveSubject(fallbackId)
    } else if (
      authStore.isAuthenticated
      && !syncStore.isResettingOffline
      && !subjectStore.subjects.some(item => item.id === subjectId.value)
    ) {
      goBack()
      return
    }
    await reloadAll()
  } finally {
    workspaceBooting.value = false
  }
})

onBeforeUnmount(() => {
  stopDragging()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize)
  }
})

watch(
  () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId],
  () => {
    showBlockModal.value = false
    showUploadModal.value = false
    showSaveAiBlockModal.value = false
    aiPanelVisible.value = false
    aiTyping.value = false
    editingBlockId.value = null
    editingInitialSourceLabel.value = ''
    submittingBlock.value = false
    uploading.value = false
    viewingBlockId.value = ''
    subjectsHydrated.value = false
    sources.value = []
    sourcesError.value = ''
    selectedSourceId.value = null
    subjectOverview.value = null
    subjectOverviewError.value = ''
    fileOverviews.value = {}
    fileOverviewErrors.value = {}
    clearPreview()
    if (authStore.isAuthenticated && subjectId.value) {
      void reloadAll()
    }
  },
)

watch(
  () => subjectStore.subjects,
  (list) => {
    if (
      subjectsHydrated.value
      && authStore.isAuthenticated
      && !syncStore.isResettingOffline
      && subjectId.value
      && !list.some(item => item.id === subjectId.value)
    ) {
      goBack()
    }
  },
)

watch(
  () => syncStore.lastSyncedAt,
  (next) => {
    if (!next || !authStore.isAuthenticated || !subjectId.value) return
    void loadSources()
    if (centerView.value === 'subject-overview') {
      void loadSubjectOverview()
    }
  },
)
</script>

<style scoped>
.t-workspace {
  width: 100%;
  height: 100%;
  background: transparent;
  padding: 12px 14px;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  overflow: hidden;
}

.tier1-strip {
  width: 72px;
  height: 100%;
  flex-shrink: 0;
  margin-right: 10px;
  padding: 18px 0 16px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.tier1-top,
.tier1-bottom {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.tier1-btn {
  width: 58px;
  height: 54px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.14s var(--ease-out);
}

.tier1-btn:hover {
  background: rgba(45, 55, 40, 0.045);
  color: var(--text-primary);
}

.tier1-btn:active {
  transform: scale(0.94);
}

.tier1-btn.is-active {
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-weight: 700;
  box-shadow: 0 2px 10px rgba(139, 154, 110, 0.16);
}

.tier1-btn-text {
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1;
}

.subject-mini-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(118, 135, 88, 0.28);
}

.ai-fab-pill {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 1050;
  height: 44px;
  padding: 0 18px;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  color: #FFFFFF;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 24px rgba(118, 135, 88, 0.36);
  cursor: pointer;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s ease;
}

.ai-fab-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(118, 135, 88, 0.44);
}

.ai-fab-pill:active {
  transform: scale(0.94);
}

.ai-fab-label {
  font-size: 13.5px;
  font-weight: 600;
  color: #FFFFFF;
}

.ai-fab-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #FFFFFF;
  animation: fabPulse 1.1s ease-in-out infinite;
}

@keyframes fabPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}

.ai-floating-shell {
  position: fixed;
  right: 22px;
  bottom: 22px;
  width: 400px;
  max-width: calc(100vw - 32px);
  height: min(74vh, 660px);
  min-height: 420px;
  z-index: 1080;
  border-radius: 20px;
  box-shadow: 0 22px 54px rgba(28, 28, 26, 0.18), 0 6px 18px rgba(45, 55, 40, 0.10);
  transition: width 0.22s var(--ease-out), height 0.22s var(--ease-out), right 0.22s var(--ease-out), bottom 0.22s var(--ease-out);
}

.ai-floating-shell.is-dragging {
  transition: none;
}

.ai-floating-shell.is-expanded {
  right: 18px;
  bottom: 18px;
  width: min(520px, calc(100vw - 96px));
  height: calc(100vh - 36px);
}

.block-detail-modal {
  max-width: 640px;
  max-height: 82vh;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-head-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-sub-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.detail-body-scroll {
  flex: 1;
  min-height: 120px;
  max-height: 54vh;
}

.detail-markdown-box {
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
}

.detail-footer {
  justify-content: space-between;
}

.detail-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  font-size: 11.5px;
  color: var(--text-secondary);
  cursor: pointer;
}

.chip-item.sm.active {
  background-color: rgba(139, 154, 110, 0.16);
  border-color: rgba(255, 255, 255, 0.78);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.74);
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

@media (max-width: 720px) {
  .t-workspace {
    padding: 8px;
  }

  .tier1-strip {
    width: 58px;
    margin-right: 8px;
  }

  .tier1-btn {
    width: 48px;
    height: 48px;
  }

  .ai-floating-shell {
    right: 12px;
    bottom: 12px;
    width: calc(100vw - 24px);
    height: min(78vh, 620px);
  }
}
</style>
