<template>
  <div class="stats-pane-scroll zen-scroll-y">
    <div class="stats-pane">
      <div class="stats-header">
        <div class="stats-title-group">
          <div class="stats-title-row">
            <span class="stats-title">学科统计</span>
            <span class="range-badge num-tabular">近 {{ days }} 天</span>
          </div>
          <span class="stats-subtitle">追踪学科学习进展、记忆保持与持续学习轨迹</span>
        </div>

        <div class="stats-controls">
          <div class="ui-segmented compact-seg" role="tablist">
            <div
              class="ui-seg-item compact-seg-item num-tabular"
              :class="{ active: days === 7 }"
              role="tab"
              :aria-selected="days === 7"
              @click="days = 7"
            >
              <span>7 天</span>
            </div>
            <div
              class="ui-seg-item compact-seg-item num-tabular"
              :class="{ active: days === 30 }"
              role="tab"
              :aria-selected="days === 30"
              @click="days = 30"
            >
              <span>30 天</span>
            </div>
          </div>

          <div class="ui-icon-btn sm" role="button" aria-label="刷新统计" @click="loadStats">
            <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
          </div>
        </div>
      </div>

      <div v-if="loading && !stats" class="stats-skeletons">
        <div class="skeleton-hero ui-shimmer"></div>
        <div class="skeleton-trend ui-shimmer"></div>
      </div>

      <div v-else-if="loadError && !stats" class="stats-notice is-error" role="alert">
        <span class="notice-text">{{ loadError }}</span>
        <button type="button" class="ui-btn ui-btn-secondary sm" @click="loadStats">重试</button>
      </div>

      <template v-else-if="stats">
        <div v-if="loadError" class="stats-notice is-error" role="alert">
          <span class="notice-text">刷新失败，当前展示上次数据：{{ loadError }}</span>
          <button type="button" class="ui-btn ui-btn-secondary sm" @click="loadStats">重试</button>
        </div>

        <!-- Hero Card -->
        <div class="hero-card zen-card">
          <div class="hero-left">
            <div class="hero-subject-row">
              <div class="hero-subject-icon">
                <LineIcon name="book" size="18px" color="var(--color-sage-ink)" />
              </div>
              <div class="hero-subject-meta">
                <span class="hero-subject-name">{{ subjectName || '当前学科' }}</span>
                <span class="hero-subject-sub num-tabular">
                  知识库 {{ overview.activeKnowledgeBlockCount }} 个知识块 · 资料 {{ totalSources }} 份
                </span>
              </div>
            </div>

            <div class="mastery-display">
              <span class="mastery-value num-tabular">{{ masteredPercent }}<span class="mastery-unit">%</span></span>
              <div class="mastery-text-group">
                <span class="mastery-label">学科掌握度</span>
                <span class="mastery-fraction num-tabular">
                  已掌握 {{ overview.masteredCount }} / {{ overview.activeKnowledgeBlockCount }} 知识块
                </span>
              </div>
            </div>

            <div v-if="masteryProportions.total > 0" class="mastery-track-wrap">
              <div class="mastery-track">
                <div
                  v-if="masteryProportions.pendingPct > 0"
                  class="track-seg is-learning"
                  :style="{ width: `${masteryProportions.pendingPct}%` }"
                ></div>
                <div
                  v-if="masteryProportions.reviewingPct > 0"
                  class="track-seg is-reviewing"
                  :style="{ width: `${masteryProportions.reviewingPct}%` }"
                ></div>
                <div
                  v-if="masteryProportions.masteredPct > 0"
                  class="track-seg is-mastered"
                  :style="{ width: `${masteryProportions.masteredPct}%` }"
                ></div>
              </div>
              <div class="track-legend num-tabular">
                <div class="legend-item">
                  <div class="legend-dot is-learning"></div>
                  <span>待学习 {{ overview.pendingLearningCount }} ({{ masteryProportions.pendingPct }}%)</span>
                </div>
                <div class="legend-item">
                  <div class="legend-dot is-reviewing"></div>
                  <span>待复习 {{ overview.reviewingCount }} ({{ masteryProportions.reviewingPct }}%)</span>
                </div>
                <div class="legend-item">
                  <div class="legend-dot is-mastered"></div>
                  <span>已掌握 {{ overview.masteredCount }} ({{ masteryProportions.masteredPct }}%)</span>
                </div>
              </div>
            </div>
          </div>

          <div class="hero-right">
            <span class="actions-heading">当前行动</span>

            <div
              class="action-card is-review"
              :class="{ 'is-urgent': overview.dueReviewCount > 0 }"
              role="button"
              @click="emit('open-review')"
            >
              <div class="action-left">
                <div class="action-icon is-review">
                  <LineIcon name="clock" size="16px" color="var(--color-warning-ink)" />
                </div>
                <div class="action-meta">
                  <div class="action-title-row">
                    <span class="action-title">待复习</span>
                    <span class="action-tag num-tabular" :class="{ 'is-urgent': overview.dueReviewCount > 0 }">
                      {{ overview.dueReviewCount > 0 ? `今日到期 ${overview.dueReviewCount}` : '暂无今日到期' }}
                    </span>
                  </div>
                  <span class="action-desc">巩固并保持记忆提取节奏</span>
                </div>
              </div>
              <div class="action-right">
                <span class="action-count num-tabular">{{ overview.reviewingCount }}</span>
                <LineIcon name="chevron-right" size="13px" color="var(--text-muted)" />
              </div>
            </div>

            <div class="action-card is-learn" role="button" @click="emit('open-review')">
              <div class="action-left">
                <div class="action-icon is-learn">
                  <LineIcon name="book" size="16px" color="var(--color-sage-ink)" />
                </div>
                <div class="action-meta">
                  <span class="action-title">待学习</span>
                  <span class="action-desc">初次理解与吸收新概念</span>
                </div>
              </div>
              <div class="action-right">
                <span class="action-count num-tabular">{{ overview.pendingLearningCount }}</span>
                <LineIcon name="chevron-right" size="13px" color="var(--text-muted)" />
              </div>
            </div>

            <div class="action-card is-mastered" role="button" @click="emit('open-review')">
              <div class="action-left">
                <div class="action-icon is-mastered">
                  <LineIcon name="check" size="16px" color="var(--color-sage-ink)" />
                </div>
                <div class="action-meta">
                  <span class="action-title">已掌握</span>
                  <span class="action-desc">随时可发起抽查自测</span>
                </div>
              </div>
              <div class="action-right">
                <span class="action-count num-tabular">{{ overview.masteredCount }}</span>
                <LineIcon name="chevron-right" size="13px" color="var(--text-muted)" />
              </div>
            </div>
          </div>
        </div>

        <!-- Activity & Trend -->
        <div class="trend-card zen-card">
          <div class="section-head">
            <div>
              <span class="section-title">学习活力与走势</span>
              <span class="section-caption">近 {{ days }} 天每日有效复习与学习完成频次</span>
            </div>
          </div>

          <div class="kpi-ribbon">
            <div class="kpi-cell">
              <span class="kpi-label">今日复习</span>
              <span class="kpi-value num-tabular">{{ todayReviewEvents }} 次</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">{{ days }} 天累计复习</span>
              <span class="kpi-value num-tabular">{{ totals.events }} 次</span>
            </div>
            <div class="kpi-cell">
              <span class="kpi-label">{{ days }} 天完成学习</span>
              <span class="kpi-value num-tabular">{{ totals.learningCompletions }} 次</span>
            </div>
          </div>

          <div class="chart-row">
            <div
              v-for="day in dailyItems"
              :key="day.date"
              class="chart-col"
              :class="{ 'is-today': day.date === todayKey }"
            >
              <span class="chart-val num-tabular">{{ day.activity }}</span>
              <div class="chart-groove">
                <div class="chart-bar" :style="{ height: `${barHeight(day.activity)}%` }"></div>
              </div>
              <span class="chart-date num-tabular">
                {{ day.date === todayKey ? '今' : day.shortDate }}
              </span>
            </div>
          </div>
        </div>

        <!-- Supporting Grid -->
        <div class="support-grid">
          <div class="support-card zen-card">
            <div class="support-head">
              <span class="support-title">资源与沉淀</span>
              <span class="support-badge num-tabular">共 {{ totalSources }} 份资料</span>
            </div>
            <div class="metric-rows">
              <div class="metric-row">
                <span class="metric-label">文件资料</span>
                <span class="metric-val num-tabular">{{ overview.fileSourceCount }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">文本 / 链接</span>
                <span class="metric-val num-tabular">{{ overview.textSourceCount }} / {{ overview.urlSourceCount }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-label">评分分布（认 / 模 / 忘）</span>
                <span class="metric-val num-tabular">
                  {{ ratingCounts.goodCount + ratingCounts.easyCount }} / {{ ratingCounts.hardCount }} / {{ ratingCounts.againCount }}
                </span>
              </div>
            </div>
          </div>

          <div class="support-card zen-card">
            <div class="support-head">
              <span class="support-title">关联任务</span>
              <span class="support-badge num-tabular">完成率 {{ taskCompletionRate }}%</span>
            </div>
            <div class="task-chips">
              <div class="task-chip">
                <span class="task-chip-label">待办</span>
                <span class="task-chip-num num-tabular">{{ overview.todoTaskCount }}</span>
              </div>
              <div class="task-chip">
                <span class="task-chip-label">进行中</span>
                <span class="task-chip-num num-tabular">{{ overview.inProgressTaskCount }}</span>
              </div>
              <div class="task-chip">
                <span class="task-chip-label">已完成</span>
                <span class="task-chip-num num-tabular">{{ overview.doneTaskCount }}</span>
              </div>
              <div class="task-chip">
                <span class="task-chip-label">已取消</span>
                <span class="task-chip-num num-tabular">{{ overview.cancelledTaskCount }}</span>
              </div>
            </div>
            <div class="task-progress-track">
              <div class="task-progress-fill" :style="{ width: `${taskCompletionRate}%` }"></div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { statsApi, type SubjectStats } from '@/api/statsApi'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { detectLocalTimeZone, toLocalDateKey } from '@/utils/dateKey'

const props = defineProps<{
  subjectId: string
  subjectName: string
  sourceCount: number
}>()

const emit = defineEmits<{
  (event: 'open-review'): void
}>()

const authStore = useAuthStore()
const syncStore = useSyncStore()

const days = ref<7 | 30>(7)
const stats = ref<SubjectStats | null>(null)
const loading = ref(false)
const loadError = ref('')
let statsReqId = 0

async function loadStats() {
  const targetSubjectId = props.subjectId
  if (!targetSubjectId || !authStore.isAuthenticated) {
    stats.value = null
    loadError.value = ''
    return
  }
  const reqId = ++statsReqId
  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const requestedDays = days.value

  const isCurrent = () => (
    reqId === statsReqId
    && props.subjectId === targetSubjectId
    && days.value === requestedDays
    && authStore.isAuthenticated
    && generation === authStore.getLoginGeneration()
    && userId === authStore.user?.id
    && serverDeviceId === authStore.serverDeviceId
  )

  loading.value = true
  loadError.value = ''
  const timeZone = detectLocalTimeZone()
  try {
    try {
      const cached = await localDb.getSubjectStatsCache(targetSubjectId, requestedDays, timeZone)
      if (!isCurrent()) return
      if (cached) {
        stats.value = cached
      }
    } catch {
      // Ignore local stats cache read failure and fall back to remote fetch.
    }

    const result = await statsApi.subject(targetSubjectId, timeZone, requestedDays)
    if (!isCurrent()) return
    stats.value = result
    void localDb.saveSubjectStatsCache(targetSubjectId, requestedDays, timeZone, result).catch(() => {})
  } catch (error) {
    if (!isCurrent()) return
    loadError.value = error instanceof Error && error.message ? error.message : '学科统计加载失败'
  } finally {
    if (isCurrent()) loading.value = false
  }
}

watch(
  () => props.subjectId,
  () => {
    statsReqId++
    stats.value = null
    loadError.value = ''
    void loadStats()
  },
  { immediate: true },
)

watch(
  days,
  () => {
    void loadStats()
  },
)

watch(
  [
    () => authStore.isAuthenticated,
    () => authStore.user?.id,
    () => authStore.serverDeviceId,
    () => authStore.sessionId,
  ],
  () => {
    statsReqId++
    stats.value = null
    loadError.value = ''
    loading.value = false
    if (authStore.isAuthenticated && props.subjectId) {
      void loadStats()
    }
  },
)

watch(
  () => syncStore.lastSyncedAt,
  (syncedAt) => {
    if (syncedAt && authStore.isAuthenticated && props.subjectId) {
      void loadStats()
    }
  },
)

const overview = computed(() => {
  const raw = stats.value?.overview
  return {
    fileSourceCount: raw?.fileSourceCount ?? 0,
    textSourceCount: raw?.textSourceCount ?? 0,
    urlSourceCount: raw?.urlSourceCount ?? 0,
    activeKnowledgeBlockCount: raw?.activeKnowledgeBlockCount ?? 0,
    todoTaskCount: raw?.todoTaskCount ?? 0,
    inProgressTaskCount: raw?.inProgressTaskCount ?? 0,
    doneTaskCount: raw?.doneTaskCount ?? 0,
    cancelledTaskCount: raw?.cancelledTaskCount ?? 0,
    dueReviewCount: raw?.dueReviewCount ?? 0,
    pendingLearningCount: raw?.pendingLearningCount ?? 0,
    reviewingCount: raw?.reviewingCount ?? 0,
    masteredCount: raw?.masteredCount ?? 0,
  }
})

const ratingCounts = computed(() => {
  const raw = stats.value?.ratingCounts
  return {
    againCount: raw?.againCount ?? 0,
    hardCount: raw?.hardCount ?? 0,
    goodCount: raw?.goodCount ?? 0,
    easyCount: raw?.easyCount ?? 0,
  }
})

const totalSources = computed(() => {
  const apiTotal = overview.value.fileSourceCount + overview.value.textSourceCount + overview.value.urlSourceCount
  return apiTotal > 0 ? apiTotal : props.sourceCount
})

const masteredPercent = computed(() => {
  const total = overview.value.activeKnowledgeBlockCount
  if (!total) return 0
  return Math.round((overview.value.masteredCount / total) * 100)
})

const masteryProportions = computed(() => {
  const total = overview.value.activeKnowledgeBlockCount
  if (!total) return { pendingPct: 0, reviewingPct: 0, masteredPct: 0, total: 0 }
  const pendingPct = Math.round((overview.value.pendingLearningCount / total) * 100)
  const reviewingPct = Math.round(((overview.value.pendingLearningCount + overview.value.reviewingCount) / total) * 100) - pendingPct
  return {
    pendingPct,
    reviewingPct,
    masteredPct: Math.max(0, 100 - pendingPct - reviewingPct),
    total,
  }
})

const todayKey = computed(() => toLocalDateKey(new Date()))

const dailyItems = computed(() => (stats.value?.daily ?? []).map((item) => {
  const date = item.date || ''
  const reviewCount = item.nonSkipReviewEventCount ?? 0
  const learnCount = item.learningCompletionCount ?? 0
  return {
    date,
    shortDate: date.slice(5),
    reviewCount,
    learnCount,
    activity: reviewCount + learnCount,
  }
}))

const totals = computed(() => dailyItems.value.reduce((acc, day) => ({
  events: acc.events + day.reviewCount,
  learningCompletions: acc.learningCompletions + day.learnCount,
}), { events: 0, learningCompletions: 0 }))

const todayReviewEvents = computed(() => dailyItems.value[dailyItems.value.length - 1]?.reviewCount ?? 0)

const barMaximum = computed(() => Math.max(1, ...dailyItems.value.map(day => day.activity)))

function barHeight(value: number): number {
  return value === 0 ? 5 : Math.max(12, Math.round((value / barMaximum.value) * 100))
}

const totalTasks = computed(() => (
  overview.value.todoTaskCount
  + overview.value.inProgressTaskCount
  + overview.value.doneTaskCount
  + overview.value.cancelledTaskCount
))

const taskCompletionRate = computed(() => {
  if (!totalTasks.value) return 0
  return Math.round((overview.value.doneTaskCount / totalTasks.value) * 100)
})
</script>

<style scoped>
.stats-pane-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
}

.stats-pane {
  max-width: 1280px;
  margin: 0 auto;
  padding: clamp(16px, 2vw, 24px) clamp(18px, 2.4vw, 28px) 84px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.stats-title-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stats-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.range-badge {
  padding: 2px 9px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 11px;
  font-weight: 600;
}

.stats-subtitle {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.stats-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-seg {
  padding: 3px;
  border-radius: var(--radius-full);
}

.compact-seg-item {
  height: 26px;
  padding: 0 11px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
}

.stats-skeletons {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skeleton-hero {
  height: 220px;
  border-radius: 18px;
}

.skeleton-trend {
  height: 200px;
  border-radius: 18px;
}

.stats-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--color-danger-bg);
  border: 1px solid rgba(201, 59, 59, 0.24);
  color: var(--color-danger);
}

.stats-notice .ui-btn {
  margin: 0;
  flex-shrink: 0;
}

.stats-notice .ui-btn::after {
  border: none;
}

.notice-text {
  flex: 1;
  font-size: var(--text-xs);
}

.hero-card {
  padding: 20px;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 20px;
}

.hero-left {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
}

.hero-subject-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hero-subject-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hero-subject-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hero-subject-name {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-subject-sub {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.mastery-display {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.mastery-value {
  font-size: 40px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1;
}

.mastery-unit {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-muted);
  margin-left: 2px;
}

.mastery-text-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mastery-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.mastery-fraction {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.mastery-track-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mastery-track {
  height: 8px;
  border-radius: var(--radius-full);
  background: rgba(45, 55, 40, 0.08);
  overflow: hidden;
  display: flex;
}

.track-seg {
  height: 100%;
}

.track-seg.is-learning {
  background: #C89B6D;
}

.track-seg.is-reviewing {
  background: var(--color-zen-sage);
}

.track-seg.is-mastered {
  background: var(--color-sage-ink);
}

.track-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
}

.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.legend-dot.is-learning {
  background: #C89B6D;
}

.legend-dot.is-reviewing {
  background: var(--color-zen-sage);
}

.legend-dot.is-mastered {
  background: var(--color-sage-ink);
}

.hero-right {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actions-heading {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.action-card {
  padding: 11px 13px;
  border-radius: 13px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s var(--ease-out);
}

.action-card:hover {
  border-color: var(--border-accent);
  transform: translateX(2px);
}

.action-card:active {
  border-color: var(--border-accent);
  transform: scale(0.985);
}

.action-card.is-urgent {
  border-color: rgba(200, 155, 109, 0.45);
}

.action-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.action-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.action-icon.is-review {
  background: var(--color-warning-bg);
}

.action-icon.is-learn,
.action-icon.is-mastered {
  background: var(--color-sage-bg);
}

.action-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.action-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.action-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: rgba(45, 55, 40, 0.06);
  color: var(--text-muted);
}

.action-tag.is-urgent {
  background: var(--color-warning-bg);
  color: var(--color-warning-ink);
  font-weight: 600;
}

.action-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.action-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.action-count {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.trend-card,
.support-card {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-head,
.support-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-title,
.support-title {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-primary);
  display: block;
}

.section-caption {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.support-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-sage-ink);
  padding: 2px 9px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
}

.kpi-ribbon {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.kpi-cell {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.kpi-label {
  font-size: 11px;
  color: var(--text-muted);
}

.kpi-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.chart-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 126px;
  padding-top: 8px;
  overflow-x: auto;
}

.chart-col {
  flex: 1;
  min-width: 22px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.chart-val {
  font-size: 10px;
  color: var(--text-muted);
}

.chart-groove {
  flex: 1;
  width: 14px;
  border-radius: var(--radius-full);
  background: rgba(45, 55, 40, 0.06);
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.chart-bar {
  width: 100%;
  border-radius: var(--radius-full);
  background: var(--color-zen-sage);
  transition: height 0.24s var(--ease-out);
}

.chart-col.is-today .chart-bar {
  background: var(--accent-gradient);
}

.chart-date {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.chart-col.is-today .chart-date {
  color: var(--color-sage-ink);
  font-weight: 700;
}

.support-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.metric-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--color-bg-tertiary);
}

.metric-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.metric-val {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.task-chips {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.task-chip {
  padding: 9px 8px;
  border-radius: 10px;
  background: var(--color-bg-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.task-chip-label {
  font-size: 10.5px;
  color: var(--text-muted);
}

.task-chip-num {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.task-progress-track {
  height: 6px;
  border-radius: var(--radius-full);
  background: rgba(45, 55, 40, 0.08);
  overflow: hidden;
}

.task-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  transition: width 0.24s var(--ease-out);
}

@media (max-width: 820px) {
  .hero-card,
  .support-grid {
    grid-template-columns: 1fr;
  }

  .task-chips {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
