<template>
  <view class="center-card zen-card">
    <view class="center-header">
      <view class="context-heading">
        <text class="context-title">{{ selectedSource ? selectedSource.title || '未命名资料' : `${subjectName} · 学科总览` }}</text>
        <text
          v-if="selectedSource"
          class="status-pill"
          :class="`tone-${getSourceStatusMeta(selectedSource.ingestionStatus).tone}`"
        >{{ getSourceStatusMeta(selectedSource.ingestionStatus).label }}</text>
      </view>

      <view class="header-right">
        <view class="tab-bar">
          <view
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-pill"
            :class="{ active: activeTab === tab.key }"
            @click="emit('update:activeTab', tab.key)"
          >
            <text>{{ tab.label }}</text>
            <text v-if="tab.key === 'blocks'" class="tab-badge">{{ subjectBlocks.length }}</text>
          </view>
        </view>

        <view
          class="ai-toggle-btn"
          :class="{ active: aiPanelVisible }"
          @click="emit('toggle-ai-panel')"
        >
          <LineIcon name="sparkles" size="24rpx" :color="aiPanelVisible ? '#FFFFFF' : '#8B9A6E'" />
          <text>AI 伴读</text>
        </view>
      </view>
    </view>

    <!-- Tab 1: 资料预览 -->
    <scroll-view v-if="activeTab === 'preview'" scroll-y :show-scrollbar="false" class="tab-body">
      <view v-if="!selectedSource" class="overview-summary-box">
        <view class="summary-hero">
          <view class="summary-hero-icon">
            <LineIcon name="layers" size="42rpx" color="var(--color-zen-sage)" />
          </view>
          <view class="summary-hero-text">
            <text class="hero-title">{{ subjectName }} 工作台</text>
            <text class="hero-desc">选择左侧资料进行预览与针对性提问，或在全科视角浏览大纲、知识块与复习卡片</text>
          </view>
        </view>

        <view class="metric-grid">
          <view class="metric-tile">
            <text class="metric-value">{{ sources.length }}</text>
            <text class="metric-label">参考资料</text>
          </view>
          <view class="metric-tile">
            <text class="metric-value">{{ readySourceCount }}</text>
            <text class="metric-label">已完成解析</text>
          </view>
          <view class="metric-tile">
            <text class="metric-value">{{ subjectBlocks.length }}</text>
            <text class="metric-label">知识块总数</text>
          </view>
        </view>

        <view class="quick-actions-row">
          <button class="zen-primary-btn" @click="emit('update:activeTab', 'overview')">查看大纲与总结</button>
          <button class="zen-secondary-btn" @click="emit('update:activeTab', 'review')">进入学科复习</button>
          <button v-if="tabletHandwritingNotesEnabled" class="zen-secondary-btn" @click="openHandwritingNotebook">打开手写笔记</button>
        </view>
      </view>

      <view v-else class="source-preview-box">
        <view
          v-if="selectedSource.ingestionStatus !== 'READY'"
          class="status-notice"
          :class="`tone-${getSourceStatusMeta(selectedSource.ingestionStatus).tone}`"
        >
          <LineIcon name="info" size="26rpx" color="currentColor" />
          <text class="notice-text">
            {{
              selectedSource.ingestionStatus === 'FAILED'
                ? (selectedSource.safeErrorDetail || '后台解析失败，建议检查文件后重新上传。')
                : selectedSource.ingestionStatus === 'PARSING' || selectedSource.ingestionStatus === 'INDEXING'
                  ? '资料正在解析构建索引，完成后将开放单文件 AI 深度检索与大纲查看。'
                  : '等待 PC 端完成解析入库；若附件已上传，你仍可直接打开原文件浏览。'
            }}
          </text>
        </view>

        <view v-if="previewLoading" class="empty-state">
          <text class="state-title">正在获取预览地址...</text>
        </view>

        <view v-else-if="previewError" class="empty-state">
          <text class="state-title error">{{ previewError }}</text>
          <button class="zen-secondary-btn" @click="emit('retry-preview')">重试获取预览</button>
        </view>

        <view v-else-if="!selectedSource.assetId" class="doc-meta-card">
          <LineIcon name="file-text" size="48rpx" color="var(--color-zen-sage)" />
          <text class="doc-name">{{ selectedSource.title || '文本或链接资料' }}</text>
          <text class="doc-meta">资料类型：{{ selectedSource.type }} · 暂无二进制附件下载链接</text>
        </view>

        <view
          v-else-if="previewUrl && isImageMedia(previewMimeType, previewOriginalName || selectedSource.title)"
          class="image-preview-frame"
        >
          <image
            :src="previewUrl"
            mode="widthFix"
            class="preview-image"
            @click="previewImageUrl(previewUrl)"
          />
          <view class="preview-footer">
            <text class="doc-meta">{{ previewOriginalName || selectedSource.title }}</text>
            <button class="zen-secondary-btn compact" @click="previewImageUrl(previewUrl)">全屏查看</button>
          </view>
        </view>

        <view v-else-if="previewUrl" class="doc-meta-card">
          <view class="doc-icon-circle">
            <LineIcon name="file-text" size="44rpx" color="var(--color-zen-sage)" />
          </view>
          <text class="doc-name">{{ previewOriginalName || selectedSource.title }}</text>
          <text class="doc-meta">
            {{ isPdfMedia(previewMimeType, previewOriginalName || selectedSource.title) ? 'PDF 文档' : (previewMimeType || '参考文件') }}
            {{ formatBytes(selectedSource.assetSizeBytes) ? ` · ${formatBytes(selectedSource.assetSizeBytes)}` : '' }}
          </text>
          <view class="quick-actions-row">
            <button class="zen-primary-btn" @click="openDocument(previewUrl)">打开原文件</button>
            <button class="zen-secondary-btn" @click="copyText(previewUrl, '已复制临时访问链接')">复制链接</button>
            <button v-if="tabletHandwritingNotesEnabled" class="zen-secondary-btn" @click="openHandwritingNotebook">手写笔记</button>
          </view>
        </view>

        <view v-else class="empty-state">
          <text class="state-title">暂无可用附件预览</text>
          <button class="zen-secondary-btn" @click="emit('retry-preview')">获取预览</button>
        </view>
      </view>
    </scroll-view>

    <!-- Tab 2: 大纲与总结 -->
    <view v-else-if="activeTab === 'overview'" class="overview-tab">
      <view class="sub-toolbar">
        <view class="segment-group">
          <view
            class="segment-pill"
            :class="{ active: overviewMode === 'outline' }"
            @click="overviewMode = 'outline'"
          >结构大纲</view>
          <view
            class="segment-pill"
            :class="{ active: overviewMode === 'summary' }"
            @click="overviewMode = 'summary'"
          >精炼总结</view>
        </view>

        <view class="toolbar-actions">
          <text v-if="overview?.updatedAt" class="meta-timestamp">
            更新于 {{ formatShortDateTime(overview.updatedAt) }}
          </text>
          <view class="icon-pill-btn" @click="emit('refresh-overview')">
            <LineIcon name="refresh" size="24rpx" color="var(--text-secondary)" />
            <text>刷新</text>
          </view>
          <view
            v-if="activeOverviewMarkdown"
            class="icon-pill-btn"
            @click="copyText(activeOverviewMarkdown, '已复制 Markdown')"
          >
            <LineIcon name="copy" size="24rpx" color="var(--text-secondary)" />
            <text>复制</text>
          </view>
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="overview-scroll">
        <view v-if="overviewLoading" class="empty-state">
          <text class="state-title">正在加载大纲与总结...</text>
        </view>

        <view v-else-if="overviewError" class="empty-state">
          <text class="state-title error">{{ overviewError }}</text>
          <button class="zen-secondary-btn" @click="emit('refresh-overview')">重试</button>
        </view>

        <view v-else-if="!overview" class="empty-state">
          <text class="state-title">当前范围尚无已生成的大纲与总结</text>
          <text class="state-desc">
            {{
              selectedSource && selectedSource.ingestionStatus !== 'READY'
                ? `当前资料状态为“${getSourceStatusMeta(selectedSource.ingestionStatus).label}”，需在 PC 端完成解析与生成后自动同步。`
                : '可在 PC 端生成并保存结构化大纲与总结，也可直接在右侧 AI 伴读中即时提问。'
            }}
          </text>
        </view>

        <view v-else-if="!activeOverviewMarkdown" class="empty-state">
          <text class="state-title">当前{{ overviewMode === 'outline' ? '结构大纲' : '精炼总结' }}为空</text>
          <text class="state-desc">可切换上方“{{ overviewMode === 'outline' ? '精炼总结' : '结构大纲' }}”查看已生成的内容。</text>
        </view>

        <view v-else class="markdown-paper">
          <text v-if="overview.title" class="overview-doc-title">{{ overview.title }}</text>
          <MarkdownText :content="activeOverviewMarkdown" />
        </view>
      </scroll-view>
    </view>

    <!-- Tab 3: 知识块 -->
    <view v-else-if="activeTab === 'blocks'" class="blocks-tab">
      <view class="sub-toolbar">
        <view class="search-input-wrap">
          <LineIcon name="search" size="24rpx" color="var(--text-muted)" />
          <input
            v-model="blockSearch"
            class="search-input"
            placeholder="筛选标题、正文或来源..."
          />
        </view>
        <button class="zen-primary-btn compact" @click="emit('create-block')">+ 新建知识块</button>
      </view>

      <view v-if="filteredBlocks.length === 0" class="empty-state">
        <text class="state-title">{{ blockSearch.trim() ? '未找到匹配的知识块' : '本学科暂无知识块' }}</text>
        <text class="state-desc">点击右上角“+ 新建知识块”随时沉淀核心概念或公式</text>
      </view>

      <view v-else class="blocks-split">
        <scroll-view scroll-y :show-scrollbar="false" class="blocks-list-col">
          <view
            v-for="block in filteredBlocks"
            :key="block.id"
            class="block-list-item"
            :class="{ active: activeBlock?.id === block.id }"
            @click="selectedBlockId = block.id"
          >
            <text class="block-item-title">{{ block.title }}</text>
            <text class="block-item-preview">{{ block.preview }}</text>
            <text class="block-item-meta">{{ block.source || '自主整理' }} · {{ formatShortDateTime(block.time) }}</text>
          </view>
        </scroll-view>

        <scroll-view scroll-y :show-scrollbar="false" class="block-detail-col">
          <view v-if="activeBlock" class="block-detail-paper">
            <view class="detail-head">
              <view class="detail-title-group">
                <text class="detail-title">{{ activeBlock.title }}</text>
                <text class="detail-meta">来源：{{ activeBlock.source || '自主整理' }} · {{ formatShortDateTime(activeBlock.time) }}</text>
              </view>
              <view class="detail-actions">
                <button class="zen-secondary-btn compact" @click="emit('edit-block', activeBlock)">编辑</button>
                <button class="zen-danger-btn compact" @click="emit('delete-block', activeBlock)">删除</button>
              </view>
            </view>

            <view class="detail-markdown">
              <MarkdownText :content="activeBlock.preview || ''" />
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- Tab 4: 学科复习 -->
    <view v-else class="review-tab">
      <view class="sub-toolbar">
        <text class="review-counter">待复习 {{ remainingCount }} · 本轮已完成 {{ completedCount }}</text>
        <view class="icon-pill-btn" @click="loadReview">
          <LineIcon name="refresh" size="24rpx" color="var(--text-secondary)" />
          <text>刷新队列</text>
        </view>
      </view>

      <view v-if="reviewLoading && !activeCard" class="empty-state">
        <text class="state-title">正在同步待复习卡片...</text>
      </view>

      <view v-else-if="reviewLoadError" class="empty-state">
        <text class="state-title error">{{ reviewLoadError }}</text>
        <button class="zen-secondary-btn" @click="loadReview">重新加载</button>
      </view>

      <view v-else-if="!activeCard" class="empty-state">
        <view class="done-badge">
          <LineIcon name="check" size="42rpx" color="var(--color-zen-sage)" />
        </view>
        <text class="state-title">{{ reviewEmptyLabel }}</text>
        <text class="state-desc">新创建的知识块将在同步并排程后加入复习队列</text>
        <button class="zen-secondary-btn" @click="loadReview">再次检查</button>
      </view>

      <view v-else class="review-stage">
        <view class="review-card-box">
          <FlashCard
            v-model:flipped="isFlipped"
            :front="activeCard.title"
            :back="activeCard.preview"
            :subject="activeCard.subject || subjectName"
          />
        </view>

        <view v-if="reviewSaveError" class="review-save-banner">
          <text>{{ reviewSaveError }}</text>
          <button
            class="zen-secondary-btn compact"
            @click="refreshRequired ? loadReview() : retrySave()"
          >{{ refreshRequired ? '刷新队列' : '重试保存' }}</button>
        </view>

        <view class="review-controls">
          <template v-if="!isFlipped">
            <button class="rate-btn skip" :disabled="reviewSaving" @click="skipCard">跳过</button>
            <button class="rate-btn good" :disabled="reviewSaving" @click="isFlipped = true">显示答案</button>
          </template>
          <template v-else>
            <button class="rate-btn again" :disabled="reviewSaving" @click="rateCard('AGAIN')">需要巩固</button>
            <button class="rate-btn good" :disabled="reviewSaving" @click="rateCard('GOOD')">已掌握</button>
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
  sources: SourceView[]
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

const tabs: Array<{ key: WorkspaceTabKey; label: string }> = [
  { key: 'preview', label: '资料预览' },
  { key: 'overview', label: '大纲与总结' },
  { key: 'blocks', label: '知识块' },
  { key: 'review', label: '学科复习' },
]

const overviewMode = ref<'outline' | 'summary'>('outline')
const blockSearch = ref('')
const selectedBlockId = ref<string>('')

const readySourceCount = computed(() => props.sources.filter(s => s.ingestionStatus === 'READY').length)

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
    ? '本轮学科复习已完成'
    : '当前学科暂无到期复习卡片'
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
          fail: () => copyText(url, '当前环境不支持内置预览，已复制访问链接'),
        })
        return
      }
      copyText(url, '已复制文件访问链接')
    },
    fail: () => copyText(url, '已复制文件访问链接'),
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
  background: var(--bg-card);
  border-radius: 28rpx;
  border: 1rpx solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.center-header {
  padding: 20rpx 26rpx;
  border-bottom: 1rpx solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  flex-wrap: wrap;
}

.context-heading {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
  flex: 1;
}

.context-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  font-size: 20rpx;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.status-pill.tone-ready {
  background: rgba(139, 154, 110, 0.16);
  color: var(--color-sage-dark);
}

.status-pill.tone-parsing {
  background: rgba(200, 155, 109, 0.16);
  color: #9A6B3B;
}

.status-pill.tone-pending {
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.status-pill.tone-failed {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.tab-bar {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: var(--bg-primary);
  padding: 6rpx;
  border-radius: 18rpx;
  border: 1rpx solid var(--border-subtle);
}

.tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 10rpx 18rpx;
  border-radius: 14rpx;
  font-size: 23rpx;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
}

.tab-pill.active {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 700;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.tab-badge {
  font-size: 19rpx;
  font-family: var(--font-family-mono);
  padding: 1rpx 8rpx;
  border-radius: 999rpx;
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.ai-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 18rpx;
  border-radius: 16rpx;
  border: 1rpx solid var(--border-accent);
  background: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: 23rpx;
  font-weight: 600;
  cursor: pointer;
}

.ai-toggle-btn.active {
  background: var(--accent-gradient);
  border-color: transparent;
  color: #FFFFFF;
}

.tab-body,
.overview-scroll {
  flex: 1;
  min-height: 0;
  padding: 26rpx;
  box-sizing: border-box;
}

.overview-summary-box,
.source-preview-box {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.summary-hero {
  background: var(--bg-primary);
  border-radius: 22rpx;
  padding: 28rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.summary-hero-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 22rpx;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.summary-hero-text {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.hero-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.hero-desc {
  font-size: 24rpx;
  color: var(--text-muted);
  line-height: 1.5;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
}

.metric-tile {
  background: var(--bg-primary);
  border-radius: 20rpx;
  padding: 24rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.metric-value {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-family-mono);
}

.metric-label {
  font-size: 22rpx;
  color: var(--text-muted);
}

.quick-actions-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex-wrap: wrap;
}

.status-notice {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 22rpx;
  border-radius: 18rpx;
  font-size: 23rpx;
  line-height: 1.5;
}

.status-notice.tone-parsing {
  background: rgba(200, 155, 109, 0.14);
  color: #8A5D31;
}

.status-notice.tone-pending {
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.status-notice.tone-failed {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.notice-text {
  flex: 1;
}

.image-preview-frame {
  background: var(--bg-primary);
  border-radius: 22rpx;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.preview-image {
  width: 100%;
  border-radius: 14rpx;
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.doc-meta-card {
  background: var(--bg-primary);
  border-radius: 24rpx;
  padding: 48rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16rpx;
}

.doc-icon-circle {
  width: 96rpx;
  height: 96rpx;
  border-radius: 28rpx;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.doc-name {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.doc-meta {
  font-size: 23rpx;
  color: var(--text-muted);
}

.overview-tab,
.blocks-tab,
.review-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sub-toolbar {
  padding: 18rpx 26rpx;
  border-bottom: 1rpx solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
}

.segment-group {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.segment-pill {
  padding: 10rpx 20rpx;
  border-radius: 14rpx;
  font-size: 23rpx;
  color: var(--text-secondary);
  background: var(--bg-primary);
  cursor: pointer;
}

.segment-pill.active {
  background: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-weight: 700;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.meta-timestamp {
  font-size: 21rpx;
  color: var(--text-muted);
}

.icon-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 16rpx;
  border-radius: 12rpx;
  background: var(--bg-primary);
  font-size: 22rpx;
  color: var(--text-secondary);
  cursor: pointer;
}

.markdown-paper {
  background: var(--bg-primary);
  border-radius: 22rpx;
  padding: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.overview-doc-title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text-primary);
  padding-bottom: 14rpx;
  border-bottom: 1rpx solid var(--border-subtle);
}

.search-input-wrap {
  flex: 1;
  height: 64rpx;
  background: var(--bg-primary);
  border-radius: 16rpx;
  padding: 0 18rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.search-input {
  flex: 1;
  font-size: 24rpx;
  color: var(--text-primary);
}

.blocks-split {
  flex: 1;
  min-height: 0;
  display: flex;
}

.blocks-list-col {
  width: 300rpx;
  height: 100%;
  border-right: 1rpx solid var(--border-subtle);
  padding: 16rpx;
  box-sizing: border-box;
  flex-shrink: 0;
}

.block-list-item {
  padding: 18rpx 16rpx;
  border-radius: 16rpx;
  margin-bottom: 10rpx;
  background: var(--bg-primary);
  border: 1rpx solid transparent;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  cursor: pointer;
}

.block-list-item.active {
  background: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.block-item-title {
  font-size: 25rpx;
  font-weight: 600;
  color: var(--text-primary);
}

.block-item-preview {
  font-size: 22rpx;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.block-item-meta {
  font-size: 20rpx;
  color: var(--text-muted);
}

.block-detail-col {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 24rpx;
  box-sizing: border-box;
}

.block-detail-paper {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 18rpx;
  border-bottom: 1rpx solid var(--border-subtle);
}

.detail-title-group {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.detail-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.detail-meta {
  font-size: 22rpx;
  color: var(--text-muted);
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
}

.detail-markdown {
  background: var(--bg-primary);
  border-radius: 20rpx;
  padding: 24rpx;
}

.review-counter {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-secondary);
}

.review-stage {
  flex: 1;
  min-height: 0;
  padding: 26rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.review-card-box {
  width: 100%;
  max-width: 720rpx;
  flex: 1;
  min-height: 440rpx;
}

.review-save-banner {
  width: 100%;
  max-width: 720rpx;
  padding: 14rpx 20rpx;
  border-radius: 16rpx;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 23rpx;
}

.review-controls {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.rate-btn {
  min-width: 168rpx;
  height: 76rpx;
  line-height: 76rpx;
  margin: 0;
  padding: 0 28rpx;
  border-radius: 18rpx;
  font-size: 25rpx;
  font-weight: 600;
}

.rate-btn::after {
  border: none;
}

.rate-btn.again {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.rate-btn.skip {
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.rate-btn.good {
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.zen-primary-btn {
  height: 72rpx;
  line-height: 72rpx;
  margin: 0;
  padding: 0 28rpx;
  border-radius: 18rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: 24rpx;
  font-weight: 600;
}

.zen-secondary-btn {
  height: 72rpx;
  line-height: 72rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 18rpx;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 24rpx;
  font-weight: 600;
  border: 1rpx solid var(--border-subtle);
}

.zen-danger-btn {
  height: 72rpx;
  line-height: 72rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 18rpx;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: 24rpx;
  font-weight: 600;
}

.zen-primary-btn.compact,
.zen-secondary-btn.compact,
.zen-danger-btn.compact {
  height: 58rpx;
  line-height: 58rpx;
  padding: 0 20rpx;
  font-size: 22rpx;
  border-radius: 14rpx;
}

.zen-primary-btn::after,
.zen-secondary-btn::after,
.zen-danger-btn::after {
  border: none;
}

.empty-state {
  padding: 80rpx 36rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16rpx;
}

.done-badge {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.state-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}

.state-title.error {
  color: var(--color-danger);
}

.state-desc {
  font-size: 23rpx;
  color: var(--text-muted);
  max-width: 520rpx;
  line-height: 1.5;
}
</style>
