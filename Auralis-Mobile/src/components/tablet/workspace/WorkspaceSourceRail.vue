<template>
  <view class="rail-card zen-card">
    <view class="rail-top">
      <view class="back-btn" @click="emit('back')">
        <LineIcon name="chevron-left" size="26rpx" color="var(--text-primary)" />
        <text>学科大厅</text>
      </view>

      <view class="subject-banner">
        <view class="subject-badge">
          <LineIcon :name="`subj-${safeIcon}`" size="30rpx" color="var(--color-zen-sage)" />
        </view>
        <view class="subject-meta">
          <text class="subject-title">{{ subjectName || '学科工作台' }}</text>
          <text class="subject-sub">{{ sources.length }} 份资料 · {{ readyCount }} 份已就绪</text>
        </view>
      </view>

      <view class="rail-actions">
        <button
          class="upload-btn"
          :disabled="uploading"
          @click="emit('upload')"
        >
          <LineIcon name="upload" size="24rpx" color="#FFFFFF" />
          <text>{{ uploading ? '上传中...' : '+ 上传文件' }}</text>
        </button>
        <view class="refresh-btn" @click="emit('refresh')">
          <LineIcon name="refresh" size="26rpx" color="var(--text-secondary)" />
        </view>
      </view>
    </view>

    <scroll-view scroll-y :show-scrollbar="false" class="rail-scroll">
      <view
        class="rail-item overview-item"
        :class="{ active: selectedSourceId === null }"
        @click="emit('select-overview')"
      >
        <view class="item-icon-box" :class="{ active: selectedSourceId === null }">
          <LineIcon
            name="layers"
            size="26rpx"
            :color="selectedSourceId === null ? '#FFFFFF' : '#8B9A6E'"
          />
        </view>
        <view class="item-body">
          <text class="item-title">学科总览</text>
          <text class="item-sub">全科视角 · 大纲、知识块与复习</text>
        </view>
      </view>

      <view class="section-caption">
        <text>参考资料</text>
        <text class="count-num">{{ sources.length }}</text>
      </view>

      <view v-if="loadingSources" class="rail-state">
        <text>正在同步资料列表...</text>
      </view>

      <view v-else-if="sourcesError" class="rail-state error">
        <text>{{ sourcesError }}</text>
      </view>

      <view v-else-if="sources.length === 0" class="rail-state">
        <text>暂无上传资料</text>
        <text class="state-hint">支持 PDF、文档与图片资料</text>
      </view>

      <view v-else class="source-list">
        <view
          v-for="src in sources"
          :key="src.id"
          class="rail-item"
          :class="{ active: src.id === selectedSourceId }"
          @click="src.id && emit('select-source', src)"
        >
          <view class="item-icon-box" :class="{ active: src.id === selectedSourceId }">
            <LineIcon
              :name="isImageMedia(undefined, src.title) ? 'file' : 'file-text'"
              size="24rpx"
              :color="src.id === selectedSourceId ? '#FFFFFF' : '#7A7A75'"
            />
          </view>

          <view class="item-body">
            <text class="item-title">{{ src.title || '未命名资料' }}</text>
            <view class="item-meta-row">
              <text
                class="status-pill"
                :class="`tone-${getSourceStatusMeta(src.ingestionStatus).tone}`"
              >{{ getSourceStatusMeta(src.ingestionStatus).label }}</text>
              <text v-if="formatBytes(src.assetSizeBytes)" class="size-label">
                {{ formatBytes(src.assetSizeBytes) }}
              </text>
            </view>
          </view>

          <view
            class="item-delete"
            @click.stop="emit('delete-source', src)"
          >
            <LineIcon name="trash" size="22rpx" color="var(--text-muted)" />
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

const SUBJECT_ICON_KEYS = new Set([
  'book', 'reading', 'library', 'code', 'computer', 'analysis', 'math',
  'school', 'art', 'notes', 'idea', 'settings', 'focus', 'achievement',
  'research', 'laptop',
])

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

const safeIcon = computed(() => (props.subjectIcon && SUBJECT_ICON_KEYS.has(props.subjectIcon) ? props.subjectIcon : 'book'))
const readyCount = computed(() => props.sources.filter(item => item.ingestionStatus === 'READY').length)
</script>

<style scoped>
.rail-card {
  width: 300rpx;
  height: 100%;
  flex-shrink: 0;
  background: var(--bg-card);
  border-radius: 28rpx;
  border: 1rpx solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.rail-top {
  padding: 22rpx 20rpx 16rpx;
  border-bottom: 1rpx solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  font-size: 24rpx;
  color: var(--text-secondary);
  font-weight: 500;
  cursor: pointer;
}

.subject-banner {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.subject-badge {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.subject-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.subject-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subject-sub {
  font-size: 21rpx;
  color: var(--text-muted);
}

.rail-actions {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.upload-btn {
  flex: 1;
  height: 62rpx;
  line-height: 62rpx;
  margin: 0;
  padding: 0 18rpx;
  border-radius: 16rpx;
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: 23rpx;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.upload-btn::after {
  border: none;
}

.upload-btn[disabled] {
  opacity: 0.6;
}

.refresh-btn {
  width: 62rpx;
  height: 62rpx;
  border-radius: 16rpx;
  background: var(--bg-primary);
  border: 1rpx solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.rail-scroll {
  flex: 1;
  min-height: 0;
  padding: 16rpx;
  box-sizing: border-box;
}

.section-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 8rpx 10rpx;
  font-size: 21rpx;
  font-weight: 600;
  color: var(--text-muted);
}

.count-num {
  font-family: var(--font-family-mono);
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.rail-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 16rpx 14rpx;
  border-radius: 18rpx;
  border: 1rpx solid transparent;
  background: transparent;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.rail-item.overview-item {
  background: var(--bg-primary);
}

.rail-item.active {
  background: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.item-icon-box {
  width: 48rpx;
  height: 48rpx;
  border-radius: 14rpx;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-icon-box.active {
  background: var(--color-zen-sage);
}

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.item-title {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-sub {
  font-size: 20rpx;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-wrap: wrap;
}

.status-pill {
  font-size: 19rpx;
  padding: 2rpx 10rpx;
  border-radius: 999rpx;
  font-weight: 600;
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

.size-label {
  font-size: 19rpx;
  color: var(--text-muted);
  font-family: var(--font-family-mono);
}

.item-delete {
  width: 40rpx;
  height: 40rpx;
  border-radius: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  flex-shrink: 0;
}

.rail-state {
  padding: 40rpx 16rpx;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  font-size: 23rpx;
  color: var(--text-muted);
}

.rail-state.error {
  color: var(--color-danger);
}

.state-hint {
  font-size: 20rpx;
  color: var(--text-muted);
}
</style>
