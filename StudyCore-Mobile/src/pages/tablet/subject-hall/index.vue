<template>
  <TabletLayout>
    <view class="t-subject-hall">
      <view class="header">
        <text class="page-title">学科大厅</text>
        <view class="header-actions">
          <view class="btn primary-btn">+ 新建学科</view>
        </view>
      </view>

      <scroll-view scroll-y class="content">
        <view class="grid">
          <view 
            v-for="subj in subjects" 
            :key="subj.id"
            class="subject-card"
            @click="enterWorkspace(subj.id)"
          >
            <view class="card-header">
              <text class="s-icon">{{ subj.icon }}</text>
              <view class="actions">...</view>
            </view>
            <text class="s-name">{{ subj.name }}</text>
            <view class="s-meta">
              <text class="s-blocks">12 个知识块</text>
              <text class="s-progress">掌握度 45%</text>
            </view>
            <view class="progress-bar">
              <view class="progress-fill" :style="{ width: '45%', background: subj.color }"></view>
            </view>
          </view>
          
          <view class="subject-card add-card">
            <text class="add-icon">+</text>
            <text class="add-text">创建新学科</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useSubjectStore } from '@/store/useSubjectStore'

const subjectStore = useSubjectStore()
const { subjects } = storeToRefs(subjectStore)

const enterWorkspace = (id: string) => {
  uni.navigateTo({
    url: `/pages/tablet/workspace/index?id=${id}`
  })
}

onMounted(() => {
  subjectStore.loadSubjects()
})
</script>

<style scoped>
.t-subject-hall {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 60rpx;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 60rpx;
}
.page-title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--text-primary);
}
.primary-btn {
  background: var(--text-primary);
  color: var(--color-bg-primary);
  padding: 20rpx 40rpx;
  border-radius: var(--radius-md);
  font-weight: 600;
}

.content {
  flex: 1;
  height: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 40rpx;
}

.subject-card {
  background: var(--color-bg-secondary);
  border: 2rpx solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 40rpx;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.subject-card:hover {
  transform: translateY(-4rpx);
  box-shadow: var(--shadow-md);
}

.card-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 32rpx;
}
.s-icon {
  font-size: 64rpx;
}
.actions {
  color: var(--text-muted);
  font-weight: bold;
}

.s-name {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16rpx;
}
.s-meta {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: var(--text-muted);
  margin-bottom: 24rpx;
}

.progress-bar {
  height: 12rpx;
  background: var(--border-default);
  border-radius: 6rpx;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 6rpx;
}

.add-card {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4rpx dashed var(--border-default);
  background: transparent;
  gap: 16rpx;
  opacity: 0.7;
}
.add-card:hover {
  opacity: 1;
  border-color: var(--text-accent);
}
.add-icon {
  font-size: 48rpx;
  color: var(--text-muted);
}
.add-text {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-muted);
}
</style>
