<script setup lang="ts">
import { ref } from 'vue'
import { IconAlertTriangle, IconBook, IconChevronDown, IconChevronRight, IconDots, IconRefresh } from '@tabler/icons-vue'
import type { SubjectOverviewRecord } from '@/types/overview'
import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(defineProps<{
  overview: SubjectOverviewRecord | null
  collapsed?: boolean
  sourceCount?: number
  isStale?: boolean
  isGenerating?: boolean
  generationConflictResolving?: boolean
  error?: string | null
}>(), { collapsed: true, sourceCount: 0, isStale: false, isGenerating: false, generationConflictResolving: false, error: null })

const morePopoverVisible = ref(false)

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  generate: []
  'generate-outline': []
  stop: []
  'open-summary': []
  'resolve-sync-conflict': [choice: 'LOCAL' | 'REMOTE']
  'resolve-generation-conflict': [payload: { clientWriteId: string; choice: 'KEEP_LOCAL' | 'USE_AI' }]
}>()

const hasContent = () => Boolean(props.overview?.outlineMarkdown?.trim() || props.overview?.summaryMarkdown?.trim())
</script>

<template>
  <div class="subject-overview-wrapper">
    <article
      class="file-outline subject-overview"
      :class="{ 'is-stale': isStale }"
    >
      <header class="file-outline__header subject-overview__header">
        <!-- 折叠/展开控制小按钮 -->
        <button
          type="button"
          class="overview-collapse-btn"
          :title="collapsed ? '展开学科大纲' : '收起学科大纲'"
          :aria-label="collapsed ? '展开学科大纲' : '收起学科大纲'"
          @click.stop="emit('update:collapsed', !collapsed)"
        >
          <IconChevronRight v-if="collapsed" :size="13" :stroke-width="2" />
          <IconChevronDown v-else :size="13" :stroke-width="2" />
        </button>

        <!-- 点击直接跳至学科总结预览 -->
        <button
          type="button"
          class="file-outline__name subject-overview__name"
          title="点击查看学科总结预览"
          @click="emit('open-summary')"
        >
          <IconBook :size="14" :stroke-width="1.6" class="subject-icon" />
          <span class="subject-overview-title">学科总览</span>
          <small v-if="sourceCount" class="subject-overview-meta">{{ sourceCount }} 份资料</small>
          <span v-if="isStale" class="overview-badge">
            <IconAlertTriangle :size="11" :stroke-width="1.6" />已更新
          </span>
        </button>

        <span class="file-outline__actions">
          <button
            v-if="isGenerating"
            type="button"
            class="retry-capsule__btn"
            aria-label="停止学科总览生成"
            @click.stop="emit('stop')"
          >停止</button>
          <!-- 重试操作（仅在非生成中且存在错误时显示精简按钮，详细原因通过 tooltip 与正文提示呈现） -->
          <button
            v-else-if="error"
            type="button"
            class="retry-capsule__btn"
            :title="error + (hasContent() ? '；当前内容仍可查看。' : '')"
            @click.stop="emit('generate')"
          >
            <IconRefresh :size="10.5" :stroke-width="2" />
            <span>重试</span>
          </button>

          <!-- 更多操作 -->
          <el-popover v-model:visible="morePopoverVisible" placement="bottom-end" trigger="click" width="130" popper-class="zen-popover zen-action-popover" :hide-after="0">
            <template #reference>
              <button
                type="button"
                class="file-more-button"
                aria-label="更多总览操作"
                :disabled="isGenerating"
              >
                <IconRefresh v-if="isGenerating" :size="13" :stroke-width="1.6" class="is-spinning" />
                <IconDots v-else :size="14" :stroke-width="1.6" />
              </button>
            </template>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <button
                class="zen-menu-item"
                :disabled="isGenerating"
                @click="morePopoverVisible = false; emit('generate-outline')"
              >重新生成大纲</button>
              <button
                class="zen-menu-item"
                :disabled="isGenerating"
                @click="morePopoverVisible = false; emit('generate')"
              >{{ hasContent() ? '重新生成全部' : '生成总览' }}</button>
            </div>
          </el-popover>
        </span>
      </header>

      <section v-for="conflict in overview?.generationConflicts ?? []" :key="conflict.clientWriteId" class="file-outline__notice generation-edit-conflict">
        <IconAlertTriangle :size="12" :stroke-width="1.6" />
        <div class="generation-edit-conflict__content">
          <strong>生成期间本机内容有更新</strong>
          <details>
            <summary>查看生成结果</summary>
            <div v-if="conflict.result.outlineMarkdown" class="generation-edit-conflict__preview" v-html="renderMarkdown(conflict.result.outlineMarkdown)" />
            <p v-if="conflict.result.summaryMarkdown" class="generation-edit-conflict__summary-preview">{{ conflict.result.summaryMarkdown.slice(0, 200) }}…</p>
          </details>
        </div>
        <button type="button" class="retry-capsule__btn" :disabled="generationConflictResolving" @click.stop="emit('resolve-generation-conflict', { clientWriteId: conflict.clientWriteId, choice: 'KEEP_LOCAL' })">保留我的修改</button>
        <button type="button" class="retry-capsule__btn" :disabled="generationConflictResolving" @click.stop="emit('resolve-generation-conflict', { clientWriteId: conflict.clientWriteId, choice: 'USE_AI' })">使用AI结果</button>
      </section>

      <!-- 展开的内容主体 -->
      <div v-show="!collapsed" class="subject-overview__body">
        <!-- 错误轻量提示条（错误优先展示；无错误时才在必要时展示资料更新提示，避免双提示框同时堆叠） -->
        <p v-if="error && hasContent()" class="file-outline__notice">
          <IconAlertTriangle :size="12" :stroke-width="1.6" />
          <span class="file-outline__notice-text">{{ error }}；当前内容仍可查看。</span>
        </p>

        <!-- 资料变化提醒 -->
        <p v-else-if="isStale && hasContent()" class="file-outline__notice subject-stale-notice">
          <IconAlertTriangle :size="12" :stroke-width="1.6" />
          <span class="file-outline__notice-text">资料发生变化，当前内容仍可查看，建议重新生成。</span>
        </p>

        <!-- 正在梳理中卡片 -->
        <div v-if="isGenerating && !hasContent()" class="subject-overview__generating-card">
          <div class="generating-card__icon-box">
            <IconRefresh :size="18" :stroke-width="2" class="is-spinning" />
          </div>
          <span class="generating-card__text">正在梳理学科资料…</span>
        </div>

        <!-- 极简一键生成排版（无大面积绿色铺色，上下居中，简洁大方） -->
        <div v-else-if="!hasContent()" class="subject-overview__empty-panel">
          <p class="empty-panel__hint">尚未生成学科总览</p>
          <button
            type="button"
            class="empty-panel__btn"
            :disabled="isGenerating"
            @click.stop="emit('generate')"
          >
            一键生成
          </button>
        </div>

        <!-- 章节大纲展示 -->
        <template v-else>
          <div v-if="isGenerating && hasContent()" class="file-outline__pending subject-overview__regenerating-banner">
            <IconRefresh :size="12" :stroke-width="1.6" class="is-spinning" />
            <span>正在重新生成学科总览与大纲…</span>
          </div>
          <div
            v-if="overview?.outlineMarkdown"
            class="subject-outline-markdown"
            :class="{ 'is-generating': isGenerating }"
            v-html="renderMarkdown(overview.outlineMarkdown)"
          />
        </template>
      </div>
    </article>
  </div>
</template>

<style scoped>
.subject-overview-wrapper {
  padding: 0 10px;
  margin-bottom: 10px;
}
.generation-edit-conflict{align-items:flex-start;flex-wrap:wrap}
.generation-edit-conflict__content{flex:1;min-width:100px}
.generation-edit-conflict__content strong{display:block}
.generation-edit-conflict__content details{margin-top:4px}
.generation-edit-conflict__content summary{cursor:pointer}
.subject-overview {
  position: relative;
  border: 1.5px solid rgba(139, 154, 110, 0.4);
  border-radius: 11px;
  background: var(--color-bg-tertiary, #FAF7F2);
  overflow: hidden;
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease;
}
.subject-overview:hover {
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 8px 20px -3px rgba(0, 0, 0, 0.06), 0 3px 8px -1px rgba(139, 154, 110, 0.12);
}
.subject-overview.is-stale {
  border-color: rgba(166, 125, 55, 0.55);
}
.subject-overview__header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 8px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border-bottom: 1px solid var(--border-subtle);
}
.overview-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
.overview-collapse-btn:hover {
  background: var(--bg-modifier-hover);
  color: var(--text-primary);
}
.file-outline__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
  transition: background 0.15s ease, color 0.15s ease;
}
.file-outline__name:hover {
  background: rgba(125, 147, 114, 0.08);
  color: var(--color-primary-accent);
}
.subject-overview-title {
  flex-shrink: 0;
  white-space: nowrap;
}
.subject-overview-meta {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.subject-icon {
  color: var(--color-primary-accent);
  flex-shrink: 0;
}
.overview-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(166, 125, 55, 0.12);
  color: #8b672f;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}
.file-outline__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.retry-capsule__btn {
  display: inline-flex;
  align-items: center;
  gap: 2.5px;
  padding: 2px 6px;
  border: 0;
  border-radius: 999px;
  background: rgba(176, 83, 83, 0.16);
  color: #8c2f2f;
  font-size: 10px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease, color 0.15s ease;
}
.retry-capsule__btn:hover:not(:disabled) {
  background: rgba(176, 83, 83, 0.26);
  color: #722020;
  transform: scale(1.02);
}
.retry-capsule__btn:active:not(:disabled) {
  transform: scale(0.97);
}
.retry-capsule__btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
.file-more-button {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.file-more-button:hover {
  background: var(--bg-modifier-hover);
  color: var(--text-primary);
}
.file-more-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.subject-overview__body {
  padding: 0 8px 8px;
  display: grid;
  gap: 6px;
}
.file-outline__notice {
  margin: 4px 0 2px;
  padding: 5px 8px;
  color: #995050;
  background: rgba(176, 83, 83, 0.06);
  font-size: 10.5px;
  line-height: 1.4;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.subject-stale-notice {
  color: #7b5d2e;
  background: rgba(166, 125, 55, 0.09);
}
.file-outline__notice-text {
  flex: 1;
}

/* 正在梳理中卡片 */
.subject-overview__generating-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 12px;
  margin-top: 4px;
  border-radius: 8px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px dashed var(--border-subtle);
}
.generating-card__icon-box {
  color: var(--color-primary-accent);
  display: flex;
}
.generating-card__text {
  font-size: 11.5px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* 极简一键生成排版（上下居中，无大面积绿底铺色） */
.subject-overview__empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 10px 10px;
  background: transparent;
}
.empty-panel__hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-muted);
}
.empty-panel__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3.5px 14px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--color-bg-tertiary, #FAF7F2);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.empty-panel__btn:hover:not(:disabled) {
  background: var(--bg-modifier-hover);
  border-color: var(--color-primary-accent);
  color: var(--color-primary-accent);
  transform: translateY(-1px);
}
.empty-panel__btn:active:not(:disabled) {
  transform: translateY(0);
}
.empty-panel__btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

/* Markdown 大纲渲染区 */
.subject-outline-markdown {
  padding: 10px 10px 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  word-break: break-word;
}
.file-outline__chapters.is-generating {
  opacity: 0.6;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
/* --- 学科大纲标题 (H1) --- */
.subject-outline-markdown :deep(h1) {
  margin: 2px 0 10px 0;
  padding: 0 0 6px 0;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 6px;
  letter-spacing: -0.01em;
}
.subject-outline-markdown :deep(h1::before) {
  content: "";
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary-accent, #8B9A6E);
  flex-shrink: 0;
}

/* --- 学科大纲议题/模块 (H2) --- */
.subject-outline-markdown :deep(h2) {
  margin: 13px 0 6px 0;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.subject-outline-markdown :deep(h1 + h2),
.subject-outline-markdown :deep(> h2:first-child) {
  margin-top: 4px;
}
.subject-outline-markdown :deep(h2::before) {
  content: "";
  display: inline-block;
  width: 3px;
  height: 11px;
  border-radius: 999px;
  background: var(--color-primary-accent, #8B9A6E);
  flex-shrink: 0;
}

/* --- 学科大纲小节 (H3 / H4) --- */
.subject-outline-markdown :deep(h3) {
  margin: 9px 0 4px 0;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 5px;
}
.subject-outline-markdown :deep(h3::before) {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: var(--color-primary-accent, #8B9A6E);
  opacity: 0.8;
  flex-shrink: 0;
}
.subject-outline-markdown :deep(h4),
.subject-outline-markdown :deep(h5),
.subject-outline-markdown :deep(h6) {
  margin: 6px 0 3px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

/* --- 列表与要点 (UL / OL / LI) --- */
.subject-outline-markdown :deep(ul),
.subject-outline-markdown :deep(ol) {
  list-style: none;
  padding: 0;
  margin: 0 0 6px 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.subject-outline-markdown :deep(li) {
  position: relative;
  padding-left: 14px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.subject-outline-markdown :deep(ul > li::before) {
  content: "";
  position: absolute;
  left: 3px;
  top: 6.5px;
  width: 4.5px;
  height: 4.5px;
  border-radius: 50%;
  background: var(--color-primary-accent, #8B9A6E);
  opacity: 0.65;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.subject-outline-markdown :deep(li:hover::before) {
  opacity: 1;
  transform: scale(1.15);
}
.subject-outline-markdown :deep(li > ul),
.subject-outline-markdown :deep(li > ol) {
  margin: 4px 0 2px 0;
  padding-left: 8px;
  gap: 4px;
}
.subject-outline-markdown :deep(li > ul > li::before) {
  left: 3px;
  top: 6.5px;
  width: 4px;
  height: 4px;
  background: transparent;
  border: 1.2px solid var(--color-primary-accent, #8B9A6E);
  opacity: 0.75;
}
.subject-outline-markdown :deep(ol) {
  counter-reset: outline-counter;
}
.subject-outline-markdown :deep(ol > li) {
  counter-increment: outline-counter;
  padding-left: 16px;
}
.subject-outline-markdown :deep(ol > li::before) {
  content: counter(outline-counter) ".";
  position: absolute;
  left: 0;
  top: 0;
  width: auto;
  height: auto;
  border-radius: 0;
  background: transparent;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-primary-accent, #8B9A6E);
  line-height: 1.55;
}

/* --- 段落与内联元素 --- */
.subject-outline-markdown :deep(p) {
  margin: 0 0 6px 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.subject-outline-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.subject-outline-markdown :deep(strong) {
  font-weight: 650;
  color: var(--text-primary);
}
.subject-outline-markdown :deep(code) {
  font-family: var(--font-family-mono, monospace);
  font-size: 10.5px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--color-primary-accent, #8B9A6E);
}
.subject-outline-markdown :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 8px;
  border-left: 2px solid var(--color-primary-accent, #8B9A6E);
  background: rgba(139, 154, 110, 0.06);
  border-radius: 0 4px 4px 0;
  font-size: 11px;
  color: var(--text-muted);
}
.subject-outline-markdown :deep(hr) {
  margin: 8px 0;
  border: none;
  border-top: 1px solid var(--border-subtle);
}

/* --- 冲突预览适配 --- */
.generation-edit-conflict__preview :deep(h1) {
  font-size: 11.5px;
  font-weight: 700;
  margin: 2px 0 4px;
}
.generation-edit-conflict__preview :deep(h2) {
  font-size: 11px;
  font-weight: 650;
  margin: 4px 0 2px;
}
.generation-edit-conflict__preview :deep(ul) {
  margin: 0;
  padding-left: 12px;
}
.generation-edit-conflict__preview :deep(li) {
  font-size: 10.5px;
  line-height: 1.4;
}

/* --- 暗色模式适配 --- */
html.dark .subject-outline-markdown :deep(code) {
  background: rgba(255, 255, 255, 0.08);
}
html.dark .subject-outline-markdown :deep(blockquote) {
  background: rgba(139, 154, 110, 0.1);
}

.subject-overview__regenerating-banner {
  background: rgba(139, 154, 110, 0.08);
  color: var(--color-primary-accent);
  border-bottom: 1px dashed rgba(139, 154, 110, 0.25);
  margin-bottom: 6px;
}
.zen-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.zen-menu-item:hover {
  background: rgba(125, 147, 114, 0.12);
  color: var(--color-primary-accent);
  transform: translateX(1px);
}
.zen-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.is-spinning {
  animation: outline-spin 1s linear infinite;
}
@keyframes outline-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
