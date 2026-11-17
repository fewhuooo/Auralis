<template>
  <TabletLayout>
    <view class="t-subject-hall">
      <view class="hall-header">
        <view class="title-row">
          <text class="page-title">学科</text>
          <text v-if="subjects.length > 0" class="count-pill num-tabular">{{ subjects.length }}</text>
        </view>

        <view class="header-actions">
          <view class="search-box zen-card">
            <LineIcon name="search" size="15px" color="var(--text-muted)" />
            <input class="search-input" v-model="searchQuery" placeholder="搜索学科…" />
            <view v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
              <LineIcon name="close" size="14px" color="var(--text-muted)" />
            </view>
          </view>
          <view class="ui-btn ui-btn-primary create-btn" @click="openCreateModal">
            <LineIcon name="plus" size="15px" color="#FFFFFF" />
            <text>新建学科</text>
          </view>
        </view>
      </view>

      <scroll-view scroll-y :show-scrollbar="false" class="content-scroll">
        <view v-if="subjects.length === 0" class="empty-hall zen-card">
          <LineIcon name="book" size="30px" color="var(--color-sage-dark)" />
          <text class="empty-title">暂无学科</text>
          <view class="ui-btn ui-btn-primary" @click="openCreateModal">
            <LineIcon name="plus" size="15px" color="#FFFFFF" />
            <text>新建学科</text>
          </view>
        </view>

        <view v-else-if="filteredSubjects.length === 0" class="empty-hall zen-card">
          <text class="empty-title">无匹配结果</text>
          <view class="ui-btn ui-btn-secondary" @click="searchQuery = ''">清空搜索</view>
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
                  size="20px"
                  color="var(--color-sage-dark)"
                />
              </view>
              <view class="card-actions" @click.stop>
                <view class="icon-action-btn" @click="openEditModal(subj)">
                  <LineIcon name="edit" size="14px" color="var(--text-muted)" />
                </view>
                <view class="icon-action-btn danger" @click="handleDeleteSubject(subj)">
                  <LineIcon name="close" size="14px" color="var(--color-danger)" />
                </view>
              </view>
            </view>

            <text class="s-name">{{ subj.name }}</text>
            <text v-if="subj.description" class="s-desc">{{ subj.description }}</text>

            <view class="s-footer">
              <text class="s-stats num-tabular">资料 {{ subj.fileCount || 0 }} · 知识 {{ subj.blockCount || 0 }}</text>
              <LineIcon name="chevron-right" size="14px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="subject-card add-card" @click="openCreateModal">
            <LineIcon name="plus" size="22px" color="var(--color-sage-dark)" />
            <text class="add-label">新建学科</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <template #modal>
      <view v-if="showModal" class="zen-modal-mask" @click="closeModal">
        <view class="zen-modal-body subject-modal" @click.stop>
          <view class="modal-header">
            <text class="modal-title">{{ isEditing ? '编辑学科' : '新建学科' }}</text>
            <view class="ui-icon-btn" @click="closeModal">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-form">
            <input
              class="ui-input"
              v-model="formData.name"
              maxlength="64"
              placeholder="学科名称"
              :disabled="savingSubject"
            />

            <input
              class="ui-input"
              v-model="formData.description"
              maxlength="200"
              placeholder="简介（可选）"
              :disabled="savingSubject"
            />

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
                  size="18px"
                  :color="formData.icon === option.key ? '#6D7D51' : '#76756F'"
                />
              </view>
            </view>

            <text v-if="modalError" class="modal-error">{{ modalError }}</text>
          </view>

          <view class="modal-footer">
            <view class="ui-btn ui-btn-ghost" @click="closeModal">取消</view>
            <view class="ui-btn ui-btn-primary" :class="{ 'is-disabled': savingSubject }" @click="handleSave">
              {{ savingSubject ? '保存中…' : isEditing ? '保存' : '创建' }}
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
    modalError.value = '已存在同名学科'
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
      uni.showToast({ title: '已更新', icon: 'none' })
      return
    }

    const newId = await subjectStore.addSubject(trimmedName, formData.description.trim(), formData.icon)
    if (generation !== authStore.getLoginGeneration()) return
    showModal.value = false
    uni.showToast({ title: '已创建', icon: 'none' })
    enterWorkspace(newId)
  } catch (err) {
    modalError.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    savingSubject.value = false
  }
}

function handleDeleteSubject(subj: Subject) {
  uni.showModal({
    title: '删除学科',
    content: `确定删除「${subj.name}」吗？`,
    confirmColor: '#C93B3B',
    success: async (res) => {
      if (res.confirm) {
        await subjectStore.deleteSubject(subj.id)
        uni.showToast({ title: '已删除', icon: 'none' })
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
  padding: 24px 26px;
  box-sizing: border-box;
  background-color: var(--color-bg-primary);
}

.hall-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: var(--text-display);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.03em;
}

.count-pill {
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-dark);
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  font-weight: var(--font-weight-semibold);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: var(--radius-full);
  width: 220px;
  box-sizing: border-box;
}

.search-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.search-clear {
  cursor: pointer;
  display: flex;
  align-items: center;
}

.create-btn {
  height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-full);
}

.content-scroll {
  flex: 1;
  min-height: 0;
}

.empty-hall {
  padding: 56px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.empty-title {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: 16px;
  padding-bottom: 20px;
}

.subject-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 156px;
  cursor: pointer;
  box-sizing: border-box;
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s ease, border-color 0.2s ease;
}

.subject-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-accent);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.s-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background-color: var(--color-bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.s-name {
  font-size: 17px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.s-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.s-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.s-stats {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.add-card {
  border: 1.5px dashed var(--border-default);
  border-radius: var(--radius-lg);
  align-items: center;
  justify-content: center;
  background-color: transparent;
  box-shadow: none;
  gap: 8px;
}

.add-card:hover {
  border-color: var(--border-accent);
  background-color: var(--color-sage-bg);
}

.add-label {
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-dark);
}

.subject-modal {
  max-width: 440px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 18px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
}

.icon-option {
  height: 38px;
  border-radius: 10px;
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
  gap: 8px;
}
</style>
