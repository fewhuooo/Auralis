<template>
  <aside class="tier2-drawer zen-panel" :class="{ 'is-open': open }">
    <div class="drawer-content">
      <div class="drawer-header">
        <span class="drawer-title">学习资料</span>
        <div
          class="drawer-add-btn"
          :class="{ 'is-busy': uploading }"
          role="button"
          aria-label="上传学习资料"
          @click="!uploading && emit('upload')"
        >
          <LineIcon name="plus" size="14px" color="#FFFFFF" />
        </div>
      </div>

      <!-- 置顶固定入口：学科总览 -->
      <div
        class="drawer-subject-entry"
        :class="{ 'is-active': subjectOverviewActive }"
        role="button"
        @click="emit('select-subject-overview')"
      >
        <div class="drawer-subject-badge">
          <LineIcon name="book" size="14px" color="var(--color-sage-ink)" />
        </div>
        <div class="drawer-subject-meta">
          <span class="drawer-subject-title">学科总览</span>
          <span class="drawer-subject-sub num-tabular">{{ subjectOverviewSubtitle }}</span>
        </div>
      </div>

      <div class="drawer-divider-row">
        <span class="drawer-divider-label num-tabular">资料文件 · {{ sources.length }}</span>
      </div>

      <div v-if="loadingSources && sources.length === 0" class="drawer-skeletons">
        <div v-for="n in 4" :key="n" class="drawer-skeleton ui-shimmer"></div>
      </div>

      <div v-else-if="sourcesError && sources.length === 0" class="drawer-state is-error">
        <span class="state-msg">{{ sourcesError }}</span>
        <button type="button" class="ui-btn ui-btn-secondary sm" @click="emit('refresh-sources')">重试</button>
      </div>

      <div v-else-if="sources.length === 0" class="drawer-state">
        <span class="state-msg">暂无学习资料</span>
      </div>

      <div v-else class="drawer-scroll zen-scroll-y">
        <div class="drawer-list">
          <div
            v-for="src in sources"
            :key="src.id"
            class="drawer-item"
            :class="{ 'is-active': !subjectOverviewActive && src.id === selectedSourceId }"
            role="button"
            @click="src.id && emit('select-source', src)"
          >
            <div class="drawer-item-body">
              <div class="drawer-item-name-row">
                <div
                  class="status-dot"
                  :class="`tone-${getSourceStatusMeta(src.ingestionStatus).tone}`"
                ></div>
                <span class="drawer-item-name">{{ src.title || '未命名资料' }}</span>
              </div>
              <span class="drawer-item-meta num-tabular">
                {{ src.ingestionStatus !== 'READY' ? `${getSourceStatusMeta(src.ingestionStatus).label} · ` : '' }}{{ formatBytes(src.assetSizeBytes) || '未知大小' }}
              </span>
            </div>

            <div
              class="drawer-item-delete"
              role="button"
              aria-label="删除资料"
              @click.stop="emit('delete-source', src)"
            >
              <LineIcon name="close" size="13px" color="var(--text-muted)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import type { OverviewResultView } from '@/api/overviewApi'
import type { SourceView } from '@/api/sourceApi'
import { formatBytes, getSourceStatusMeta } from '@/utils/sourceFormat'

const props = defineProps<{
  open: boolean
  sources: SourceView[]
  selectedSourceId: string | null
  loadingSources: boolean
  sourcesError: string
  uploading: boolean
  subjectOverviewActive: boolean
  subjectOverview: OverviewResultView | null
  subjectOverviewLoading: boolean
  subjectOverviewError: string
}>()

const emit = defineEmits<{
  (event: 'upload'): void
  (event: 'refresh-sources'): void
  (event: 'select-source', source: SourceView): void
  (event: 'delete-source', source: SourceView): void
  (event: 'select-subject-overview'): void
}>()

const subjectOverviewSubtitle = computed(() => {
  if (props.subjectOverviewLoading && !props.subjectOverview) return '加载中…'
  if (props.subjectOverviewError && !props.subjectOverview) return '加载失败'
  const hasContent = Boolean(props.subjectOverview?.summaryMarkdown || props.subjectOverview?.outlineMarkdown)
  return `${props.sources.length} 份资料 · ${hasContent ? '已就绪' : '暂无内容'}`
})
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
  width: clamp(204px, 18.5vw, 256px);
  opacity: 1;
  border-width: 1px;
  pointer-events: auto;
  margin-right: 10px;
}

.drawer-content {
  width: clamp(204px, 18.5vw, 256px);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  height: 42px;
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

.drawer-subject-entry {
  position: relative;
  margin: 0 10px 8px;
  padding: 10px 10px 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-elevated);
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.drawer-subject-entry:hover {
  background: var(--color-bg-tertiary);
}

.drawer-subject-entry:active {
  background: var(--color-bg-tertiary);
  transform: scale(0.985);
}

.drawer-subject-entry.is-active {
  border-color: rgba(139, 154, 110, 0.42);
  background: linear-gradient(90deg, rgba(139, 154, 110, 0.16) 0%, rgba(139, 154, 110, 0.05) 100%);
}

.drawer-subject-entry.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-zen-sage);
}

.drawer-subject-badge {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.drawer-subject-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drawer-subject-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.drawer-subject-entry.is-active .drawer-subject-title {
  color: var(--color-sage-ink);
}

.drawer-subject-sub {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-divider-row {
  padding: 6px 14px 4px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.drawer-divider-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
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
  padding: 8px 8px 8px 11px;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.16s ease;
}

.drawer-item:hover {
  background: var(--color-bg-tertiary);
}

.drawer-item:active {
  background: var(--color-bg-tertiary);
  transform: scale(0.985);
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

.drawer-item-delete:active {
  opacity: 1;
  background: var(--color-danger-bg);
  transform: scale(0.9);
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
</style>
