<template>
  <div class="hall-container">
    <div class="hall-content">
      <div class="hall-header">
        <div>
          <h1 class="hall-title">学科空间</h1>
          <p class="hall-desc">选择或创建一个专属的学科空间，进行深度的材料解析与知识沉淀</p>
        </div>
        <button class="create-btn" @click="openCreateSubject(null)"><IconPlus :size="14" :stroke-width="2" style="margin-right: 4px; vertical-align: -2px;" />新建学科</button>
      </div>

      <div class="hall-search" v-if="subjectStore.subjects.length > 0">
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="搜索学科空间..."
        />
      </div>

      <div class="subjects-grid" v-if="filteredSubjects.length > 0">
        <div
          v-for="subj in filteredSubjects"
          :key="subj.id"
          class="subject-card"
          @click="router.push(`/subject/${subj.id}`)"
        >
          <div class="subject-card-header">
            <div class="subject-card-icon">
              <ElIcon v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)" :size="28">
                <component :is="getSubjectIconComponent(subj.icon)" />
              </ElIcon>
              <span v-else>{{ getLegacySubjectIcon(subj.icon) }}</span>
            </div>
            <div class="subject-card-actions" @click.stop>
              <button class="card-action-btn" title="编辑" @click="openCreateSubject(subj)">
                <IconPencil :size="12" :stroke-width="1.8" />
              </button>
              <button class="card-action-btn delete" title="删除" @click="confirmDeleteSubject(subj)">
                <IconX :size="12" :stroke-width="1.8" />
              </button>
            </div>
          </div>
          <h4 class="subject-card-title">{{ subj.name }}</h4>
          <div class="subject-card-meta">
            {{ subj.fileCount || 0 }} 个材料 · {{ subj.blockCount || 0 }} 个知识块
          </div>
          <div class="mastery-bar">
            <div class="mastery-fill" :style="{ width: getMasteryPercent(subj) + '%' }"></div>
          </div>
        </div>

        <!-- Add Subject Card -->
        <div class="subject-card add-card" @click="openCreateSubject(null)">
          <div class="add-plus-btn"><IconPlus :size="20" :stroke-width="2" /></div>
          <span class="add-label">新建学科空间</span>
        </div>
      </div>

      <div class="empty-hall" v-else-if="subjectStore.subjects.length === 0">
        <div class="empty-icon"><IconBooks :size="48" :stroke-width="1.4" /></div>
        <h3>还没有学科空间</h3>
        <p>创建你的第一个学科空间，开始系统化管理知识</p>
        <button class="create-btn" @click="openCreateSubject(null)"><IconPlus :size="14" :stroke-width="2" style="margin-right: 4px; vertical-align: -2px;" />新建学科</button>
      </div>

      <div class="empty-hall" v-else>
        <div class="empty-icon"><IconSearch :size="48" :stroke-width="1.4" /></div>
        <h3>未找到匹配的学科空间</h3>
        <p>尝试更换关键词进行搜索</p>
      </div>
    </div>

    <!-- Subject Create/Edit Modal -->
    <SubjectCreateModal
      v-if="showSubjectModal"
      :subjectData="selectedSubjectForEdit || undefined"
      @close="closeCreateSubject"
      @save="handleSaveSubject"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElIcon, ElNotification } from 'element-plus'
import { IconPencil, IconX, IconPlus, IconBooks, IconSearch } from '@tabler/icons-vue'
import 'element-plus/theme-chalk/el-notification.css'

import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import SubjectCreateModal from '@/components/subject/SubjectCreateModal.vue'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'

const router = useRouter()
const subjectStore = useSubjectStore()

const showSubjectModal = ref(false)
const selectedSubjectForEdit = ref<Subject | null>(null)
const searchQuery = ref('')

const filteredSubjects = computed(() => {
  if (!searchQuery.value.trim()) return subjectStore.subjects
  const q = searchQuery.value.toLowerCase()
  return subjectStore.subjects.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q)
  )
})

const getMasteryPercent = (subj: any) => {
  const blocks = subj.blockCount || 0
  const files = subj.fileCount || 0
  if (files === 0 && blocks === 0) return 0
  return Math.min(100, Math.round((blocks / Math.max(files * 3, 1)) * 100))
}

onMounted(async () => {
  await subjectStore.loadSubjects()
})

const openCreateSubject = (subject: Subject | null) => {
  selectedSubjectForEdit.value = subject
  showSubjectModal.value = true
}

const closeCreateSubject = () => {
  showSubjectModal.value = false
  selectedSubjectForEdit.value = null
}

const handleSaveSubject = async (formData: any) => {
  try {
    if (formData.id) {
      await subjectStore.updateSubject(formData)
    } else {
      const newId = await subjectStore.addSubject(formData.name, formData.description, formData.icon)
      closeCreateSubject()
      router.push(`/subject/${newId}`)
      return
    }
    closeCreateSubject()
  } catch (e) {
    console.error('Failed to save subject:', e)
  }
}

const confirmDeleteSubject = async (subject: Subject) => {
  if (confirm(`确定要删除学科空间"${subject.name}"吗？这将同步删除登记的材料。`)) {
    try {
      await subjectStore.deleteSubject(subject.id)
      ElNotification({
        title: '学科空间已删除',
        message: `"${subject.name}" 空间已彻底从本地数据库移除。`,
        type: 'success',
        position: 'top-right'
      })
    } catch (e) {
      console.error(e)
    }
  }
}
</script>

<style scoped>
.hall-container {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  background: var(--color-bg-secondary, #EEEEEE); /* 页面大背景 / 次级中性底 */
  padding: 8px;
  box-sizing: border-box;

  /* Zen Minimalist Theme override */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #76855B;
  --color-primary-light: rgba(139, 154, 110, 0.16);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%);
}

html.dark .hall-container {
  background: var(--color-bg-primary);
}

.hall-content {
  max-width: 1440px;
  margin: 12px auto;
  padding: 32px 40px;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
}

html.dark .hall-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--border-subtle);
}

.hall-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.hall-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.hall-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.create-btn {
  background: var(--accent-gradient);
  color: white;
  border: none;
  padding: 8px 18px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.3);
}

.create-btn:hover {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(139, 154, 110, 0.45);
}

.hall-search {
  margin-bottom: 24px;
}

.search-input {
  width: 100%;
  max-width: 400px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: all var(--transition-normal);
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
}

html.dark .search-input {
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
}

.search-input:focus {
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.18), 0 2px 6px rgba(0, 0, 0, 0.04);
}

html.dark .search-input:focus {
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.25), 0 2px 6px rgba(0, 0, 0, 0.2);
}

.subjects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(234px, 1fr));
  gap: 20px;
}

.subject-card {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  aspect-ratio: 1.3 / 1;
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
}

html.dark .subject-card {
  background: var(--color-bg-secondary);
  border-color: var(--border-subtle);
  box-shadow: 0 10px 24px -4px rgba(0, 0, 0, 0.35), 0 3px 6px -1px rgba(0, 0, 0, 0.2);
}

.subject-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 10px 22px -3px rgba(0, 0, 0, 0.06), 0 4px 10px -2px rgba(139, 154, 110, 0.12);
}

html.dark .subject-card:hover {
  box-shadow: 0 16px 32px -4px rgba(0, 0, 0, 0.5), 0 6px 12px -2px rgba(0, 0, 0, 0.35);
}

.subject-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: auto; /* Push title to the bottom area */
}

.subject-card-icon {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-primary-accent, #8B9A6E);
}

html.dark .subject-card-icon {
  background: color-mix(in srgb, var(--color-primary-accent, #8B9A6E) 25%, var(--color-bg-secondary));
}

.subject-card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.subject-card:hover .subject-card-actions {
  opacity: 1;
}

.card-action-btn {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.card-action-btn:hover {
  background: var(--color-bg-primary);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.card-action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.2);
}

.subject-card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.subject-card-meta {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  font-weight: 500;
  opacity: 0.8;
}

.mastery-bar {
  width: 100%;
  height: 4px;
  background: var(--border-subtle);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-top: 10px;
}

.mastery-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, #8B9A6E, #AAB88E);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.add-card {
  border: 2px dashed rgba(139, 154, 110, 0.35) !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  box-shadow: none !important;
}

html.dark .add-card {
  background: var(--color-bg-secondary) !important;
  border-color: var(--border-subtle) !important;
}

.add-card:hover {
  background: color-mix(in srgb, var(--color-primary-accent, #8B9A6E) 4%, var(--color-bg-tertiary, #FAF7F2)) !important;
  border-color: var(--color-primary-accent, #8B9A6E) !important;
}

html.dark .add-card:hover {
  background: color-mix(in srgb, var(--color-primary-accent, #8B9A6E) 6%, var(--color-bg-secondary)) !important;
}

.add-plus-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-primary-accent, #8B9A6E);
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

html.dark .add-plus-btn {
  background: color-mix(in srgb, var(--color-primary-accent, #8B9A6E) 12%, var(--color-bg-secondary));
}

.add-card:hover .add-plus-btn {
  background: var(--color-primary-accent, #8B9A6E);
  color: white;
}

.add-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-hall {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 16px;
  color: var(--text-muted);
  opacity: 0.5;
}

.empty-hall h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.empty-hall p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 20px;
}
</style>
