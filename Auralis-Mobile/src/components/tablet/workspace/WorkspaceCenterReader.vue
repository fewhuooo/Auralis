<template>
  <main class="center-card zen-panel">
    <!-- 顶部微状态栏 -->
    <header class="center-status-bar">
      <view class="status-left">
        <view v-if="centerView === 'subject-overview'" class="status-title-row">
          <LineIcon name="book" size="14px" color="var(--color-sage-ink)" />
          <text class="status-title">学科总览 · {{ subjectName }}</text>
        </view>
        <view v-else-if="centerView === 'preview' && selectedSource" class="status-title-row">
          <LineIcon name="file-text" size="14px" color="var(--text-muted)" />
          <text class="status-title">{{ selectedSource.title || '未命名资料' }}</text>
          <text
            v-if="selectedSource.ingestionStatus !== 'READY'"
            class="ui-tag"
            :class="`tone-${getSourceStatusMeta(selectedSource.ingestionStatus).tone}`"
          >{{ getSourceStatusMeta(selectedSource.ingestionStatus).label }}</text>
        </view>
        <view v-else-if="centerView === 'blocks'" class="status-title-row">
          <LineIcon name="layers" size="14px" color="var(--text-muted)" />
          <text class="status-title num-tabular">共 {{ subjectBlocks.length }} 个知识块</text>
        </view>
        <text v-else-if="centerView === 'review'" class="status-title">学科复习 · {{ subjectName }}</text>
        <text v-else-if="centerView === 'stats'" class="status-title">学科统计 · {{ subjectName }}</text>
        <text v-else class="status-title">{{ subjectName || '学科工作区' }}</text>
      </view>

      <view class="status-right">
        <template v-if="centerView === 'subject-overview'">
          <view class="ui-segmented compact-seg" role="tablist" aria-label="学科总览视图">
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: subjectOverviewMode === 'summary' }"
              role="tab"
              :aria-selected="subjectOverviewMode === 'summary'"
              @click="subjectOverviewMode = 'summary'"
            >
              <text>精炼总结</text>
            </view>
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: subjectOverviewMode === 'outline' }"
              role="tab"
              :aria-selected="subjectOverviewMode === 'outline'"
              @click="subjectOverviewMode = 'outline'"
            >
              <text>结构大纲</text>
            </view>
          </view>

          <button
            v-if="activeOverviewCopyText"
            type="button"
            class="status-icon-btn"
            title="复制当前内容"
            aria-label="复制当前内容"
            @click="copyActiveOverview"
          >
            <LineIcon
              :name="copiedOverview ? 'check' : 'copy'"
              size="14px"
              :color="copiedOverview ? 'var(--color-sage-ink)' : 'var(--text-secondary)'"
            />
          </button>

          <button
            type="button"
            class="status-icon-btn"
            title="刷新学科总览"
            aria-label="刷新学科总览"
            @click="emit('refresh-subject-overview')"
          >
            <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
          </button>
        </template>

        <template v-else-if="centerView === 'preview' && selectedSource">
          <view class="ui-segmented compact-seg" role="tablist" aria-label="文件视图模式">
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: fileReaderMode === 'document' }"
              role="tab"
              :aria-selected="fileReaderMode === 'document'"
              @click="setFileReaderMode('document')"
            >
              <text>原文</text>
            </view>
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: fileReaderMode === 'summary' }"
              role="tab"
              :aria-selected="fileReaderMode === 'summary'"
              @click="setFileReaderMode('summary')"
            >
              <text>总结</text>
            </view>
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: fileReaderMode === 'outline' }"
              role="tab"
              :aria-selected="fileReaderMode === 'outline'"
              @click="setFileReaderMode('outline')"
            >
              <text>大纲</text>
            </view>
          </view>

          <template v-if="fileReaderMode === 'document' && (hasPreviewSource || (previewLoading && showCorePreviewControls))">
            <!-- #ifdef H5 -->
            <view v-if="showCorePreviewControls" class="preview-controls-bar" aria-label="文档预览控制">
              <view class="preview-control-group">
                <button
                  type="button"
                  class="preview-ctrl-btn"
                  :disabled="!viewerReady || !zoomState.canZoomOut"
                  aria-label="缩小"
                  title="缩小"
                  @click="docViewerRef?.zoomOut()"
                >−</button>
                <text class="preview-ctrl-value num-tabular">{{ zoomState.label }}</text>
                <button
                  type="button"
                  class="preview-ctrl-btn"
                  :disabled="!viewerReady || !zoomState.canZoomIn"
                  aria-label="放大"
                  title="放大"
                  @click="docViewerRef?.zoomIn()"
                >＋</button>
                <button
                  type="button"
                  class="preview-ctrl-btn preview-ctrl-reset"
                  :disabled="!viewerReady || !zoomState.canReset"
                  aria-label="重置缩放"
                  @click="docViewerRef?.resetZoom()"
                >重置</button>
              </view>

              <view class="preview-control-group">
                <button
                  type="button"
                  class="preview-ctrl-btn"
                  :disabled="!viewerReady"
                  aria-label="向左旋转"
                  title="向左旋转"
                  @click="docViewerRef?.rotateLeft()"
                >
                  <LineIcon name="rotate" size="13px" color="currentColor" />
                </button>
                <text class="preview-ctrl-value preview-ctrl-deg num-tabular">{{ previewRotation }}°</text>
                <button
                  type="button"
                  class="preview-ctrl-btn"
                  :disabled="!viewerReady"
                  aria-label="向右旋转"
                  title="向右旋转"
                  @click="docViewerRef?.rotateRight()"
                >
                  <LineIcon name="rotate-cw" size="13px" color="currentColor" />
                </button>
              </view>
            </view>
            <!-- #endif -->

            <view class="preview-utility-actions">
              <button
                type="button"
                class="status-icon-btn"
                :disabled="!hasPreviewSource"
                title="新窗口打开"
                aria-label="新窗口打开"
                @click="openActiveDocument"
              >
                <LineIcon name="external-link" size="14px" color="var(--text-secondary)" />
              </button>
              <button
                type="button"
                class="status-icon-btn"
                :disabled="!previewUrl"
                title="复制链接"
                aria-label="复制链接"
                @click="previewUrl && copyLink(previewUrl, '已复制链接')"
              >
                <LineIcon name="copy" size="14px" color="var(--text-secondary)" />
              </button>
            </view>
          </template>

          <view v-else-if="fileReaderMode !== 'document'" class="preview-utility-actions">
            <button
              v-if="activeOverviewCopyText"
              type="button"
              class="status-icon-btn"
              title="复制当前内容"
              aria-label="复制当前内容"
              @click="copyActiveOverview"
            >
              <LineIcon
                :name="copiedOverview ? 'check' : 'copy'"
                size="14px"
                :color="copiedOverview ? 'var(--color-sage-ink)' : 'var(--text-secondary)'"
              />
            </button>
            <button
              type="button"
              class="status-icon-btn"
              title="刷新文件总览"
              aria-label="刷新文件总览"
              @click="emit('refresh-file-overview', selectedSource)"
            >
              <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
            </button>
          </view>
        </template>
        <text v-else-if="centerView === 'preview'" class="status-caption">文件预览</text>
      </view>
    </header>

    <!-- 主内容体 -->
    <view class="center-body">
      <view
        class="edge-collapse-btn"
        role="button"
        :aria-label="tier2Open ? '收起左侧面板' : '展开左侧面板'"
        @click="emit('toggle-tier2')"
      >
        <LineIcon
          :name="tier2Open ? 'chevron-left' : 'chevron-right'"
          size="13px"
          color="var(--text-secondary)"
        />
      </view>

      <!-- 1. 文件预览 / 总结 / 大纲一体阅读 -->
      <view v-if="centerView === 'preview' && selectedSource" class="preview-stage">
        <template v-if="fileReaderMode === 'document'">
          <view v-if="selectedSource.ingestionStatus === 'FAILED'" class="processing-alert-banner">
            <view class="processing-alert-left">
              <text class="processing-alert-badge">解析失败</text>
              <text class="processing-alert-msg">{{ selectedSource.safeErrorDetail || '解析未完成，建议重新上传' }}</text>
            </view>
          </view>

          <view v-else-if="selectedSource.ingestionStatus !== 'READY'" class="processing-info-banner">
            <LineIcon name="info" size="14px" color="var(--color-sage-ink)" />
            <text class="processing-info-text">
              {{
                selectedSource.ingestionStatus === 'PARSING' || selectedSource.ingestionStatus === 'INDEXING'
                  ? '正在解析并构建索引，索引完成后即可读取结构大纲'
                  : '等待 PC 端完成解析索引'
              }}
            </text>
          </view>
        </template>

        <view v-show="fileReaderMode === 'document'" class="document-preview-pane">
          <view v-if="previewLoading" class="reader-loading-stage" role="status">
            <view class="reader-sheet-placeholder zen-card" aria-hidden="true">
              <view class="reader-sheet-kicker"></view>
              <view class="reader-sheet-title"></view>
              <view class="reader-sheet-block"></view>
              <view class="reader-sheet-line"></view>
              <view class="reader-sheet-line is-short"></view>
            </view>
            <view class="reader-status-pill zen-card">
              <view class="reader-spinner" aria-hidden="true"></view>
              <text class="reader-status-title">正在准备文档预览…</text>
              <text class="reader-status-sub">{{ selectedSource.title || previewOriginalName || '加载文档中' }}</text>
            </view>
          </view>

          <view v-else-if="previewError" class="empty-state">
            <text class="state-title is-error">{{ previewError }}</text>
            <button class="ui-btn ui-btn-secondary sm" @click="emit('retry-preview')">重试</button>
          </view>

          <view v-else-if="!selectedSource.assetId" class="empty-state">
            <view class="doc-meta-card zen-card">
              <view class="doc-icon-circle">
                <LineIcon name="file-text" size="22px" color="var(--color-sage-ink)" />
              </view>
              <text class="doc-name">{{ selectedSource.title || '文本资料' }}</text>
              <text class="doc-meta">{{ selectedSource.type }}</text>
            </view>
          </view>

          <scroll-view
            v-else-if="previewUrl && isImageMedia(previewMimeType, previewMediaName)"
            scroll-y
            :show-scrollbar="false"
            class="preview-scroll"
          >
            <view class="image-preview-frame zen-card">
              <image
                :src="previewUrl"
                mode="widthFix"
                class="preview-image"
                @click="previewImageUrl(previewUrl)"
              />
              <view class="preview-footer">
                <text class="doc-meta">{{ selectedSource.title || previewOriginalName }}</text>
                <button class="ui-btn ui-btn-secondary sm" @click="previewImageUrl(previewUrl)">全屏</button>
              </view>
            </view>
          </scroll-view>

          <!-- #ifdef H5 -->
          <WorkspaceDocumentViewer
            v-else-if="hasPreviewSource && isCoreFileViewerKind(activePreviewKind)"
            ref="docViewerRef"
            :url="previewUrl"
            :asset-id="previewAssetId || selectedSource.assetId || ''"
            :cached-buffer="previewBuffer || null"
            :file-name="previewCoreFileName"
            :mime-type="previewMimeType"
            :preview-kind="activePreviewKind"
            :source-key="`${selectedSource.id}:${previewAssetId || ''}:${previewUrl || 'cached'}`"
            @ready-change="viewerReady = $event"
            @zoom-change="zoomState = $event"
            @rotation-change="previewRotation = $event"
            @page-change="handleViewerPageChange"
            @open-external="openActiveDocument"
            @retry-source="emit('retry-preview')"
          />
          <!-- #endif -->

          <view v-else-if="previewUrl" class="empty-state">
            <view class="doc-meta-card zen-card">
              <view class="doc-icon-circle">
                <LineIcon name="file-text" size="22px" color="var(--color-sage-ink)" />
              </view>
              <text class="doc-name">{{ selectedSource.title || previewOriginalName }}</text>
              <text class="doc-meta num-tabular">
                {{ formatPreviewFileType(previewMediaName, previewMimeType) }}
                {{ formatBytes(selectedSource.assetSizeBytes) ? ` · ${formatBytes(selectedSource.assetSizeBytes)}` : '' }}
              </text>
              <view class="quick-actions-row">
                <button class="ui-btn ui-btn-primary sm" @click="openDocument(previewUrl)">打开原文件</button>
                <button class="ui-btn ui-btn-secondary sm" @click="copyLink(previewUrl, '已复制链接')">复制链接</button>
                <button v-if="tabletHandwritingNotesEnabled" class="ui-btn ui-btn-secondary sm" @click="openHandwritingNotebook">手写笔记</button>
              </view>
            </view>
          </view>

          <view v-else class="empty-state">
            <text class="state-title">暂无预览</text>
            <button class="ui-btn ui-btn-secondary sm" @click="emit('retry-preview')">获取预览</button>
          </view>
        </view>

        <WorkspaceOverviewPane
          v-if="fileReaderMode !== 'document'"
          kind="file"
          :mode="fileReaderMode"
          :title="selectedSource.title || '未命名资料'"
          :sources-count="sourcesCount"
          :source="selectedSource"
          :overview="activeFileOverview"
          :loading="activeFileOverviewLoading"
          :error="activeFileOverviewError"
          @refresh="emit('refresh-file-overview', selectedSource)"
          @switch-mode="setFileReaderMode($event)"
          @open-document="setFileReaderMode('document')"
        />

        <!-- #ifdef H5 -->
        <view
          v-if="fileReaderMode === 'document' && isCoreDocPreview && viewerReady && previewPageCount > 1"
          class="floating-page-pill"
          role="navigation"
          aria-label="文档翻页"
        >
          <view
            class="floating-page-btn"
            :class="{ 'is-disabled': previewPage <= 1 }"
            role="button"
            aria-label="上一页"
            @click="previewPage > 1 && docViewerRef?.prevPage()"
          >
            <LineIcon name="chevron-left" size="14px" color="currentColor" />
          </view>
          <text class="floating-page-text num-tabular">{{ previewPage }} / {{ previewPageCount }}</text>
          <view
            class="floating-page-btn"
            :class="{ 'is-disabled': previewPage >= previewPageCount }"
            role="button"
            aria-label="下一页"
            @click="previewPage < previewPageCount && docViewerRef?.nextPage()"
          >
            <LineIcon name="chevron-right" size="14px" color="currentColor" />
          </view>
        </view>
        <!-- #endif -->
      </view>

      <!-- 2. 学科总览全幅阅读 -->
      <WorkspaceOverviewPane
        v-else-if="centerView === 'subject-overview'"
        kind="subject"
        :mode="subjectOverviewMode"
        :title="subjectName || '当前学科'"
        :sources-count="sourcesCount"
        :overview="subjectOverview"
        :loading="subjectOverviewLoading"
        :error="subjectOverviewError"
        @refresh="emit('refresh-subject-overview')"
        @switch-mode="subjectOverviewMode = $event"
      />

      <!-- 3. 知识库网格视图 -->
      <view v-else-if="centerView === 'blocks'" class="blocks-workspace">
        <view class="blocks-top-bar">
          <view class="blocks-search-wrap">
            <LineIcon name="search" size="14px" color="var(--text-muted)" />
            <input
              v-model="blockSearch"
              class="blocks-search-input"
              placeholder="搜索知识块…"
            />
            <view
              v-if="blockSearch"
              class="search-clear-btn"
              role="button"
              aria-label="清空搜索"
              @click="blockSearch = ''"
            >
              <LineIcon name="close" size="12px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="blocks-bar-actions">
            <text class="blocks-count-badge num-tabular">{{ filteredBlocks.length }} 个知识块</text>
            <button class="blocks-add-btn" @click="emit('create-block')">
              <LineIcon name="plus" size="14px" color="#FFFFFF" />
              <text>新建知识块</text>
            </button>
          </view>
        </view>

        <scroll-view v-if="filteredBlocks.length > 0" scroll-y :show-scrollbar="false" class="blocks-grid-scroll">
          <view class="blocks-grid">
            <view
              v-for="block in filteredBlocks"
              :key="block.id"
              class="block-card"
              role="button"
              :aria-label="`查看知识块 ${block.title}`"
              @click="emit('view-block', block)"
            >
              <view class="block-card-header">
                <view class="block-title-row">
                  <LineIcon name="file-text" size="14px" color="var(--color-sage-ink)" />
                  <text class="block-card-title">{{ block.title || '未命名知识块' }}</text>
                </view>
                <view class="block-card-actions" @click.stop>
                  <view
                    class="card-action-btn"
                    :class="{ 'is-copied': copiedBlockId === block.id }"
                    role="button"
                    aria-label="复制知识块"
                    @click.stop="copyBlockCard(block)"
                  >
                    <LineIcon
                      :name="copiedBlockId === block.id ? 'check' : 'copy'"
                      size="12px"
                      :color="copiedBlockId === block.id ? 'var(--color-sage-ink)' : 'var(--text-secondary)'"
                    />
                  </view>
                  <view
                    class="card-action-btn is-danger"
                    role="button"
                    aria-label="删除知识块"
                    @click.stop="emit('delete-block', block)"
                  >
                    <LineIcon name="trash" size="12px" color="var(--text-secondary)" />
                  </view>
                </view>
              </view>

              <view class="block-card-body">
                <text class="block-excerpt" :class="{ 'is-empty': !block.preview }">
                  {{ plainExcerpt(block.preview) || '暂无正文内容' }}
                </text>
              </view>

              <view class="block-card-footer">
                <text class="block-footer-source">{{ block.source || '自主整理' }}</text>
                <text class="block-footer-time num-tabular">{{ formatShortDateTime(block.time) }}</text>
              </view>
            </view>
          </view>
        </scroll-view>

        <view v-else-if="blockSearch.trim()" class="empty-state">
          <text class="state-title">无匹配知识块</text>
          <button class="ui-btn ui-btn-secondary sm" @click="blockSearch = ''">清空搜索</button>
        </view>

        <view v-else class="blocks-onboarding">
          <view class="onboarding-halo">
            <LineIcon name="layers" size="28px" color="var(--color-sage-ink)" />
          </view>
          <text class="onboarding-heading">本学科暂无知识块</text>
          <text class="onboarding-desc">手动提炼关键概念，或先浏览学习资料沉淀知识点</text>
          <view class="onboarding-cards">
            <view class="onboarding-card zen-card" role="button" @click="emit('create-block')">
              <view class="onboarding-card-icon">
                <LineIcon name="plus" size="20px" color="var(--color-sage-ink)" />
              </view>
              <text class="onboarding-card-title">手动创建知识块</text>
              <text class="onboarding-card-hint">记录核心概念、公式与记忆卡片</text>
            </view>
            <view class="onboarding-card zen-card" role="button" @click="emit('open-files-drawer')">
              <view class="onboarding-card-icon">
                <LineIcon name="file-text" size="20px" color="var(--color-sage-ink)" />
              </view>
              <text class="onboarding-card-title">查看学习资料</text>
              <text class="onboarding-card-hint">从课件与文档中整理学习要点</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 4. 学科复习 -->
      <WorkspaceReviewPane
        v-else-if="centerView === 'review'"
        :subject-id="subjectId"
        :subject-name="subjectName"
        :subject-blocks="subjectBlocks"
      />

      <!-- 5. 学科统计 -->
      <WorkspaceStatsPane
        v-else-if="centerView === 'stats'"
        :subject-id="subjectId"
        :subject-name="subjectName"
        :source-count="sourcesCount"
        @open-review="emit('open-review')"
      />

      <!-- 6. 初始化过渡 / 默认学科欢迎引导 -->
      <view v-else-if="initializing" class="reader-loading-stage" role="status">
        <view class="reader-sheet-placeholder zen-card" aria-hidden="true">
          <view class="reader-sheet-kicker"></view>
          <view class="reader-sheet-title"></view>
          <view class="reader-sheet-block"></view>
          <view class="reader-sheet-line"></view>
          <view class="reader-sheet-line is-short"></view>
        </view>
        <view class="reader-status-pill zen-card">
          <view class="reader-spinner" aria-hidden="true"></view>
          <text class="reader-status-title">正在进入学科工作区…</text>
          <text class="reader-status-sub">{{ subjectName || '加载学习资料中' }}</text>
        </view>
      </view>

      <view v-else class="workspace-onboarding">
        <view class="onboarding-halo is-large">
          <LineIcon :name="`subj-${safeIcon}`" size="34px" color="var(--color-sage-ink)" />
        </view>
        <text class="onboarding-welcome">欢迎来到「{{ subjectName || '学科工作区' }}」</text>
        <text class="onboarding-subtitle">
          {{ subjectDescription || '上传学习资料、梳理结构总览、整理知识块或随时召唤 AI 伴读' }}
        </text>
        <view class="onboarding-upload-capsule" role="button" @click="emit('upload')">
          <LineIcon name="upload" size="16px" color="var(--color-sage-ink)" />
          <text>点击上传学习资料</text>
        </view>
      </view>
    </view>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import WorkspaceOverviewPane from '@/components/tablet/workspace/WorkspaceOverviewPane.vue'
import WorkspaceReviewPane from '@/components/tablet/workspace/WorkspaceReviewPane.vue'
import WorkspaceStatsPane from '@/components/tablet/workspace/WorkspaceStatsPane.vue'
// #ifdef H5
import WorkspaceDocumentViewer from '@/components/tablet/workspace/WorkspaceDocumentViewer.vue'
// #endif
import type { DocViewerZoomPayload } from '@/components/tablet/workspace/WorkspaceDocumentViewer.vue'
import type { OverviewResultView } from '@/api/overviewApi'
import type { SourceView } from '@/api/sourceApi'
import { tabletHandwritingNotesEnabled } from '@/config/features'
import type { KnowledgeBlock } from '@/store/useBlockStore'
import { plainMarkdownExcerpt } from '@/utils/markdown'
import { copyTextWithFallback } from '@/utils/mobileLearning'
import {
  formatBytes,
  formatShortDateTime,
  getSourceStatusMeta,
  isImageMedia,
  isPdfMedia,
} from '@/utils/sourceFormat'
import { isSubjectIconKey } from '@/utils/subjectIcon'
import {
  buildPreviewFileName,
  isCoreFileViewerKind,
  resolveTabletPreviewKind,
} from '@/utils/tabletFilePreview'

export type WorkspaceCenterView = 'onboarding' | 'preview' | 'subject-overview' | 'blocks' | 'review' | 'stats'

const props = defineProps<{
  centerView: WorkspaceCenterView
  tier2Open: boolean
  initializing?: boolean
  subjectId: string
  subjectName: string
  subjectIcon?: string
  subjectDescription?: string
  selectedSource: SourceView | null
  sourcesCount: number
  previewUrl: string
  previewBuffer?: ArrayBuffer | null
  previewAssetId?: string
  previewMimeType: string
  previewOriginalName: string
  previewLoading: boolean
  previewError: string
  subjectOverview: OverviewResultView | null
  subjectOverviewLoading: boolean
  subjectOverviewError: string
  fileOverviews: Record<string, OverviewResultView | null>
  fileOverviewLoading: Record<string, boolean>
  fileOverviewErrors: Record<string, string>
  subjectBlocks: KnowledgeBlock[]
}>()

const emit = defineEmits<{
  (event: 'toggle-tier2'): void
  (event: 'upload'): void
  (event: 'retry-preview'): void
  (event: 'refresh-subject-overview'): void
  (event: 'refresh-file-overview', source: SourceView): void
  (event: 'ensure-file-overview', source: SourceView): void
  (event: 'view-block', block: KnowledgeBlock): void
  (event: 'create-block'): void
  (event: 'delete-block', block: KnowledgeBlock): void
  (event: 'open-files-drawer'): void
  (event: 'open-review'): void
}>()

const safeIcon = computed(() => (props.subjectIcon && isSubjectIconKey(props.subjectIcon) ? props.subjectIcon : 'book'))
const fileReaderMode = ref<'document' | 'summary' | 'outline'>('document')
const subjectOverviewMode = ref<'summary' | 'outline'>('summary')
const copiedOverview = ref(false)
let copiedOverviewTimer: ReturnType<typeof setTimeout> | null = null

const activeFileOverview = computed(() => {
  const id = props.selectedSource?.id
  return id ? (props.fileOverviews[id] ?? null) : null
})

const activeFileOverviewLoading = computed(() => {
  const id = props.selectedSource?.id
  return id ? Boolean(props.fileOverviewLoading[id]) : false
})

const activeFileOverviewError = computed(() => {
  const id = props.selectedSource?.id
  return id ? (props.fileOverviewErrors[id] || '') : ''
})

const activeOverviewCopyText = computed(() => {
  if (props.centerView === 'subject-overview') {
    const overview = props.subjectOverview
    if (!overview) return ''
    return subjectOverviewMode.value === 'summary'
      ? (overview.summaryMarkdown || '')
      : (overview.outlineMarkdown || '')
  }
  if (props.centerView === 'preview' && fileReaderMode.value !== 'document') {
    const overview = activeFileOverview.value
    if (!overview) return ''
    return fileReaderMode.value === 'summary'
      ? (overview.summaryMarkdown || '')
      : (overview.outlineMarkdown || '')
  }
  return ''
})

function setFileReaderMode(mode: 'document' | 'summary' | 'outline') {
  fileReaderMode.value = mode
  if (mode !== 'document' && props.selectedSource) {
    emit('ensure-file-overview', props.selectedSource)
  }
}

async function copyActiveOverview() {
  if (!activeOverviewCopyText.value) return
  const ok = await copyTextWithFallback(activeOverviewCopyText.value)
  if (!ok) {
    uni.showToast({ title: '复制失败，请手动复制', icon: 'none' })
    return
  }
  copiedOverview.value = true
  uni.showToast({ title: '已复制', icon: 'none' })
  if (copiedOverviewTimer) clearTimeout(copiedOverviewTimer)
  copiedOverviewTimer = setTimeout(() => {
    copiedOverview.value = false
    copiedOverviewTimer = null
  }, 1500)
}

watch(
  () => props.centerView,
  (next, prev) => {
    if (prev === 'subject-overview' && next === 'preview') {
      fileReaderMode.value = 'document'
    }
  },
)

watch(
  () => [
    props.selectedSource?.id,
    props.selectedSource?.ingestionStatus,
    props.selectedSource?.ingestionRevision,
  ],
  () => {
    if (props.centerView === 'preview' && fileReaderMode.value !== 'document' && props.selectedSource) {
      emit('ensure-file-overview', props.selectedSource)
    }
  },
)

interface DocViewerHandle {
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  rotateLeft: () => void
  rotateRight: () => void
  prevPage: () => void
  nextPage: () => void
}

const DEFAULT_VIEWER_ZOOM: DocViewerZoomPayload = {
  scale: 1,
  label: '100%',
  canZoomIn: true,
  canZoomOut: true,
  canReset: false,
}

const docViewerRef = ref<DocViewerHandle | null>(null)
const viewerReady = ref(false)
const zoomState = ref<DocViewerZoomPayload>({ ...DEFAULT_VIEWER_ZOOM })
const previewRotation = ref(0)
const previewPage = ref(1)
const previewPageCount = ref(1)

const previewMediaName = computed(() => (
  buildPreviewFileName(props.previewOriginalName, props.selectedSource?.title || '', props.previewMimeType)
))

const activePreviewKind = computed(() => (
  resolveTabletPreviewKind(previewMediaName.value, props.previewMimeType)
))

const hasPreviewSource = computed(() => Boolean(props.previewUrl || props.previewBuffer))

const isCoreDocPreview = computed(() => {
  let enabled = false
  // #ifdef H5
  enabled = (
    hasPreviewSource.value
    && !isImageMedia(props.previewMimeType, previewMediaName.value)
    && isCoreFileViewerKind(activePreviewKind.value)
  )
  // #endif
  return enabled
})

const showCorePreviewControls = computed(() => {
  let enabled = false
  // #ifdef H5
  enabled = (
    Boolean(props.selectedSource?.assetId)
    && !isImageMedia(props.previewMimeType, previewMediaName.value)
    && isCoreFileViewerKind(activePreviewKind.value)
  )
  // #endif
  return enabled
})

const previewCoreFileName = computed(() => (
  buildPreviewFileName(props.previewOriginalName, props.selectedSource?.title || '', props.previewMimeType)
))

function handleViewerPageChange(page: number, pageCount: number) {
  previewPage.value = page
  previewPageCount.value = pageCount
}

watch(
  () => [props.selectedSource?.id, props.previewUrl, props.previewBuffer],
  () => {
    viewerReady.value = false
    zoomState.value = { ...DEFAULT_VIEWER_ZOOM }
    previewRotation.value = 0
    previewPage.value = 1
    previewPageCount.value = 1
  },
)

function formatPreviewFileType(name: string, mime: string): string {
  if (isPdfMedia(mime, name)) return 'PDF'
  const extMatch = name.toLowerCase().match(/\.([a-z0-9]{2,6})$/)
  if (extMatch) return extMatch[1].toUpperCase()
  const lowerMime = mime.toLowerCase()
  if (lowerMime.includes('wordprocessingml')) return 'DOCX'
  if (lowerMime.includes('presentationml')) return 'PPTX'
  if (lowerMime.includes('spreadsheetml')) return 'XLSX'
  return '文档'
}

const blockSearch = ref('')
const filteredBlocks = computed(() => {
  const kw = blockSearch.value.trim().toLowerCase()
  if (!kw) return props.subjectBlocks
  return props.subjectBlocks.filter(b => (
    b.title.toLowerCase().includes(kw)
    || b.preview.toLowerCase().includes(kw)
    || (b.source || '').toLowerCase().includes(kw)
  ))
})

function plainExcerpt(raw: string): string {
  return plainMarkdownExcerpt(raw)
}

const copiedBlockId = ref('')
let copiedResetTimer: ReturnType<typeof setTimeout> | null = null

async function copyLink(text: string, toastTitle: string) {
  const ok = await copyTextWithFallback(text)
  uni.showToast({ title: ok ? toastTitle : '复制失败，请手动复制', icon: 'none' })
}

async function copyBlockCard(block: KnowledgeBlock) {
  const content = block.preview?.trim()
    ? `${block.title}\n\n${block.preview}`
    : block.title
  const ok = await copyTextWithFallback(content)
  if (!ok) {
    uni.showToast({ title: '复制失败，请手动复制', icon: 'none' })
    return
  }
  copiedBlockId.value = block.id
  if (copiedResetTimer) clearTimeout(copiedResetTimer)
  copiedResetTimer = setTimeout(() => {
    copiedBlockId.value = ''
    copiedResetTimer = null
  }, 1500)
}

function previewImageUrl(url: string) {
  uni.previewImage({ urls: [url], current: url })
}

function openActiveDocument() {
  if (props.previewUrl) {
    openDocument(props.previewUrl)
    return
  }
  // #ifdef H5
  if (props.previewBuffer && typeof window !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([props.previewBuffer.slice(0)], {
      type: props.previewMimeType || 'application/octet-stream',
    })
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }
  // #endif
}

function openDocument(url: string) {
  // #ifdef H5
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener')
    return
  }
  // #endif
  uni.downloadFile({
    url,
    success: (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
        uni.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => { void copyLink(url, '已复制链接') },
        })
        return
      }
      void copyLink(url, '已复制链接')
    },
    fail: () => { void copyLink(url, '已复制链接') },
  })
}

function openHandwritingNotebook() {
  uni.navigateTo({ url: '/pages/tablet/handwriting/index' })
}

onBeforeUnmount(() => {
  if (copiedResetTimer) {
    clearTimeout(copiedResetTimer)
    copiedResetTimer = null
  }
  if (copiedOverviewTimer) {
    clearTimeout(copiedOverviewTimer)
    copiedOverviewTimer = null
  }
})
</script>

<style scoped>
.center-card {
  flex: 1;
  min-width: 0;
  height: 100%;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.center-status-bar {
  min-height: 48px;
  padding: 6px 20px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
  box-sizing: border-box;
}

.compact-seg {
  padding: 3px;
  border-radius: var(--radius-full);
}

.compact-seg-item {
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
}

.status-left {
  flex: 1;
  min-width: 0;
}

.status-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.status-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.preview-controls-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-control-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--glass-sub-bg);
  border: 1px solid var(--border-subtle);
}

.preview-ctrl-btn {
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.preview-ctrl-btn::after {
  border: none;
}

.preview-ctrl-btn:hover:not(:disabled) {
  background: rgba(139, 154, 110, 0.12);
  color: var(--text-primary);
}

.preview-ctrl-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.preview-ctrl-reset {
  padding: 0 7px;
  font-size: 11px;
}

.preview-ctrl-value {
  min-width: 38px;
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-ctrl-deg {
  min-width: 28px;
}

.preview-utility-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--glass-sub-bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}

.status-icon-btn::after {
  border: none;
}

.status-icon-btn:hover:not(:disabled) {
  border-color: var(--border-accent);
  background: var(--color-bg-tertiary);
}

.status-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.status-caption {
  font-size: 12px;
  color: var(--text-muted);
}

.center-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.edge-collapse-btn {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 40px;
  border-radius: 8px;
  background: var(--glass-surface-strong);
  border: 1px solid var(--border-default);
  box-shadow: var(--glass-shadow-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.72;
  cursor: pointer;
  z-index: 12;
  transition: opacity 0.16s ease, border-color 0.16s ease;
}

.edge-collapse-btn:hover {
  opacity: 1;
  border-color: var(--border-accent);
}

.preview-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.document-preview-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.processing-alert-banner,
.processing-info-banner {
  margin: 12px 18px 0;
  padding: 9px 14px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.processing-alert-banner {
  background: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.24);
}

.processing-alert-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.processing-alert-badge {
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(201, 59, 59, 0.16);
  color: var(--color-danger);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.processing-alert-msg {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.processing-info-banner {
  background: var(--color-sage-bg);
  border: 1px solid var(--border-accent);
}

.processing-info-text {
  font-size: var(--text-xs);
  color: var(--color-sage-ink);
}

.reader-loading-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  background: var(--color-bg-primary, #F7F2EB);
  box-sizing: border-box;
}

.reader-sheet-placeholder {
  width: 100%;
  max-width: 560px;
  height: min(460px, 78%);
  padding: 36px 40px;
  border-radius: 16px;
  background: rgba(255, 253, 249, 0.88);
  border: 1px solid var(--border-subtle, rgba(45, 55, 40, 0.08));
  box-shadow: 0 12px 32px rgba(45, 55, 40, 0.06);
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

.reader-sheet-kicker,
.reader-sheet-title,
.reader-sheet-block,
.reader-sheet-line {
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(139, 154, 110, 0.08) 0%,
    rgba(139, 154, 110, 0.16) 50%,
    rgba(139, 154, 110, 0.08) 100%
  );
  background-size: 200% 100%;
  animation: readerSheetShimmer 1.8s ease-in-out infinite;
}

.reader-sheet-kicker {
  width: 34%;
  height: 12px;
  margin: 0 auto;
}

.reader-sheet-title {
  width: 56%;
  height: 24px;
  margin: 4px auto 8px;
}

.reader-sheet-block {
  width: 100%;
  flex: 1;
  min-height: 140px;
  border-radius: 12px;
}

.reader-sheet-line {
  width: 82%;
  height: 14px;
}

.reader-sheet-line.is-short {
  width: 58%;
}

@keyframes readerSheetShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.reader-status-pill {
  position: absolute;
  width: min(320px, calc(100% - 48px));
  padding: 20px 22px;
  border-radius: 16px;
  background: var(--glass-surface-strong, rgba(252, 249, 244, 0.94));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 12px 32px rgba(45, 55, 40, 0.1), 0 2px 6px rgba(45, 55, 40, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  box-sizing: border-box;
}

.reader-spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2.5px solid rgba(139, 154, 110, 0.24);
  border-top-color: var(--color-zen-sage, #8B9A6E);
  animation: readerSpin 0.8s linear infinite;
}

@keyframes readerSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.reader-status-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.reader-status-sub {
  max-width: 100%;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  padding: 20px 28px 84px;
  box-sizing: border-box;
}

.image-preview-frame {
  max-width: 840px;
  margin: 0 auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-image {
  width: 100%;
  border-radius: 10px;
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.floating-page-pill {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 15;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: var(--radius-full);
  background: rgba(250, 247, 242, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 24px rgba(45, 55, 40, 0.1), 0 1px 3px rgba(45, 55, 40, 0.05);
}

.floating-page-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color 0.14s ease, transform 0.12s ease;
}

.floating-page-btn:hover:not(.is-disabled) {
  background: rgba(139, 154, 110, 0.14);
}

.floating-page-btn:active:not(.is-disabled) {
  transform: scale(0.92);
}

.floating-page-btn.is-disabled {
  opacity: 0.3;
  pointer-events: none;
}

.floating-page-text {
  min-width: 56px;
  padding: 0 4px;
  text-align: center;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.doc-meta-card {
  width: 100%;
  max-width: 440px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.doc-icon-circle {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.doc-name {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-primary);
}

.doc-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.quick-actions-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.blocks-workspace {
  flex: 1;
  min-height: 0;
  padding: 20px 26px 0 34px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.blocks-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.blocks-search-wrap {
  flex: 1;
  min-width: 210px;
  max-width: 340px;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  gap: 8px;
}

.blocks-search-input {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.search-clear-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.blocks-bar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.blocks-count-badge {
  padding: 4px 11px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
  border: 1px solid rgba(139, 154, 110, 0.24);
  color: var(--color-sage-ink);
  font-size: 11.5px;
  font-weight: 600;
}

.blocks-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 15px;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: 12.5px;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(118, 135, 88, 0.28);
  cursor: pointer;
}

.blocks-grid-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.blocks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  padding: 2px 2px 84px;
  align-content: start;
}

.block-card {
  height: 184px;
  padding: 15px 16px 13px;
  border-radius: 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  cursor: pointer;
  transition: transform 0.18s var(--ease-out), border-color 0.18s ease, box-shadow 0.18s ease;
}

.block-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-accent);
  box-shadow: 0 8px 20px -4px rgba(45, 55, 40, 0.08);
}

.block-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.block-title-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.block-card-title {
  flex: 1;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-action-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(45, 55, 40, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.card-action-btn.is-copied {
  background: var(--color-sage-bg);
}

.card-action-btn.is-danger:hover {
  background: var(--color-danger-bg);
}

.block-card-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  margin-bottom: 8px;
}

.block-excerpt {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.58;
  color: var(--text-secondary);
}

.block-excerpt.is-empty {
  color: var(--text-muted);
}

.block-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.block-footer-source,
.block-footer-time {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blocks-onboarding,
.workspace-onboarding {
  flex: 1;
  padding: 36px 28px 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}

.onboarding-halo {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.onboarding-halo.is-large {
  width: 72px;
  height: 72px;
  border-radius: 20px;
}

.onboarding-heading,
.onboarding-welcome {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.onboarding-desc,
.onboarding-subtitle {
  font-size: var(--text-sm);
  color: var(--text-muted);
  max-width: 460px;
  line-height: 1.55;
}

.onboarding-cards {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 230px));
  gap: 14px;
}

.onboarding-card {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.onboarding-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.onboarding-card-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.onboarding-card-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.45;
}

.onboarding-upload-capsule {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
  border: 1px dashed var(--border-accent);
  color: var(--color-sage-ink);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.empty-state {
  flex: 1;
  padding: 48px 24px 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}

.state-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.state-title.is-error {
  color: var(--color-danger);
}

@media (max-width: 720px) {
  .blocks-workspace {
    padding: 16px 16px 0 28px;
  }

  .onboarding-cards {
    grid-template-columns: 1fr;
  }
}
</style>
