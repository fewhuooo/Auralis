<template>
  <aside class="tier2-drawer zen-panel" :class="{ 'is-open': open }">
    <!-- 1. 学习资料抽屉 -->
    <view v-if="mode === 'files'" class="drawer-content">
      <view class="drawer-header">
        <text class="drawer-title">学习资料</text>
        <view class="drawer-header-actions">
          <view class="ui-icon-btn sm" role="button" aria-label="刷新资料" @click="emit('refresh-sources')">
            <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
          </view>
          <view
            class="drawer-add-btn"
            :class="{ 'is-busy': uploading }"
            role="button"
            aria-label="上传学习资料"
            @click="!uploading && emit('upload')"
          >
            <LineIcon name="plus" size="14px" color="#FFFFFF" />
          </view>
        </view>
      </view>

      <view v-if="loadingSources && sources.length === 0" class="drawer-skeletons">
        <view v-for="n in 4" :key="n" class="drawer-skeleton ui-shimmer"></view>
      </view>

      <view v-else-if="sourcesError && sources.length === 0" class="drawer-state is-error">
        <text class="state-msg">{{ sourcesError }}</text>
        <button class="ui-btn ui-btn-secondary sm" @click="emit('refresh-sources')">重试</button>
      </view>

      <view v-else-if="sources.length === 0" class="drawer-state">
        <text class="state-msg">暂无学习资料</text>
      </view>

      <scroll-view v-else scroll-y :show-scrollbar="false" class="drawer-scroll">
        <view class="drawer-list">
          <view
            v-for="src in sources"
            :key="src.id"
            class="drawer-item"
            :class="{ 'is-active': src.id === selectedSourceId }"
            role="button"
            @click="src.id && emit('select-source', src)"
          >
            <view class="drawer-item-body">
              <view class="drawer-item-name-row">
                <view
                  class="status-dot"
                  :class="`tone-${getSourceStatusMeta(src.ingestionStatus).tone}`"
                ></view>
                <text class="drawer-item-name">{{ src.title || '未命名资料' }}</text>
              </view>
              <text class="drawer-item-meta num-tabular">
                {{ src.ingestionStatus !== 'READY' ? `${getSourceStatusMeta(src.ingestionStatus).label} · ` : '' }}{{ formatBytes(src.assetSizeBytes) || '未知大小' }}
              </text>
            </view>

            <view
              class="drawer-item-delete"
              role="button"
              aria-label="删除资料"
              @click.stop="emit('delete-source', src)"
            >
              <LineIcon name="close" size="13px" color="var(--text-muted)" />
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 2. 总览抽屉 -->
    <view v-else class="drawer-content">
      <view class="drawer-header">
        <text class="drawer-title">总览</text>
        <view class="ui-icon-btn sm" role="button" aria-label="刷新总览" @click="emit('refresh-overviews')">
          <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="drawer-scroll">
        <view class="outline-list">
          <!-- 学科总览折叠卡 -->
          <view class="overview-card is-subject">
            <view class="overview-card-header">
              <view
                class="collapse-btn"
                role="button"
                :aria-label="subjectCollapsed ? '展开学科大纲' : '收起学科大纲'"
                @click.stop="subjectCollapsed = !subjectCollapsed"
              >
                <LineIcon
                  :name="subjectCollapsed ? 'chevron-right' : 'chevron-down'"
                  size="13px"
                  color="var(--text-secondary)"
                />
              </view>

              <view class="overview-name-btn" role="button" @click="emit('open-subject-summary')">
                <LineIcon name="book" size="13px" color="var(--color-sage-ink)" />
                <text class="overview-card-title">学科总览</text>
                <text v-if="sources.length > 0" class="overview-meta num-tabular">{{ sources.length }} 份资料</text>
              </view>

              <button
                class="summary-pill-btn"
                :class="{ 'is-disabled': !subjectOverview?.summaryMarkdown }"
                :disabled="!subjectOverview?.summaryMarkdown"
                @click.stop="emit('open-subject-summary')"
              >
                总结
              </button>
            </view>

            <view v-if="!subjectCollapsed" class="overview-card-body">
              <view v-if="subjectOverviewLoading && !subjectOverview" class="overview-state">
                <text>正在加载学科总览…</text>
              </view>
              <view v-else-if="subjectOverviewError && !subjectOverview" class="overview-state is-error">
                <text>{{ subjectOverviewError }}</text>
                <button class="retry-inline-btn" @click.stop="emit('refresh-overviews')">重试</button>
              </view>
              <view v-else-if="!subjectOverview?.outlineMarkdown" class="overview-state">
                <text>暂无学科大纲</text>
              </view>
              <view v-else class="zen-outline-markdown">
                <MarkdownText :content="subjectOverview.outlineMarkdown" />
              </view>
            </view>
          </view>

          <!-- 各文件大纲列表 -->
          <view v-if="sources.length === 0" class="drawer-state">
            <text class="state-msg">暂无学习文件</text>
          </view>

          <view
            v-for="src in sources"
            :key="src.id"
            class="overview-card"
            :class="{ 'is-selected': src.id === selectedSourceId }"
          >
            <view class="overview-card-header">
              <view class="overview-name-btn" role="button" @click="src.id && emit('select-source', src)">
                <LineIcon name="file-text" size="13px" :color="src.id === selectedSourceId ? 'var(--color-sage-ink)' : 'var(--text-secondary)'" />
                <text class="overview-card-title">{{ src.title || '未命名资料' }}</text>
              </view>

              <button
                class="summary-pill-btn"
                :class="{ 'is-disabled': !(src.id && fileOverviews[src.id]?.summaryMarkdown) }"
                :disabled="!(src.id && fileOverviews[src.id]?.summaryMarkdown)"
                @click.stop="emit('open-file-summary', src)"
              >
                总结
              </button>
            </view>

            <view v-if="src.ingestionStatus !== 'READY'" class="overview-state">
              <text>{{ getSourceStatusMeta(src.ingestionStatus).label }}</text>
            </view>
            <view v-else-if="src.id && fileOverviewLoading[src.id] && !fileOverviews[src.id]" class="overview-state">
              <text>正在加载文件大纲…</text>
            </view>
            <view v-else-if="src.id && fileOverviewErrors[src.id] && !fileOverviews[src.id]" class="overview-state is-error">
              <text>{{ fileOverviewErrors[src.id] }}</text>
              <button class="retry-inline-btn" @click.stop="emit('retry-file-overview', src)">重试</button>
            </view>
            <view v-else-if="src.id && fileOverviews[src.id]?.outlineMarkdown" class="zen-outline-markdown">
              <MarkdownText :content="fileOverviews[src.id]!.outlineMarkdown" />
            </view>
            <view v-else class="overview-state">
              <text>暂无文件大纲</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import type { OverviewResultView } from '@/api/overviewApi'
import type { SourceView } from '@/api/sourceApi'
import { formatBytes, getSourceStatusMeta } from '@/utils/sourceFormat'

defineProps<{
  open: boolean
  mode: 'files' | 'outline'
  subjectName: string
  sources: SourceView[]
  selectedSourceId: string | null
  loadingSources: boolean
  sourcesError: string
  uploading: boolean
  subjectOverview: OverviewResultView | null
  subjectOverviewLoading: boolean
  subjectOverviewError: string
  fileOverviews: Record<string, OverviewResultView | null>
  fileOverviewLoading: Record<string, boolean>
  fileOverviewErrors: Record<string, string>
}>()

const emit = defineEmits<{
  (event: 'upload'): void
  (event: 'refresh-sources'): void
  (event: 'select-source', source: SourceView): void
  (event: 'delete-source', source: SourceView): void
  (event: 'refresh-overviews'): void
  (event: 'open-subject-summary'): void
  (event: 'open-file-summary', source: SourceView): void
  (event: 'retry-file-overview', source: SourceView): void
}>()

const subjectCollapsed = ref(true)
</script>

<style scoped>
.tier2-drawer {
  width: 0;
  height: 100%;
  flex-shrink: 0;
  border-radius: 16px;
  overflow: hidden;
  opacity: 0;
  border-width: 0;
  pointer-events: none;
  box-sizing: border-box;
  transition: width 0.26s var(--ease-out), opacity 0.22s ease;
}

.tier2-drawer.is-open {
  width: 272px;
  opacity: 1;
  border-width: 1px;
  pointer-events: auto;
  margin-right: 10px;
}

.drawer-content {
  width: 272px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  height: 50px;
  padding: 0 14px 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  box-sizing: border-box;
}

.drawer-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.drawer-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.drawer-add-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(118, 135, 88, 0.28);
  cursor: pointer;
  transition: transform 0.18s var(--ease-out);
}

.drawer-add-btn:active {
  transform: scale(0.92);
}

.drawer-add-btn.is-busy {
  opacity: 0.45;
  pointer-events: none;
}

.drawer-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.drawer-list {
  padding: 0 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drawer-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 13px;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.drawer-item:hover {
  background: var(--color-bg-tertiary);
}

.drawer-item.is-active {
  background: linear-gradient(90deg, rgba(139, 154, 110, 0.16) 0%, rgba(139, 154, 110, 0.04) 100%);
}

.drawer-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-zen-sage);
}

.drawer-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.drawer-item-name-row {
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

.drawer-item-name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-item.is-active .drawer-item-name {
  color: var(--color-sage-ink);
  font-weight: 700;
}

.drawer-item-meta {
  font-size: 11px;
  color: var(--text-muted);
  padding-left: 13px;
}

.drawer-item-delete {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.56;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.drawer-item-delete:hover {
  opacity: 1;
  background: var(--color-danger-bg);
}

.drawer-skeletons {
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-skeleton {
  height: 48px;
  border-radius: 12px;
}

.drawer-state {
  padding: 36px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.drawer-state.is-error .state-msg {
  color: var(--color-danger);
}

.state-msg {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.outline-list {
  padding: 0 10px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.overview-card {
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-elevated);
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.overview-card.is-subject {
  border-color: rgba(139, 154, 110, 0.36);
  background: var(--color-bg-tertiary);
}

.overview-card.is-selected {
  border-color: var(--border-accent);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.22);
}

.overview-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 9px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--border-subtle);
}

.collapse-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.overview-name-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.overview-card-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-card.is-selected .overview-card-title {
  color: var(--color-sage-ink);
}

.overview-meta {
  font-size: 10.5px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.summary-pill-btn {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(139, 154, 110, 0.3);
  background: var(--color-bg-tertiary);
  color: var(--color-sage-ink);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.4;
  flex-shrink: 0;
  cursor: pointer;
}

.summary-pill-btn.is-disabled {
  opacity: 0.4;
  border-color: transparent;
  background: rgba(45, 55, 40, 0.05);
  color: var(--text-muted);
  cursor: not-allowed;
}

.overview-card-body {
  background: var(--color-bg-tertiary);
}

.overview-state {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.overview-state.is-error {
  color: var(--color-danger);
}

.retry-inline-btn {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid rgba(201, 59, 59, 0.3);
  background: var(--color-bg-tertiary);
  color: var(--color-danger);
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}

.zen-outline-markdown {
  padding: 10px 12px 12px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.zen-outline-markdown :deep(h1) {
  margin: 2px 0 8px;
  padding-bottom: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 6px;
}

.zen-outline-markdown :deep(h1::before) {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-zen-sage);
  flex-shrink: 0;
}

.zen-outline-markdown :deep(h2) {
  margin: 11px 0 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.zen-outline-markdown :deep(h2::before) {
  content: '';
  width: 3px;
  height: 11px;
  border-radius: 999px;
  background: var(--color-zen-sage);
  flex-shrink: 0;
}

.zen-outline-markdown :deep(h3) {
  margin: 8px 0 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 5px;
}

.zen-outline-markdown :deep(h3::before) {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: var(--color-zen-sage);
  flex-shrink: 0;
}

.zen-outline-markdown :deep(ul),
.zen-outline-markdown :deep(ol) {
  margin: 0 0 6px;
  padding-left: 14px;
}

.zen-outline-markdown :deep(li) {
  margin-bottom: 4px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.zen-outline-markdown :deep(p) {
  margin: 0 0 5px;
  font-size: 11.5px;
  line-height: 1.5;
}
</style>
