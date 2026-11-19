<template>
  <view class="rail-card zen-panel">
    <view class="rail-top">
      <view class="rail-header-row">
        <view class="ui-icon-btn sm" role="button" aria-label="返回学科大厅" @click="emit('back')">
          <LineIcon name="chevron-left" size="15px" color="var(--text-primary)" />
        </view>
        <view class="subject-badge" aria-hidden="true">
          <LineIcon :name="`subj-${safeIcon}`" size="15px" color="var(--color-sage-ink)" />
        </view>
        <text class="subject-title">{{ subjectName || '学科工作台' }}</text>
        <view
          class="ui-icon-btn sm"
          :class="{ 'is-busy': uploading }"
          role="button"
          aria-label="上传资料"
          @click="!uploading && emit('upload')"
        >
          <LineIcon name="upload" size="14px" color="var(--color-sage-ink)" />
        </view>
        <view class="ui-icon-btn sm" role="button" aria-label="刷新资料" @click="emit('refresh')">
          <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
        </view>
      </view>
    </view>

    <scroll-view scroll-y :show-scrollbar="false" class="rail-scroll">
      <view
        class="rail-item overview-item"
        :class="{ active: selectedSourceId === null }"
        role="button"
        @click="emit('select-overview')"
      >
        <view class="item-icon-box" :class="{ active: selectedSourceId === null }">
          <LineIcon
            name="layers"
            size="15px"
            :color="selectedSourceId === null ? '#FFFFFF' : 'var(--color-sage-ink)'"
          />
        </view>
        <text class="overview-title">学科总览</text>
      </view>

      <view class="section-caption">
        <text>资料</text>
        <text class="count-num num-tabular">{{ sources.length }}</text>
      </view>

      <view v-if="loadingSources" class="rail-skeletons">
        <view v-for="n in 3" :key="n" class="rail-skeleton ui-shimmer" />
      </view>

      <view v-else-if="sourcesError" class="rail-state error">
        <text>{{ sourcesError }}</text>
      </view>

      <view v-else-if="sources.length === 0" class="rail-state">
        <text>暂无资料</text>
      </view>

      <view v-else class="source-list">
        <view
          v-for="src in sources"
          :key="src.id"
          class="rail-item"
          :class="{ active: src.id === selectedSourceId }"
          role="button"
          @click="src.id && emit('select-source', src)"
        >
          <view class="item-icon-box" :class="{ active: src.id === selectedSourceId }">
            <LineIcon
              :name="isImageMedia(undefined, src.title) ? 'file' : 'file-text'"
              size="14px"
              :color="src.id === selectedSourceId ? '#FFFFFF' : 'var(--text-secondary)'"
            />
          </view>

          <view class="item-body">
            <text class="item-title">{{ src.title || '未命名资料' }}</text>
            <view class="item-meta-row">
              <view
                class="status-dot"
                :class="`tone-${getSourceStatusMeta(src.ingestionStatus).tone}`"
              />
              <text
                v-if="src.ingestionStatus !== 'READY'"
                class="status-label"
                :class="`tone-${getSourceStatusMeta(src.ingestionStatus).tone}`"
              >{{ getSourceStatusMeta(src.ingestionStatus).label }}</text>
              <text v-if="formatBytes(src.assetSizeBytes)" class="size-label num-tabular">
                {{ src.ingestionStatus !== 'READY' ? '· ' : '' }}{{ formatBytes(src.assetSizeBytes) }}
              </text>
            </view>
          </view>

          <view class="item-delete" role="button" aria-label="删除资料" @click.stop="emit('delete-source', src)">
            <LineIcon name="trash" size="13px" color="var(--text-muted)" />
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import type { SourceView } from '@/api/sourceApi'
import { formatBytes, getSourceStatusMeta, isImageMedia } from '@/utils/sourceFormat'
import { isSubjectIconKey } from '@/utils/subjectIcon'

const props = defineProps<{
  subjectName: string
  subjectIcon?: string
  sources: SourceView[]
  selectedSourceId: string | null
  loadingSources: boolean
  sourcesError: string
  uploading: boolean
}>()

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'upload'): void
  (event: 'refresh'): void
  (event: 'select-overview'): void
  (event: 'select-source', source: SourceView): void
  (event: 'delete-source', source: SourceView): void
}>()

const safeIcon = computed(() => (props.subjectIcon && isSubjectIconKey(props.subjectIcon) ? props.subjectIcon : 'book'))
</script>

<style scoped>
.rail-card {
  width: 248px;
  height: 100%;
  flex-shrink: 0;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.rail-top {
  height: 54px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  box-sizing: border-box;
}

.rail-header-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
}

.is-busy {
  opacity: 0.45;
  pointer-events: none;
}

.subject-badge {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.subject-title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  padding: 10px;
  box-sizing: border-box;
}

.rail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.16s var(--ease-out), border-color 0.16s var(--ease-out);
  margin-bottom: 4px;
}

.rail-item.overview-item {
  margin-bottom: 2px;
}

.rail-item:hover {
  background: var(--color-bg-tertiary);
}

.rail-item.active {
  background: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.item-icon-box {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.16s var(--ease-out);
}

.item-icon-box.active {
  background: var(--color-zen-sage);
  border-color: transparent;
}

.overview-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.section-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px 6px;
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.count-num {
  font-variant-numeric: tabular-nums;
}

.rail-skeletons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 2px;
}

.rail-skeleton {
  height: 48px;
  border-radius: 12px;
}

.rail-state {
  padding: 28px 10px;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.rail-state.error {
  color: var(--color-danger);
}

.source-list {
  display: flex;
  flex-direction: column;
}

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta-row {
  display: flex;
  align-items: center;
  gap: 5px;
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
  background: #C89B6D;
}

.status-dot.tone-pending {
  background: var(--text-muted);
}

.status-dot.tone-failed {
  background: var(--color-danger);
}

.status-label {
  font-size: var(--text-2xs);
  font-weight: 600;
}

.status-label.tone-ready {
  color: var(--color-sage-dark);
}

.status-label.tone-parsing {
  color: #9A6B3B;
}

.status-label.tone-pending {
  color: var(--text-muted);
}

.status-label.tone-failed {
  color: var(--color-danger);
}

.size-label {
  font-size: var(--text-2xs);
  color: var(--text-muted);
}

.item-delete {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.78;
  transition: opacity 0.14s var(--ease-out), background-color 0.14s var(--ease-out);
}

.item-delete:hover {
  opacity: 1;
  background: var(--color-danger-bg);
}

@media (max-width: 1100px) {
  .rail-card {
    width: 216px;
  }
}

@media (max-width: 900px) {
  .rail-card {
    width: 100%;
    height: auto;
    max-height: 220px;
  }

  .rail-scroll {
    flex: none;
    height: auto;
    max-height: 164px;
  }
}
</style>
