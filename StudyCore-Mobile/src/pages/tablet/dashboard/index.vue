<template>
  <TabletLayout>
    <view class="t-dashboard">
      <!-- Left Panel: Subjects -->
      <view class="panel left-panel">
        <view class="panel-header">
          <text class="panel-title">学科空间</text>
        </view>
        <scroll-view scroll-y class="panel-content">
          <view class="subject-list">
            <view 
              class="subject-item"
              :class="{ active: !selectedSubjectId }"
              @click="selectedSubjectId = null"
            >
              <text class="s-icon">📋</text>
              <text class="s-name">全部</text>
              <text class="s-count">{{ recentBlocks.length }}</text>
            </view>
            <view 
              v-for="subj in subjects" 
              :key="subj.id"
              class="subject-item"
              :class="{ active: selectedSubjectId === subj.id }"
              @click="selectedSubjectId = subj.id"
            >
              <view class="active-indicator" :style="{ background: subj.color }" v-if="selectedSubjectId === subj.id"></view>
              <text class="s-icon">{{ subj.icon }}</text>
              <text class="s-name">{{ subj.name }}</text>
              <text class="s-count">0</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="splitter"></view>

      <!-- Center Panel: Knowledge Stream -->
      <view class="panel center-panel">
        <view class="panel-header">
          <text class="panel-title">知识流</text>
        </view>
        <scroll-view scroll-y class="panel-content">
          <view v-if="filteredBlocks.length === 0" class="empty-state">
            <text>暂无知识块</text>
          </view>
          <view 
            v-for="block in filteredBlocks" 
            :key="block.id"
            class="block-card"
          >
            <text class="b-title">{{ block.title }}</text>
            <view class="b-meta">
              <text :style="{ color: block.color }">{{ block.subject }}</text>
              <text>· {{ block.source }}</text>
            </view>
            <text class="b-preview">{{ block.preview }}</text>
          </view>
        </scroll-view>
      </view>

      <view class="splitter"></view>

      <!-- Right Panel: Schedule & Tasks -->
      <view class="panel right-panel">
        <!-- Timeline -->
        <view class="timeline-section">
          <view class="panel-header">
            <text class="panel-title">今日排期</text>
            <view class="add-btn" @click="mockAddTask">+</view>
          </view>
          <scroll-view scroll-y class="timeline-scroll">
            <view v-for="slot in timeSlots" :key="slot.time" class="t-slot">
              <text class="t-time">{{ slot.time }}</text>
              <view class="t-content">
                <view class="dash" v-if="!slot.task"></view>
                <view 
                  v-else 
                  class="t-task"
                  :style="{ borderLeftColor: slot.task.color }"
                >
                  <text class="tt-name">{{ slot.task.name }}</text>
                </view>
              </view>
            </view>
          </scroll-view>
        </view>

        <view class="h-splitter"></view>

        <!-- Pending Tasks -->
        <view class="pending-section">
          <view class="panel-header">
            <text class="panel-title">待办清单</text>
          </view>
          <scroll-view scroll-y class="pending-scroll">
            <view v-for="task in pendingTasks" :key="task.id" class="p-task">
              <view class="checkbox"></view>
              <view class="p-info">
                <text class="p-name">{{ task.name }}</text>
                <text class="p-meta" :style="{ color: task.color }">{{ task.subject }}</text>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useTaskStore } from '@/store/useTaskStore'

const blockStore = useBlockStore()
const subjectStore = useSubjectStore()
const taskStore = useTaskStore()

const { recentBlocks } = storeToRefs(blockStore)
const { subjects } = storeToRefs(subjectStore)
const { pendingTasks, timeSlots } = storeToRefs(taskStore)

const selectedSubjectId = ref<string | null>(null)

const filteredBlocks = computed(() => {
  if (!selectedSubjectId.value) return recentBlocks.value
  return recentBlocks.value.filter(b => b.subjectId === selectedSubjectId.value)
})

const mockAddTask = () => {
  uni.showToast({ title: '添加任务功能', icon: 'none' })
}

onMounted(async () => {
  await blockStore.fetchBlocks()
  await subjectStore.loadSubjects()
  await taskStore.fetchTasks()
})
</script>

<style scoped>
.t-dashboard {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-bg-primary);
  padding: var(--tablet-panel-gap);
  box-sizing: border-box;
}

.panel {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  border: 2rpx solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.left-panel {
  width: 25%;
  min-width: 250px;
}
.center-panel {
  flex: 1;
  min-width: 400px;
}
.right-panel {
  width: 30%;
  min-width: 300px;
}

.splitter {
  width: var(--tablet-panel-gap);
  flex-shrink: 0;
}
.h-splitter {
  height: 2rpx;
  background: var(--border-subtle);
  margin: 0 40rpx;
}

.panel-header {
  padding: 40rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2rpx solid var(--border-subtle);
}
.panel-title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--text-primary);
}
.panel-content {
  flex: 1;
  height: 0;
}

/* Left Panel */
.subject-list {
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.subject-item {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  border-radius: var(--radius-md);
  gap: 20rpx;
  position: relative;
}
.subject-item:hover {
  background: var(--color-bg-secondary);
}
.subject-item.active {
  background: var(--color-bg-secondary);
}
.active-indicator {
  position: absolute;
  left: 12rpx;
  width: 8rpx;
  height: 32rpx;
  border-radius: 4rpx;
}
.s-icon { font-size: 32rpx; }
.s-name {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.s-count {
  font-size: 24rpx;
  color: var(--text-muted);
}

/* Center Panel */
.empty-state {
  padding: 80rpx;
  text-align: center;
  color: var(--text-muted);
}
.block-card {
  margin: 40rpx;
  padding: 32rpx;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 2rpx solid var(--border-subtle);
}
.b-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
  display: block;
  margin-bottom: 12rpx;
}
.b-meta {
  font-size: 24rpx;
  color: var(--text-muted);
  margin-bottom: 20rpx;
}
.b-preview {
  font-size: 28rpx;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Right Panel */
.timeline-section {
  flex: 3;
  display: flex;
  flex-direction: column;
  height: 0;
}
.pending-section {
  flex: 2;
  display: flex;
  flex-direction: column;
  height: 0;
}
.timeline-scroll, .pending-scroll {
  flex: 1;
  height: 0;
  padding: 20rpx;
}
.add-btn {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: var(--text-primary);
  color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  cursor: pointer;
}

.t-slot {
  display: flex;
  gap: 20rpx;
  min-height: 100rpx;
}
.t-time {
  width: 80rpx;
  font-size: 24rpx;
  color: var(--text-muted);
  text-align: right;
  padding-top: 10rpx;
}
.t-content {
  flex: 1;
  position: relative;
}
.dash {
  position: absolute;
  top: 24rpx; left: 0; right: 0;
  height: 2rpx;
  border-top: 2rpx dashed var(--border-subtle);
}
.t-task {
  margin-bottom: 10rpx;
  padding: 20rpx;
  background: var(--color-bg-secondary);
  border-left: 8rpx solid;
  border-radius: var(--radius-md);
}
.tt-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}

.p-task {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  border-bottom: 2rpx solid var(--border-subtle);
}
.checkbox {
  width: 32rpx; height: 32rpx;
  border: 4rpx solid var(--border-default);
  border-radius: 8rpx;
}
.p-info {
  display: flex;
  flex-direction: column;
}
.p-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-primary);
}
.p-meta {
  font-size: 22rpx;
}
</style>
