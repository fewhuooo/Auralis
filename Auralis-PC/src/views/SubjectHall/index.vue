<template>
  <div class="hall-container">
    <div class="hall-content">
      <!-- 页面顶层头部 -->
      <div class="hall-header">
        <div class="hall-header-left">
          <div class="hall-title-row">
            <h1 class="hall-title">学科空间</h1>
            <span v-if="subjectStore.subjects.length > 0" class="hall-count-badge">
              共 {{ subjectStore.subjects.length }} 个空间
            </span>
          </div>
          <p class="hall-desc">按学科分类管理你的学习资料、知识点与复习计划</p>
        </div>
        <button class="create-btn" @click="openCreateSubject(null)">
          <IconPlus :size="15" :stroke-width="2.2" class="create-btn-icon" />
          <span>新建学科空间</span>
        </button>
      </div>

      <!-- 搜索栏 -->
      <div class="hall-search-wrap" v-if="subjectStore.subjects.length > 0">
        <div class="search-input-box">
          <IconSearch :size="15" :stroke-width="2" class="search-icon" />
          <input
            v-model="searchQuery"
            class="search-input"
            placeholder="搜索学科空间名称或简介..."
          />
          <button
            v-if="searchQuery"
            type="button"
            class="search-clear-btn"
            title="清空搜索"
            aria-label="清空搜索"
            @click="searchQuery = ''"
          >
            <IconX :size="13" :stroke-width="2.2" />
          </button>
        </div>
      </div>

      <!-- 学科卡片网格 -->
      <div class="subjects-grid" v-if="filteredSubjects.length > 0">
        <div
          v-for="subj in filteredSubjects"
          :key="subj.id"
          class="subject-card"
          role="button"
          tabindex="0"
          :aria-label="`进入学科空间 ${subj.name}`"
          @click="router.push(`/subject/${subj.id}`)"
          @keydown.enter="router.push(`/subject/${subj.id}`)"
        >
          <div class="subject-card-header">
            <div class="subject-card-icon" aria-hidden="true">
              <ElIcon v-if="isSubjectIconKey(subj.icon) || !getLegacySubjectIcon(subj.icon)" :size="24">
                <component :is="getSubjectIconComponent(subj.icon)" />
              </ElIcon>
              <span v-else>{{ getLegacySubjectIcon(subj.icon) }}</span>
            </div>
            <div class="subject-card-actions" @click.stop>
              <button
                class="card-action-btn"
                title="编辑学科空间"
                aria-label="编辑学科空间"
                @click="openCreateSubject(subj)"
              >
                <IconPencil :size="13" :stroke-width="2" />
              </button>
              <button
                class="card-action-btn delete"
                title="删除学科空间"
                aria-label="删除学科空间"
                @click="confirmDeleteSubject(subj)"
              >
                <IconX :size="13" :stroke-width="2.2" />
              </button>
            </div>
          </div>

          <div class="subject-card-body">
            <h4 class="subject-card-title">{{ subj.name }}</h4>
            <div class="subject-card-meta">
              <span class="meta-pill">{{ subj.fileCount || 0 }} 材料</span>
              <span class="meta-dot">·</span>
              <span class="meta-pill">{{ subj.blockCount || 0 }} 知识块</span>
            </div>
          </div>

          <div class="subject-card-footer">
            <div class="mastery-label-row">
              <span class="mastery-title">知识掌握度</span>
              <span class="mastery-value">{{ getMasteryPercent(subj) }}%</span>
            </div>
            <!-- 三态细轨进度条 -->
            <div
              class="mastery-bar-track"
              :title="`待学习 ${getSubjectProportions(subj).pendingCount} (${getSubjectProportions(subj).pendingPct}%) · 待复习 ${getSubjectProportions(subj).reviewingCount} (${getSubjectProportions(subj).reviewingPct}%) · 已掌握 ${getSubjectProportions(subj).masteredCount} (${getSubjectProportions(subj).masteredPct}%)`"
            >
              <div
                class="mastery-bar-seg mastery-bar-seg--new"
                :style="{ width: `${getSubjectProportions(subj).pendingPct}%` }"
              ></div>
              <div
                class="mastery-bar-seg mastery-bar-seg--due"
                :style="{ width: `${getSubjectProportions(subj).reviewingPct}%` }"
              ></div>
              <div
                class="mastery-bar-seg mastery-bar-seg--mastered"
                :style="{ width: `${getSubjectProportions(subj).masteredPct}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Add Subject Card -->
        <div
          class="subject-card add-card"
          role="button"
          tabindex="0"
          aria-label="新建学科空间"
          @click="openCreateSubject(null)"
          @keydown.enter="openCreateSubject(null)"
        >
          <div class="add-plus-btn">
            <IconPlus :size="20" :stroke-width="2.2" />
          </div>
          <div class="add-text-group">
            <span class="add-label">创建学科空间</span>
            <span class="add-sublabel">扩展你的新知识疆域</span>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div class="empty-hall" v-else-if="subjectStore.subjects.length === 0">
        <div class="empty-icon-halo">
          <IconBooks :size="40" :stroke-width="1.6" class="empty-halo-svg" />
        </div>
        <h3 class="empty-hall-title">还没有学科空间</h3>
        <p class="empty-hall-desc">创建你的第一个专属学科空间，开始系统化沉淀材料与知识块</p>
        <button class="create-btn" @click="openCreateSubject(null)">
          <IconPlus :size="15" :stroke-width="2.2" class="create-btn-icon" />
          <span>立即创建学科空间</span>
        </button>
      </div>

      <div class="empty-hall" v-else>
        <div class="empty-icon-halo">
          <IconSearch :size="38" :stroke-width="1.6" class="empty-halo-svg" />
        </div>
        <h3 class="empty-hall-title">未找到匹配的学科空间</h3>
        <p class="empty-hall-desc">未能找到包含 “{{ searchQuery }}” 的学科，尝试更换关键词</p>
        <button class="clear-search-btn" @click="searchQuery = ''">
          清空搜索条件
        </button>
      </div>
    </div>

    <!-- Subject Create/Edit Modal -->
    <SubjectCreateModal
      v-model="showSubjectModal"
      :saving="isSavingSubject"
      :subjectData="selectedSubjectForEdit || undefined"
      @close="closeCreateSubject"
      @save="handleSaveSubject"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElIcon, ElNotification } from 'element-plus'
import { IconPencil, IconX, IconPlus, IconBooks, IconSearch } from '@tabler/icons-vue'
import 'element-plus/theme-chalk/el-notification.css'

import { useSubjectStore, type Subject } from '@/store/useSubjectStore'
import { useStatsStore } from '@/store/useStatsStore'
import { useAuthStore } from '@/store/useAuthStore'
import SubjectCreateModal from '@/components/subject/SubjectCreateModal.vue'
import { getLegacySubjectIcon, getSubjectIconComponent, isSubjectIconKey } from '@/utils/subjectIcon'

const router = useRouter()
const subjectStore = useSubjectStore()
const statsStore = useStatsStore()
const authStore = useAuthStore()

const showSubjectModal = ref(false)
const selectedSubjectForEdit = ref<Subject | null>(null)
export interface SubjectMasteryStats {
  masteredPercent: number
  pendingPct: number
  reviewingPct: number
  masteredPct: number
  pendingCount: number
  reviewingCount: number
  masteredCount: number
  total: number
}

const defaultMasteryStats: SubjectMasteryStats = {
  masteredPercent: 0,
  pendingPct: 0,
  reviewingPct: 0,
  masteredPct: 0,
  pendingCount: 0,
  reviewingCount: 0,
  masteredCount: 0,
  total: 0,
}

const isSavingSubject = ref(false)
const searchQuery = ref('')
const subjectMasteryMap = ref<Record<string, SubjectMasteryStats>>({})

const filteredSubjects = computed(() => {
  if (!searchQuery.value.trim()) return subjectStore.subjects
  const q = searchQuery.value.toLowerCase()
  return subjectStore.subjects.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.description || '').toLowerCase().includes(q)
  )
})

const getSubjectProportions = (subj: any): SubjectMasteryStats => {
  if (subj?.id && subjectMasteryMap.value[subj.id]) {
    return subjectMasteryMap.value[subj.id]
  }
  return defaultMasteryStats
}

const getMasteryPercent = (subj: any): number => {
  return getSubjectProportions(subj).masteredPercent
}

let isLoadingMastery = false
let masteryPending = false

const loadSubjectMasteryData = async () => {
  const list = subjectStore.subjects
  if (!list || list.length === 0) return
  if (isLoadingMastery) {
    masteryPending = true
    return
  }
  isLoadingMastery = true
  try {
    const userId = authStore.user?.id
    const deviceId = authStore.serverDeviceId
    if (!userId || !deviceId || !authStore.isAuthenticated) {
      return
    }

    const { localDb, getLocalRepository, getLocalSqlDatabase } = await import('@/services/localDb')
    await localDb.init()
    const repo = await getLocalRepository(userId, deviceId)
    const db = getLocalSqlDatabase()

    // 1. Fetch active knowledge blocks across all subjects in a single query
    const blockRows = await repo.list<{ subjectId?: string; subject_id?: string }>('KNOWLEDGE_BLOCK', { includeDeleted: false })

    // 2. Fetch review records across all subjects in a single query
    let reviewRows: Array<{ knowledge_block_id: string; state_json: string | null }> = []
    if (db === 'localstorage') {
      const storageKey = `auralis:v2:${encodeURIComponent(userId).replace(/%/g, '_')}:${encodeURIComponent(deviceId).replace(/%/g, '_')}:review-store`
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          reviewRows = (parsed.records || []).map((r: any) => ({
            knowledge_block_id: r.knowledgeBlockId,
            state_json: r.state ? JSON.stringify(r.state) : null,
          }))
        }
      } catch {
        // fallback
      }
    } else {
      try {
        reviewRows = await db.select(
          `SELECT knowledge_block_id, state_json FROM local_review_records WHERE user_id = ? AND device_id = ?`,
          [userId, deviceId]
        )
      } catch {
        // table query fallback
      }
    }

    const stateMap = new Map<string, { needsLearning?: boolean; mastered?: boolean }>()
    for (const row of reviewRows) {
      if (row.state_json) {
        try {
          const parsed = JSON.parse(row.state_json)
          if (parsed && typeof parsed === 'object') {
            stateMap.set(row.knowledge_block_id, parsed)
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    // 3. Count in-memory in one fast O(N) pass
    const subjectStatsMap: Record<string, { pending: number; reviewing: number; mastered: number; total: number }> = {}
    for (const subj of list) {
      subjectStatsMap[subj.id] = { pending: 0, reviewing: 0, mastered: 0, total: 0 }
    }

    for (const row of blockRows) {
      const subjId = row.value?.subjectId || row.value?.subject_id
      if (!subjId || !subjectStatsMap[subjId]) continue
      const target = subjectStatsMap[subjId]
      target.total += 1
      const state = stateMap.get(row.id)
      if (!state || state.needsLearning) {
        target.pending += 1
      } else if (state.mastered) {
        target.mastered += 1
      } else {
        target.reviewing += 1
      }
    }

    const nextMap: Record<string, SubjectMasteryStats> = {}
    for (const subj of list) {
      const s = subjectStatsMap[subj.id]
      if (!s || s.total === 0) {
        nextMap[subj.id] = { ...defaultMasteryStats }
        continue
      }
      const total = s.total
      const masteredPercent = Math.round((s.mastered / total) * 100)
      const pendingPct = Math.round((s.pending / total) * 100)
      const reviewingPct = Math.round(((s.pending + s.reviewing) / total) * 100) - pendingPct
      const masteredPct = Math.max(0, 100 - pendingPct - reviewingPct)
      nextMap[subj.id] = {
        masteredPercent,
        pendingPct,
        reviewingPct,
        masteredPct,
        pendingCount: s.pending,
        reviewingCount: s.reviewing,
        masteredCount: s.mastered,
        total,
      }
    }
    subjectMasteryMap.value = nextMap
  } catch (e) {
    console.error('Failed to load subject mastery:', e)
  } finally {
    isLoadingMastery = false
    if (masteryPending) {
      masteryPending = false
      void loadSubjectMasteryData()
    }
  }
}

const handleReviewUpdated = (event: Event) => {
  const detail = (event as CustomEvent<Record<string, unknown>>)?.detail
  const subjId = detail?.subjectId as string | undefined
  if (subjId) {
    statsStore.invalidateSubjectStats(subjId)
  }
  void loadSubjectMasteryData()
}

onMounted(async () => {
  await subjectStore.loadSubjects()
  await loadSubjectMasteryData()
  window.addEventListener('local-review-updated', handleReviewUpdated)
})

onUnmounted(() => {
  window.removeEventListener('local-review-updated', handleReviewUpdated)
})

watch(
  () => subjectStore.subjects,
  () => {
    void loadSubjectMasteryData()
  },
  { deep: false }
)

const openCreateSubject = (subject: Subject | null) => {
  if (isSavingSubject.value) return
  selectedSubjectForEdit.value = subject
  showSubjectModal.value = true
}

const closeCreateSubject = () => {
  if (isSavingSubject.value) return
  showSubjectModal.value = false
  setTimeout(() => {
    if (!showSubjectModal.value) {
      selectedSubjectForEdit.value = null
    }
  }, 240)
}

const handleSaveSubject = async (formData: any) => {
  if (isSavingSubject.value) return
  isSavingSubject.value = true
  let closeAfterSave = false
  let createdSubjectId: string | null = null
  try {
    if (formData.id) {
      const existing = subjectStore.subjects.find(s => s.id === formData.id)
      if (!existing) {
        ElNotification({
          title: '无法保存学科空间',
          message: '该学科已不存在，请刷新后重试。',
          type: 'error',
          position: 'top-right'
        })
        return
      }
      await subjectStore.updateSubject({
        ...existing,
        name: formData.name,
        description: formData.description,
        iconKey: formData.icon,
        version: formData.version
      })
      closeAfterSave = true
    } else {
      createdSubjectId = await subjectStore.addSubject(formData.name, formData.description, formData.icon)
      closeAfterSave = true
    }
  } catch (e) {
    console.error('Failed to save subject:', e)
    ElNotification({
      title: '学科空间保存失败',
      message: '更改未能保存，请重试。表单内容仍保留。',
      type: 'error',
      position: 'top-right'
    })
  } finally {
    isSavingSubject.value = false
  }
  if (closeAfterSave) {
    closeCreateSubject()
    if (createdSubjectId) router.push(`/subject/${createdSubjectId}`)
  }
}

const confirmDeleteSubject = async (subject: Subject) => {
  if (confirm(`确定要删除学科"${subject.name}"吗？关联的学习材料也将同步删除。`)) {
    try {
      await subjectStore.deleteSubject(subject.id)
      ElNotification({
        title: '学科已删除',
        message: `"${subject.name}" 学科及关联材料已删除。`,
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
  background: var(--color-bg-secondary, #EEEEEE);
  padding: 16px 20px;
  box-sizing: border-box;

  /* Zen Minimalist Theme Tokens */
  --color-primary-accent: #8B9A6E;
  --color-primary-accent-hover: #76855B;
  --color-primary-light: rgba(139, 154, 110, 0.14);
  --color-primary-glow: rgba(139, 154, 110, 0.28);
  --accent-gradient: linear-gradient(135deg, #8E9F70 0%, #768758 100%);
}

html.dark .hall-container {
  background: var(--color-bg-primary);
}

.hall-content {
  max-width: 1440px;
  margin: 0 auto;
  padding: 36px 44px;
  background: var(--color-bg-primary, #F7F2EB);
  border-radius: var(--radius-xl, 20px);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.04), 0 4px 12px -2px rgba(0, 0, 0, 0.02);
  box-sizing: border-box;
}

html.dark .hall-content {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 48px -8px rgba(0, 0, 0, 0.45);
}

/* Header */
.hall-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 28px;
}

.hall-header-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.hall-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hall-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary, #1C1C1A);
  margin: 0;
  letter-spacing: -0.025em;
  line-height: 1.25;
}

html.dark .hall-title {
  color: var(--text-primary, #e6dfd8);
}

.hall-count-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-primary-accent, #8B9A6E);
  border: 0.5px solid rgba(139, 154, 110, 0.22);
  letter-spacing: 0.01em;
}

html.dark .hall-count-badge {
  background: rgba(163, 177, 155, 0.16);
  color: #B4C4AA;
  border-color: rgba(163, 177, 155, 0.24);
}

.hall-desc {
  font-size: 13.5px;
  color: var(--text-muted, #7A7A75);
  margin: 0;
  line-height: 1.5;
  letter-spacing: -0.01em;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 38px;
  background: var(--accent-gradient);
  color: #FFFFFF;
  border: none;
  padding: 0 18px;
  border-radius: var(--radius-full, 9999px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.32), 0 1px 2px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  user-select: none;
}

.create-btn-icon {
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

.create-btn:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 6px 18px rgba(118, 135, 88, 0.42), 0 2px 4px rgba(0, 0, 0, 0.08);
}

.create-btn:hover .create-btn-icon {
  transform: rotate(90deg) scale(1.08);
}

.create-btn:active {
  transform: translateY(0) scale(0.975);
  box-shadow: 0 2px 6px rgba(118, 135, 88, 0.24);
}

/* Search bar */
.hall-search-wrap {
  margin-bottom: 26px;
}

.search-input-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 420px;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: var(--text-muted, #7A7A75);
  pointer-events: none;
  transition: color 0.2s ease;
}

.search-input {
  width: 100%;
  padding: 10px 38px 10px 38px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-default, rgba(0, 0, 0, 0.08));
  border-radius: var(--radius-full, 9999px);
  color: var(--text-primary, #1C1C1A);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  box-sizing: border-box;
}

html.dark .search-input {
  background: var(--color-bg-tertiary, #2e2c29);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-primary, #e6dfd8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.search-input-box:focus-within .search-icon {
  color: var(--color-primary-accent, #8B9A6E);
}

.search-input:focus {
  border-color: var(--color-primary-accent, #8B9A6E);
  background: var(--color-bg-primary, #FFFFFF);
  box-shadow: 0 0 0 3px rgba(139, 154, 110, 0.16), 0 3px 10px rgba(0, 0, 0, 0.03);
}

html.dark .search-input:focus {
  background: #252422;
  box-shadow: 0 0 0 3px rgba(163, 177, 155, 0.22), 0 4px 12px rgba(0, 0, 0, 0.35);
}

.search-clear-btn {
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-muted, #7A7A75);
  cursor: pointer;
  transition: all 0.18s ease;
  padding: 0;
}

.search-clear-btn:hover {
  background: rgba(0, 0, 0, 0.12);
  color: var(--text-primary, #1C1C1A);
}

html.dark .search-clear-btn {
  background: rgba(255, 255, 255, 0.08);
}

html.dark .search-clear-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #FFFFFF;
}

/* Subjects Grid */
.subjects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 22px;
}

/* Subject Card */
.subject-card {
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  border-radius: 16px;
  padding: 22px 24px;
  cursor: pointer;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 14px -3px rgba(0, 0, 0, 0.03), 0 1px 3px rgba(0, 0, 0, 0.02);
  user-select: none;
  box-sizing: border-box;
}

html.dark .subject-card {
  background: var(--color-bg-secondary);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.35);
}

.subject-card:hover {
  transform: translateY(-2.5px);
  border-color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 12px 26px -4px rgba(0, 0, 0, 0.05), 0 4px 10px -2px rgba(139, 154, 110, 0.12);
}

html.dark .subject-card:hover {
  box-shadow: 0 14px 32px -4px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(163, 177, 155, 0.16);
}

.subject-card:active {
  transform: translateY(-0.5px) scale(0.99);
}

.subject-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.subject-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-primary-accent, #8B9A6E);
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .subject-card-icon {
  background: rgba(163, 177, 155, 0.16);
  color: #B4C4AA;
}

.subject-card:hover .subject-card-icon {
  transform: scale(1.06) rotate(2deg);
}

.subject-card-actions {
  display: flex;
  gap: 6px;
  opacity: 0.25;
  transition: opacity 0.2s ease;
}

.subject-card:hover .subject-card-actions {
  opacity: 1;
}

.card-action-btn {
  background: rgba(0, 0, 0, 0.04);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  color: var(--text-secondary, #7A7A75);
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 0;
}

html.dark .card-action-btn {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
  color: #9E9B95;
}

.card-action-btn:hover {
  background: var(--color-primary-accent, #8B9A6E);
  color: #FFFFFF;
  border-color: var(--color-primary-accent, #8B9A6E);
  transform: scale(1.08);
}

.card-action-btn.delete:hover {
  background: #D14343;
  color: #FFFFFF;
  border-color: #D14343;
}

.subject-card-body {
  margin-bottom: 20px;
}

.subject-card-title {
  font-size: 16.5px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  margin: 0 0 8px;
  letter-spacing: -0.015em;
  line-height: 1.35;
}

html.dark .subject-card-title {
  color: var(--text-primary, #e6dfd8);
}

.subject-card-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  font-weight: 500;
}

.meta-pill {
  font-weight: 600;
}

.meta-dot {
  opacity: 0.45;
  margin: 0 1px;
}

.subject-card-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.mastery-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.mastery-title {
  color: var(--text-muted, #7A7A75);
  font-weight: 500;
}

.mastery-value {
  color: var(--color-primary-accent, #8B9A6E);
  font-weight: 700;
  font-feature-settings: "tnum";
}

html.dark .mastery-value {
  color: #B4C4AA;
}

/* 三态细轨进度条 */
.mastery-bar-track {
  display: flex;
  width: 100%;
  height: 6px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: var(--radius-full, 9999px);
  overflow: hidden;
}

html.dark .mastery-bar-track {
  background: rgba(255, 255, 255, 0.08);
}

.mastery-bar-seg {
  height: 100%;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.mastery-bar-seg--new {
  background: #88929E;
}

.mastery-bar-seg--due {
  background: #C49A6C;
}

.mastery-bar-seg--mastered {
  background: var(--color-primary-accent, #8B9A6E);
}

/* Add Subject Card */
.add-card {
  border: 0.5px dashed rgba(139, 154, 110, 0.4) !important;
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 14px;
  box-shadow: none !important;
  text-align: center;
  min-height: 180px;
}

html.dark .add-card {
  background: var(--color-bg-secondary) !important;
  border-color: rgba(163, 177, 155, 0.3) !important;
}

.add-card:hover {
  background: rgba(139, 154, 110, 0.05) !important;
  border-color: var(--color-primary-accent, #8B9A6E) !important;
  transform: translateY(-2.5px);
  box-shadow: 0 10px 24px -4px rgba(139, 154, 110, 0.12) !important;
}

html.dark .add-card:hover {
  background: rgba(163, 177, 155, 0.08) !important;
}

.add-plus-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(139, 154, 110, 0.12);
  color: var(--color-primary-accent, #8B9A6E);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .add-plus-btn {
  background: rgba(163, 177, 155, 0.16);
  color: #B4C4AA;
}

.add-card:hover .add-plus-btn {
  background: var(--color-primary-accent, #8B9A6E);
  color: #FFFFFF;
  transform: rotate(90deg) scale(1.06);
}

.add-text-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.add-label {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  letter-spacing: -0.01em;
}

html.dark .add-label {
  color: var(--text-primary, #e6dfd8);
}

.add-sublabel {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
}

/* Empty State */
.empty-hall {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
}

.empty-icon-halo {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(139, 154, 110, 0.10);
  border: 0.5px solid rgba(139, 154, 110, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  color: var(--color-primary-accent, #8B9A6E);
  box-shadow: 0 8px 24px rgba(139, 154, 110, 0.12);
}

html.dark .empty-icon-halo {
  background: rgba(163, 177, 155, 0.14);
  color: #B4C4AA;
}

.empty-hall-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #1C1C1A);
  margin: 0 0 8px;
  letter-spacing: -0.015em;
}

html.dark .empty-hall-title {
  color: var(--text-primary, #e6dfd8);
}

.empty-hall-desc {
  font-size: 13px;
  color: var(--text-muted, #7A7A75);
  margin: 0 0 24px;
  max-width: 380px;
  line-height: 1.5;
}

.clear-search-btn {
  background: transparent;
  border: 0.5px solid var(--border-default, rgba(0, 0, 0, 0.12));
  color: var(--color-primary-accent, #8B9A6E);
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-search-btn:hover {
  background: rgba(139, 154, 110, 0.10);
  border-color: var(--color-primary-accent, #8B9A6E);
}

/* ===== Responsive Adaptation ===== */
@media (max-width: 1200px) {
  .hall-content {
    padding: 28px 32px;
  }
  .subjects-grid {
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 960px) {
  .hall-container {
    padding: 12px 14px;
  }
  .hall-content {
    padding: 20px 18px;
    border-radius: 16px;
  }
  .hall-header {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .create-btn {
    align-self: flex-start;
  }
  .subjects-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
}
</style>
