<template>
  <TabletLayout>
    <view class="t-subject-hall">
      <!-- Header -->
      <view class="header">
        <view class="header-left">
          <text class="page-title">学科大厅</text>
          <text class="page-sub">构建与拓展你的专属知识体系</text>
        </view>
        <view class="header-actions">
          <view class="search-box">
            <LineIcon name="search" size="26rpx" color="var(--color-zen-stone, #A8A8A5)" />
            <input class="search-input" v-model="searchQuery" placeholder="搜索学科..." />
          </view>
          <view class="btn primary-btn" @click="openCreateModal">
            <text>+ 新建学科</text>
          </view>
        </view>
      </view>

      <!-- Content -->
      <scroll-view scroll-y class="content">
        <!-- Empty State -->
        <view v-if="filteredSubjects.length === 0 && !searchQuery" class="empty-state">
          <LineIcon name="grid" size="88rpx" color="var(--color-zen-stone, #A8A8A5)" />
          <text class="empty-title">还没有学科</text>
          <text class="empty-hint">点击右上角「+ 新建学科」开始创建你的知识空间</text>
        </view>

        <!-- Grid -->
        <view class="grid" v-else>
          <view
            v-for="subj in filteredSubjects"
            :key="subj.id"
            class="subject-card"
            @click="enterWorkspace(subj.id)"
          >
            <view class="card-accent-stripe" />
            <view class="card-header">
              <view class="s-icon">
                <LineIcon v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)" :name="`subj-${subj.icon || 'book'}`" size="56rpx" />
                <text v-else>{{ getLegacySubjectIcon(subj.icon) }}</text>
              </view>
              <view class="card-actions">
                <view class="action-btn" @click.stop="openEditModal(subj)">
                  <text>编辑</text>
                </view>
                <view class="action-btn danger" @click.stop="handleDeleteSubject(subj)">
                  <text>删除</text>
                </view>
              </view>
            </view>
            <text class="s-name">{{ subj.name }}</text>
            <text class="s-desc" v-if="subj.description">{{ subj.description }}</text>
            <text class="s-desc placeholder-desc" v-else>暂无描述</text>
            <view class="s-meta">
              <text class="s-blocks">{{ subj.blockCount || 0 }} 个知识块</text>
              <text class="s-files">{{ subj.fileCount || 0 }} 个文件</text>
            </view>
            <view class="progress-bar">
              <view
                class="progress-fill"
                :style="{ width: getMasteryPercent(subj) + '%' }"
              ></view>
            </view>
            <text class="mastery-label">掌握度 {{ getMasteryPercent(subj) }}%</text>
          </view>

          <!-- Add Card -->
          <view class="subject-card add-card" @click="openCreateModal">
            <view class="add-circle"><LineIcon name="plus" size="36rpx" color="var(--color-zen-stone, #A8A8A5)" /></view>
            <text class="add-text">创建新学科</text>
          </view>
        </view>
      </scroll-view>

      <!-- 重构后的弹窗根容器：将遮罩层与卡片分离为同级兄弟元素，固定合适像素宽度适配平板，彻底解决软键盘/焦点与布局错位问题 -->
      <view v-if="showModal" class="modal-root">
        <!-- 遮罩层 (层级 1) -->
        <view class="modal-overlay" @click="showModal = false" @touchmove.stop.prevent></view>

        <!-- 弹窗卡片 (层级 2) -->
        <view class="modal-card" @click.stop>
          <view class="modal-header">
            <view class="title-group">
              <text class="modal-title">{{ isEditing ? '编辑学科' : '新建学科' }}</text>
            </view>
            <view class="modal-close" @click="showModal = false"><LineIcon name="close" size="26rpx" /></view>
          </view>

          <scroll-view scroll-y class="modal-body">
            <view class="form-group">
              <text class="form-label">学科名称 <text class="required">*</text></text>
              <input
                class="form-input"
                v-model="formData.name"
                placeholder="例如: 高等数学、现代物理..."
                cursor-spacing="24"
              />
            </view>

            <view class="form-group">
              <text class="form-label">学科简介</text>
              <input
                class="form-input"
                v-model="formData.description"
                placeholder="添加重点研究方向或简介..."
                cursor-spacing="24"
              />
            </view>

            <view class="form-group">
              <text class="form-label">标志图标</text>
              <view class="icon-grid">
                <view
                  v-for="option in subjectIconOptions"
                  :key="option.key"
                  class="icon-option"
                  :class="{ selected: formData.icon === option.key }"
                  @click="formData.icon = option.key"
                  :title="option.label"
                >
                  <LineIcon :name="`subj-${option.key}`" size="40rpx" :color="formData.icon === option.key ? '#7D9372' : 'var(--color-zen-stone)'" />
                </view>
              </view>
            </view>
          </scroll-view>

          <view class="modal-footer">
            <view class="btn secondary-btn" @click="showModal = false"><text>取消</text></view>
            <view class="btn primary-btn submit-btn" @click="handleSave">
              <text class="btn-text">{{ isEditing ? '保存修改' : '立即创建' }}</text>
            </view>
          </view>
        </view>
      </view>

    </view>
  </TabletLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import { useBlockStore } from '@/store/useBlockStore'
import { subjectIconOptions, isSubjectIconKey, getLegacySubjectIcon } from '@/utils/subjectIcon'

const subjectStore = useSubjectStore()
const blockStore = useBlockStore()
const { subjects } = storeToRefs(subjectStore)
const { recentBlocks } = storeToRefs(blockStore)

// State
const searchQuery = ref('')
const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const formData = ref({
  name: '',
  description: '',
  icon: 'book'
})

// Computed
const filteredSubjects = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return subjects.value
  return subjects.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q)
  )
})

// Methods
const getMasteryPercent = (subj: Subject): number => {
  const blocks = recentBlocks.value.filter(b => b.subjectId === subj.id)
  if (blocks.length === 0) return 0
  const totalMastery = blocks.reduce((sum, b) => sum + (b.mastery || 0), 0)
  return Math.round(totalMastery / blocks.length)
}

const openCreateModal = () => {
  isEditing.value = false
  editingId.value = null
  formData.value = { name: '', description: '', icon: 'book' }
  showModal.value = true
}

const openEditModal = (subj: Subject) => {
  isEditing.value = true
  editingId.value = subj.id
  formData.value = {
    name: subj.name,
    description: subj.description || '',
    icon: subj.icon
  }
  showModal.value = true
}

const handleSave = async () => {
  if (!formData.value.name.trim()) {
    uni.showToast({ title: '请输入学科名称', icon: 'none' })
    return
  }

  if (isEditing.value && editingId.value) {
    const existing = subjects.value.find(s => s.id === editingId.value)
    if (existing) {
      await subjectStore.updateSubject({
        ...existing,
        name: formData.value.name,
        description: formData.value.description,
        icon: formData.value.icon
      })
      uni.showToast({ title: '学科已更新', icon: 'success' })
    }
  } else {
    const newId = await subjectStore.addSubject(
      formData.value.name,
      formData.value.description,
      formData.value.icon
    )
    uni.showToast({ title: '学科已创建', icon: 'success' })
    // Auto-navigate to workspace
    enterWorkspace(newId)
  }
  showModal.value = false
}

const handleDeleteSubject = (subj: Subject) => {
  uni.showModal({
    title: '确认删除',
    content: `删除「${subj.name}」及其所有数据？`,
    success: async (res) => {
      if (res.confirm) {
        await subjectStore.deleteSubject(subj.id)
        uni.showToast({ title: '已删除', icon: 'success' })
      }
    }
  })
}

const enterWorkspace = (id: string) => {
  uni.navigateTo({
    url: `/pages/tablet/workspace/index?id=${id}`
  })
}

onMounted(async () => {
  await blockStore.fetchBlocks()
  await subjectStore.loadSubjects()
})
</script>

<style scoped>
.t-subject-hall {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 48rpx 56rpx;
  box-sizing: border-box;
  background: var(--color-zen-ivory, #F9F9F7);
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 48rpx;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.page-title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.page-sub {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
}
.header-actions {
  display: flex;
  gap: 20rpx;
  align-items: center;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 32rpx;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16rpx);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  width: 320rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
  transition: all 0.2s;
}
.search-box:focus-within {
  border-color: var(--color-zen-graphite, #1C1C1A);
  width: 380rpx;
}
.search-input {
  flex: 1;
  font-size: 26rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  background: transparent;
}
.btn {
  padding: 18rpx 40rpx;
  border-radius: 999rpx;
  font-weight: 600;
  font-size: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:active { transform: scale(0.96); }
.primary-btn {
  background: var(--color-zen-graphite, #1C1C1A);
  color: var(--color-zen-white, #FFFFFF);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
}
.secondary-btn {
  background: var(--color-zen-ivory, #F9F9F7);
  color: var(--color-zen-graphite, #1C1C1A);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
}

/* Content */
.content {
  flex: 1;
  height: 0;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx;
  gap: 16rpx;
}
.empty-title {
  font-size: 36rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
}
.empty-hint {
  font-size: 28rpx;
  color: var(--color-zen-stone, #A8A8A5);
}

/* Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 36rpx;
  padding-bottom: 40rpx;
}

/* Subject Card */
.subject-card {
  position: relative;
  overflow: hidden;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 36rpx;
  padding: 44rpx 40rpx 40rpx;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.02);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.subject-card:hover {
  transform: translateY(-4rpx);
  box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.06);
}
.card-accent-stripe {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 12rpx;
  transition: height 0.25s;
}
.subject-card:hover .card-accent-stripe {
  height: 16rpx;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.s-icon {
  font-size: 56rpx;
}
.card-actions {
  display: flex;
  gap: 12rpx;
  opacity: 0;
  transition: opacity 0.2s;
}
.subject-card:hover .card-actions {
  opacity: 1;
}
.action-btn {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  font-size: 22rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
  transition: all 0.2s;
}
.action-btn:hover {
  background: #f0f0ee;
}
.action-btn.danger {
  color: #b05555;
  border-color: rgba(212, 163, 163, 0.4);
}

.s-name {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  margin-bottom: 8rpx;
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.s-desc {
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  margin-bottom: 20rpx;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 68rpx;
  line-height: 1.5;
}
.placeholder-desc {
  opacity: 0.5;
  font-style: italic;
}
.s-meta {
  display: flex;
  gap: 24rpx;
  font-size: 24rpx;
  color: var(--color-zen-stone, #A8A8A5);
  margin-bottom: 20rpx;
}

.progress-bar {
  height: 14rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  overflow: hidden;
  margin-bottom: 10rpx;
}
.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  transition: width 0.3s;
}
.mastery-label {
  font-size: 22rpx;
  color: var(--color-zen-stone, #A8A8A5);
  text-align: right;
  font-weight: 600;
}

/* Add Card */
.add-card {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed var(--color-zen-stone, #A8A8A5);
  background: transparent;
  gap: 16rpx;
  opacity: 0.7;
  min-height: 260rpx;
  border-radius: 36rpx;
  box-shadow: none;
}
.add-card:hover {
  opacity: 1;
  border-color: var(--color-zen-graphite, #1C1C1A);
  background: rgba(255, 255, 255, 0.4);
}
.add-circle {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: var(--color-zen-white, #FFFFFF);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
}
.add-text {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-zen-graphite, #1C1C1A);
}

/* Modal Root 架构：同级分层，适配平板固定宽度 */
.modal-root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(28, 28, 26, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1;
}
.modal-card {
  position: relative;
  z-index: 2;
  width: 540px;
  max-width: 88vw;
  max-height: 85vh;
  background: var(--color-zen-white, #FFFFFF);
  border-radius: 40rpx;
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalPop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(16rpx);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 36rpx 40rpx;
  border-bottom: 1px solid var(--color-zen-hairline, #E6E6E4);
}
.title-group {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.modal-title {
  font-size: 36rpx;
  font-weight: 800;
  color: var(--color-zen-graphite, #1C1C1A);
  font-family: "Outfit", "Plus Jakarta Sans", sans-serif;
}
.modal-close {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.modal-body {
  padding: 36rpx 40rpx;
  max-height: 58vh;
  box-sizing: border-box;
}

.form-group {
  margin-bottom: 32rpx;
}
.form-label {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-zen-graphite, #1C1C1A);
  display: block;
  margin-bottom: 12rpx;
}
.required {
  color: #b05555;
  margin-left: 4rpx;
}
.form-input {
  width: 100%;
  padding: 24rpx 32rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  border-radius: 999rpx;
  font-size: 28rpx;
  color: var(--color-zen-graphite, #1C1C1A);
  box-sizing: border-box;
  min-height: 80rpx;
}

.icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.icon-option {
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  background: var(--color-zen-ivory, #F9F9F7);
  border: 1px solid var(--color-zen-hairline, #E6E6E4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  cursor: pointer;
  transition: all 0.2s;
}
.icon-option:hover {
  background: #f0f0ee;
}
.icon-option.selected {
  border-color: #7D9372;
  border-width: 3rpx;
  background: rgba(125, 147, 114, 0.1);
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 20rpx;
  padding: 28rpx 40rpx;
  border-top: 1px solid var(--color-zen-hairline, #E6E6E4);
  background: var(--color-zen-white, #FFFFFF);
}
.primary-btn {
  background: linear-gradient(135deg, #A3B19B 0%, #7D9372 100%);
  color: #FFFFFF;
}
.submit-btn {
  transition: opacity 0.2s;
}
.submit-btn:hover {
  opacity: 0.9;
}
.btn-text {
  color: var(--color-zen-white, #FFFFFF);
  font-weight: 700;
}
</style>
