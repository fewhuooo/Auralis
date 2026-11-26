<template>
  <div class="overview-reader-scroll zen-scroll-y">
    <div class="reader-body-wrap">
      <div
        v-if="kind === 'file' && source && source.ingestionStatus !== 'READY'"
        class="reader-state-card zen-card"
      >
        <span
          class="ui-tag"
          :class="`tone-${getSourceStatusMeta(source.ingestionStatus).tone}`"
        >{{ getSourceStatusMeta(source.ingestionStatus).label }}</span>
        <span class="state-heading">资料仍在解析中，暂未生成{{ modeLabel }}</span>
        <span class="state-desc">
          {{
            source.ingestionStatus === 'FAILED'
              ? (source.safeErrorDetail || '解析失败，可检查文件后重新上传')
              : '等待 PC 端完成解析索引后将自动呈现精炼总结与结构大纲，你也可以先查看原文件。'
          }}
        </span>
        <button type="button" class="ui-btn ui-btn-primary sm" @click="emit('open-document')">查看原文</button>
      </div>

      <div v-else-if="loading && !overview" class="paper-skeletons">
        <div class="paper-skeleton-title ui-shimmer"></div>
        <div class="paper-skeleton-line ui-shimmer"></div>
        <div class="paper-skeleton-line mid ui-shimmer"></div>
        <div class="paper-skeleton-line ui-shimmer"></div>
        <div class="paper-skeleton-line short ui-shimmer"></div>
      </div>

      <div v-else-if="error && !overview" class="reader-state-card zen-card">
        <span class="state-heading is-error">{{ error }}</span>
        <button type="button" class="ui-btn ui-btn-secondary sm" @click="emit('refresh')">重试</button>
      </div>

      <div v-else-if="!activeMarkdown" class="reader-state-card zen-card">
        <span class="state-heading">暂无{{ modeLabel }}</span>
        <span class="state-desc">
          {{
            hasSiblingMarkdown
              ? `当前资料已生成${siblingModeLabel}，可切换标签查看`
              : (kind === 'file' && source?.ingestionStatus === 'FAILED')
                ? '资料解析失败，无法生成结构总览'
                : (kind === 'file' && source && source.ingestionStatus !== 'READY')
                  ? '资料仍在解析索引中，完成后将自动更新'
                  : '暂无生成结果，可点击刷新再次检查'
          }}
        </span>
        <div class="state-actions">
          <button
            v-if="hasSiblingMarkdown"
            type="button"
            class="ui-btn ui-btn-primary sm"
            @click="emit('switch-mode', siblingMode)"
          >
            切换到{{ siblingModeLabel }}
          </button>
          <button type="button" class="ui-btn ui-btn-secondary sm" @click="emit('refresh')">刷新</button>
        </div>
      </div>

      <template v-else>
        <div v-if="error" class="inline-warning-bar" role="alert">
          <span class="inline-warning-text">刷新失败，当前展示上次缓存内容：{{ error }}</span>
          <button type="button" class="retry-inline-btn" @click="emit('refresh')">重试</button>
        </div>

        <div class="overview-paper zen-card">
          <div class="paper-header">
            <span class="paper-title">{{ overview?.title || title }}</span>
            <span class="paper-meta num-tabular">{{ paperMetaLabel }}</span>
          </div>

          <div
            class="overview-markdown"
            :class="mode === 'outline' ? 'is-outline' : 'is-summary'"
          >
            <MarkdownText :content="activeMarkdown" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownText from '@/components/MarkdownText.vue'
import type { OverviewResultView } from '@/api/overviewApi'
import type { SourceView } from '@/api/sourceApi'
import { formatBytes, getSourceStatusMeta } from '@/utils/sourceFormat'

const props = defineProps<{
  kind: 'subject' | 'file'
  mode: 'summary' | 'outline'
  title: string
  sourcesCount: number
  source?: SourceView | null
  overview: OverviewResultView | null
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
  (event: 'switch-mode', mode: 'summary' | 'outline'): void
  (event: 'open-document'): void
}>()

const modeLabel = computed(() => (props.mode === 'summary' ? '精炼总结' : '结构大纲'))
const siblingMode = computed<'summary' | 'outline'>(() => (
  props.mode === 'summary' ? 'outline' : 'summary'
))
const siblingModeLabel = computed(() => (siblingMode.value === 'summary' ? '精炼总结' : '结构大纲'))

const activeMarkdown = computed(() => {
  if (!props.overview) return ''
  return props.mode === 'summary'
    ? (props.overview.summaryMarkdown || '')
    : (props.overview.outlineMarkdown || '')
})

const hasSiblingMarkdown = computed(() => {
  if (!props.overview) return false
  const candidate = siblingMode.value === 'summary'
    ? props.overview.summaryMarkdown
    : props.overview.outlineMarkdown
  return Boolean(candidate && candidate.trim())
})

const paperMetaLabel = computed(() => {
  if (props.kind === 'subject') {
    return `学科总览 · ${props.sourcesCount} 份资料 · ${modeLabel.value}`
  }
  const sizeText = formatBytes(props.source?.assetSizeBytes)
  return sizeText ? `文件总览 · ${sizeText} · ${modeLabel.value}` : `文件总览 · ${modeLabel.value}`
})
</script>

<style scoped>
.overview-reader-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  background: var(--color-bg-primary, #F7F2EB);
}

.reader-body-wrap {
  padding: 24px 34px 88px;
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
  .reader-body-wrap {
    padding: 18px 20px 84px;
  }

  .overview-paper {
    padding: 22px 22px 28px;
  }
}
</style>
