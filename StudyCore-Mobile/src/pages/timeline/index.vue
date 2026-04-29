<template>
  <view class="page">
    <!-- MOBILE VIEW -->
    <view class="mobile-view">
      <!-- Search Box -->
      <view class="search-section">
        <view class="search-box" @click="focusSearch">
          <text class="search-icon">⌕</text>
          <input
            class="search-input"
            v-model="query"
            placeholder="搜索你的个人知识库..."
            placeholder-class="search-placeholder"
            confirm-type="search"
            @confirm="handleSearch"
            :focus="isSearchFocused"
          />
          <view v-if="query" class="search-clear" @click.stop="query = ''">
            <text class="clear-icon">✕</text>
          </view>
        </view>
      </view>

      <!-- Stats -->
      <view class="stats-row">
        <view class="stat-card" v-for="stat in stats" :key="stat.label">
          <text class="stat-icon">{{ stat.icon }}</text>
          <view class="stat-info">
            <text class="stat-value">{{ stat.value }}</text>
            <text class="stat-label">{{ stat.label }}</text>
          </view>
        </view>
      </view>

      <!-- Pending Tasks -->
      <view class="section">
        <view class="sec-head">
          <text class="sec-title">待同步任务</text>
          <text class="sec-count">{{ pendingTasks.length }} 项</text>
        </view>
        <view class="pend-list">
          <view v-for="t in pendingTasks" :key="t.id" class="pend-card" :style="{ borderLeftColor: t.color || 'var(--text-accent)' }">
            <view class="pend-main">
              <text class="pend-name">{{ t.name }}</text>
              <text class="pend-sub">{{ t.subject }}</text>
            </view>
            <view class="pend-meta">
              <text class="pend-dur">{{ t.duration }}h</text>
              <view class="load-b" :class="'load-'+t.load"><text class="load-t">{{ t.loadText }}</text></view>
            </view>
          </view>
        </view>
      </view>

      <!-- Recent Knowledge -->
      <view class="section">
        <view class="sec-head">
          <text class="sec-title">近期知识块</text>
          <text class="sec-action">查看全部 →</text>
        </view>
        <view class="block-list">
          <view
            v-for="block in recentBlocks"
            :key="block.id"
            class="block-card"
          >
            <view class="block-top">
              <view class="block-tag" :style="{ background: 'var(--color-bg-tertiary)' }">
                <text class="block-tag-text">{{ block.subject }}</text>
              </view>
              <text class="block-time">{{ block.time }}</text>
            </view>
            <text class="block-title">{{ block.title }}</text>
            <text class="block-preview">{{ block.preview }}</text>
            <view class="block-footer">
              <text class="block-source">{{ block.source }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- TABLET VIEW -->
    <view class="tablet-view main-layout">
      <!-- Left Column -->
      <view class="left-col">
        <view class="stats-row">
          <view class="stat-card" v-for="stat in stats" :key="stat.label">
            <text class="stat-icon">{{ stat.icon }}</text>
            <view class="stat-info">
              <text class="stat-value">{{ stat.value }}</text>
              <text class="stat-label">{{ stat.label }}</text>
            </view>
          </view>
        </view>

        <view class="date-bar">
          <view v-for="day in weekDays" :key="day.date" class="date-item" :class="{ active: day.isToday }">
            <text class="date-weekday">{{ day.weekday }}</text>
            <text class="date-num">{{ day.date }}</text>
          </view>
        </view>

        <view class="section">
          <view class="sec-head"><text class="sec-title">待同步任务</text><text class="sec-count">{{ pendingTasks.length }} 项</text></view>
          <view class="pend-list">
            <view v-for="t in pendingTasks" :key="t.id" class="pend-card" :style="{ borderLeftColor: t.color || 'var(--text-accent)' }">
              <view class="pend-main">
                <text class="pend-name">{{ t.name }}</text>
                <text class="pend-sub">{{ t.subject }}</text>
              </view>
              <view class="pend-meta">
                <text class="pend-dur">{{ t.duration }}h</text>
                <view class="load-b" :class="'load-'+t.load"><text class="load-t">{{ t.loadText }}</text></view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- Right Column -->
      <view class="right-col">
        <view class="timeline">
          <view v-for="slot in timeSlots" :key="slot.time" class="time-slot">
            <text class="slot-time">{{ slot.time }}</text>
            <view v-if="slot.task" class="slot-task" :style="{ borderLeftColor: slot.task.color || 'var(--text-accent)' }">
              <view class="task-header">
                <text class="task-name">{{ slot.task.name }}</text>
                <text class="task-dur">{{ slot.task.duration }}h</text>
              </view>
              <text class="task-sub">{{ slot.task.subject }}</text>
              <view class="task-actions">
                <view class="tbtn tbtn-ok" @click="completeTask(slot)"><text class="tbtn-t">✓ 完成</text></view>
                <view class="tbtn tbtn-defer" @click="deferTask(slot)"><text class="tbtn-t">延后</text></view>
              </view>
            </view>
            <view v-else class="slot-empty"><text class="empty-t">空闲</text></view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/store/useTaskStore'
import { useBlockStore } from '@/store/useBlockStore'
import { vibrate } from '@/api/device'

const taskStore = useTaskStore()
const blockStore = useBlockStore()

const { pendingTasks, timeSlots, completedCount, pendingCount, totalFocusHours } = storeToRefs(taskStore)
const { recentBlocks } = storeToRefs(blockStore)

const query = ref('')
const isSearchFocused = ref(false)

const focusSearch = () => { isSearchFocused.value = true }
const handleSearch = () => {
  if (!query.value.trim()) return
  console.log('Search:', query.value)
}

const stats = computed(() => [
  { icon: '▤', value: String(pendingCount.value), label: '待完成' },
  { icon: '✦', value: String(completedCount.value), label: '已完成' },
  { icon: '◷', value: totalFocusHours.value, label: '已专注' },
  { icon: '☍', value: '中', label: '脑力负荷' },
])

const weekDays = [
  { weekday: '一', date: '25', isToday: false },
  { weekday: '二', date: '26', isToday: false },
  { weekday: '三', date: '27', isToday: false },
  { weekday: '四', date: '28', isToday: true },
  { weekday: '五', date: '29', isToday: false },
  { weekday: '六', date: '30', isToday: false },
  { weekday: '日', date: '1', isToday: false },
]

const completeTask = (slot: any) => {
  vibrate('light')
  taskStore.completeTask(slot.time)
  uni.showToast({ title: '已完成', icon: 'success' })
}

const deferTask = (slot: any) => {
  vibrate('light')
  taskStore.deferTask(slot.time)
  uni.showToast({ title: '已延后', icon: 'none' })
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg-primary); padding-bottom: 180rpx; }

/* Visibility Control */
.tablet-view { display: none; }
.mobile-view { display: flex; flex-direction: column; }
@media screen and (min-width: 768px) {
  .tablet-view { display: flex; }
  .mobile-view { display: none; }
}

/* Search */
.search-section { padding: 40rpx 24rpx 20rpx; }
.search-box {
  display: flex;
  align-items: center;
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: 0 28rpx;
  height: 96rpx;
  box-shadow: var(--shadow-sm);
  transition: all 0.25s;
}
.search-box:active {
  border-color: var(--border-accent);
  box-shadow: var(--accent-glow);
}
.search-icon {
  font-size: 36rpx;
  margin-right: 16rpx;
  color: var(--text-secondary);
}
.search-input {
  flex: 1;
  font-size: 30rpx;
  color: var(--text-primary);
  background: transparent;
}
.search-placeholder {
  color: var(--text-muted);
  font-size: 28rpx;
}
.search-clear {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
}
.clear-icon {
  font-size: 22rpx;
  color: var(--text-muted);
}

/* Stats */
.stats-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16rpx; padding: 12rpx 24rpx 24rpx; }
.stat-card { display: flex; flex-direction: column; align-items: center; padding: 20rpx 8rpx; background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.stat-icon { font-size: 36rpx; margin-bottom: 8rpx; color: var(--text-accent); }
.stat-info { display: flex; flex-direction: column; align-items: center; }
.stat-value { font-size: 36rpx; font-weight: 700; color: var(--text-primary); }
.stat-label { font-size: 20rpx; color: var(--text-muted); margin-top: 4rpx; }

/* Section Generic */
.section { padding: 16rpx 24rpx 24rpx; }
.sec-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.sec-title { font-size: 34rpx; font-weight: 700; color: var(--text-primary); }
.sec-count { font-size: 24rpx; color: var(--text-muted); }
.sec-action { font-size: 24rpx; color: var(--text-accent); font-weight: 500; }

/* Date Bar */
.date-bar { display: flex; justify-content: space-between; padding: 16rpx 24rpx 24rpx; gap: 12rpx; }
.date-item { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 16rpx 0; border-radius: var(--radius-lg); background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); }
.date-item.active { background: var(--text-primary); border-color: transparent; }
.date-weekday { font-size: 22rpx; color: var(--text-muted); margin-bottom: 6rpx; }
.date-item.active .date-weekday { color: var(--color-bg-elevated); }
.date-num { font-size: 30rpx; font-weight: 700; color: var(--text-primary); }
.date-item.active .date-num { color: var(--color-bg-primary); }

/* Timeline */
.timeline { padding: 0 24rpx; }
.time-slot { display: flex; gap: 20rpx; margin-bottom: 20rpx; min-height: 100rpx; }
.slot-time { width: 90rpx; font-size: 26rpx; font-weight: 600; color: var(--text-muted); padding-top: 16rpx; flex-shrink: 0; }
.slot-task { flex: 1; background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); border-left: 6rpx solid; border-radius: var(--radius-lg); padding: 24rpx; box-shadow: var(--shadow-sm); }
.task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8rpx; }
.task-name { font-size: 30rpx; font-weight: 600; color: var(--text-primary); flex: 1; }
.task-dur { font-size: 24rpx; color: var(--text-muted); background: var(--color-bg-tertiary); padding: 4rpx 12rpx; border-radius: var(--radius-sm); }
.task-sub { display: block; font-size: 24rpx; color: var(--text-secondary); margin-bottom: 16rpx; }
.task-actions { display: flex; gap: 16rpx; }
.tbtn { padding: 10rpx 24rpx; border-radius: var(--radius-md); }
.tbtn:active { transform: scale(0.95); }
.tbtn-ok { background: rgba(181, 172, 159, 0.15); border: 2rpx solid var(--border-accent); }
.tbtn-ok .tbtn-t { font-size: 24rpx; font-weight: 600; color: var(--text-accent); }
.tbtn-defer { background: var(--color-bg-tertiary); }
.tbtn-defer .tbtn-t { font-size: 24rpx; font-weight: 600; color: var(--text-secondary); }
.slot-empty { flex: 1; display: flex; align-items: center; padding: 0 24rpx; border: 2rpx dashed var(--border-subtle); border-radius: var(--radius-lg); min-height: 80rpx; }
.empty-t { font-size: 24rpx; color: var(--text-muted); }

/* Pending Tasks */
.pend-list { display: flex; flex-direction: column; gap: 16rpx; }
.pend-card { display: flex; justify-content: space-between; align-items: center; padding: 24rpx; background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); border-left: 6rpx solid; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.pend-card:active { transform: scale(0.98); }
.pend-main { flex: 1; }
.pend-name { display: block; font-size: 30rpx; font-weight: 600; color: var(--text-primary); margin-bottom: 6rpx; }
.pend-sub { display: block; font-size: 24rpx; color: var(--text-secondary); }
.pend-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
.pend-dur { font-size: 26rpx; font-weight: 600; color: var(--text-muted); }
.load-b { padding: 4rpx 14rpx; border-radius: var(--radius-full); }
.load-low { background: var(--color-bg-tertiary); border: 1px solid var(--border-subtle); }
.load-low .load-t { color: var(--text-secondary); }
.load-medium { background: var(--color-bg-tertiary); border: 1px solid var(--border-subtle); }
.load-medium .load-t { color: var(--text-secondary); }
.load-high { background: var(--color-bg-tertiary); border: 1px solid var(--border-subtle); }
.load-high .load-t { color: var(--text-secondary); }
.load-t { font-size: 20rpx; font-weight: 600; }

/* Block list */
.block-list { display: flex; flex-direction: column; gap: 20rpx; }
.block-card { background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); border-radius: var(--radius-lg); padding: 28rpx; box-shadow: var(--shadow-sm); transition: transform 0.2s; }
.block-card:active { transform: scale(0.98); }
.block-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.block-tag { padding: 6rpx 16rpx; border-radius: var(--radius-full); }
.block-tag-text { font-size: 22rpx; font-weight: 600; color: var(--text-primary); }
.block-time { font-size: 22rpx; color: var(--text-muted); }
.block-title { display: block; font-size: 32rpx; font-weight: 600; color: var(--text-primary); margin-bottom: 10rpx; }
.block-preview { display: block; font-size: 26rpx; color: var(--text-secondary); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 16rpx; }
.block-footer { display: flex; align-items: center; }
.block-source { font-size: 22rpx; color: var(--text-muted); padding: 4rpx 12rpx; background: var(--color-bg-tertiary); border-radius: var(--radius-sm); }

/* Tablet Setup */
@media screen and (min-width: 768px) {
  .main-layout { flex-direction: row; gap: 40rpx; padding: 40rpx; }
  .left-col { flex: 1; min-width: 300px; max-width: 400px; }
  .right-col { flex: 1.5; }
  .stats-row, .section, .date-bar { padding-left: 0; padding-right: 0; }
  .timeline { padding-left: 0; padding-right: 0; }
}
</style>
