<template>
  <scroll-view scroll-y :show-scrollbar="false" class="stats-pane-scroll">
    <view class="stats-pane">
      <view class="stats-header">
        <view class="stats-title-group">
          <view class="stats-title-row">
            <text class="stats-title">学科统计</text>
            <text class="range-badge num-tabular">近 {{ days }} 天</text>
          </view>
          <text class="stats-subtitle">追踪学科学习进展、记忆保持与持续学习轨迹</text>
        </view>

        <view class="stats-controls">
          <view class="ui-segmented compact-seg" role="tablist">
            <view
              class="ui-seg-item compact-seg-item num-tabular"
              :class="{ active: days === 7 }"
              role="tab"
              :aria-selected="days === 7"
              @click="days = 7"
            >
              <text>7 天</text>
            </view>
            <view
              class="ui-seg-item compact-seg-item num-tabular"
              :class="{ active: days === 30 }"
              role="tab"
              :aria-selected="days === 30"
              @click="days = 30"
            >
              <text>30 天</text>
            </view>
          </view>

          <view class="ui-icon-btn sm" role="button" aria-label="刷新统计" @click="loadStats">
            <LineIcon name="refresh" size="14px" color="var(--text-secondary)" />
          </view>
        </view>
      </view>

      <view v-if="loading && !stats" class="stats-skeletons">
        <view class="skeleton-hero ui-shimmer"></view>
        <view class="skeleton-trend ui-shimmer"></view>
      </view>

      <view v-else-if="loadError && !stats" class="stats-notice is-error" role="alert">
        <text class="notice-text">{{ loadError }}</text>
        <button class="ui-btn ui-btn-secondary sm" @click="loadStats">重试</button>
      </view>

      <template v-else-if="stats">
        <view v-if="loadError" class="stats-notice is-error" role="alert">
          <text class="notice-text">刷新失败，当前展示上次数据：{{ loadError }}</text>
          <button class="ui-btn ui-btn-secondary sm" @click="loadStats">重试</button>
        </view>

        <!-- Hero Card -->
        <view class="hero-card zen-card">
          <view class="hero-left">
            <view class="hero-subject-row">
              <view class="hero-subject-icon">
                <LineIcon name="book" size="18px" color="var(--color-sage-ink)" />
              </view>
              <view class="hero-subject-meta">
                <text class="hero-subject-name">{{ subjectName || '当前学科' }}</text>
                <text class="hero-subject-sub num-tabular">
                  知识库 {{ overview.activeKnowledgeBlockCount }} 个知识块 · 资料 {{ totalSources }} 份
                </text>
              </view>
            </view>

            <view class="mastery-display">
              <text class="mastery-value num-tabular">{{ masteredPercent }}<text class="mastery-unit">%</text></text>
              <view class="mastery-text-group">
                <text class="mastery-label">学科掌握度</text>
                <text class="mastery-fraction num-tabular">
                  已掌握 {{ overview.masteredCount }} / {{ overview.activeKnowledgeBlockCount }} 知识块
                </text>
              </view>
            </view>

            <view v-if="masteryProportions.total > 0" class="mastery-track-wrap">
              <view class="mastery-track">
                <view
                  v-if="masteryProportions.pendingPct > 0"
                  class="track-seg is-learning"
                  :style="{ width: `${masteryProportions.pendingPct}%` }"
                ></view>
                <view
                  v-if="masteryProportions.reviewingPct > 0"
                  class="track-seg is-reviewing"
                  :style="{ width: `${masteryProportions.reviewingPct}%` }"
                ></view>
                <view
                  v-if="masteryProportions.masteredPct > 0"
                  class="track-seg is-mastered"
                  :style="{ width: `${masteryProportions.masteredPct}%` }"
                ></view>
              </view>
              <view class="track-legend num-tabular">
                <view class="legend-item">
                  <view class="legend-dot is-learning"></view>
                  <text>待学习 {{ overview.pendingLearningCount }} ({{ masteryProportions.pendingPct }}%)</text>
                </view>
                <view class="legend-item">
                  <view class="legend-dot is-reviewing"></view>
                  <text>待复习 {{ overview.reviewingCount }} ({{ masteryProportions.reviewingPct }}%)</text>
                </view>
                <view class="legend-item">
                  <view class="legend-dot is-mastered"></view>
                  <text>已掌握 {{ overview.masteredCount }} ({{ masteryProportions.masteredPct }}%)</text>
                </view>
              </view>
            </view>
          </view>

          <view class="hero-right">
            <text class="actions-heading">当前行动</text>

            <view
              class="action-card is-review"
              :class="{ 'is-urgent': overview.dueReviewCount > 0 }"
              role="button"
              @click="emit('open-review')"
            >
              <view class="action-left">
                <view class="action-icon is-review">
                  <LineIcon name="clock" size="16px" color="var(--color-warning-ink)" />
                </view>
                <view class="action-meta">
                  <view class="action-title-row">
                    <text class="action-title">待复习</text>
                    <text class="action-tag num-tabular" :class="{ 'is-urgent': overview.dueReviewCount > 0 }">
                      {{ overview.dueReviewCount > 0 ? `今日到期 ${overview.dueReviewCount}` : '暂无今日到期' }}
                    </text>
                  </view>
                  <text class="action-desc">巩固并保持记忆提取节奏</text>
                </view>
              </view>
              <view class="action-right">
                <text class="action-count num-tabular">{{ overview.reviewingCount }}</text>
                <LineIcon name="chevron-right" size="13px" color="var(--text-muted)" />
              </view>
            </view>

            <view class="action-card is-learn" role="button" @click="emit('open-review')">
              <view class="action-left">
                <view class="action-icon is-learn">
                  <LineIcon name="book" size="16px" color="var(--color-sage-ink)" />
                </view>
                <view class="action-meta">
                  <text class="action-title">待学习</text>
                  <text class="action-desc">初次理解与吸收新概念</text>
                </view>
              </view>
              <view class="action-right">
                <text class="action-count num-tabular">{{ overview.pendingLearningCount }}</text>
                <LineIcon name="chevron-right" size="13px" color="var(--text-muted)" />
              </view>
            </view>

            <view class="action-card is-mastered" role="button" @click="emit('open-review')">
              <view class="action-left">
                <view class="action-icon is-mastered">
                  <LineIcon name="check" size="16px" color="var(--color-sage-ink)" />
                </view>
                <view class="action-meta">
                  <text class="action-title">已掌握</text>
                  <text class="action-desc">随时可发起抽查自测</text>
                </view>
              </view>
              <view class="action-right">
                <text class="action-count num-tabular">{{ overview.masteredCount }}</text>
                <LineIcon name="chevron-right" size="13px" color="var(--text-muted)" />
              </view>
            </view>
          </view>
        </view>

        <!-- Activity & Trend -->
        <view class="trend-card zen-card">
          <view class="section-head">
            <view>
              <text class="section-title">学习活力与走势</text>
              <text class="section-caption">近 {{ days }} 天每日有效复习与学习完成频次</text>
            </view>
          </view>

          <view class="kpi-ribbon">
            <view class="kpi-cell">
              <text class="kpi-label">今日复习</text>
              <text class="kpi-value num-tabular">{{ todayReviewEvents }} 次</text>
            </view>
            <view class="kpi-cell">
              <text class="kpi-label">{{ days }} 天累计复习</text>
              <text class="kpi-value num-tabular">{{ totals.events }} 次</text>
            </view>
            <view class="kpi-cell">
              <text class="kpi-label">{{ days }} 天完成学习</text>
              <text class="kpi-value num-tabular">{{ totals.learningCompletions }} 次</text>
            </view>
          </view>

          <view class="chart-row">
            <view
              v-for="day in dailyItems"
              :key="day.date"
              class="chart-col"
              :class="{ 'is-today': day.date === todayKey }"
            >
              <text class="chart-val num-tabular">{{ day.activity }}</text>
              <view class="chart-groove">
                <view class="chart-bar" :style="{ height: `${barHeight(day.activity)}%` }"></view>
              </view>
              <text class="chart-date num-tabular">
                {{ day.date === todayKey ? '今' : day.shortDate }}
              </text>
            </view>
          </view>
        </view>

        <!-- Supporting Grid -->
        <view class="support-grid">
          <view class="support-card zen-card">
            <view class="support-head">
              <text class="support-title">资源与沉淀</text>
              <text class="support-badge num-tabular">共 {{ totalSources }} 份资料</text>
            </view>
            <view class="metric-rows">
              <view class="metric-row">
                <text class="metric-label">文件资料</text>
                <text class="metric-val num-tabular">{{ overview.fileSourceCount }}</text>
              </view>
              <view class="metric-row">
                <text class="metric-label">文本 / 链接</text>
                <text class="metric-val num-tabular">{{ overview.textSourceCount }} / {{ overview.urlSourceCount }}</text>
              </view>
              <view class="metric-row">
                <text class="metric-label">评分分布（认 / 模 / 忘）</text>
                <text class="metric-val num-tabular">
                  {{ ratingCounts.goodCount + ratingCounts.easyCount }} / {{ ratingCounts.hardCount }} / {{ ratingCounts.againCount }}
                </text>
              </view>
            </view>
          </view>

          <view class="support-card zen-card">
            <view class="support-head">
              <text class="support-title">关联任务</text>
              <text class="support-badge num-tabular">完成率 {{ taskCompletionRate }}%</text>
            </view>
            <view class="task-chips">
              <view class="task-chip">
                <text class="task-chip-label">待办</text>
                <text class="task-chip-num num-tabular">{{ overview.todoTaskCount }}</text>
              </view>
              <view class="task-chip">
                <text class="task-chip-label">进行中</text>
                <text class="task-chip-num num-tabular">{{ overview.inProgressTaskCount }}</text>
              </view>
              <view class="task-chip">
                <text class="task-chip-label">已完成</text>
                <text class="task-chip-num num-tabular">{{ overview.doneTaskCount }}</text>
              </view>
              <view class="task-chip">
                <text class="task-chip-label">已取消</text>
                <text class="task-chip-num num-tabular">{{ overview.cancelledTaskCount }}</text>
              </view>
            </view>
            <view class="task-progress-track">
              <view class="task-progress-fill" :style="{ width: `${taskCompletionRate}%` }"></view>
            </view>
          </view>
        </view>
      </template>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import { statsApi, type SubjectStats } from '@/api/statsApi'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
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
  [days, () => authStore.user?.id, () => authStore.serverDeviceId, () => authStore.sessionId],
  () => {
    void loadStats()
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
  max-width: 980px;
  margin: 0 auto;
  padding: 22px 26px 84px;
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
