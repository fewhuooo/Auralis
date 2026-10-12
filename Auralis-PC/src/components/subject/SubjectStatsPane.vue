<template>
  <section class="subject-stats" :data-again-count="stats?.ratingCounts.againCount">
    <div class="subject-stats__container">
      <!-- 极简顶栏 -->
      <header class="subject-stats__header" :data-range="days">
        <div class="subject-stats__title-wrap">
          <div class="subject-stats__title-row">
            <h2>学科统计</h2>
            <span class="subject-stats__range-badge">近 7 天</span>
          </div>
          <p class="subject-stats__subtitle">追踪学科学习进展、记忆保持与持续学习轨迹</p>
        </div>
      </header>

      <!-- 状态与异常提示 -->
      <div v-if="isSubjectStatsLoading && !stats" class="subject-stats__notice" role="status">
        <div class="subject-stats__spinner"></div>
        <span>正在加载学科统计…</span>
      </div>
      <div v-else-if="subjectStatsError && !stats" class="subject-stats__notice subject-stats__notice--error" role="alert">
        <span>{{ subjectStatsError }}</span>
        <button type="button" @click="reload">重试</button>
      </div>
      <template v-else-if="stats">
        <div v-if="reviewSyncError" class="subject-stats__notice" role="status">{{ reviewSyncError }}</div>
        <div v-if="stats?.historyCoverage === 'INCOMPLETE'" class="subject-stats__notice subject-stats__notice--hidden" role="status">
          当前设备历史复习记录未完全同步，趋势图仅统计当前已有记录。
        </div>
        <div v-if="(stats?.pendingReviewCommandCount ?? 0) > 0" class="subject-stats__notice subject-stats__notice--hidden" role="status">
          {{ stats?.pendingReviewCommandCount ?? 0 }} 条复习记录已保存在本地，等待联网同步。
        </div>
        <div v-if="subjectStatsError" class="subject-stats__notice subject-stats__notice--error" role="alert">
          <span>统计刷新失败，当前显示上次成功的数据：{{ subjectStatsError }}</span>
          <button type="button" @click="reload">重试</button>
        </div>

        <!-- ========================================================
             第一级：核心看板 (Hero) —— 学科掌握度与当下行动
             ======================================================== -->
        <section class="subject-stats__section subject-stats__section--hero" aria-labelledby="subject-stats-hero">
          <div class="subject-stats__hero-card">
            <!-- 左侧：掌握度总览核心 -->
            <div class="subject-stats__hero-mastery">
              <div class="subject-stats__subject-header">
                <div class="subject-stats__subject-icon-box">
                  <IconBook :size="20" :stroke-width="1.8" />
                </div>
                <div class="subject-stats__subject-info">
                  <strong class="subject-stats__subject-name" :title="currentSubjectName">{{ currentSubjectName }}</strong>
                  <span class="subject-stats__subject-meta">知识库 {{ stats.overview.activeKnowledgeBlockCount }} 个知识块 · 资料 {{ sourceTotal }} 份</span>
                </div>
              </div>

              <!-- 大字掌握度展示 -->
              <div class="subject-stats__mastery-display">
                <div class="subject-stats__mastery-num-group">
                  <span class="subject-stats__mastery-val">{{ masteredPercent }}<small>%</small></span>
                  <div class="subject-stats__mastery-text-group">
                    <span class="subject-stats__mastery-title">学科掌握度</span>
                    <span class="subject-stats__mastery-fraction">
                      已掌握 <strong>{{ stats.overview.masteredCount }}</strong> / {{ stats.overview.activeKnowledgeBlockCount }} 知识块
                    </span>
                  </div>
                </div>
              </div>

              <!-- 极简三态细轨与图例 -->
              <div v-if="masteryProportions.total > 0" class="subject-stats__mastery-bar-wrap">
                <div
                  class="subject-stats__bar-track"
                  :title="`待学习 ${masteryProportions.pendingPct}% · 待复习 ${masteryProportions.reviewingPct}% · 已掌握 ${masteryProportions.masteredPct}%`"
                >
                  <div class="subject-stats__bar-seg subject-stats__bar-seg--new" :style="{ width: `${masteryProportions.pendingPct}%` }"></div>
                  <div class="subject-stats__bar-seg subject-stats__bar-seg--due" :style="{ width: `${masteryProportions.reviewingPct}%` }"></div>
                  <div class="subject-stats__bar-seg subject-stats__bar-seg--mastered" :style="{ width: `${masteryProportions.masteredPct}%` }"></div>
                </div>
                <div class="subject-stats__bar-legend">
                  <span class="subject-stats__legend-item">
                    <i class="subject-stats__legend-dot subject-stats__legend-dot--new"></i>
                    待学习 {{ stats.overview.pendingLearningCount }} ({{ masteryProportions.pendingPct }}%)
                  </span>
                  <span class="subject-stats__legend-item">
                    <i class="subject-stats__legend-dot subject-stats__legend-dot--due"></i>
                    待复习 {{ stats.overview.reviewingCount }} ({{ masteryProportions.reviewingPct }}%)
                  </span>
                  <span class="subject-stats__legend-item">
                    <i class="subject-stats__legend-dot subject-stats__legend-dot--mastered"></i>
                    已掌握 {{ stats.overview.masteredCount }} ({{ masteryProportions.masteredPct }}%)
                  </span>
                </div>
              </div>
            </div>

            <!-- 右侧：三态交互行动卡片 -->
            <div class="subject-stats__hero-actions">
              <div class="subject-stats__actions-label">当前行动</div>

              <!-- 待复习 (高优先级高光卡片) -->
              <button
                type="button"
                class="subject-stats__action-card subject-stats__action-card--review"
                :class="{ 'subject-stats__action-card--urgent': stats.overview.dueReviewCount > 0 }"
                @click="openReviews('reviewing')"
              >
                <div class="subject-stats__action-left">
                  <div class="subject-stats__action-icon subject-stats__action-icon--review">
                    <IconClock :size="18" :stroke-width="1.8" />
                  </div>
                  <div class="subject-stats__action-meta">
                    <div class="subject-stats__action-title-row">
                      <span class="subject-stats__action-title">待复习</span>
                      <span v-if="stats.overview.dueReviewCount > 0" class="subject-stats__action-tag subject-stats__action-tag--urgent">
                        今日到期 {{ stats.overview.dueReviewCount }}
                      </span>
                      <span v-else class="subject-stats__action-tag">暂无今日到期</span>
                    </div>
                    <span class="subject-stats__action-desc">巩固并保持记忆提取节奏</span>
                  </div>
                </div>
                <div class="subject-stats__action-right">
                  <span class="subject-stats__action-count">{{ stats.overview.reviewingCount }}</span>
                  <span class="subject-stats__action-cta">
                    <span>进入复习</span>
                    <IconArrowRight :size="13" :stroke-width="2" />
                  </span>
                </div>
              </button>

              <!-- 待学习 -->
              <button
                type="button"
                class="subject-stats__action-card subject-stats__action-card--learn"
                @click="openReviews('pending-learning')"
              >
                <div class="subject-stats__action-left">
                  <div class="subject-stats__action-icon subject-stats__action-icon--learn">
                    <IconBrain :size="18" :stroke-width="1.8" />
                  </div>
                  <div class="subject-stats__action-meta">
                    <span class="subject-stats__action-title">待学习</span>
                    <span class="subject-stats__action-desc">初次理解与吸收新概念</span>
                  </div>
                </div>
                <div class="subject-stats__action-right">
                  <span class="subject-stats__action-count">{{ stats.overview.pendingLearningCount }}</span>
                  <span class="subject-stats__action-cta">
                    <span>进入学习</span>
                    <IconArrowRight :size="13" :stroke-width="2" />
                  </span>
                </div>
              </button>

              <!-- 已掌握 -->
              <button
                type="button"
                class="subject-stats__action-card subject-stats__action-card--mastered"
                @click="openReviews('mastered')"
              >
                <div class="subject-stats__action-left">
                  <div class="subject-stats__action-icon subject-stats__action-icon--mastered">
                    <IconCircleCheck :size="18" :stroke-width="1.8" />
                  </div>
                  <div class="subject-stats__action-meta">
                    <span class="subject-stats__action-title">已掌握</span>
                    <span class="subject-stats__action-desc">随时可发起抽查自测</span>
                  </div>
                </div>
                <div class="subject-stats__action-right">
                  <span class="subject-stats__action-count">{{ stats.overview.masteredCount }}</span>
                  <span class="subject-stats__action-cta">
                    <span>抽查自测</span>
                    <IconArrowRight :size="13" :stroke-width="2" />
                  </span>
                </div>
              </button>
            </div>
          </div>
        </section>

        <!-- ========================================================
             第二级：学习活力与近 7 天走势 (Activity & Trend Rhythm)
             ======================================================== -->
        <section class="subject-stats__section" aria-labelledby="subject-stats-trend">
          <div class="subject-stats__section-header">
            <div class="subject-stats__section-title-wrap">
              <h3 id="subject-stats-trend">学习活力与走势</h3>
              <p class="subject-stats__section-caption">近 {{ days }} 天每日有效复习次数与学习完成频次</p>
            </div>
            <span class="subject-stats__section-badge">近 {{ days }} 天</span>
          </div>

          <div class="subject-stats__trend-card">
            <!-- 顶部三项核心活跃统计指标横向条 -->
            <div class="subject-stats__activity-ribbon">
              <div class="subject-stats__activity-cell subject-stats__activity-cell--today">
                <div class="subject-stats__activity-dot"></div>
                <div class="subject-stats__activity-text">
                  <span class="subject-stats__activity-label">今日复习</span>
                  <strong class="subject-stats__activity-val">{{ todayReviewEvents }} <small>次</small></strong>
                </div>
              </div>
              <div class="subject-stats__activity-sep"></div>
              <div class="subject-stats__activity-cell">
                <div class="subject-stats__activity-text">
                  <span class="subject-stats__activity-label">7 天累计复习</span>
                  <strong class="subject-stats__activity-val">{{ totals.events }} <small>次</small></strong>
                </div>
              </div>
              <div class="subject-stats__activity-sep"></div>
              <div class="subject-stats__activity-cell">
                <div class="subject-stats__activity-text">
                  <span class="subject-stats__activity-label">7 天完成学习</span>
                  <strong class="subject-stats__activity-val">{{ totals.learningCompletions }} <small>次</small></strong>
                </div>
              </div>
            </div>

            <!-- 每日活跃走势柱状图 -->
            <div class="subject-stats__chart" role="img" :aria-label="`近 ${days} 天每日学习趋势`">
              <div
                v-for="day in stats.daily"
                :key="day.date"
                class="subject-stats__chart-col"
                :class="{ 'subject-stats__chart-col--today': isDateToday(day.date) }"
                :title="`${day.date}：复习 ${day.nonSkipReviewEventCount} 次，完成学习 ${day.learningCompletionCount} 次`"
              >
                <span class="subject-stats__chart-val">{{ dayActivityCount(day) }}</span>
                <div class="subject-stats__chart-groove">
                  <span class="subject-stats__chart-bar" :style="{ height: `${barHeight(dayActivityCount(day))}%` }"></span>
                </div>
                <span class="subject-stats__chart-date">
                  <span v-if="isDateToday(day.date)" class="subject-stats__today-tag">今</span>
                  <small>{{ shortDate(day.date) }}</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- ========================================================
             第三级：学科底座与协同任务 (Supporting 2-Column Balance)
             ======================================================== -->
        <section class="subject-stats__section" aria-labelledby="subject-stats-support">
          <div class="subject-stats__section-header">
            <div class="subject-stats__section-title-wrap">
              <h3 id="subject-stats-support">学科底座与协同</h3>
              <p class="subject-stats__section-caption">知识资产沉淀与关联任务执行概况</p>
            </div>
          </div>

          <div class="subject-stats__support-grid">
            <!-- 左侧：学科资源沉淀 -->
            <div class="subject-stats__support-card">
              <div class="subject-stats__support-card-head">
                <div class="subject-stats__support-head-left">
                  <span class="subject-stats__support-title">资源与沉淀</span>
                  <span class="subject-stats__support-sub">学科内容资产构成</span>
                </div>
                <span class="subject-stats__support-badge">共 {{ sourceTotal }} 份资料</span>
              </div>

              <div class="subject-stats__resource-list">
                <div class="subject-stats__resource-item">
                  <span class="subject-stats__resource-label">知识块</span>
                  <strong class="subject-stats__resource-val">{{ stats.overview.activeKnowledgeBlockCount }} <small>个</small></strong>
                </div>
                <div class="subject-stats__resource-item">
                  <span class="subject-stats__resource-label">学习文件</span>
                  <strong class="subject-stats__resource-val">{{ stats.overview.fileSourceCount }} <small>份</small></strong>
                </div>
                <div class="subject-stats__resource-item">
                  <span class="subject-stats__resource-label">资料总数</span>
                  <strong class="subject-stats__resource-val">{{ sourceTotal }} <small>份</small></strong>
                </div>
              </div>
            </div>

            <!-- 右侧：任务协同状态 -->
            <div class="subject-stats__support-card">
              <div class="subject-stats__support-card-head">
                <div class="subject-stats__support-head-left">
                  <span class="subject-stats__support-title">任务协同</span>
                  <span class="subject-stats__support-sub">共 {{ totalTasks }} 项关联任务</span>
                </div>
                <span class="subject-stats__support-badge">完成率 {{ taskCompletionRate }}%</span>
              </div>

              <div class="subject-stats__task-grid">
                <div class="subject-stats__task-chip subject-stats__task-chip--todo">
                  <span class="subject-stats__task-label">待办</span>
                  <strong class="subject-stats__task-num">{{ stats.overview.todoTaskCount }}</strong>
                </div>
                <div class="subject-stats__task-chip subject-stats__task-chip--progress">
                  <span class="subject-stats__task-label">进行中</span>
                  <strong class="subject-stats__task-num">{{ stats.overview.inProgressTaskCount }}</strong>
                </div>
                <div class="subject-stats__task-chip subject-stats__task-chip--done">
                  <span class="subject-stats__task-label">已完成</span>
                  <strong class="subject-stats__task-num">{{ stats.overview.doneTaskCount }}</strong>
                </div>
                <div class="subject-stats__task-chip subject-stats__task-chip--cancel">
                  <span class="subject-stats__task-label">已取消</span>
                  <strong class="subject-stats__task-num">{{ stats.overview.cancelledTaskCount }}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import {
  IconBook,
  IconBrain,
  IconClock,
  IconCircleCheck,
  IconArrowRight,
} from '@tabler/icons-vue'
import { useStatsStore } from '@/store/useStatsStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'

const props = defineProps<{ subjectId: string }>()
const router = useRouter()
const statsStore = useStatsStore()
const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const syncStore = useSyncStore()

const { subjectStats, subjectStatsError, isSubjectStatsLoading } = storeToRefs(statsStore)
const { isSyncing, reviewSyncError } = storeToRefs(syncStore)

const days = ref<7 | 30>(7)
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const currentSubject = computed(() => subjectStore.subjects.find((s) => s.id === props.subjectId))
const currentSubjectName = computed(() => currentSubject.value?.name || '当前学科')

const stats = computed(() => subjectStats.value?.subjectId === props.subjectId
  && subjectStats.value.timeZone === timeZone
  && subjectStats.value.daily.length === days.value
  ? subjectStats.value
  : null)

const sourceTotal = computed(() => {
  if (!stats.value) return 0
  const { fileSourceCount, textSourceCount, urlSourceCount } = stats.value.overview
  return fileSourceCount + textSourceCount + urlSourceCount
})

const masteredPercent = computed(() => {
  if (!stats.value || stats.value.overview.activeKnowledgeBlockCount === 0) return 0
  return Math.round((stats.value.overview.masteredCount / stats.value.overview.activeKnowledgeBlockCount) * 100)
})

const masteryProportions = computed(() => {
  if (!stats.value) return { pendingPct: 0, reviewingPct: 0, masteredPct: 0, total: 0 }
  const { pendingLearningCount, reviewingCount, activeKnowledgeBlockCount } = stats.value.overview
  const total = activeKnowledgeBlockCount
  if (total === 0) return { pendingPct: 0, reviewingPct: 0, masteredPct: 0, total: 0 }
  const pendingPct = Math.round((pendingLearningCount / total) * 100)
  const reviewingPct = Math.round(((pendingLearningCount + reviewingCount) / total) * 100) - pendingPct
  return {
    pendingPct,
    reviewingPct,
    masteredPct: Math.max(0, 100 - pendingPct - reviewingPct),
    total,
  }
})

const totals = computed(() => (stats.value?.daily ?? []).reduce((result, day) => ({
  events: result.events + day.nonSkipReviewEventCount,
  activity: result.activity + day.nonSkipReviewEventCount + day.learningCompletionCount,
  blocks: result.blocks + day.distinctReviewedKnowledgeBlockCount,
  first: result.first + day.firstLearningKnowledgeBlockCount,
  subsequent: result.subsequent + day.subsequentReviewKnowledgeBlockCount,
  created: result.created + day.createdKnowledgeBlockCount,
  completedTasks: result.completedTasks + day.completedTaskCount,
  learningCompletions: result.learningCompletions + day.learningCompletionCount,
  studiedBlocks: result.studiedBlocks + day.distinctStudiedKnowledgeBlockCount,
}), { events: 0, activity: 0, blocks: 0, first: 0, subsequent: 0, created: 0, completedTasks: 0, learningCompletions: 0, studiedBlocks: 0 }))

const todayReviewEvents = computed(() => {
  if (!stats.value || stats.value.daily.length === 0) return 0
  return stats.value.daily[stats.value.daily.length - 1]?.nonSkipReviewEventCount ?? 0
})

const totalTasks = computed(() => {
  if (!stats.value) return 0
  const { todoTaskCount, inProgressTaskCount, doneTaskCount, cancelledTaskCount } = stats.value.overview
  return todoTaskCount + inProgressTaskCount + doneTaskCount + cancelledTaskCount
})

const taskCompletionRate = computed(() => {
  if (!totalTasks.value) return 0
  return Math.round((stats.value!.overview.doneTaskCount / totalTasks.value) * 100)
})

function dayActivityCount(day: NonNullable<typeof stats.value>['daily'][number]): number {
  return day.nonSkipReviewEventCount + day.learningCompletionCount
}

const barMaximum = computed(() => Math.max(1, ...(stats.value?.daily ?? []).map(dayActivityCount)))

function barHeight(value: number): number {
  return value === 0 ? 4 : Math.max(12, Math.round((value / barMaximum.value) * 100))
}

function shortDate(value: string): string {
  return value.slice(5)
}

function isDateToday(dateStr: string): boolean {
  if (!stats.value || stats.value.daily.length === 0) return false
  return dateStr === stats.value.daily[stats.value.daily.length - 1]?.date
}

async function reload(): Promise<void> {
  await statsStore.loadSubjectStats(props.subjectId, { days: days.value, timeZone })
}

function onLocalReviewUpdated(event: Event): void {
  const detail = (event as CustomEvent<Record<string, unknown>>).detail
  if (detail?.subjectId !== props.subjectId
    || detail.userId !== authStore.user?.id
    || detail.deviceId !== authStore.serverDeviceId
    || detail.sessionId !== authStore.sessionId) return
  statsStore.invalidateSubjectStats(props.subjectId)
  void reload().catch(() => undefined)
}

function accountKey(): string {
  return JSON.stringify([authStore.user?.id ?? null, authStore.serverDeviceId ?? null, authStore.sessionId ?? null])
}

function openReviews(state: 'pending-learning' | 'reviewing' | 'mastered'): void {
  void router.replace({ path: `/subject/${encodeURIComponent(props.subjectId)}`, query: { view: 'review', reviewState: state } })
}

watch([
  () => props.subjectId,
  days,
  () => authStore.user?.id,
  () => authStore.serverDeviceId,
  () => authStore.sessionId,
], () => { void reload().catch(() => undefined) }, { immediate: true })

watch([isSyncing, accountKey], ([syncing, identity], [previousSyncing, previousIdentity]) => {
  if (previousSyncing && !syncing && identity === previousIdentity) void reload().catch(() => undefined)
})

onMounted(() => window.addEventListener('auralis-review-local-updated', onLocalReviewUpdated))
onUnmounted(() => window.removeEventListener('auralis-review-local-updated', onLocalReviewUpdated))
</script>

<style scoped>
.subject-stats {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 36px 48px 72px;
  color: var(--text-primary);
  background: var(--color-bg-primary);
}

.subject-stats__container {
  max-width: 1160px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* 顶部标题栏 */
.subject-stats__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 4px;
}

.subject-stats__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.subject-stats__title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.subject-stats__title-row h2 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.2;
  color: var(--text-primary);
}

.subject-stats__subtitle {
  margin: 0;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-muted);
}

.subject-stats__range-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-zen-sage, #8B9A6E);
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 40%, transparent);
  padding: 3px 12px;
  border-radius: var(--radius-full, 9999px);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, transparent);
}

/* 状态与通知 */
.subject-stats__notice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-radius: 12px;
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 25%, transparent);
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.04);
  font-size: 13px;
  color: var(--text-secondary);
}

.subject-stats__notice--hidden {
  display: none !important;
}

.subject-stats__notice--error {
  border-color: rgba(229, 115, 115, 0.45);
  color: var(--color-danger, #E57373);
  background: #FFFFFF;
  box-shadow: 0 2px 8px -2px rgba(229, 115, 115, 0.15);
}

.subject-stats__notice--error button {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.subject-stats__spinner {
  width: 15px;
  height: 15px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--color-zen-sage, #8B9A6E);
  border-radius: 50%;
  animation: stats-spin 0.8s linear infinite;
}

@keyframes stats-spin {
  to { transform: rotate(360deg); }
}

/* ========================================================
   通用分段标题与结构规范
   ======================================================== */
.subject-stats__section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.subject-stats__section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.subject-stats__section-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.subject-stats__section-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.3;
  color: var(--text-primary);
}

.subject-stats__section-caption {
  margin: 0;
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-muted);
}

.subject-stats__section-badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-zen-sage, #8B9A6E);
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
  padding: 3px 12px;
  border-radius: var(--radius-full, 9999px);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, transparent);
}

/* ========================================================
   第一级：核心看板 (Hero Card) —— 掌握度与当下行动
   ======================================================== */
.subject-stats__hero-card {
  display: grid;
  grid-template-columns: 1.18fr 0.82fr;
  gap: 36px;
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
  border-radius: 20px;
  padding: 32px 36px;
  box-shadow: 0 4px 20px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, rgba(0, 0, 0, 0.04)), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
  transition: all 0.25s ease;
}

.subject-stats__hero-card:hover {
  border-color: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 55%, transparent);
  box-shadow: 0 6px 24px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 18%, rgba(0, 0, 0, 0.06)), 0 2px 8px -1px rgba(0, 0, 0, 0.03);
}

@media (max-width: 960px) {
  .subject-stats__hero-card {
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 26px 28px;
  }
}

/* 左侧：掌握度总览 */
.subject-stats__hero-mastery {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  padding-right: 28px;
  border-right: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, transparent);
}

@media (max-width: 960px) {
  .subject-stats__hero-mastery {
    padding-right: 0;
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, transparent);
    padding-bottom: 28px;
  }
}

.subject-stats__subject-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.subject-stats__subject-icon-box {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, #FFFFFF);
  border: 1.5px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
  color: var(--color-zen-sage, #8B9A6E);
  box-shadow: 0 2px 8px -1px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, transparent);
  flex-shrink: 0;
}

.subject-stats__subject-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
}

.subject-stats__subject-name {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subject-stats__subject-meta {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-muted);
}

/* 核心大字指标展示 */
.subject-stats__mastery-display {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 8px 0;
}

.subject-stats__mastery-num-group {
  display: flex;
  align-items: baseline;
  gap: 18px;
}

.subject-stats__mastery-val {
  font-size: 52px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--color-zen-sage, #8B9A6E);
}

.subject-stats__mastery-val small {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-zen-sage, #8B9A6E);
  margin-left: 2px;
}

.subject-stats__mastery-text-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.subject-stats__mastery-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}

.subject-stats__mastery-fraction {
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-secondary);
}

.subject-stats__mastery-fraction strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-zen-sage, #8B9A6E);
}

/* 极简细轨进度条 */
.subject-stats__mastery-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.subject-stats__bar-track {
  display: flex;
  height: 8px;
  width: 100%;
  border-radius: var(--radius-full, 9999px);
  overflow: hidden;
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 8%, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, transparent);
}

.subject-stats__bar-seg {
  height: 100%;
  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-stats__bar-seg--new { background: #88929E; }
.subject-stats__bar-seg--due { background: #C49A6C; }
.subject-stats__bar-seg--mastered { background: var(--color-zen-sage, #8B9A6E); }

.subject-stats__bar-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  font-size: 12px;
  color: var(--text-muted);
}

.subject-stats__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.subject-stats__legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full, 9999px);
}

.subject-stats__legend-dot--new { background: #88929E; }
.subject-stats__legend-dot--due { background: #C49A6C; }
.subject-stats__legend-dot--mastered { background: var(--color-zen-sage, #8B9A6E); }

/* 右侧：三态交互行动卡片组 */
.subject-stats__hero-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
}

.subject-stats__actions-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.subject-stats__action-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 32%, transparent);
  background: #FFFFFF;
  color: inherit;
  cursor: pointer;
  text-align: left;
  box-shadow: 0 3px 12px -1px rgba(0, 0, 0, 0.05), 0 1px 4px 0 rgba(0, 0, 0, 0.03), 0 0 0 1px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, transparent);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-stats__action-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-zen-sage, #8B9A6E);
  box-shadow: 0 10px 26px -3px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, rgba(0, 0, 0, 0.08)), 0 4px 8px -2px rgba(0, 0, 0, 0.04);
}

/* 待复习高优先级卡片高亮 */
.subject-stats__action-card--urgent {
  border-color: color-mix(in srgb, #C49A6C 55%, transparent);
  box-shadow: 0 4px 14px -2px color-mix(in srgb, #C49A6C 25%, rgba(0, 0, 0, 0.06)), 0 1px 4px 0 rgba(0, 0, 0, 0.03), 0 0 0 1px color-mix(in srgb, #C49A6C 15%, transparent);
}

.subject-stats__action-card--urgent:hover {
  border-color: #C49A6C;
  box-shadow: 0 10px 28px -3px color-mix(in srgb, #C49A6C 35%, rgba(0, 0, 0, 0.10)), 0 4px 8px -2px rgba(0, 0, 0, 0.04);
}

.subject-stats__action-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.subject-stats__action-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, transparent);
  box-shadow: 0 2px 6px -1px rgba(0, 0, 0, 0.06);
}

.subject-stats__action-icon--review {
  color: #B58752;
  border-color: color-mix(in srgb, #C49A6C 35%, transparent);
  background: color-mix(in srgb, #C49A6C 10%, #FFFFFF);
}

.subject-stats__action-icon--learn {
  color: #6C7785;
}

.subject-stats__action-icon--mastered {
  color: var(--color-zen-sage, #8B9A6E);
  border-color: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 10%, #FFFFFF);
}

.subject-stats__action-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.subject-stats__action-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.subject-stats__action-title {
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}

.subject-stats__action-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 1.5px 7px;
  border-radius: var(--radius-full, 9999px);
  background: #FFFFFF;
  color: var(--text-muted);
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, transparent);
}

.subject-stats__action-tag--urgent {
  background: color-mix(in srgb, #C49A6C 15%, #FFFFFF);
  border-color: color-mix(in srgb, #C49A6C 40%, transparent);
  color: #A36E3B;
  font-weight: 600;
}

.subject-stats__action-desc {
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-muted);
}

.subject-stats__action-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.subject-stats__action-count {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  line-height: 1;
}

.subject-stats__action-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  transition: color 0.15s ease;
}

.subject-stats__action-card:hover .subject-stats__action-cta {
  color: var(--color-zen-sage, #8B9A6E);
}

.subject-stats__action-card--urgent:hover .subject-stats__action-cta {
  color: #B58752;
}

/* ========================================================
   第二级：学习活力与近 7 天走势 (Activity & Trend Rhythm)
   ======================================================== */
.subject-stats__trend-card {
  display: flex;
  flex-direction: column;
  gap: 26px;
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
  border-radius: 20px;
  padding: 28px 32px 30px;
  box-shadow: 0 4px 20px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, rgba(0, 0, 0, 0.04)), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
  transition: all 0.25s ease;
}

.subject-stats__trend-card:hover {
  border-color: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 55%, transparent);
  box-shadow: 0 6px 24px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 18%, rgba(0, 0, 0, 0.06)), 0 2px 8px -1px rgba(0, 0, 0, 0.03);
}

/* 顶部三项核心活跃统计指标横向条 */
.subject-stats__activity-ribbon {
  display: flex;
  align-items: center;
  gap: 36px;
  padding-bottom: 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 18%, transparent);
}

@media (max-width: 680px) {
  .subject-stats__activity-ribbon {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
}

.subject-stats__activity-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.subject-stats__activity-cell--today .subject-stats__activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-zen-sage, #8B9A6E);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 28%, transparent);
}

.subject-stats__activity-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.subject-stats__activity-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--text-muted);
}

.subject-stats__activity-val {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  line-height: 1;
}

.subject-stats__activity-val small {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 2px;
}

.subject-stats__activity-sep {
  width: 1px;
  height: 36px;
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, transparent);
}

@media (max-width: 680px) {
  .subject-stats__activity-sep {
    display: none;
  }
}

/* 每日活跃走势柱状图 */
.subject-stats__chart {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 16px;
  height: 150px;
  align-items: stretch;
  padding-top: 6px;
}

.subject-stats__chart-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  height: 100%;
}

.subject-stats__chart-val {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  opacity: 0.8;
  transition: opacity 0.15s ease;
}

.subject-stats__chart-col:hover .subject-stats__chart-val {
  opacity: 1;
  color: var(--color-zen-sage, #8B9A6E);
}

.subject-stats__chart-groove {
  position: relative;
  width: 16px;
  flex: 1;
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 8%, #FFFFFF);
  border-radius: var(--radius-full, 9999px);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, transparent);
}

.subject-stats__chart-bar {
  width: 100%;
  border-radius: var(--radius-full, 9999px);
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 85%, #6B7B50);
  transition: height 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease;
}

.subject-stats__chart-col:hover .subject-stats__chart-bar {
  background: var(--color-zen-sage, #8B9A6E);
}

.subject-stats__chart-col--today .subject-stats__chart-groove {
  border-color: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 45%, transparent);
}

.subject-stats__chart-col--today .subject-stats__chart-bar {
  background: var(--color-zen-sage, #8B9A6E);
  box-shadow: 0 0 10px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
}

.subject-stats__chart-col--today .subject-stats__chart-val {
  color: var(--color-zen-sage, #8B9A6E);
  font-weight: 700;
  opacity: 1;
}

.subject-stats__chart-date {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

.subject-stats__chart-col--today .subject-stats__chart-date {
  color: var(--color-zen-sage, #8B9A6E);
  font-weight: 600;
}

.subject-stats__today-tag {
  display: inline-block;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #FFFFFF;
  background: var(--color-zen-sage, #8B9A6E);
  line-height: 14px;
}

/* ========================================================
   第三级：学科底座与协同任务 (Supporting 2-Column Balance)
   ======================================================== */
.subject-stats__support-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 860px) {
  .subject-stats__support-grid {
    grid-template-columns: 1fr;
  }
}

.subject-stats__support-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
  border-radius: 18px;
  padding: 24px 28px;
  box-shadow: 0 6px 24px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 15%, rgba(0, 0, 0, 0.06)), 0 2px 8px -1px rgba(0, 0, 0, 0.03);
  transition: all 0.25s ease;
}

.subject-stats__support-card:hover {
  border-color: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 55%, transparent);
  box-shadow: 0 8px 28px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, rgba(0, 0, 0, 0.08)), 0 3px 10px -1px rgba(0, 0, 0, 0.04);
}

.subject-stats__support-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.subject-stats__support-head-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.subject-stats__support-title {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}

.subject-stats__support-sub {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-muted);
}

.subject-stats__support-badge {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-zen-sage, #8B9A6E);
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent);
  padding: 3px 12px;
  border-radius: var(--radius-full, 9999px);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, transparent);
}

/* 资源列表 */
.subject-stats__resource-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subject-stats__resource-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-radius: 13px;
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 30%, transparent);
  box-shadow: 0 3px 12px -1px rgba(0, 0, 0, 0.07), 0 1px 4px 0 rgba(0, 0, 0, 0.03), 0 0 0 1px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, transparent);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-stats__resource-item:hover {
  transform: translateY(-2px);
  border-color: var(--color-zen-sage, #8B9A6E);
  box-shadow: 0 8px 22px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, rgba(0, 0, 0, 0.10)), 0 3px 8px -1px rgba(0, 0, 0, 0.05);
}

.subject-stats__resource-label {
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--text-secondary);
}

.subject-stats__resource-val {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  line-height: 1;
}

.subject-stats__resource-val small {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 2px;
}

/* 任务状态卡片网格 */
.subject-stats__task-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

@media (max-width: 540px) {
  .subject-stats__task-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.subject-stats__task-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 10px;
  border-radius: 13px;
  background: #FFFFFF;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 30%, transparent);
  box-shadow: 0 3px 12px -1px rgba(0, 0, 0, 0.07), 0 1px 4px 0 rgba(0, 0, 0, 0.03), 0 0 0 1px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, transparent);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.subject-stats__task-chip:hover {
  transform: translateY(-2px);
  border-color: var(--color-zen-sage, #8B9A6E);
  box-shadow: 0 8px 22px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, rgba(0, 0, 0, 0.10)), 0 3px 8px -1px rgba(0, 0, 0, 0.05);
}

.subject-stats__task-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.subject-stats__task-num {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  line-height: 1;
}

.subject-stats__task-chip--todo .subject-stats__task-label { color: #88929E; }
.subject-stats__task-chip--progress .subject-stats__task-label { color: #C49A6C; }
.subject-stats__task-chip--done .subject-stats__task-label { color: var(--color-zen-sage, #8B9A6E); }
.subject-stats__task-chip--cancel .subject-stats__task-label { color: var(--text-muted); opacity: 0.7; }
</style>
