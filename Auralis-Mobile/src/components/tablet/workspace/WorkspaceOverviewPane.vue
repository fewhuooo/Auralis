<template>
  <view class="overview-hub">
    <!-- 左侧轻目录（固定宽度，禁止平铺大纲正文） -->
    <aside class="overview-dir" aria-label="总览目录">
      <view class="dir-header">
        <text class="dir-title">总览目录</text>
        <view
          class="ui-icon-btn sm"
          role="button"
          aria-label="刷新全部总览"
          @click="emit('refresh-all')"
        >
          <LineIcon name="refresh" size="13px" color="var(--text-secondary)" />
        </view>
      </view>

      <view
        class="dir-subject-item"
        :class="{ 'is-active': effectiveKind === 'subject' }"
        role="button"
        @click="emit('select', { kind: 'subject' })"
      >
        <view class="dir-subject-badge">
          <LineIcon name="book" size="14px" color="var(--color-sage-ink)" />
        </view>
        <view class="dir-item-body">
          <text class="dir-item-title">学科总览</text>
          <text class="dir-item-sub num-tabular">{{ subjectSubtitle }}</text>
        </view>
      </view>

      <view class="dir-section-head">
        <text class="dir-section-label">学习资料</text>
        <text class="dir-section-count num-tabular">{{ sources.length }}</text>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="dir-scroll">
        <view v-if="loadingSources && sources.length === 0" class="dir-skeletons">
          <view v-for="n in 4" :key="n" class="dir-skeleton ui-shimmer"></view>
        </view>

        <view v-else-if="sources.length === 0" class="dir-empty">
          <text class="dir-empty-text">暂无学习资料</text>
          <button class="ui-btn ui-btn-secondary sm" @click="emit('upload')">上传资料</button>
        </view>

        <view v-else class="dir-file-list">
          <view
            v-for="src in sources"
            :key="src.id"
            class="dir-file-item"
            :class="{ 'is-active': effectiveKind === 'file' && activeSource?.id === src.id }"
            role="button"
            @click="src.id && emit('select', { kind: 'file', sourceId: src.id })"
          >
            <view class="dir-file-top">
              <view
                class="status-dot"
                :class="`tone-${getSourceStatusMeta(src.ingestionStatus).tone}`"
              ></view>
              <text class="dir-file-title">{{ src.title || '未命名资料' }}</text>
            </view>
            <text class="dir-item-sub num-tabular">{{ getSourceSubtitle(src) }}</text>
          </view>
        </view>
      </scroll-view>
    </aside>

    <!-- 右侧宽幅阅读舞台 -->
    <section class="overview-reader" aria-label="总览阅读区">
      <view class="reader-bar">
        <view class="reader-bar-left">
          <text class="scope-badge">{{ effectiveKind === 'subject' ? '学科总览' : '文件总览' }}</text>
          <text class="reader-active-title">{{ activeTitle }}</text>
        </view>

        <view class="reader-bar-actions">
          <view class="ui-segmented compact-seg" role="tablist">
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: activeMode === 'summary' }"
              role="tab"
              :aria-selected="activeMode === 'summary'"
              @click="activeMode = 'summary'"
            >
              <text>精炼总结</text>
            </view>
            <view
              class="ui-seg-item compact-seg-item"
              :class="{ active: activeMode === 'outline' }"
              role="tab"
              :aria-selected="activeMode === 'outline'"
              @click="activeMode = 'outline'"
            >
              <text>结构大纲</text>
            </view>
          </view>

          <button
            v-if="effectiveKind === 'file' && activeSource"
            type="button"
            class="preview-jump-btn"
            @click="emit('open-source-preview', activeSource)"
          >
            <LineIcon name="file-text" size="13px" color="currentColor" />
            <text>查看原文</text>
          </button>

          <view
            v-if="activeMarkdown"
            class="ui-icon-btn sm"
            role="button"
            aria-label="复制当前内容"
            @click="copyActiveContent"
          >
            <LineIcon
              :name="copied ? 'check' : 'copy'"
              size="13px"
              :color="copied ? 'var(--color-sage-ink)' : 'var(--text-secondary)'"
            />
          </view>

          <view
            class="ui-icon-btn sm"
            role="button"
            aria-label="刷新当前总览"
            @click="emit('refresh-active')"
          >
            <LineIcon name="refresh" size="13px" color="var(--text-secondary)" />
          </view>
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="reader-scroll">
        <view class="reader-body-wrap">
          <view
            v-if="effectiveKind === 'file' && activeSource && activeSource.ingestionStatus !== 'READY'"
            class="reader-state-card zen-card"
          >
            <text
              class="ui-tag"
              :class="`tone-${getSourceStatusMeta(activeSource.ingestionStatus).tone}`"
            >{{ getSourceStatusMeta(activeSource.ingestionStatus).label }}</text>
            <text class="state-heading">资料仍在解析中，暂未生成总览</text>
            <text class="state-desc">
              {{
                activeSource.ingestionStatus === 'FAILED'
                  ? (activeSource.safeErrorDetail || '解析失败，可检查文件后重新上传')
                  : '等待 PC 端完成解析索引后将自动呈现精炼总结与结构大纲，你也可以直接阅读原文件。'
              }}
            </text>
            <button
              class="ui-btn ui-btn-primary sm"
              @click="emit('open-source-preview', activeSource)"
            >
              查看原文
            </button>
          </view>

          <view v-else-if="activeLoading && !activeOverview" class="paper-skeletons">
            <view class="paper-skeleton-title ui-shimmer"></view>
            <view class="paper-skeleton-line ui-shimmer"></view>
            <view class="paper-skeleton-line mid ui-shimmer"></view>
            <view class="paper-skeleton-line ui-shimmer"></view>
            <view class="paper-skeleton-line short ui-shimmer"></view>
          </view>

          <view v-else-if="activeError && !activeOverview" class="reader-state-card zen-card">
            <text class="state-heading is-error">{{ activeError }}</text>
            <button class="ui-btn ui-btn-secondary sm" @click="emit('refresh-active')">重试</button>
          </view>

          <view v-else-if="!activeMarkdown" class="reader-state-card zen-card">
            <text class="state-heading">
              {{ activeMode === 'summary' ? '暂无精炼总结' : '暂无结构大纲' }}
            </text>
            <text class="state-desc">
              {{
                hasSiblingMarkdown
                  ? `当前资料已生成${siblingMode === 'summary' ? '精炼总结' : '结构大纲'}，可切换标签查看`
                  : '等待解析生成完成，或点击下方刷新再次检查。'
              }}
            </text>
            <view class="state-actions">
              <button
                v-if="hasSiblingMarkdown"
                class="ui-btn ui-btn-primary sm"
                @click="activeMode = siblingMode"
              >
                切换到{{ siblingMode === 'summary' ? '精炼总结' : '结构大纲' }}
              </button>
              <button class="ui-btn ui-btn-secondary sm" @click="emit('refresh-active')">刷新</button>
            </view>
          </view>

          <template v-else>
            <view v-if="activeError" class="inline-warning-bar" role="alert">
              <text class="inline-warning-text">刷新失败，当前展示上次缓存内容：{{ activeError }}</text>
              <button class="retry-inline-btn" @click="emit('refresh-active')">重试</button>
            </view>

            <view class="overview-paper zen-card">
              <view class="paper-header">
                <text class="paper-title">{{ activeOverview?.title || activeTitle }}</text>
                <text class="paper-meta num-tabular">
                  {{ paperMetaLabel }}
                </text>
              </view>

              <view
                class="overview-markdown"
                :class="activeMode === 'outline' ? 'is-outline' : 'is-summary'"
              >
                <MarkdownText :content="activeMarkdown" />
              </view>
            </view>
          </template>
        </view>
      </scroll-view>
    </section>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import type { OverviewResultView } from '@/api/overviewApi'
import type { SourceView } from '@/api/sourceApi'
import { copyTextWithFallback } from '@/utils/mobileLearning'
import { formatBytes, getSourceStatusMeta } from '@/utils/sourceFormat'

export type WorkspaceOverviewSelection =
  | { kind: 'subject' }
  | { kind: 'file'; sourceId: string }

const props = defineProps<{
  subjectName: string
  sources: SourceView[]
  loadingSources: boolean
  selection: WorkspaceOverviewSelection
  subjectOverview: OverviewResultView | null
  subjectOverviewLoading: boolean
  subjectOverviewError: string
  fileOverviews: Record<string, OverviewResultView | null>
  fileOverviewLoading: Record<string, boolean>
  fileOverviewErrors: Record<string, string>
}>()

const emit = defineEmits<{
  (event: 'select', selection: WorkspaceOverviewSelection): void
  (event: 'refresh-all'): void
  (event: 'refresh-active'): void
  (event: 'open-source-preview', source: SourceView): void
  (event: 'upload'): void
}>()

const activeMode = ref<'summary' | 'outline'>('summary')
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const activeSource = computed<SourceView | null>(() => {
  if (props.selection.kind !== 'file') return null
  const targetId = props.selection.sourceId
  return props.sources.find(item => item.id === targetId) || null
})

const effectiveKind = computed<'subject' | 'file'>(() => (
  props.selection.kind === 'file' && activeSource.value ? 'file' : 'subject'
))

const activeOverview = computed<OverviewResultView | null>(() => {
  if (effectiveKind.value === 'subject') return props.subjectOverview
  const sourceId = activeSource.value?.id
  if (!sourceId) return null
  return props.fileOverviews[sourceId] ?? null
})

const activeLoading = computed(() => {
  if (effectiveKind.value === 'subject') return props.subjectOverviewLoading
  const sourceId = activeSource.value?.id
  if (!sourceId) return false
  return Boolean(props.fileOverviewLoading[sourceId])
})

const activeError = computed(() => {
  if (effectiveKind.value === 'subject') return props.subjectOverviewError
  const sourceId = activeSource.value?.id
  if (!sourceId) return ''
  return props.fileOverviewErrors[sourceId] || ''
})

const activeTitle = computed(() => (
  effectiveKind.value === 'subject'
    ? (props.subjectName || '当前学科')
    : (activeSource.value?.title || '未命名资料')
))

const activeMarkdown = computed(() => {
  const overview = activeOverview.value
  if (!overview) return ''
  return activeMode.value === 'summary'
    ? (overview.summaryMarkdown || '')
    : (overview.outlineMarkdown || '')
})

const siblingMode = computed<'summary' | 'outline'>(() => (
  activeMode.value === 'summary' ? 'outline' : 'summary'
))

const hasSiblingMarkdown = computed(() => {
  const overview = activeOverview.value
  if (!overview) return false
  const candidate = siblingMode.value === 'summary'
    ? overview.summaryMarkdown
    : overview.outlineMarkdown
  return Boolean(candidate && candidate.trim())
})

const subjectSubtitle = computed(() => {
  if (props.subjectOverviewLoading && !props.subjectOverview) return '加载中…'
  if (props.subjectOverviewError && !props.subjectOverview) return '加载失败'
  const hasContent = Boolean(props.subjectOverview?.summaryMarkdown || props.subjectOverview?.outlineMarkdown)
  return `${props.sources.length} 份资料 · ${hasContent ? '已就绪' : '暂无内容'}`
})

const paperMetaLabel = computed(() => {
  const modeLabel = activeMode.value === 'summary' ? '精炼总结' : '结构大纲'
  if (effectiveKind.value === 'subject') {
    return `学科总览 · ${props.sources.length} 份资料 · ${modeLabel}`
  }
  const sizeText = formatBytes(activeSource.value?.assetSizeBytes)
  return sizeText ? `文件总览 · ${sizeText} · ${modeLabel}` : `文件总览 · ${modeLabel}`
})

function getSourceSubtitle(src: SourceView): string {
  if (src.ingestionStatus !== 'READY') {
    return getSourceStatusMeta(src.ingestionStatus).label
  }
  const id = src.id
  if (!id) return '暂无总览'
  const cached = props.fileOverviews[id]
  if (props.fileOverviewLoading[id] && !cached) return '加载中…'
  if (props.fileOverviewErrors[id] && !cached) return '加载失败'
  const hasSummary = Boolean(cached?.summaryMarkdown)
  const hasOutline = Boolean(cached?.outlineMarkdown)
  if (hasSummary && hasOutline) return '总结 · 大纲'
  if (hasSummary) return '仅总结'
  if (hasOutline) return '仅大纲'
  return '暂无总览'
}

async function copyActiveContent() {
  if (!activeMarkdown.value) return
  const ok = await copyTextWithFallback(activeMarkdown.value)
  if (!ok) {
    uni.showToast({ title: '复制失败，请手动复制', icon: 'none' })
    return
  }
  copied.value = true
  uni.showToast({ title: '已复制', icon: 'none' })
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
    copiedTimer = null
  }, 1500)
}

onBeforeUnmount(() => {
  if (copiedTimer) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
})
</script>

<style scoped>
.overview-hub {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
}

.overview-dir {
  width: 244px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-subtle);
  background: rgba(250, 247, 242, 0.56);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.dir-header {
  height: 46px;
  padding: 0 12px 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.dir-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.dir-subject-item {
  position: relative;
  margin: 2px 10px 10px;
  padding: 10px 10px 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-elevated);
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.dir-subject-item:hover {
  background: var(--color-bg-tertiary);
}

.dir-subject-item.is-active {
  border-color: rgba(139, 154, 110, 0.42);
  background: linear-gradient(90deg, rgba(139, 154, 110, 0.16) 0%, rgba(139, 154, 110, 0.05) 100%);
}

.dir-subject-item.is-active::before,
.dir-file-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-zen-sage);
}

.dir-subject-badge {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dir-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dir-item-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-subject-item.is-active .dir-item-title,
.dir-file-item.is-active .dir-file-title {
  color: var(--color-sage-ink);
}

.dir-item-sub {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-section-head {
  padding: 6px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.dir-section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.dir-section-count {
  font-size: 11px;
  color: var(--text-muted);
}

.dir-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.dir-skeletons {
  padding: 4px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dir-skeleton {
  height: 46px;
  border-radius: 10px;
}

.dir-empty {
  padding: 28px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.dir-empty-text {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.dir-file-list {
  padding: 2px 10px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dir-file-item {
  position: relative;
  padding: 9px 10px 9px 13px;
  border-radius: 11px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.dir-file-item:hover {
  background: var(--color-bg-tertiary);
}

.dir-file-item.is-active {
  background: linear-gradient(90deg, rgba(139, 154, 110, 0.16) 0%, rgba(139, 154, 110, 0.04) 100%);
}

.dir-file-top {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.tone-ready {
  background: var(--color-zen-sage);
}

.status-dot.tone-parsing {
  background: var(--color-warning);
}

.status-dot.tone-pending {
  background: var(--text-muted);
}

.status-dot.tone-failed {
  background: var(--color-danger);
}

.dir-file-title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-file-item .dir-item-sub {
  padding-left: 13px;
}

.overview-reader {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary, #F7F2EB);
}

.reader-bar {
  min-height: 48px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(250, 247, 242, 0.65);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
  box-sizing: border-box;
}

.reader-bar-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-badge {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.reader-active-title {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.compact-seg {
  padding: 3px;
  border-radius: var(--radius-full);
}

.compact-seg-item {
  height: 26px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  font-size: 12px;
}

.preview-jump-btn {
  height: 30px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-accent);
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: background-color 0.14s ease, transform 0.12s ease;
}

.preview-jump-btn::after {
  border: none;
}

.preview-jump-btn:hover {
  background: rgba(139, 154, 110, 0.22);
}

.preview-jump-btn:active {
  transform: scale(0.97);
}

.reader-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.reader-body-wrap {
  padding: 24px 32px 88px;
  box-sizing: border-box;
}

.paper-skeletons {
  max-width: 780px;
  margin: 0 auto;
  padding: 28px 34px;
  border-radius: 16px;
  background: rgba(255, 253, 249, 0.72);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}

.paper-skeleton-title {
  height: 24px;
  width: 44%;
  border-radius: 8px;
}

.paper-skeleton-line {
  height: 15px;
  border-radius: 6px;
}

.paper-skeleton-line.mid {
  width: 78%;
}

.paper-skeleton-line.short {
  width: 56%;
}

.reader-state-card {
  max-width: 460px;
  margin: 48px auto;
  padding: 30px 26px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.state-heading {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.state-heading.is-error {
  color: var(--color-danger);
}

.state-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.state-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.inline-warning-bar {
  max-width: 780px;
  margin: 0 auto 14px;
  padding: 9px 14px;
  border-radius: 10px;
  background: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.22);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
}

.inline-warning-text {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--color-danger);
}

.retry-inline-btn {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(201, 59, 59, 0.3);
  background: var(--color-bg-tertiary);
  color: var(--color-danger);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.overview-paper {
  max-width: 780px;
  margin: 0 auto;
  padding: 28px 34px 34px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-sizing: border-box;
}

.paper-header {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.paper-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.35;
}

.paper-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.overview-markdown {
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--text-primary);
}

.overview-markdown.is-outline :deep(h1) {
  margin: 6px 0 12px;
  padding-bottom: 8px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.overview-markdown.is-outline :deep(h1::before) {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-zen-sage);
  flex-shrink: 0;
}

.overview-markdown.is-outline :deep(h2) {
  margin: 18px 0 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.overview-markdown.is-outline :deep(h2::before) {
  content: '';
  width: 3px;
  height: 14px;
  border-radius: 999px;
  background: var(--color-zen-sage);
  flex-shrink: 0;
}

.overview-markdown.is-outline :deep(h3) {
  margin: 12px 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 7px;
}

.overview-markdown.is-outline :deep(h3::before) {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 1.5px;
  background: var(--color-zen-sage);
  flex-shrink: 0;
}

.overview-markdown.is-outline :deep(ul),
.overview-markdown.is-outline :deep(ol) {
  margin: 0 0 10px;
  padding-left: 18px;
}

.overview-markdown.is-outline :deep(li) {
  margin-bottom: 6px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .overview-dir {
    width: 204px;
  }

  .reader-body-wrap {
    padding: 18px 20px 84px;
  }

  .overview-paper {
    padding: 22px 22px 28px;
  }
}
</style>
