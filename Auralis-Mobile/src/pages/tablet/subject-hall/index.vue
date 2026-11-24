<template>
  <TabletLayout>
    <view class="t-subject-hall">
      <view class="hall-content zen-panel">
        <view class="hall-header">
          <view class="title-row">
            <text class="page-title">学科空间</text>
            <text v-if="subjects.length > 0" class="count-num num-tabular">{{ subjects.length }}</text>
          </view>

          <view class="header-actions">
            <view v-if="subjects.length > 0" class="search-box">
              <LineIcon name="search" size="14px" color="var(--text-muted)" />
              <input class="search-input" v-model="searchQuery" placeholder="搜索学科" />
              <view v-if="searchQuery" class="search-clear" role="button" aria-label="清空搜索" @click="searchQuery = ''">
                <LineIcon name="close" size="13px" color="var(--text-muted)" />
              </view>
            </view>

            <view class="ui-btn ui-btn-primary create-btn" role="button" @click="openCreateModal">
              <LineIcon name="plus" size="15px" color="#FFFFFF" />
              <text>新建学科</text>
            </view>
          </view>
        </view>

        <view v-if="hydrated && subjects.length === 0" class="empty-hall zen-card">
          <LineIcon name="book" size="30px" color="var(--color-zen-sage)" />
          <text class="empty-title">暂无学科空间</text>
          <view class="ui-btn ui-btn-primary create-btn" role="button" @click="openCreateModal">
            <LineIcon name="plus" size="15px" color="#FFFFFF" />
            <text>新建学科</text>
          </view>
        </view>

        <view v-else-if="filteredSubjects.length === 0" class="empty-hall zen-card">
          <text class="empty-title">无匹配学科</text>
          <view class="ui-btn ui-btn-secondary" role="button" @click="searchQuery = ''">清空搜索</view>
        </view>

        <view v-else class="grid">
          <view
            v-for="subj in filteredSubjects"
            :key="subj.id"
            class="subject-card zen-card"
            role="button"
            :aria-label="`进入学科 ${subj.name}`"
            @click="enterWorkspace(subj.id)"
          >
            <view class="card-top">
              <view class="s-icon">
                <LineIcon
                  :name="`subj-${isSubjectIconKey(subj.icon) ? subj.icon : 'book'}`"
                  size="21px"
                  color="var(--color-sage-ink)"
                />
              </view>
              <view class="card-actions" @click.stop>
                <view class="icon-action-btn" role="button" aria-label="编辑学科" @click="openEditModal(subj)">
                  <LineIcon name="edit" size="13px" color="var(--text-muted)" />
                </view>
                <view class="icon-action-btn danger" role="button" aria-label="删除学科" @click="handleDeleteSubject(subj)">
                  <LineIcon name="close" size="13px" color="var(--text-muted)" />
                </view>
              </view>
            </view>

            <text class="s-name">{{ subj.name }}</text>
            <text v-if="subj.description" class="s-desc">{{ subj.description }}</text>

            <view class="s-footer">
              <view class="s-metrics num-tabular">
                <view class="s-metric-item">
                  <LineIcon name="file-text" size="13px" color="var(--text-muted)" />
                  <text>{{ subj.fileCount || 0 }}</text>
                </view>
                <view class="s-metric-item">
                  <LineIcon name="layers" size="13px" color="var(--text-muted)" />
                  <text>{{ subj.blockCount || 0 }}</text>
                </view>
              </view>
              <LineIcon name="arrow-right" size="14px" color="var(--text-muted)" class="card-arrow" />
            </view>
          </view>

          <view class="subject-card add-card" role="button" aria-label="新建学科" @click="openCreateModal">
            <view class="add-plus-btn">
              <LineIcon name="plus" size="20px" color="var(--color-sage-ink)" />
            </view>
            <text class="add-label">新建学科</text>
          </view>
        </view>
      </view>
    </view>

    <template #modal>
      <view v-if="showModal" class="zen-modal-mask subject-modal-mask" @click="closeModal">
        <view
          class="subject-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="isEditing ? '编辑学科空间' : '创建学科空间'"
          @click.stop
        >
          <view class="modal-header">
            <text class="modal-title">{{ isEditing ? '编辑学科空间' : '创建学科空间' }}</text>
            <view
              class="modal-close-btn"
              :class="{ 'is-disabled': savingSubject }"
              role="button"
              aria-label="关闭"
              @click="closeModal"
            >
              <LineIcon name="close" size="15px" color="var(--text-muted)" />
            </view>
          </view>

          <view class="modal-body">
            <view class="preview-row">
              <view class="preview-icon">
                <LineIcon :name="`subj-${formData.icon}`" size="26px" color="#FFFFFF" />
              </view>
              <view class="preview-info">
                <text class="preview-name">{{ formData.name.trim() || '学科名称预览' }}</text>
                <text class="preview-desc">{{ formData.description.trim() || '这是您的专属学科知识沉淀空间' }}</text>
              </view>
            </view>

            <view class="modal-form-group">
              <view class="modal-form-label">
                <text>学科名称</text>
                <text class="required">*</text>
              </view>
              <input
                v-model="formData.name"
                class="modal-form-input"
                maxlength="20"
                placeholder="例如: 算法与数据结构、应用物理学"
                :disabled="savingSubject"
                @confirm="handleSave"
              />
            </view>

            <view class="modal-form-group">
              <text class="modal-form-label">学科简述</text>
              <textarea
                v-model="formData.description"
                class="modal-form-textarea"
                maxlength="100"
                placeholder="简短描述这个学科的研究方向或课程定位..."
                :disabled="savingSubject"
              />
            </view>

            <view class="modal-form-group">
              <text class="modal-form-label">选择空间图标</text>
              <view class="icon-grid">
                <view
                  v-for="option in subjectIconOptions"
                  :key="option.key"
                  class="icon-option"
                  :class="{ selected: formData.icon === option.key }"
                  role="button"
                  :title="option.label"
                  :aria-label="`选择${option.label}图标`"
                  @click="!savingSubject && (formData.icon = option.key)"
                >
                  <LineIcon
                    :name="`subj-${option.key}`"
                    size="20px"
                    :color="formData.icon === option.key ? '#76855B' : 'var(--text-secondary)'"
                  />
                </view>
              </view>
            </view>

            <text v-if="modalError" class="modal-error">{{ modalError }}</text>
          </view>

          <view class="modal-footer">
            <button
              type="button"
              class="modal-btn modal-btn-secondary"
              :disabled="savingSubject"
              @click="closeModal"
            >取消</button>
            <button
              type="button"
              class="modal-btn modal-btn-primary"
              :disabled="savingSubject || !formData.name.trim()"
              @click="handleSave"
            >{{ savingSubject ? '保存中…' : isEditing ? '保存修改' : '确认创建' }}</button>
          </view>
        </view>
      </view>
    </template>
  </TabletLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import LineIcon from '@/components/LineIcon.vue'
import TabletLayout from '@/components/tablet/TabletLayout.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
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

useEscapeKey(() => showModal.value, closeModal)

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
    if (generation !== authStore.getLoginGeneration()) return
    modalError.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      savingSubject.value = false
    }
  }
}

function handleDeleteSubject(subj: Subject) {
  const generation = authStore.getLoginGeneration()
  uni.showModal({
    title: '删除学科',
    content: `确定删除「${subj.name}」吗？`,
    confirmColor: '#C93B3B',
    success: async (res) => {
      if (!res.confirm || generation !== authStore.getLoginGeneration()) return
      try {
        await subjectStore.deleteSubject(subj.id)
        if (generation !== authStore.getLoginGeneration()) return
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch (err) {
        if (generation !== authStore.getLoginGeneration()) return
        uni.showToast({ title: err instanceof Error ? err.message : '删除失败', icon: 'none' })
      }
    },
  })
}

function enterWorkspace(id: string) {
  uni.navigateTo({ url: `/pages/tablet/workspace/index?id=${id}` })
}

const hydrated = ref(false)

async function hydrateHallData() {
  const gen = authStore.getLoginGeneration()
  try {
    await Promise.all([blockStore.fetchBlocks(), subjectStore.loadSubjects()])
  } finally {
    if (gen === authStore.getLoginGeneration()) {
      hydrated.value = true
    }
  }
}

watch(
  () => [authStore.isAuthenticated, authStore.user?.id, authStore.serverDeviceId],
  () => {
    hydrated.value = false
    showModal.value = false
    savingSubject.value = false
    editingId.value = null
    searchQuery.value = ''
    modalError.value = ''
    if (!authStore.isAuthenticated) return
    void hydrateHallData()
  },
)

onMounted(async () => {
  if (!authStore.isAuthenticated) return
  await hydrateHallData()
})
</script>

<style scoped>
.t-subject-hall {
  width: 100%;
  height: 100%;
  padding: 16px 20px;
  background-color: transparent;
  overflow-y: auto;
  box-sizing: border-box;
}

.hall-content {
  width: 100%;
  max-width: 1360px;
  min-height: 100%;
  margin: 0 auto;
  padding: 28px 32px;
  border-radius: 20px;
  box-sizing: border-box;
}

.hall-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.page-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.count-num {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 13px;
  border-radius: var(--radius-full);
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  width: 220px;
  box-sizing: border-box;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

/* #ifdef H5 */
.search-box:focus-within {
  border-color: var(--color-zen-sage);
  background-color: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16);
}
/* #endif */

.search-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
}

.search-clear {
  cursor: pointer;
  display: flex;
  align-items: center;
}

.create-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-full);
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
  grid-template-columns: repeat(auto-fill, minmax(264px, 1fr));
  gap: 18px;
}

.subject-card {
  padding: 20px 22px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 158px;
  cursor: pointer;
  box-sizing: border-box;
  transition: transform 0.22s var(--ease-out), box-shadow 0.22s ease, border-color 0.22s ease;
}

.subject-card:hover {
  transform: translateY(-3px);
  border-color: var(--glass-border);
  box-shadow: 0 0 0 1px rgba(139, 154, 110, 0.36), 0 12px 30px rgba(45, 55, 40, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.90);
}

.subject-card:hover .card-arrow {
  transform: translateX(3px);
}

.card-arrow {
  transition: transform 0.2s var(--ease-out);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.s-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.85;
  transition: opacity 0.18s ease;
}

.subject-card:hover .card-actions {
  opacity: 1;
}

.icon-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border-subtle);
  box-shadow: var(--glass-shadow-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.14s ease, border-color 0.14s ease;
}

.icon-action-btn:hover {
  border-color: var(--border-accent);
}

.icon-action-btn.danger:hover {
  background-color: var(--color-danger-bg);
  border-color: transparent;
}

.s-name {
  font-size: 17px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.015em;
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

.s-metrics {
  display: flex;
  align-items: center;
  gap: 14px;
}

.s-metric-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.add-card {
  border: 1px dashed rgba(139, 154, 110, 0.34);
  border-radius: 16px;
  align-items: center;
  justify-content: center;
  background-color: var(--glass-sub-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
  gap: 10px;
}

.add-card:hover {
  border-color: var(--color-zen-sage);
  background-color: rgba(139, 154, 110, 0.08);
}

.add-plus-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-label {
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
}

.subject-modal-mask {
  background-color: rgba(28, 28, 26, 0.42);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  padding: 24px;
}

.subject-modal {
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 48px);
  background: var(--color-bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow:
    0 24px 64px -12px rgba(0, 0, 0, 0.13),
    0 8px 24px -6px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  animation: uiModalIn 0.22s var(--ease-out) both;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 28px 12px;
  flex-shrink: 0;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.18s ease, transform 0.2s var(--ease-out);
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.05);
}

.modal-close-btn.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.modal-body {
  padding: 8px 28px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-sizing: border-box;
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 2px;
  box-sizing: border-box;
}

.preview-icon {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-md);
  background: #7D9372;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(139, 154, 110, 0.3);
  flex-shrink: 0;
}

.preview-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.preview-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-desc {
  margin-top: 3px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-form-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.modal-form-label .required {
  color: #D14343;
  font-weight: 700;
}

.modal-form-input,
.modal-form-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  font-size: 13.5px;
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04), 0 0.5px 1.5px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), background-color 0.2s ease;
}

.modal-form-input {
  height: 40px;
}

.modal-form-textarea {
  height: 84px;
  line-height: 1.5;
}

/* #ifdef H5 */
.modal-form-input:focus,
.modal-form-textarea:focus {
  outline: none;
  border-color: var(--color-zen-sage);
  background: #FDFBF8;
  box-shadow: 0 0 0 3.5px rgba(139, 154, 110, 0.14), 0 2px 8px rgba(139, 154, 110, 0.12);
}
/* #endif */

.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
}

.icon-option {
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.18s var(--ease-out);
}

.icon-option:hover {
  background: #FFFFFF;
  border-color: var(--color-zen-sage);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.icon-option.selected {
  background: rgba(139, 154, 110, 0.16);
  border-color: var(--color-zen-sage);
  box-shadow: 0 0 0 2px rgba(139, 154, 110, 0.35), 0 3px 8px rgba(0, 0, 0, 0.08);
  transform: scale(1.04);
}

.modal-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 28px 24px;
  flex-shrink: 0;
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 20px;
  margin: 0;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  border: none;
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.2s var(--ease-out);
}

.modal-btn::after {
  border: none;
}

.modal-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.modal-btn-secondary {
  background: rgba(0, 0, 0, 0.035);
  border: 1px solid rgba(0, 0, 0, 0.09);
  color: var(--text-primary);
  box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.04);
}

.modal-btn-secondary:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.065);
  border-color: rgba(0, 0, 0, 0.16);
}

.modal-btn-primary {
  background: var(--accent-gradient);
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.32), 0 1px 2px rgba(0, 0, 0, 0.06);
}

.modal-btn-primary:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(118, 135, 88, 0.42), 0 2px 4px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

@media (max-width: 760px) {
  .t-subject-hall {
    padding: 12px;
  }

  .hall-content {
    padding: 20px 18px;
  }

  .search-box {
    width: 100%;
  }
}
</style>
