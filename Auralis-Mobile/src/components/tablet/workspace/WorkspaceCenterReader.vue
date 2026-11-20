<template>
  <main class="center-card zen-panel">
    <!-- 顶部微状态栏 -->
    <header class="center-status-bar">
      <view class="status-left">
        <text v-if="centerView === 'summary' && summaryTarget" class="status-title">
          {{ summaryTarget.kind === 'subject' ? '学科总结' : '文件总结' }} · {{ summaryTarget.title }}
        </text>
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
        <template v-if="centerView === 'preview' && selectedSource && previewUrl">
          <button class="status-pill-btn" @click="openDocument(previewUrl)">新窗口打开</button>
          <button class="status-pill-btn" @click="copyLink(previewUrl, '已复制链接')">复制链接</button>
          <text class="status-caption">文件预览</text>
        </template>
        <text v-else-if="centerView === 'preview'" class="status-caption">文件预览</text>
        <text v-else-if="centerView === 'summary'" class="status-caption">AI 总结</text>
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

      <!-- 1. 文件预览 -->
      <view v-if="centerView === 'preview' && selectedSource" class="preview-stage">
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

        <view v-if="previewLoading" class="preview-skeletons">
          <view class="preview-skeleton-hero ui-shimmer"></view>
          <view class="preview-skeleton-line ui-shimmer"></view>
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
        <view
          v-else-if="previewUrl && isPdfMedia(previewMimeType, previewMediaName)"
          class="pdf-frame-wrap"
        >
          <iframe :src="previewUrl" class="pdf-preview-frame" title="PDF 预览" />
        </view>
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

      <!-- 2. 总结与大纲全屏阅读视图 -->
      <view v-else-if="centerView === 'summary' && summaryTarget" class="summary-stage">
        <view class="summary-header">
          <button class="summary-back-btn" @click="emit('close-summary')">
            <LineIcon name="chevron-left" size="14px" color="var(--text-primary)" />
            <text>返回</text>
          </button>

          <view class="summary-title-box">
            <text class="summary-kicker">{{ summaryTarget.kind === 'subject' ? '学科总结' : '文件总结' }}</text>
            <text class="summary-title-text">{{ summaryTarget.title }}</text>
          </view>

          <view class="summary-actions">
            <view class="ui-segmented compact-seg" role="tablist">
              <view
                class="ui-seg-item compact-seg-item"
                :class="{ active: summaryMode === 'summary' }"
                role="tab"
                :aria-selected="summaryMode === 'summary'"
                @click="summaryMode = 'summary'"
              >
                <text>精炼总结</text>
              </view>
              <view
                class="ui-seg-item compact-seg-item"
                :class="{ active: summaryMode === 'outline' }"
                role="tab"
                :aria-selected="summaryMode === 'outline'"
                @click="summaryMode = 'outline'"
              >
                <text>结构大纲</text>
              </view>
            </view>
            <view class="ui-icon-btn sm" role="button" aria-label="刷新" @click="emit('refresh-summary')">
              <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
            </view>
            <view
              v-if="activeSummaryMarkdown"
              class="ui-icon-btn sm"
              role="button"
              aria-label="复制内容"
              @click="copyLink(activeSummaryMarkdown, '已复制')"
            >
              <LineIcon name="copy" size="14px" color="var(--text-secondary)" />
            </view>
          </view>
        </view>

        <scroll-view scroll-y :show-scrollbar="false" class="summary-scroll">
          <view class="summary-body-wrap">
            <view v-if="summaryTarget.loading && !summaryTarget.overview" class="paper-skeletons">
              <view class="paper-skeleton-title ui-shimmer"></view>
              <view class="paper-skeleton-line ui-shimmer"></view>
              <view class="paper-skeleton-line mid ui-shimmer"></view>
            </view>
            <view v-else-if="summaryTarget.error && !summaryTarget.overview" class="empty-state">
              <text class="state-title is-error">{{ summaryTarget.error }}</text>
              <button class="ui-btn ui-btn-secondary sm" @click="emit('refresh-summary')">重试</button>
            </view>
            <view v-else-if="!activeSummaryMarkdown" class="empty-state">
              <text class="state-title">{{ summaryMode === 'summary' ? '暂无精炼总结' : '暂无结构大纲' }}</text>
            </view>
            <view v-else class="summary-paper zen-card">
              <text v-if="summaryTarget.overview?.title" class="summary-doc-title">{{ summaryTarget.overview.title }}</text>
              <MarkdownText :content="activeSummaryMarkdown" />
            </view>
          </view>
        </scroll-view>
      </view>

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

      <!-- 6. 默认学科欢迎引导 -->
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
import { computed, onBeforeUnmount, ref } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import WorkspaceReviewPane from '@/components/tablet/workspace/WorkspaceReviewPane.vue'
import WorkspaceStatsPane from '@/components/tablet/workspace/WorkspaceStatsPane.vue'
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

export type WorkspaceCenterView = 'onboarding' | 'preview' | 'summary' | 'blocks' | 'review' | 'stats'

export interface WorkspaceSummaryTarget {
  kind: 'subject' | 'file'
  id: string
  title: string
  overview: OverviewResultView | null
  loading: boolean
  error: string
}

const props = defineProps<{
  centerView: WorkspaceCenterView
  tier2Open: boolean
  subjectId: string
  subjectName: string
  subjectIcon?: string
  subjectDescription?: string
  selectedSource: SourceView | null
  sourcesCount: number
  previewUrl: string
  previewMimeType: string
  previewOriginalName: string
  previewLoading: boolean
  previewError: string
  summaryTarget: WorkspaceSummaryTarget | null
  subjectBlocks: KnowledgeBlock[]
}>()

const emit = defineEmits<{
  (event: 'toggle-tier2'): void
  (event: 'upload'): void
  (event: 'retry-preview'): void
  (event: 'close-summary'): void
  (event: 'refresh-summary'): void
  (event: 'view-block', block: KnowledgeBlock): void
  (event: 'create-block'): void
  (event: 'delete-block', block: KnowledgeBlock): void
  (event: 'open-files-drawer'): void
  (event: 'open-review'): void
}>()

const safeIcon = computed(() => (props.subjectIcon && isSubjectIconKey(props.subjectIcon) ? props.subjectIcon : 'book'))

const summaryMode = ref<'summary' | 'outline'>('summary')
const activeSummaryMarkdown = computed(() => {
  const overview = props.summaryTarget?.overview
  if (!overview) return ''
  return summaryMode.value === 'summary'
    ? (overview.summaryMarkdown || '')
    : (overview.outlineMarkdown || '')
})

const previewMediaName = computed(() => {
  const orig = props.previewOriginalName || ''
  if (orig && /\.[a-z0-9]{2,6}$/i.test(orig)) return orig
  return props.selectedSource?.title || orig
})

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
  height: 48px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  box-sizing: border-box;
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

.status-pill-btn {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--color-bg-tertiary);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
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

.preview-skeletons {
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preview-skeleton-hero {
  height: 240px;
  border-radius: 16px;
}

.preview-skeleton-line {
  height: 18px;
  width: 60%;
  border-radius: 8px;
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

.pdf-frame-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 12px 16px 16px 32px;
  box-sizing: border-box;
}

.pdf-preview-frame {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: #FFFFFF;
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

.summary-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.summary-header {
  min-height: 54px;
  padding: 8px 18px 8px 34px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.summary-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}

.summary-title-box {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.summary-kicker {
  font-size: 10px;
  color: var(--text-muted);
}

.summary-title-text {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-seg {
  padding: 3px;
  border-radius: var(--radius-full);
}

.compact-seg-item {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
}

.summary-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.summary-body-wrap {
  padding: 20px 28px 84px;
}

.paper-skeletons {
  max-width: 820px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.paper-skeleton-title {
  height: 24px;
  width: 45%;
  border-radius: 8px;
}

.paper-skeleton-line {
  height: 15px;
  border-radius: 6px;
}

.paper-skeleton-line.mid {
  width: 78%;
}

.summary-paper {
  max-width: 820px;
  margin: 0 auto;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-doc-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
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
