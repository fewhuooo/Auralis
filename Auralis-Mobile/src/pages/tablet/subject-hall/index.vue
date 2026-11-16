<template>
  <TabletLayout>
    <view class="t-subject-hall">
      <view class="hall-header">
        <view class="header-left">
          <view class="title-row">
            <text class="page-title">学科空间</text>
            <view v-if="subjects.length > 0" class="count-pill">
              <text>共 {{ subjects.length }} 个</text>
            </view>
          </view>
          <text class="page-sub">按学科分类管理学习资料、知识点与复习进度</text>
        </view>

        <view class="header-actions">
          <view class="search-box zen-card">
            <LineIcon name="search" size="28rpx" color="var(--text-muted)" />
            <input class="search-input" v-model="searchQuery" placeholder="搜索学科名称或简介…" />
            <view v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
              <LineIcon name="close" size="24rpx" color="var(--text-muted)" />
            </view>
          </view>
          <view class="create-btn" @click="openCreateModal">
            <LineIcon name="plus" size="28rpx" color="#FFFFFF" />
            <text>新建学科</text>
          </view>
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="content-scroll">
        <view v-if="subjects.length === 0" class="empty-hall zen-card">
          <view class="empty-badge">
            <LineIcon name="book" size="56rpx" color="var(--color-zen-sage)" />
          </view>
          <text class="empty-title">还没有学科空间</text>
          <text class="empty-hint">点击右上角「新建学科」开始整理你的资料与知识块</text>
        </view>

        <view v-else-if="filteredSubjects.length === 0" class="empty-hall zen-card">
          <LineIcon name="search" size="52rpx" color="var(--text-muted)" />
          <text class="empty-title">未找到匹配的学科</text>
          <view class="clear-search-btn" @click="searchQuery = ''">清空筛选条件</view>
        </view>

        <view v-else class="grid">
          <view
            v-for="subj in filteredSubjects"
            :key="subj.id"
            class="subject-card zen-card"
            @click="enterWorkspace(subj.id)"
          >
            <view class="card-top">
              <view class="s-icon">
                <LineIcon
                  :name="`subj-${isSubjectIconKey(subj.icon) ? subj.icon : 'book'}`"
                  size="36rpx"
                  color="var(--color-zen-sage)"
                />
              </view>
              <view class="card-actions" @click.stop>
                <view class="icon-action-btn" @click="openEditModal(subj)">
                  <LineIcon name="edit" size="24rpx" color="var(--text-muted)" />
                </view>
                <view class="icon-action-btn danger" @click="handleDeleteSubject(subj)">
                  <LineIcon name="close" size="24rpx" color="var(--color-danger)" />
                </view>
              </view>
            </view>

            <text class="s-name">{{ subj.name }}</text>
            <text class="s-desc">{{ subj.description || '点击进入学科工作区查看资料与知识' }}</text>

            <view class="s-meta">
              <text class="meta-item">资料 {{ subj.fileCount || 0 }}</text>
              <text class="meta-dot">·</text>
              <text class="meta-item">知识块 {{ subj.blockCount || 0 }}</text>
            </view>
          </view>

          <view class="subject-card add-card" @click="openCreateModal">
            <view class="add-circle">
              <LineIcon name="plus" size="34rpx" color="var(--color-zen-sage)" />
            </view>
            <text class="add-label">创建新学科</text>
            <text class="add-sub">整理新的学习领域</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <template #modal>
      <view v-if="showModal" class="zen-modal-mask" @click="closeModal">
        <view class="zen-modal-body subject-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">{{ isEditing ? '编辑学科空间' : '新建学科空间' }}</text>
            <view class="modal-close" @click="closeModal">
              <LineIcon name="close" size="26rpx" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-form">
            <view class="form-group">
              <text class="form-label">学科名称</text>
              <input
                class="zen-input"
                v-model="formData.name"
                maxlength="64"
                placeholder="例如：高等数学、现代物理…"
                :disabled="savingSubject"
              />
            </view>

            <view class="form-group">
              <text class="form-label">学科简介（可选）</text>
              <input
                class="zen-input"
                v-model="formData.description"
                maxlength="200"
                placeholder="简要描述研究或复习范围…"
                :disabled="savingSubject"
              />
            </view>

            <view class="form-group">
              <text class="form-label">学科图标</text>
              <view class="icon-grid">
                <view
                  v-for="option in subjectIconOptions"
                  :key="option.key"
                  class="icon-option"
                  :class="{ selected: formData.icon === option.key }"
                  @click="!savingSubject && (formData.icon = option.key)"
                >
                  <LineIcon
                    :name="`subj-${option.key}`"
                    size="36rpx"
                    :color="formData.icon === option.key ? '#8B9A6E' : '#7A7A75'"
                  />
                </view>
              </view>
            </view>

            <text v-if="modalError" class="modal-error">{{ modalError }}</text>
          </view>

          <view class="modal-footer">
            <view class="btn ghost-btn" @click="closeModal">取消</view>
            <view class="btn save-btn" :class="{ disabled: savingSubject }" @click="handleSave">
              {{ savingSubject ? '保存中…' : isEditing ? '保存修改' : '立即创建' }}
            </view>
          </view>
        </view>
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import LineIcon from '@/components/LineIcon.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore } from '@/store/useBlockStore'
import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import { isSubjectIconKey, subjectIconOptions } from '@/utils/subjectIcon'

const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const blockStore = useBlockStore()
const { subjects } = storeToRefs(subjectStore)

const searchQuery = ref('')
const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const savingSubject = ref(false)
const modalError = ref('')

const formData = reactive({
  name: '',
  description: '',
  icon: 'book',
})

const filteredSubjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return subjects.value
  return subjects.value.filter(s =>
    s.name.toLowerCase().includes(q)
    || (s.description || '').toLowerCase().includes(q),
  )
})

function openCreateModal() {
  isEditing.value = false
  editingId.value = null
  formData.name = ''
  formData.description = ''
  formData.icon = 'book'
  modalError.value = ''
  showModal.value = true
}

function openEditModal(subj: Subject) {
  isEditing.value = true
  editingId.value = subj.id
  formData.name = subj.name
  formData.description = subj.description || ''
  formData.icon = isSubjectIconKey(subj.icon) ? subj.icon : 'book'
  modalError.value = ''
  showModal.value = true
}

function closeModal() {
  if (savingSubject.value) return
  showModal.value = false
}

async function handleSave() {
  if (savingSubject.value) return
  modalError.value = ''
  const trimmedName = formData.name.trim()
  if (!trimmedName) {
    modalError.value = '请输入学科名称'
    return
  }

  const normalizedName = trimmedName.toLowerCase()
  const duplicate = subjects.value.some(item =>
    item.id !== editingId.value && item.name.trim().toLowerCase() === normalizedName,
  )
  if (duplicate) {
    modalError.value = '已存在同名学科，请使用其他名称'
    return
  }

  const generation = authStore.getLoginGeneration()
  savingSubject.value = true
  try {
    if (isEditing.value && editingId.value) {
      const existing = subjects.value.find(s => s.id === editingId.value)
      if (!existing) throw new Error('学科不存在或已删除')
      await subjectStore.updateSubject({
        ...existing,
        name: trimmedName,
        description: formData.description.trim(),
        icon: formData.icon,
      })
      if (generation !== authStore.getLoginGeneration()) return
      showModal.value = false
      uni.showToast({ title: '学科已更新', icon: 'none' })
      return
    }

    const newId = await subjectStore.addSubject(trimmedName, formData.description.trim(), formData.icon)
    if (generation !== authStore.getLoginGeneration()) return
    showModal.value = false
    uni.showToast({ title: '学科已创建', icon: 'none' })
    enterWorkspace(newId)
  } catch (err) {
    modalError.value = err instanceof Error ? err.message : '保存失败，请稍后重试'
  } finally {
    savingSubject.value = false
  }
}

function handleDeleteSubject(subj: Subject) {
  uni.showModal({
    title: '删除学科空间',
    content: `确定删除「${subj.name}」吗？该操作会同步移除所属资料关联。`,
    success: async (res) => {
      if (res.confirm) {
        await subjectStore.deleteSubject(subj.id)
        uni.showToast({ title: '学科已删除', icon: 'none' })
      }
    },
  })
}

function enterWorkspace(id: string) {
  uni.navigateTo({ url: `/pages/tablet/workspace/index?id=${id}` })
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
  padding: 40rpx 44rpx;
  box-sizing: border-box;
  background-color: var(--color-bg-primary);
}

.hall-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 32rpx;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.page-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.count-pill {
  padding: 4rpx 16rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: 22rpx;
  font-weight: var(--font-weight-semibold);
}

.page-sub {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 24rpx;
  border-radius: var(--radius-full);
  width: 380rpx;
  box-sizing: border-box;
}

.search-input {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--text-primary);
}

.search-clear {
  cursor: pointer;
  padding: 4rpx;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 28rpx;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  color: #FFFFFF;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  box-shadow: 0 8rpx 20rpx rgba(139, 154, 110, 0.24);
  cursor: pointer;
}

.content-scroll {
  flex: 1;
  min-height: 0;
}

.empty-hall {
  padding: 80rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  text-align: center;
}

.empty-badge {
  width: 112rpx;
  height: 112rpx;
  border-radius: 32rpx;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.empty-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.clear-search-btn {
  padding: 12rpx 24rpx;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-zen-sage);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24rpx;
  padding-bottom: 32rpx;
}

.subject-card {
  padding: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  min-height: 260rpx;
  box-sizing: border-box;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.subject-card:active {
  transform: scale(0.98);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.s-icon {
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-actions {
  display: flex;
  gap: 8rpx;
}

.icon-action-btn {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-action-btn.danger {
  background-color: var(--color-danger-bg);
}

.s-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.s-desc {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  line-height: 1.5;
  flex: 1;
}

.s-meta {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding-top: 12rpx;
  border-top: 1px solid var(--border-subtle);
}

.meta-item,
.meta-dot {
  font-size: 22rpx;
  color: var(--text-muted);
}

.add-card {
  border: 1px dashed var(--border-accent);
  background-color: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  align-items: center;
  justify-content: center;
  text-align: center;
}

.add-circle {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.add-sub {
  font-size: 22rpx;
  color: var(--text-muted);
}

.subject-modal {
  max-width: 760rpx;
  padding: 36rpx;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.modal-close {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.form-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.zen-input {
  height: 82rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 20rpx;
  padding: 0 22rpx;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  box-sizing: border-box;
}

.icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.icon-option {
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-option.selected {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.modal-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 28rpx;
}

.btn {
  padding: 16rpx 32rpx;
  border-radius: 20rpx;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.ghost-btn {
  background-color: var(--color-bg-primary);
  color: var(--text-secondary);
}

.save-btn {
  background: var(--accent-gradient);
  color: #FFFFFF;
}

.save-btn.disabled {
  opacity: 0.55;
}
</style>
