<template>
  <view class="page">
    <!-- MOBILE VIEW -->
    <view class="mobile-view">
      <view class="item-hero hero">
        <view class="hero-greeting">
          <text class="greeting-text">你好，同学 ✦</text>
          <text class="greeting-sub">今天也要专注前行</text>
        </view>
      </view>

      <view class="item-datebar date-bar">
        <view v-for="day in weekDays" :key="day.date" class="date-item" :class="{ active: day.isToday }">
          <text class="date-weekday">{{ day.weekday }}</text>
          <text class="date-num">{{ day.date }}</text>
        </view>
      </view>

      <view class="item-timeline section">
        <view class="section-header">
          <text class="section-title">今日时间线</text>
        </view>
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

      <view class="item-quick section">
        <text class="section-title">快捷操作</text>
        <view class="quick-grid">
          <view
            v-for="action in quickActions"
            :key="action.label"
            class="quick-card"
            @click="handleQuickAction(action)"
          >
            <text class="quick-icon">{{ action.icon }}</text>
            <text class="quick-label">{{ action.label }}</text>
            <text class="quick-desc">{{ action.desc }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- TABLET VIEW -->
    <view class="tablet-view main-layout">
      <view class="left-col">
        <view class="hero">
          <view class="hero-greeting">
            <text class="greeting-text">你好，同学 ✦</text>
            <text class="greeting-sub">开始今天的知识探索吧</text>
          </view>
        </view>

        <view class="search-section">
          <view class="search-box" @click="focusSearch">
            <text class="search-icon">⌕</text>
            <input
              class="search-input"
              v-model="query"
              placeholder="唤醒你的个人知识库..."
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

        <view class="section">
          <text class="section-title">快捷操作</text>
          <view class="quick-grid">
            <view
              v-for="action in quickActions"
              :key="action.label"
              class="quick-card"
              @click="handleQuickAction(action)"
            >
              <text class="quick-icon">{{ action.icon }}</text>
              <text class="quick-label">{{ action.label }}</text>
              <text class="quick-desc">{{ action.desc }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="right-col">
        <view class="section">
          <view class="section-header">
            <text class="section-title">近期知识块</text>
            <text class="section-action">查看全部 →</text>
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
    </view>

    <!-- FAB: Voice Input -->
    <view class="fab" @click="handleVoice">
      <text class="fab-icon">⚲</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/store/useTaskStore'
import { useBlockStore } from '@/store/useBlockStore'
import { vibrate, takePhoto } from '@/api/device'
import { transcribeAndExtractTasks } from '@/api/aiClient'

const taskStore = useTaskStore()
const blockStore = useBlockStore()

const { timeSlots } = storeToRefs(taskStore)
const { recentBlocks } = storeToRefs(blockStore)

const query = ref('')
const isSearchFocused = ref(false)

const focusSearch = () => { isSearchFocused.value = true }
const handleSearch = () => {
  if (!query.value.trim()) return
  console.log('Search:', query.value)
}

const weekDays = [
  { weekday: '一', date: '25', isToday: false },
  { weekday: '二', date: '26', isToday: false },
  { weekday: '三', date: '27', isToday: false },
  { weekday: '四', date: '28', isToday: true },
  { weekday: '五', date: '29', isToday: false },
  { weekday: '六', date: '30', isToday: false },
  { weekday: '日', date: '1', isToday: false },
]

const handleVoice = async () => {
  vibrate('light')
  uni.showToast({ title: '正在聆听...', icon: 'none', duration: 1500 })
  
  // 模拟语音转文字后的内容
  const mockTranscription = "我今晚八点需要复习一下昨天学的Transformer模型机制，可能需要一个小时。哦对，明天下午还要提交数据结构的实验报告。";
  
  setTimeout(async () => {
    uni.showLoading({ title: 'AI 意图解析中...' })
    try {
      const result = await transcribeAndExtractTasks(mockTranscription)
      uni.hideLoading()
      
      // 添加到块(作为知识/备忘)
      blockStore.addBlock({
        id: `voice-${Date.now()}`,
        subject: '语音备忘',
        title: result.summary || '未命名备忘',
        preview: mockTranscription,
        source: 'Voice Note',
        time: '刚刚',
        color: '#f59e0b'
      })
      
      // 提取出的任务放入明天或今天的Timeline
      if (result.tasks && result.tasks.length > 0) {
        uni.showModal({
          title: '已自动提取任务',
          content: `AI 提取了 ${result.tasks.length} 个任务，是否一键排入日程？`,
          success: (res) => {
            if (res.confirm) {
              uni.showToast({ title: '已添加到时间流', icon: 'success' })
              // 这里实际上应该调用 taskStore 去添加新任务块，演示目的暂时toast
            }
          }
        })
      } else {
        uni.showToast({ title: '已保存为备忘录', icon: 'success' })
      }
    } catch (err) {
      uni.hideLoading()
      console.error(err)
      uni.showToast({ title: 'AI 解析失败，需在设置配Key', icon: 'none' })
    }
  }, 1500)
}

const handleQuickAction = async (action: any) => {
  vibrate('light')
  if (action.label === '智能伴读') {
    uni.navigateTo({ url: '/pages/pdf/index' })
  } else if (action.label === '手写笔记') {
    uni.navigateTo({ url: '/pages/handwriting/index' })
  } else if (action.label === '扫描文档') {
    try {
      const path = await takePhoto()
      uni.showToast({ title: '已扫描: ' + path.split('/').pop(), icon: 'none' })
    } catch {
      uni.showToast({ title: '已取消', icon: 'none' })
    }
  } else {
    uni.showToast({ title: `${action.label} 开发中`, icon: 'none' })
  }
}

const quickActions = [
  { icon: '✧', label: '智能伴读', desc: 'PDF 互动问答' },
  { icon: '✎', label: '手写笔记', desc: 'AI 自动转换' },
  { icon: '▤', label: '扫描文档', desc: '拍照自动入库' },
  { icon: '◱', label: '学习报告', desc: '今日数据总览' },
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
.page {
  min-height: 100vh;
  background: var(--color-bg-primary);
  padding-bottom: 180rpx;
}

/* Visibility Control */
.tablet-view { display: none; }
.mobile-view { display: flex; flex-direction: column; }
@media screen and (min-width: 768px) {
  .tablet-view { display: flex; }
  .mobile-view { display: none; }
}

/* Mobile ordering: Timeline placed above Quick Actions */
.item-hero { order: 1; }
.item-datebar { order: 2; margin-top: 10rpx; }
.item-timeline { order: 3; }
.item-quick { order: 4; margin-top: 20rpx; }

/* Hero */
.hero {
  padding: 60rpx 40rpx 20rpx;
  background: linear-gradient(180deg, var(--border-subtle) 0%, transparent 100%);
}
.greeting-text { display: block; font-size: 52rpx; font-weight: 700; color: var(--text-primary); margin-bottom: 8rpx; }
.greeting-sub { display: block; font-size: 28rpx; color: var(--text-muted); }

/* Search */
.search-section { padding: 20rpx 32rpx 32rpx; }
.search-box { display: flex; align-items: center; background: var(--color-bg-secondary); border: 2rpx solid var(--border-default); border-radius: var(--radius-xl); padding: 0 28rpx; height: 96rpx; box-shadow: var(--shadow-sm); transition: all 0.25s; }
.search-box:active { border-color: var(--border-accent); box-shadow: var(--accent-glow); }
.search-icon { font-size: 36rpx; margin-right: 16rpx; color: var(--text-secondary); }
.search-input { flex: 1; font-size: 30rpx; color: var(--text-primary); background: transparent; }
.search-placeholder { color: var(--text-muted); font-size: 28rpx; }
.search-clear { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; background: var(--color-bg-tertiary); border-radius: var(--radius-full); }
.clear-icon { font-size: 22rpx; color: var(--text-muted); }

/* Section Generic */
.section { padding: 16rpx 32rpx 24rpx; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.section-title { display: block; font-size: 34rpx; font-weight: 700; color: var(--text-primary); margin-bottom: 20rpx; }
.section-header .section-title { margin-bottom: 0; }
.section-action { font-size: 24rpx; color: var(--text-accent); font-weight: 500; }

/* Quick Actions */
.quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20rpx; }
.quick-card { padding: 28rpx 24rpx; background: var(--color-bg-secondary); border-radius: var(--radius-lg); border: 2rpx solid var(--border-subtle); box-shadow: var(--shadow-sm); transition: transform 0.2s; }
.quick-card:active { transform: scale(0.97); background: var(--color-bg-tertiary); }
.quick-icon { display: block; font-size: 48rpx; color: var(--text-accent); margin-bottom: 12rpx; }
.quick-label { display: block; font-size: 30rpx; font-weight: 600; color: var(--text-primary); margin-bottom: 6rpx; }
.quick-desc { display: block; font-size: 22rpx; color: var(--text-secondary); }

/* Date Bar */
.date-bar { display: flex; justify-content: space-between; padding: 16rpx 32rpx 24rpx; gap: 12rpx; }
.date-item { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 16rpx 0; border-radius: var(--radius-lg); background: var(--color-bg-secondary); border: 2rpx solid var(--border-subtle); }
.date-item.active { background: var(--text-primary); border-color: transparent; }
.date-weekday { font-size: 22rpx; color: var(--text-muted); margin-bottom: 6rpx; }
.date-item.active .date-weekday { color: var(--color-bg-elevated); }
.date-num { font-size: 30rpx; font-weight: 700; color: var(--text-primary); }
.date-item.active .date-num { color: var(--color-bg-primary); }

/* Timeline */
.timeline { display: flex; flex-direction: column; gap: 16rpx; }
.time-slot { display: flex; gap: 20rpx; min-height: 100rpx; }
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

/* Blocks */
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

/* FAB */
.fab { position: fixed; right: 40rpx; bottom: 200rpx; width: 112rpx; height: 112rpx; border-radius: 50%; background: var(--text-accent); display: flex; align-items: center; justify-content: center; box-shadow: var(--accent-glow); z-index: 100; transition: transform 0.2s; }
.fab:active { transform: scale(0.9); }
.fab-icon { font-size: 48rpx; color: var(--color-bg-primary); }

/* Tablet Setup */
@media screen and (min-width: 768px) {
  .main-layout { flex-direction: row; gap: 40rpx; padding: 40rpx; }
  .left-col { flex: 1; min-width: 300px; max-width: 400px; }
  .right-col { flex: 1.5; }
  .hero { padding: 20rpx 0; }
  .search-section, .section { padding-left: 0; padding-right: 0; }
  .quick-grid { grid-template-columns: 1fr; }
}
</style>
