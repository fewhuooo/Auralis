<template>
  <div class="hall-container">
    <div class="hall-content">
      <div class="hall-header">
        <div>
          <h1 class="hall-title">学科空间</h1>
          <p class="hall-desc">选择或创建一个专属的学科空间，进行深度的材料解析与知识沉淀</p>
        </div>
        <button class="create-btn" @click="openCreateSubject(null)">＋ 新建学科</button>
      </div>

      <div class="subjects-grid" v-if="subjectStore.subjects.length > 0">
        <div
          v-for="subj in subjectStore.subjects"
          :key="subj.id"
          class="subject-card"
          :style="{ '--subj-theme-color': subj.color || '#0284c7' }"
          @click="router.push(`/subject/${subj.id}`)"
        >
          <div class="subject-card-header">
            <div class="subject-card-icon">
              {{ subj.icon || '📚' }}
            </div>
            <div class="subject-card-actions" @click.stop>
              <button class="card-action-btn" title="编辑" @click="openCreateSubject(subj)">✎</button>
              <button class="card-action-btn delete" title="删除" @click="confirmDeleteSubject(subj)">✕</button>
            </div>
          </div>
          <h4 class="subject-card-title">{{ subj.name }}</h4>
          <div class="subject-card-meta">
            {{ subj.fileCount || 0 }} 个材料 · {{ subj.blockCount || 0 }} 个知识块
          </div>
        </div>

        <!-- Add Subject Card -->
        <div class="subject-card add-card" @click="openCreateSubject(null)">
          <div class="add-plus-btn">＋</div>
          <span class="add-label">新建学科空间</span>
        </div>
      </div>

      <div class="empty-hall" v-else>
        <div class="empty-icon">🏛️</div>
        <h3>还没有学科空间</h3>
        <p>创建你的第一个学科空间，开始系统化管理知识</p>
        <button class="create-btn" @click="openCreateSubject(null)">＋ 新建学科</button>
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'

import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import SubjectCreateModal from '@/components/subject/SubjectCreateModal.vue'

const router = useRouter()
const subjectStore = useSubjectStore()

const showSubjectModal = ref(false)
const selectedSubjectForEdit = ref<Subject | null>(null)

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
      const newId = await subjectStore.addSubject(formData.name, formData.description, formData.icon, formData.color)
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
  background: #f1f3f5; /* Clean light gray base */
  padding: 8px;
  box-sizing: border-box;

  /* Vibrant Accent Theme override */
  --color-primary-accent: #0284c7;
  --color-primary-accent-hover: #0369a1;
  --color-primary-light: rgba(2, 132, 199, 0.08);
  --color-primary-glow: rgba(2, 132, 199, 0.15);
  --accent-gradient: linear-gradient(135deg, #0284c7, #0d9488);
}

html.dark .hall-container {
  background: #121110;
}

.hall-content {
  max-width: 1440px;
  margin: 12px auto;
  padding: 32px 40px;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border-default);
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .hall-content {
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
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
}

.create-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.subjects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(234px, 1fr));
  gap: 20px;
}

.subject-card {
  background: color-mix(in srgb, var(--subj-theme-color) 8%, var(--color-bg-primary));
  border: 1px solid color-mix(in srgb, var(--subj-theme-color) 15%, var(--border-default));
  border-radius: var(--radius-lg);
  padding: 24px;
  cursor: pointer;
  transition: all var(--transition-normal);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  aspect-ratio: 1.3 / 1;
  box-shadow: rgba(0, 0, 0, 0.02) 0px 4px 12px;
}

html.dark .subject-card {
  background: color-mix(in srgb, var(--subj-theme-color) 12%, var(--color-bg-secondary));
  border-color: color-mix(in srgb, var(--subj-theme-color) 20%, var(--border-subtle));
}

.subject-card:hover {
  transform: translateY(-4px);
  border-color: var(--subj-theme-color);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.06);
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
  background: color-mix(in srgb, var(--subj-theme-color) 20%, var(--color-bg-primary));
}

html.dark .subject-card-icon {
  background: color-mix(in srgb, var(--subj-theme-color) 25%, var(--color-bg-secondary));
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
  background: var(--color-bg-primary);
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
  background: var(--color-bg-tertiary);
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

.add-card {
  border: 2px dashed var(--border-default) !important;
  background: var(--color-bg-primary) !important;
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
  background: color-mix(in srgb, var(--color-primary-accent, #0284c7) 4%, var(--color-bg-primary)) !important;
  border-color: var(--color-primary-accent, #0284c7) !important;
}

html.dark .add-card:hover {
  background: color-mix(in srgb, var(--color-primary-accent, #0284c7) 6%, var(--color-bg-secondary)) !important;
}

.add-plus-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary-accent, #0284c7) 8%, var(--color-bg-primary));
  color: var(--color-primary-accent, #0284c7);
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

html.dark .add-plus-btn {
  background: color-mix(in srgb, var(--color-primary-accent, #0284c7) 12%, var(--color-bg-secondary));
}

.add-card:hover .add-plus-btn {
  background: var(--color-primary-accent, #0284c7);
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
  font-size: 48px;
  margin-bottom: 16px;
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
