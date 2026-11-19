<template>
  <view class="center-card zen-panel">
    <view class="center-header">
      <view class="context-heading">
        <text class="context-title">{{ selectedSource ? selectedSource.title || '未命名资料' : subjectName }}</text>
        <text
          v-if="selectedSource && selectedSource.ingestionStatus !== 'READY'"
          class="ui-tag"
          :class="`tone-${getSourceStatusMeta(selectedSource.ingestionStatus).tone}`"
        >{{ getSourceStatusMeta(selectedSource.ingestionStatus).label }}</text>
      </view>

      <view class="header-right">
        <view class="ui-segmented compact-seg" role="tablist">
          <view
            v-for="tab in visibleTabs"
            :key="tab.key"
            class="ui-seg-item compact-seg-item"
            :class="{ active: activeTab === tab.key }"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="emit('update:activeTab', tab.key)"
          >
            <text>{{ tab.label }}</text>
            <text v-if="tab.key === 'blocks'" class="tab-badge num-tabular">{{ subjectBlocks.length }}</text>
          </view>
        </view>

        <view
          class="ai-toggle-btn"
          :class="{ active: aiPanelVisible }"
          role="button"
          :aria-pressed="aiPanelVisible"
          aria-label="切换 AI 伴读"
          @click="emit('toggle-ai-panel')"
        >
          <LineIcon name="sparkles" size="14px" :color="aiPanelVisible ? '#FFFFFF' : 'var(--color-sage-ink)'" />
          <text>AI</text>
        </view>
      </view>
    </view>

    <!-- Tab 1: 资料预览 -->
    <scroll-view v-if="activeTab === 'preview' && selectedSource" scroll-y :show-scrollbar="false" class="tab-body">
      <view class="source-preview-box">
        <view
          v-if="selectedSource.ingestionStatus !== 'READY'"
          class="status-notice"
          :class="`tone-${getSourceStatusMeta(selectedSource.ingestionStatus).tone}`"
        >
          <LineIcon name="info" size="14px" color="currentColor" />
          <text class="notice-text">
            {{
              selectedSource.ingestionStatus === 'FAILED'
                ? (selectedSource.safeErrorDetail || '解析失败，建议重新上传')
                : selectedSource.ingestionStatus === 'PARSING' || selectedSource.ingestionStatus === 'INDEXING'
                  ? '正在解析构建索引'
                  : '等待 PC 端解析'
            }}
          </text>
        </view>

        <view v-if="previewLoading" class="preview-skeletons">
          <view class="preview-skeleton-hero ui-shimmer" />
          <view class="preview-skeleton-line ui-shimmer" />
        </view>

        <view v-else-if="previewError" class="empty-state">
          <text class="state-title error">{{ previewError }}</text>
          <button class="ui-btn ui-btn-secondary sm" @click="emit('retry-preview')">重试</button>
        </view>

        <view v-else-if="!selectedSource.assetId" class="doc-meta-card zen-card">
          <view class="doc-icon-circle">
            <LineIcon name="file-text" size="22px" color="var(--color-sage-ink)" />
          </view>
          <text class="doc-name">{{ selectedSource.title || '文本资料' }}</text>
          <text class="doc-meta">{{ selectedSource.type }}</text>
        </view>

        <view
          v-else-if="previewUrl && isImageMedia(previewMimeType, previewMediaName)"
          class="image-preview-frame zen-card"
        >
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

        <view v-else-if="previewUrl" class="doc-meta-card zen-card">
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
            <button class="ui-btn ui-btn-secondary sm" @click="copyText(previewUrl, '已复制链接')">复制链接</button>
            <button v-if="tabletHandwritingNotesEnabled" class="ui-btn ui-btn-secondary sm" @click="openHandwritingNotebook">手写笔记</button>
          </view>
        </view>

        <view v-else class="empty-state">
          <text class="state-title">暂无预览</text>
          <button class="ui-btn ui-btn-secondary sm" @click="emit('retry-preview')">获取预览</button>
        </view>
      </view>
    </scroll-view>

    <!-- Tab 2: 大纲与总结 -->
    <scroll-view v-else-if="activeTab === 'overview'" scroll-y :show-scrollbar="false" class="overview-scroll">
      <view class="markdown-paper">
        <view class="paper-head">
          <view class="ui-segmented compact-seg" role="tablist">
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: overviewMode === 'outline' }"
              role="tab"
              :aria-selected="overviewMode === 'outline'"
              @click="overviewMode = 'outline'"
            >
              <text>结构大纲</text>
            </view>
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: overviewMode === 'summary' }"
              role="tab"
              :aria-selected="overviewMode === 'summary'"
              @click="overviewMode = 'summary'"
            >
              <text>精炼总结</text>
            </view>
          </view>

          <view class="toolbar-actions">
            <text v-if="overview?.updatedAt" class="meta-timestamp num-tabular">
              {{ formatShortDateTime(overview.updatedAt) }}
            </text>
            <view class="ui-icon-btn sm" role="button" aria-label="刷新" @click="emit('refresh-overview')">
              <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
            </view>
            <view
              v-if="activeOverviewMarkdown"
              class="ui-icon-btn sm"
              role="button"
              aria-label="复制内容"
              @click="copyText(activeOverviewMarkdown, '已复制')"
            >
              <LineIcon name="copy" size="14px" color="var(--text-secondary)" />
            </view>
          </view>
        </view>

        <view v-if="overviewLoading" class="paper-skeletons">
          <view class="paper-skeleton-title ui-shimmer" />
          <view class="paper-skeleton-line ui-shimmer" />
          <view class="paper-skeleton-line mid ui-shimmer" />
          <view class="paper-skeleton-line ui-shimmer" />
        </view>

        <view v-else-if="overviewError" class="empty-state">
          <text class="state-title error">{{ overviewError }}</text>
          <button class="ui-btn ui-btn-secondary sm" @click="emit('refresh-overview')">重试</button>
        </view>

        <view v-else-if="!overview" class="empty-state">
          <text class="state-title">
            {{
              selectedSource && selectedSource.ingestionStatus !== 'READY'
                ? getSourceStatusMeta(selectedSource.ingestionStatus).label
                : '暂无大纲与总结'
            }}
          </text>
        </view>

        <view v-else-if="!activeOverviewMarkdown" class="empty-state">
          <text class="state-title">{{ overviewMode === 'outline' ? '暂无大纲' : '暂无总结' }}</text>
        </view>

        <template v-else>
          <text v-if="overview.title" class="overview-doc-title">{{ overview.title }}</text>
          <MarkdownText :content="activeOverviewMarkdown" />
        </template>
      </view>
    </scroll-view>

    <!-- Tab 3: 知识块 -->
    <view v-else-if="activeTab === 'blocks'" class="blocks-tab">
      <view class="blocks-split">
        <view class="blocks-list-col">
          <view class="blocks-list-head">
            <view class="search-wrap">
              <LineIcon name="search" size="13px" color="var(--text-muted)" />
              <input
                v-model="blockSearch"
                class="search-input"
                placeholder="搜索知识块"
              />
            </view>
            <view class="ui-icon-btn sm add-block-btn" role="button" aria-label="新建知识块" @click="emit('create-block')">
              <LineIcon name="plus" size="15px" color="#FFFFFF" />
            </view>
          </view>

          <view v-if="filteredBlocks.length === 0" class="empty-list-state">
            <text class="state-title">{{ blockSearch.trim() ? '无匹配结果' : '暂无知识块' }}</text>
          </view>

          <scroll-view v-else scroll-y :show-scrollbar="false" class="blocks-list-scroll">
            <view class="blocks-items-wrap">
              <view
                v-for="block in filteredBlocks"
                :key="block.id"
                class="block-list-item"
                :class="{ active: activeBlock?.id === block.id }"
                role="button"
                @click="selectedBlockId = block.id"
              >
                <text class="block-item-title">{{ block.title }}</text>
                <text class="block-item-preview">{{ plainExcerpt(block.preview) }}</text>
                <text class="block-item-meta num-tabular">{{ block.source || '自主整理' }} · {{ formatShortDateTime(block.time) }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <scroll-view scroll-y :show-scrollbar="false" class="block-detail-col">
          <view v-if="activeBlock" class="block-detail-paper">
            <view class="detail-head">
              <view class="detail-title-group">
                <text class="detail-title">{{ activeBlock.title }}</text>
                <text class="detail-meta num-tabular">{{ activeBlock.source || '自主整理' }} · {{ formatShortDateTime(activeBlock.time) }}</text>
              </view>
              <view class="detail-actions">
                <button class="ui-btn ui-btn-secondary sm" @click="emit('edit-block', activeBlock)">编辑</button>
                <button class="ui-btn ui-btn-danger sm" @click="emit('delete-block', activeBlock)">删除</button>
              </view>
            </view>

            <view class="detail-markdown">
              <MarkdownText :content="activeBlock.preview || ''" />
            </view>
          </view>
          <view v-else class="empty-state">
            <text class="state-title">暂无知识块</text>
            <button class="ui-btn ui-btn-primary sm" @click="emit('create-block')">新建知识块</button>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- Tab 4: 复习 -->
    <view v-else class="review-tab">
      <view v-if="reviewLoading && !activeCard" class="paper-skeletons review-skeleton-wrap">
        <view class="review-skeleton-card ui-shimmer" />
      </view>

      <view v-else-if="reviewLoadError" class="empty-state">
        <text class="state-title error">{{ reviewLoadError }}</text>
        <button class="ui-btn ui-btn-secondary sm" @click="loadReview">重试</button>
      </view>

      <view v-else-if="reviewSaveError && !activeCard" class="empty-state">
        <text class="state-title error">{{ reviewSaveError }}</text>
        <button
          class="ui-btn ui-btn-primary sm"
          @click="refreshRequired ? loadReview() : retrySave()"
        >{{ refreshRequired ? '刷新队列' : '重试保存' }}</button>
      </view>

      <view v-else-if="!activeCard" class="empty-state">
        <view class="done-badge">
          <LineIcon name="check" size="22px" color="var(--color-sage-ink)" />
        </view>
        <text class="state-title">{{ reviewEmptyLabel }}</text>
        <button class="ui-btn ui-btn-secondary sm" @click="loadReview">刷新</button>
      </view>

      <view v-else class="review-stage">
        <view class="review-stage-head">
          <text class="review-counter num-tabular">{{ remainingCount }} 待复习 · {{ completedCount }} 完成</text>
          <view class="ui-icon-btn sm" role="button" aria-label="刷新队列" @click="loadReview">
            <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
          </view>
        </view>

        <view class="review-card-box">
          <FlashCard
            v-model:flipped="isFlipped"
            :front="activeCard.title"
            :back="activeCard.preview"
            :subject="activeCard.subject || subjectName"
            :has-next="remainingCount > 1"
          />
        </view>

        <view v-if="reviewSaveError" class="review-save-banner">
          <text>{{ reviewSaveError }}</text>
          <button
            class="ui-btn ui-btn-secondary sm"
            @click="refreshRequired ? loadReview() : retrySave()"
          >{{ refreshRequired ? '刷新' : '重试' }}</button>
        </view>

        <view class="review-controls">
          <template v-if="!isFlipped">
            <button class="ui-btn ui-btn-secondary rate-btn" :disabled="reviewSaving" @click="skipCard">跳过</button>
            <button class="ui-btn ui-btn-primary rate-btn wide" :disabled="reviewSaving" @click="isFlipped = true">显示答案</button>
          </template>
          <template v-else>
            <button class="ui-btn ui-btn-danger rate-btn" :disabled="reviewSaving" @click="rateCard('AGAIN')">再记一次</button>
            <button class="ui-btn ui-btn-primary rate-btn wide" :disabled="reviewSaving" @click="rateCard('GOOD')">已掌握</button>
          </template>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FlashCard from '@/components/FlashCard.vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { reviewApi } from '@/api/reviewApi'
import type { OverviewResultView } from '@/api/overviewApi'
import type { SourceView } from '@/api/sourceApi'
import { useDueReview } from '@/composables/useDueReview'
import { tabletHandwritingNotesEnabled } from '@/config/features'
import type { KnowledgeBlock } from '@/store/useBlockStore'
import { plainMarkdownExcerpt } from '@/utils/markdown'
import {
  formatBytes,
  formatShortDateTime,
  getSourceStatusMeta,
  isImageMedia,
  isPdfMedia,
} from '@/utils/sourceFormat'

export type WorkspaceTabKey = 'preview' | 'overview' | 'blocks' | 'review'

const props = defineProps<{
  subjectId: string
  subjectName: string
  selectedSource: SourceView | null
  activeTab: WorkspaceTabKey
  aiPanelVisible: boolean
  previewUrl: string
  previewMimeType: string
  previewOriginalName: string
  previewLoading: boolean
  previewError: string
  overview: OverviewResultView | null
  overviewLoading: boolean
  overviewError: string
  subjectBlocks: KnowledgeBlock[]
}>()

const emit = defineEmits<{
  (event: 'update:activeTab', tab: WorkspaceTabKey): void
  (event: 'toggle-ai-panel'): void
  (event: 'retry-preview'): void
  (event: 'refresh-overview'): void
  (event: 'create-block'): void
  (event: 'edit-block', block: KnowledgeBlock): void
  (event: 'delete-block', block: KnowledgeBlock): void
}>()

const visibleTabs = computed<Array<{ key: WorkspaceTabKey; label: string }>>(() => (
  props.selectedSource
    ? [
        { key: 'preview', label: '预览' },
        { key: 'overview', label: '大纲' },
        { key: 'blocks', label: '知识块' },
        { key: 'review', label: '复习' },
      ]
    : [
        { key: 'overview', label: '大纲' },
        { key: 'blocks', label: '知识块' },
        { key: 'review', label: '复习' },
      ]
))

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

const previewMediaName = computed(() => {
  const orig = props.previewOriginalName || ''
  if (orig && /\.[a-z0-9]{2,6}$/i.test(orig)) return orig
  return props.selectedSource?.title || orig
})

const overviewMode = ref<'outline' | 'summary'>('outline')
const blockSearch = ref('')
const selectedBlockId = ref<string>('')

const activeOverviewMarkdown = computed(() => {
  if (!props.overview) return ''
  return overviewMode.value === 'outline'
    ? (props.overview.outlineMarkdown || '')
    : (props.overview.summaryMarkdown || '')
})

const filteredBlocks = computed(() => {
  const kw = blockSearch.value.trim().toLowerCase()
  if (!kw) return props.subjectBlocks
  return props.subjectBlocks.filter(b => (
    b.title.toLowerCase().includes(kw)
    || b.preview.toLowerCase().includes(kw)
    || (b.source || '').toLowerCase().includes(kw)
  ))
})

const activeBlock = computed(() => {
  if (filteredBlocks.value.length === 0) return null
  return filteredBlocks.value.find(b => b.id === selectedBlockId.value) || filteredBlocks.value[0]
})

watch(() => props.subjectBlocks, (blocks) => {
  if (blocks.length > 0 && !blocks.some(b => b.id === selectedBlockId.value)) {
    selectedBlockId.value = blocks[0].id
  }
}, { immediate: true })

function plainExcerpt(raw: string): string {
  return plainMarkdownExcerpt(raw)
}

const {
  currentIndex,
  completedCount,
  remainingCount,
  activeCard,
  isFlipped,
  loading: reviewLoading,
  saving: reviewSaving,
  loadError: reviewLoadError,
  saveError: reviewSaveError,
  refreshRequired,
  loadReview,
  retrySave,
  skipCard,
  rateCard,
} = useDueReview(reviewApi, {
  subjectId: () => props.subjectId || undefined,
  enabled: () => props.activeTab === 'review' && Boolean(props.subjectId),
})

const reviewEmptyLabel = computed(() => (
  currentIndex.value > 0 || completedCount.value > 0
    ? '本轮已完成'
    : '暂无待复习'
))

function copyText(text: string, toastTitle: string) {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: toastTitle, icon: 'none' }),
  })
}

function previewImageUrl(url: string) {
  uni.previewImage({ urls: [url], current: url })
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
          fail: () => copyText(url, '已复制链接'),
        })
        return
      }
      copyText(url, '已复制链接')
    },
    fail: () => copyText(url, '已复制链接'),
  })
}

function openHandwritingNotebook() {
  uni.navigateTo({ url: '/pages/tablet/handwriting/index' })
}
</script>

<style scoped>
.center-card {
  flex: 1;
  min-width: 0;
  height: 100%;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.center-header {
  min-height: 54px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
  box-sizing: border-box;
}

.context-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.context-title {
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-tag.tone-ready {
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
}

.ui-tag.tone-parsing {
  background: rgba(200, 155, 109, 0.16);
  color: #9A6B3B;
}

.ui-tag.tone-pending {
  background: var(--bg-primary);
  color: var(--text-muted);
}

.ui-tag.tone-failed {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.compact-seg {
  padding: 3px;
  border-radius: 10px;
}

.compact-seg-item {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 11px;
  font-size: var(--text-xs);
  border-radius: 8px;
  gap: 5px;
  white-space: nowrap;
}

.tab-badge {
  font-size: var(--text-2xs);
  opacity: 0.72;
}

.ai-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.16s var(--ease-out), border-color 0.16s var(--ease-out), color 0.16s var(--ease-out);
}

.ai-toggle-btn:hover {
  border-color: var(--border-accent);
}

.ai-toggle-btn.active {
  background: var(--accent-gradient);
  color: #FFFFFF;
  border-color: transparent;
}

.tab-body {
  flex: 1;
  height: 0;
  min-height: 0;
  padding: 20px 24px;
  box-sizing: border-box;
}

.source-preview-box {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-notice {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: var(--text-xs);
  font-weight: 500;
}

.status-notice.tone-parsing {
  background: rgba(200, 155, 109, 0.14);
  color: #9A6B3B;
}

.status-notice.tone-pending {
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.status-notice.tone-failed {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.preview-skeletons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-skeleton-hero {
  height: 220px;
  border-radius: 14px;
}

.preview-skeleton-line {
  height: 18px;
  width: 48%;
  border-radius: 8px;
}

.image-preview-frame {
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
  gap: 12px;
}

.doc-meta-card {
  max-width: 440px;
  width: 100%;
  margin: 32px auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  box-sizing: border-box;
}

.doc-icon-circle {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.doc-name {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-all;
}

.doc-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.quick-actions-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.overview-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  padding: 20px 28px 28px;
  box-sizing: border-box;
}

.markdown-paper {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.paper-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-timestamp {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-right: 4px;
}

.paper-skeletons {
  width: 100%;
  max-width: 680px;
  margin: 12px auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.review-skeleton-wrap {
  padding: 28px;
  box-sizing: border-box;
}

.paper-skeleton-title {
  width: 42%;
  height: 28px;
  border-radius: 8px;
  margin-bottom: 6px;
}

.paper-skeleton-line {
  width: 100%;
  height: 16px;
  border-radius: 6px;
}

.paper-skeleton-line.mid {
  width: 78%;
}

.overview-doc-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.blocks-tab,
.review-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.blocks-split {
  flex: 1;
  min-height: 0;
  display: flex;
}

.blocks-list-col {
  width: 256px;
  flex-shrink: 0;
  height: 100%;
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.blocks-list-head {
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.search-wrap {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

/* #ifdef H5 */
.search-wrap:focus-within {
  border-color: var(--color-zen-sage);
  background: #FFFFFF;
}
/* #endif */

.search-input {
  flex: 1;
  min-width: 0;
  font-size: var(--text-xs);
  color: var(--text-primary);
  background: transparent;
}

.add-block-btn {
  background: var(--accent-gradient);
  border-color: transparent;
}

.empty-list-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
}

.blocks-list-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.blocks-items-wrap {
  padding: 8px 10px;
}

.block-list-item {
  padding: 11px 12px;
  border-radius: 12px;
  background: transparent;
  margin-bottom: 4px;
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  transition: background-color 0.14s var(--ease-out), border-color 0.14s var(--ease-out);
}

.block-list-item:hover {
  background: var(--color-bg-tertiary);
}

.block-list-item.active {
  background: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.block-item-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-item-preview {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.45;
}

.block-item-meta {
  font-size: var(--text-2xs);
  color: var(--text-muted);
}

.block-detail-col {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 22px 26px;
  box-sizing: border-box;
}

.block-detail-paper {
  max-width: 680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.detail-title-group {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-title {
  font-size: var(--text-xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.detail-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.detail-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.review-skeleton-card {
  height: 300px;
  max-width: 540px;
  width: 100%;
  margin: 0 auto;
  border-radius: 22px;
}

.review-stage {
  flex: 1;
  min-height: 0;
  padding: 16px 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.review-stage-head {
  width: 100%;
  max-width: 560px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.review-counter {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

.review-card-box {
  flex: 1;
  min-height: 0;
  max-height: 430px;
  width: 100%;
  max-width: 560px;
  display: flex;
}

.review-save-banner {
  width: 100%;
  max-width: 560px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: var(--text-xs);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
}

.review-controls {
  display: flex;
  gap: 10px;
  width: 100%;
  max-width: 560px;
  flex-shrink: 0;
}

.rate-btn {
  flex: 1;
  height: 46px;
}

.rate-btn.wide {
  flex: 1.5;
}

.empty-state {
  flex: 1;
  padding: 56px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}

.done-badge {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.state-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.state-title.error {
  color: var(--color-danger);
}

@media (max-width: 1080px) {
  .context-heading {
    min-width: 100%;
  }

  .header-right {
    width: 100%;
    justify-content: space-between;
  }
}

@media (max-width: 900px) {
  .center-card {
    height: auto;
    min-height: 520px;
  }

  .tab-body,
  .overview-scroll,
  .block-detail-col {
    flex: none;
    height: auto;
  }

  .blocks-split {
    flex-direction: column;
  }

  .blocks-list-col {
    width: 100%;
    height: auto;
    max-height: 220px;
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
  }

  .blocks-list-scroll {
    flex: none;
    height: auto;
    max-height: 164px;
  }
}
</style>
