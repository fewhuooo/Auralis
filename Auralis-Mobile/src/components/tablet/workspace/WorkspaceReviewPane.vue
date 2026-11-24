<template>
  <scroll-view scroll-y :show-scrollbar="false" class="review-pane-scroll">
    <view class="review-pane">
      <!-- 1. 规划总览态 -->
      <template v-if="!inRound">
        <view v-if="statesError" class="pane-notice is-error" role="alert">
          <text class="notice-text">{{ statesError }}</text>
          <button
            class="ui-btn ui-btn-secondary sm"
            :disabled="statesLoading"
            @click="loadPlanningStates"
          >重试</button>
        </view>

        <view v-if="statesLoading && !statesLoaded" class="plan-card zen-card">
          <view class="plan-skeleton-hero ui-shimmer"></view>
          <view class="plan-skeleton-row ui-shimmer"></view>
        </view>

        <view v-else class="plan-card zen-card">
          <view class="plan-top">
            <view class="plan-meta">
              <view class="plan-badge">
                <text>学科记忆规划</text>
              </view>
              <text class="plan-title">{{ subjectName || '当前学科' }}</text>
              <text class="plan-subtitle num-tabular">共 {{ summary.blockCount }} 个知识块</text>

              <view class="segment-wrap">
                <view class="segment-header">
                  <text class="segment-title">知识块掌握分布</text>
                  <view class="segment-legend num-tabular">
                    <view class="legend-item">
                      <view class="legend-dot is-learning"></view>
                      <text>待学习 {{ summary.pendingLearningCount }}</text>
                    </view>
                    <view class="legend-item">
                      <view class="legend-dot is-reviewing"></view>
                      <text>待复习 {{ summary.reviewingCount }}</text>
                    </view>
                    <view class="legend-item">
                      <view class="legend-dot is-mastered"></view>
                      <text>已掌握 {{ summary.masteredCount }}</text>
                    </view>
                  </view>
                </view>

                <view
                  class="progress-track"
                  role="progressbar"
                  :aria-valuenow="summary.masteryPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <template v-if="summary.blockCount > 0">
                    <view
                      v-if="summary.pendingLearningCount > 0"
                      class="progress-fill is-learning"
                      :style="{ width: `${summary.distributionPercents.learning}%` }"
                    ></view>
                    <view
                      v-if="summary.reviewingCount > 0"
                      class="progress-fill is-reviewing"
                      :style="{ width: `${summary.distributionPercents.reviewing}%` }"
                    ></view>
                    <view
                      v-if="summary.masteredCount > 0"
                      class="progress-fill is-mastered"
                      :style="{ width: `${summary.distributionPercents.mastered}%` }"
                    ></view>
                  </template>
                </view>
              </view>
            </view>

            <view class="mastery-ring-box">
              <view class="mastery-ring">
                <!-- #ifdef H5 -->
                <svg class="ring-svg" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" :r="ringRadius" fill="none" class="ring-track" />
                  <circle
                    cx="50"
                    cy="50"
                    :r="ringRadius"
                    fill="none"
                    class="ring-progress"
                    :stroke-dasharray="ringCircumference"
                    :stroke-dashoffset="ringDashOffset"
                  />
                </svg>
                <!-- #endif -->
                <!-- #ifndef H5 -->
                <view class="ring-conic-track" :style="{ background: ringConicBackground }"></view>
                <!-- #endif -->
                <view class="ring-inner">
                  <text class="ring-percent num-tabular">{{ summary.masteryPercent }}%</text>
                  <view class="ring-pill">
                    <view class="ring-pill-dot"></view>
                    <text class="ring-pill-text num-tabular">{{ summary.masteredCount }}/{{ summary.blockCount }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <view class="panels-container">
            <view class="panels-toolbar">
              <view class="group-size-wrap" role="group" aria-label="每组数量">
                <text class="group-size-label">每组</text>
                <view
                  class="group-size-btn num-tabular"
                  :class="{ active: groupSize === 5 }"
                  role="button"
                  @click="groupSize = 5"
                >
                  <text>5 个</text>
                </view>
                <view
                  class="group-size-btn num-tabular"
                  :class="{ active: groupSize === 10 }"
                  role="button"
                  @click="groupSize = 10"
                >
                  <text>10 个</text>
                </view>
              </view>

              <button
                class="voluntary-btn"
                :class="{ 'is-disabled': !canStartSelfTest }"
                :disabled="!canStartSelfTest"
                @click="enterRound('self-test')"
              >
                <LineIcon name="rotate" size="13px" :color="canStartSelfTest ? 'var(--color-sage-ink)' : 'var(--text-muted)'" />
                <text>自测复习</text>
              </button>
            </view>

            <view class="panels-grid">
              <view
                class="action-panel is-learn"
                :class="{ 'is-disabled': !canStartLearning }"
                role="button"
                aria-label="进入学习"
                @click="canStartLearning && enterRound('learn')"
              >
                <view class="action-panel-head">
                  <view class="action-title-group">
                    <view class="action-icon-wrap is-learn">
                      <LineIcon name="book" size="16px" color="var(--color-sage-ink)" />
                    </view>
                    <text class="action-name num-tabular">待学习 · {{ statesLoaded ? summary.pendingLearningCount : '—' }} 个</text>
                  </view>
                  <view class="action-cta is-learn">
                    <text>进入学习</text>
                    <LineIcon name="chevron-right" size="12px" color="#FFFFFF" />
                  </view>
                </view>
                <text class="action-hint num-tabular">{{ learnPanelHint }}</text>
              </view>

              <view
                class="action-panel is-review"
                :class="{ 'is-disabled': !canStartReview }"
                role="button"
                aria-label="进入复习"
                @click="canStartReview && enterRound('review')"
              >
                <view class="action-panel-head">
                  <view class="action-title-group">
                    <view class="action-icon-wrap is-review">
                      <LineIcon name="rotate" size="16px" color="var(--color-warning-ink)" />
                    </view>
                    <text class="action-name num-tabular">待复习 · {{ statesLoaded ? summary.dueReviewCount : '—' }} 个</text>
                  </view>
                  <view class="action-cta is-review">
                    <text>进入复习</text>
                    <LineIcon name="chevron-right" size="12px" color="#FFFFFF" />
                  </view>
                </view>
                <text class="action-hint num-tabular">{{ reviewPanelHint }}</text>
              </view>
            </view>
          </view>
        </view>
      </template>

      <!-- 2. 轮次学习 / 复习态 -->
      <view v-else class="round-stage">
        <view class="round-nav">
          <view class="round-nav-left">
            <button class="nav-back-btn" :disabled="submitting" @click="exitRound">
              <LineIcon name="chevron-left" size="14px" color="var(--text-primary)" />
              <text>返回</text>
            </button>
            <text v-if="progressTotal > 0" class="round-progress-pill num-tabular">
              {{ currentMode === 'FUZZY' ? `巩固 ${progressCurrent} / ${progressTotal}` : `本组 ${progressCurrent} / ${progressTotal}` }}
            </text>
            <text v-if="currentMode === 'FUZZY'" class="round-tag">本轮巩固</text>
            <text v-if="isMasteredCard" class="round-tag">已掌握抽查</text>
          </view>

          <button class="nav-end-btn" :disabled="submitting" @click="exitRound">结束本轮</button>
        </view>

        <view v-if="roundNeedsRestart" class="pane-notice is-error" role="alert">
          <text class="notice-text">{{ actionError || '知识块版本已变化，请返回规划后重新开始。' }}</text>
          <view class="notice-actions">
            <button class="ui-btn ui-btn-secondary sm" @click="discardPendingAndReload">刷新本轮</button>
            <button class="ui-btn ui-btn-ghost sm" @click="exitRound">返回规划</button>
          </view>
        </view>

        <view v-else-if="hasPendingCommand && actionError" class="pane-notice is-error" role="alert">
          <text class="notice-text">{{ actionError }}</text>
          <view class="notice-actions">
            <button v-if="!pendingIsConflict" class="ui-btn ui-btn-primary sm" :disabled="submitting" @click="retryPending">
              {{ submitting ? '确认中…' : '原样重试' }}
            </button>
            <button class="ui-btn ui-btn-secondary sm" :disabled="submitting" @click="discardPendingAndReload">刷新状态</button>
          </view>
        </view>

        <view v-else-if="actionError && activeBlock" class="pane-notice is-error" role="alert">
          <text class="notice-text">{{ actionError }}</text>
          <button class="ui-btn ui-btn-ghost sm" @click="actionError = ''">关闭</button>
        </view>

        <view v-if="activeBlock && !roundNeedsRestart" class="study-card zen-card">
          <view class="study-card-head">
            <view class="study-head-left">
              <text class="mode-badge" :class="`tone-${modeBadgeTone}`">{{ modeBadgeLabel }}</text>
              <text class="study-title">{{ activeBlock.title || '未命名知识块' }}</text>
            </view>
            <text class="study-pos num-tabular">{{ cardPositionText }}</text>
          </view>

          <view v-if="isRecallHidden" class="recall-zone">
            <view class="frosted-canvas">
              <text class="frosted-blurred-text" aria-hidden="true">{{ blurredPreview }}</text>
              <view class="frosted-veil" aria-hidden="true"></view>
              <view class="recall-overlay">
                <view class="recall-halo">
                  <LineIcon
                    :name="phase === 'LEARNING_RECALL' ? 'eye-off' : 'book'"
                    size="20px"
                    color="var(--color-sage-ink)"
                  />
                </view>
                <text class="recall-title">{{ recallPromptTitle }}</text>
                <text class="recall-desc">{{ recallPromptSubtitle }}</text>
              </view>
            </view>

            <view v-if="isMasteredCard && phase === 'REVIEW_RECALL' && !hasPendingCommand" class="reopen-row">
              <button class="reopen-btn" :disabled="submitting" @click="reopenMasteredBlock">
                <LineIcon name="rotate" size="12px" color="var(--text-muted)" />
                <text>重新学习这块</text>
              </button>
            </view>
          </view>

          <view v-else-if="isContentVisible" class="content-zone">
            <view v-if="phase === 'REVIEW_CHECK'" class="check-guide-bar">
              <text class="check-guide-tag">核对中</text>
              <text class="check-guide-text">请对照正文检查回忆，无误点「下一个」，记错点「记错了」</text>
            </view>

            <scroll-view scroll-y :show-scrollbar="false" class="content-scroll">
              <view class="content-paper">
                <MarkdownText :content="activeBlock.content || '该知识块暂无正文内容'" />
              </view>
            </scroll-view>
          </view>

          <view v-if="!hasPendingCommand" class="study-actions">
            <button
              v-if="phase === 'LEARNING_READ'"
              class="ui-btn ui-btn-primary study-btn-wide"
              :disabled="submitting"
              @click="beginLearningRecall"
            >
              <text>去回忆</text>
              <LineIcon name="chevron-right" size="14px" color="#FFFFFF" />
            </button>

            <button
              v-else-if="phase === 'LEARNING_RECALL'"
              class="ui-btn ui-btn-primary study-btn-wide"
              :disabled="submitting"
              @click="revealAnswer"
            >
              <LineIcon name="eye" size="14px" color="#FFFFFF" />
              <text>查看答案</text>
            </button>

            <view v-else-if="phase === 'LEARNING_CHECK'" class="study-actions-row">
              <button class="ui-btn ui-btn-secondary study-btn" :disabled="submitting" @click="failLearning">没记住，再看一次</button>
              <button class="ui-btn ui-btn-primary study-btn" :disabled="submitting" @click="completeLearning">
                <LineIcon name="check" size="14px" color="#FFFFFF" />
                <text>{{ submitting ? '提交中…' : '记住了' }}</text>
              </button>
            </view>

            <view v-else-if="phase === 'REVIEW_RECALL'" class="study-actions-row">
              <button class="rate-pill is-again" :disabled="submitting" @click="selectRating('AGAIN')">
                <view class="rate-dot is-again"></view>
                <text>忘记</text>
              </button>
              <button class="rate-pill is-hard" :disabled="submitting" @click="selectRating('HARD')">
                <view class="rate-dot is-hard"></view>
                <text>模糊</text>
              </button>
              <button class="rate-pill is-good" :disabled="submitting" @click="selectRating('GOOD')">
                <view class="rate-dot is-good"></view>
                <text>{{ submitting ? '保存中…' : '认识' }}</text>
              </button>
            </view>

            <view v-else-if="phase === 'FUZZY_RECALL'" class="study-actions-row">
              <button class="rate-pill is-again" :disabled="submitting" @click="correctReview">
                <view class="rate-dot is-again"></view>
                <text>{{ submitting ? '处理中…' : '没想起来' }}</text>
              </button>
              <button class="ui-btn ui-btn-primary study-btn" :disabled="submitting" @click="revealAnswer">
                <LineIcon name="eye" size="14px" color="#FFFFFF" />
                <text>想起来了</text>
              </button>
            </view>

            <view v-else-if="phase === 'REVIEW_CHECK' || phase === 'FUZZY_CHECK'" class="study-actions-row">
              <button class="rate-pill is-again" :disabled="submitting" @click="correctReview">
                <view class="rate-dot is-again"></view>
                <text>{{ submitting ? '处理中…' : '记错了' }}</text>
              </button>
              <button class="ui-btn ui-btn-primary study-btn" :disabled="submitting" @click="confirmReview">
                <text>{{ submitting ? '确认中…' : phase === 'FUZZY_CHECK' ? '通过巩固' : '下一个' }}</text>
                <LineIcon name="chevron-right" size="14px" color="#FFFFFF" />
              </button>
            </view>
          </view>
        </view>

        <view v-else-if="!roundNeedsRestart" class="milestone-card zen-card">
          <view class="milestone-halo">
            <LineIcon
              :name="loading ? 'refresh' : (loadError || hasPendingCommand) ? 'alert' : 'check'"
              size="24px"
              color="var(--color-sage-ink)"
            />
          </view>
          <text class="milestone-title">{{ milestoneTitle }}</text>
          <text v-if="milestoneSubtitle" class="milestone-subtitle">{{ milestoneSubtitle }}</text>

          <text
            v-if="phase === 'ROUND_COMPLETE' && roundMode !== 'learn' && totalFeedbackCount > 0"
            class="feedback-summary num-tabular"
          >
            首次评估：认识 {{ firstFeedbackCounts.GOOD }} · 模糊 {{ firstFeedbackCounts.HARD }} · 忘记 {{ firstFeedbackCounts.AGAIN }}
          </text>

          <view v-if="!loading" class="milestone-actions">
            <button v-if="phase === 'GROUP_COMPLETE'" class="ui-btn ui-btn-primary" @click="continueNextGroup">
              <text>继续下一组（{{ nextGroupCount }} 个）</text>
              <LineIcon name="chevron-right" size="14px" color="#FFFFFF" />
            </button>

            <button v-if="loadError" class="ui-btn ui-btn-primary" @click="reloadCurrentRound">
              <LineIcon name="refresh" size="14px" color="#FFFFFF" />
              <text>重试</text>
            </button>

            <button
              v-if="phase === 'ROUND_COMPLETE' && selfTestCount > 0"
              class="ui-btn ui-btn-secondary"
              @click="startSelfTestRound(groupSize)"
            >
              <text>再来一组自测</text>
            </button>

            <button
              class="ui-btn"
              :class="phase === 'ROUND_COMPLETE' ? 'ui-btn-primary' : 'ui-btn-secondary'"
              @click="exitRound"
            >
              <text>返回规划</text>
            </button>
          </view>
        </view>
      </view>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { ApiProblemError } from '@/api/protocol'
import { reviewApi, type ReviewState } from '@/api/reviewApi'
import { useMobileLifecycleReview } from '@/composables/useMobileLifecycleReview'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
import type { KnowledgeBlock } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { plainMarkdownExcerpt } from '@/utils/markdown'
import {
  summarizeSubjectReview,
  type MobileGroupSize,
  type MobileStudyMode,
} from '@/utils/mobileLearning'

const props = defineProps<{
  subjectId: string
  subjectName: string
  subjectBlocks: KnowledgeBlock[]
}>()

const EMPTY_DUE_IDS = new Set<string>()

const authStore = useAuthStore()
const subjectStore = useSubjectStore()

const inRound = ref(false)
const groupSize = ref<MobileGroupSize>(5)
const states = ref<ReviewState[]>([])
const statesLoaded = ref(false)
const statesLoading = ref(false)
const statesError = ref('')
let planningReqId = 0

const lifecycle = useMobileLifecycleReview(reviewApi)
const {
  roundMode,
  phase,
  currentMode,
  loading,
  submitting,
  loadError,
  actionError,
  roundNeedsRestart,
  unsyncedBlockCount,
  activeBlock,
  currentState,
  remainingIds,
  pendingIsConflict,
  selfTestCount,
  hasPendingCommand,
  isRecallHidden,
  isContentVisible,
  isMasteredCard,
  progressCurrent,
  progressTotal,
  completedCount,
  firstFeedbackCounts,
  startRound,
  continueNextGroup,
  startSelfTestRound,
  reloadCurrentRound,
  beginLearningRecall,
  revealAnswer,
  failLearning,
  completeLearning,
  selectRating,
  confirmReview,
  correctReview,
  reopenMasteredBlock,
  retryPending,
  discardPendingAndReload,
} = lifecycle

const summary = computed(() => summarizeSubjectReview(props.subjectBlocks, states.value, EMPTY_DUE_IDS))

const ringRadius = 42
const ringCircumference = 2 * Math.PI * ringRadius
const ringDashOffset = computed(() => (
  ringCircumference * (1 - summary.value.masteryPercent / 100)
))
const ringConicBackground = computed(() => {
  const deg = Math.round((summary.value.masteryPercent / 100) * 3600) / 10
  return `conic-gradient(var(--color-zen-sage) ${deg}deg, rgba(139, 154, 110, 0.14) ${deg}deg)`
})

const canStartLearning = computed(() => (
  statesLoaded.value && !statesLoading.value && !loading.value && summary.value.pendingLearningCount > 0
))

const canStartReview = computed(() => (
  statesLoaded.value
  && !statesLoading.value
  && !loading.value
  && (summary.value.dueReviewCount > 0 || summary.value.pendingCheckCount > 0)
))

const canStartSelfTest = computed(() => (
  statesLoaded.value && !statesLoading.value && !loading.value && summary.value.selfTestCount > 0
))

const learnPanelHint = computed(() => {
  if (!statesLoaded.value) return statesLoading.value ? '状态加载中…' : '等待状态同步'
  if (summary.value.unsyncedLearningCount > 0) {
    return `包含新知导入及错题重学（${summary.value.unsyncedLearningCount} 个待同步）`
  }
  if (summary.value.pendingLearningCount > 0) return '包含新知导入及错题重学'
  return '暂无待学习内容'
})

const reviewPanelHint = computed(() => {
  if (!statesLoaded.value) return statesLoading.value ? '状态加载中…' : '等待状态同步'
  const unfinished = summary.value.pendingLearningCount + summary.value.reviewingCount
  if (summary.value.pendingCheckCount > 0) {
    return `待核对 ${summary.value.pendingCheckCount} · 未掌握 ${unfinished}`
  }
  if (summary.value.dueReviewCount > 0) {
    return `今日到期 ${summary.value.dueReviewCount} · 未掌握 ${unfinished}`
  }
  if (summary.value.selfTestCount > 0) {
    return `今日无到期知识块 · 可点击上方“自测复习”随机抽查（共 ${summary.value.selfTestCount} 个）`
  }
  return '暂无复习内容'
})

async function loadPlanningStates() {
  const targetSubjectId = props.subjectId
  if (!targetSubjectId || !authStore.isAuthenticated) {
    states.value = []
    statesLoaded.value = false
    statesError.value = ''
    return
  }
  const reqId = ++planningReqId
  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const targetSubject = subjectStore.subjects.find(item => item.id === targetSubjectId)

  const isCurrent = () => (
    reqId === planningReqId
    && props.subjectId === targetSubjectId
    && authStore.isAuthenticated
    && generation === authStore.getLoginGeneration()
    && userId === authStore.user?.id
    && serverDeviceId === authStore.serverDeviceId
  )

  statesLoading.value = true
  statesError.value = ''
  try {
    try {
      const [cached, loadedMarker] = await Promise.all([
        localDb.getReviewStatesBySubject(targetSubjectId),
        localDb.hasLoadedReviewStates(targetSubjectId),
      ])
      if (!isCurrent()) return
      if (cached.length > 0 || loadedMarker) {
        states.value = cached
        statesLoaded.value = true
      }
    } catch {
      // Ignore local review-state cache read error and proceed to network fetch.
    }

    const collected: ReviewState[] = []
    let cursor: string | undefined
    do {
      const page = await reviewApi.states(targetSubjectId, cursor)
      if (!isCurrent()) return
      for (const item of page.items ?? []) {
        if (item.knowledgeBlockId) collected.push(item)
      }
      if (page.hasMore && !page.nextCursor) {
        throw new Error('复习状态分页游标缺失')
      }
      cursor = page.hasMore ? page.nextCursor : undefined
    } while (cursor)
    if (!isCurrent()) return
    states.value = collected
    statesLoaded.value = true
    void localDb.replaceSubjectReviewStates(targetSubjectId, collected).catch(() => {})
  } catch (error) {
    if (!isCurrent()) return
    const isPendingLocalSubject = (targetSubject?.version ?? 0) === 0
      && error instanceof ApiProblemError
      && (error.status === 404 || error.code === 'RESOURCE_NOT_FOUND')
    if (isPendingLocalSubject) {
      states.value = []
      statesLoaded.value = true
      statesError.value = ''
      return
    }
    const msg = error instanceof Error && error.message ? error.message : '复习状态读取失败'
    statesError.value = statesLoaded.value ? `刷新失败，当前展示本地缓存状态：${msg}` : msg
  } finally {
    if (isCurrent()) statesLoading.value = false
  }
}

watch(
  [
    () => props.subjectId,
    () => authStore.user?.id,
    () => authStore.serverDeviceId,
    () => authStore.sessionId,
  ],
  () => {
    planningReqId++
    inRound.value = false
    states.value = []
    statesLoaded.value = false
    statesError.value = ''
    void loadPlanningStates()
  },
  { immediate: true },
)

function enterRound(mode: MobileStudyMode) {
  if (!props.subjectId) return
  inRound.value = true
  void startRound(mode, groupSize.value, props.subjectId)
}

function exitRound() {
  if (submitting.value) return
  inRound.value = false
  void loadPlanningStates()
}

const cardPositionText = computed(() => {
  const total = progressTotal.value
  if (!total) return ''
  const prefix = currentMode.value === 'FUZZY' ? '巩固' : '本组'
  return `${prefix} ${progressCurrent.value} / ${total}`
})

const modeBadgeLabel = computed(() => {
  if (phase.value.startsWith('LEARNING')) {
    return currentState.value ? '错题重学' : '新知学习'
  }
  if (currentMode.value === 'FUZZY') return '巩固抽查'
  if (isMasteredCard.value) return '掌握抽查'
  if (roundMode.value === 'self-test') return '自测复习'
  return '复习自测'
})

const modeBadgeTone = computed<'warning' | 'sage'>(() => {
  if (phase.value.startsWith('LEARNING') || currentMode.value === 'FUZZY') return 'warning'
  return 'sage'
})

const blurredPreview = computed(() => (
  plainMarkdownExcerpt(activeBlock.value?.content || '') || '该知识块核心要点与定义内容'
))

const recallPromptTitle = computed(() => {
  if (phase.value === 'LEARNING_RECALL') return '合上正文，主动回忆'
  if (phase.value === 'FUZZY_RECALL') return '再回想刚才标为「模糊」的要点'
  return '在脑海中回忆该知识块要点'
})

const recallPromptSubtitle = computed(() => {
  if (phase.value === 'LEARNING_RECALL') return '回忆核心定义与关键结论，再展开核对正文'
  if (phase.value === 'FUZZY_RECALL') return '巩固记忆提取后点击下方「想起来了」核对确认'
  return '请依据提取的清晰度客观评估：认识 / 模糊 / 忘记'
})

const totalFeedbackCount = computed(() => (
  firstFeedbackCounts.value.GOOD + firstFeedbackCounts.value.HARD + firstFeedbackCounts.value.AGAIN
))

const nextGroupCount = computed(() => Math.min(groupSize.value, remainingIds.value.length))

const milestoneTitle = computed(() => {
  if (loading.value) return '正在准备学习队列…'
  if (hasPendingCommand.value) return '存在待确认的学习操作'
  if (loadError.value) return loadError.value
  if (phase.value === 'GROUP_COMPLETE') {
    return roundMode.value === 'learn' ? '本组内容已学完' : '本组复习已完成'
  }
  if (phase.value === 'ROUND_COMPLETE') {
    if (roundMode.value === 'learn') return '本次学习已完成'
    if (roundMode.value === 'self-test') return '本轮自测已完成'
    return '本轮复习已完成'
  }
  if (roundMode.value === 'learn') {
    return unsyncedBlockCount.value > 0 ? '暂无已同步待学习内容' : '暂无待学习知识块'
  }
  if (roundMode.value === 'self-test') return '暂无可自测知识点'
  return '今日待复习已清空'
})

const milestoneSubtitle = computed(() => {
  if (loading.value || loadError.value) return ''
  if (hasPendingCommand.value) {
    return '请点击上方「原样重试」确认上次提交，或点击「刷新状态」同步最新进度'
  }
  if (phase.value === 'GROUP_COMPLETE') {
    return `本轮还剩 ${remainingIds.value.length} 个知识点待${roundMode.value === 'learn' ? '学习' : '复习'}`
  }
  if (phase.value === 'ROUND_COMPLETE') {
    const verb = roundMode.value === 'learn' ? '学习' : roundMode.value === 'self-test' ? '自测' : '复习'
    return `本次共完成 ${completedCount.value} 个知识点的${verb}`
  }
  if (roundMode.value === 'learn' && unsyncedBlockCount.value > 0) {
    return `检测到 ${unsyncedBlockCount.value} 个离线新建知识块，联网同步后即可进入学习`
  }
  return ''
})
</script>

<style scoped>
.review-pane-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
  width: 100%;
}

.review-pane-scroll :deep(.uni-scroll-view-content) {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.review-pane {
  width: 100%;
  max-width: 1040px;
  min-height: 100%;
  margin: 0 auto;
  padding: 28px 36px 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  box-sizing: border-box;
}

.pane-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-tertiary);
}

.pane-notice.is-error {
  background: var(--color-danger-bg);
  border-color: rgba(201, 59, 59, 0.24);
  color: var(--color-danger);
}

.notice-text {
  flex: 1;
  font-size: var(--text-xs);
  line-height: 1.5;
}

.notice-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pane-notice .ui-btn,
.milestone-actions .ui-btn,
.voluntary-btn,
.nav-back-btn,
.nav-end-btn,
.reopen-btn,
.rate-pill,
.study-btn-wide,
.study-btn {
  margin: 0;
  line-height: 1;
}

.pane-notice .ui-btn::after,
.milestone-actions .ui-btn::after,
.voluntary-btn::after,
.nav-back-btn::after,
.nav-end-btn::after,
.reopen-btn::after,
.rate-pill::after,
.study-btn-wide::after,
.study-btn::after {
  border: none;
}

.plan-card {
  min-height: clamp(440px, 56vh, 580px);
  padding: 40px 48px;
  border-radius: 26px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 28px;
}

.plan-skeleton-hero {
  height: 170px;
  border-radius: 14px;
}

.plan-skeleton-row {
  height: 156px;
  border-radius: 14px;
}

.plan-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 48px;
}

.plan-meta {
  flex: 1;
  min-width: 0;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-badge {
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}

.plan-title {
  font-size: 34px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  line-height: 1.2;
  margin-top: 2px;
}

.plan-subtitle {
  font-size: 15px;
  color: var(--text-muted);
}

.segment-wrap {
  margin-top: 22px;
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.segment-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.segment-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
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

.progress-track {
  height: 8px;
  width: 100%;
  border-radius: var(--radius-full);
  background: rgba(45, 55, 40, 0.08);
  overflow: hidden;
  display: flex;
}

.progress-fill {
  height: 100%;
  transition: width 0.24s var(--ease-out);
}

.progress-fill.is-learning {
  background: #C89B6D;
}

.progress-fill.is-reviewing {
  background: var(--color-zen-sage);
}

.progress-fill.is-mastered {
  background: var(--color-sage-ink);
}

.mastery-ring-box {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mastery-ring {
  position: relative;
  width: 172px;
  height: 172px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track {
  stroke: rgba(139, 154, 110, 0.16);
  stroke-width: 6;
}

.ring-progress {
  stroke: var(--color-zen-sage);
  stroke-width: 6.4;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.35s var(--ease-out);
}

.ring-conic-track {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  -webkit-mask: radial-gradient(circle, transparent 64px, #000 65px);
  mask: radial-gradient(circle, transparent 64px, #000 65px);
}

.ring-inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.ring-percent {
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
}

.ring-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 11px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
}

.ring-pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-zen-sage);
}

.ring-pill-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-sage-ink);
}

.panels-container {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
}

.panels-toolbar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.group-size-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 3px 4px 3px 11px;
  border-radius: 10px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--border-subtle);
}

.group-size-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-right: 2px;
}

.group-size-btn {
  padding: 3px 10px;
  border-radius: 7px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
}

.group-size-btn.active {
  background: var(--color-sage-bg);
  border-color: var(--border-accent);
  color: var(--color-sage-ink);
}

.voluntary-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 13px;
  border-radius: 10px;
  border: 1px solid var(--border-accent);
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.voluntary-btn.is-disabled {
  opacity: 0.45;
  border-color: var(--border-subtle);
  background: var(--glass-sub-bg);
  color: var(--text-muted);
  cursor: not-allowed;
}

.panels-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.action-panel {
  padding: 22px 24px;
  min-height: 112px;
  border-radius: 16px;
  background: var(--color-bg-tertiary);
  border: 1.5px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s var(--ease-out);
}

.action-panel:hover:not(.is-disabled) {
  border-color: var(--border-accent);
  transform: translateY(-1px);
}

.action-panel.is-disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.action-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.action-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.action-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.action-icon-wrap.is-learn {
  background: var(--color-sage-bg);
}

.action-icon-wrap.is-review {
  background: var(--color-warning-bg);
}

.action-name {
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text-primary);
}

.action-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 13px;
  height: 29px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: #FFFFFF;
  flex-shrink: 0;
}

.action-cta.is-learn {
  background: var(--accent-gradient);
}

.action-cta.is-review {
  background: linear-gradient(135deg, #C89B6D 0%, #B08254 100%);
}

.action-hint {
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.45;
}

.round-stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.round-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.round-nav-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.nav-back-btn,
.nav-end-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--color-bg-tertiary);
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}

.nav-end-btn {
  color: var(--text-secondary);
}

.round-progress-pill {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: var(--text-xs);
  font-weight: 600;
}

.round-tag {
  padding: 3px 9px;
  border-radius: var(--radius-full);
  background: var(--color-warning-bg);
  color: var(--color-warning-ink);
  font-size: 11px;
  font-weight: 600;
}

.study-card {
  padding: 36px 44px 32px;
  border-radius: 26px;
  min-height: clamp(460px, 58vh, 620px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 22px;
}

.study-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.study-head-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-badge {
  align-self: flex-start;
  padding: 2px 9px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
}

.mode-badge.tone-sage {
  background: var(--color-sage-bg);
  color: var(--color-sage-ink);
}

.mode-badge.tone-warning {
  background: var(--color-warning-bg);
  color: var(--color-warning-ink);
}

.study-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.35;
}

.study-pos {
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.recall-zone {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 10px;
}

.frosted-canvas {
  position: relative;
  min-height: 260px;
  flex: 1;
  padding: 22px;
  border-radius: 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.frosted-blurred-text {
  font-size: var(--text-sm);
  line-height: 1.75;
  color: var(--text-secondary);
  filter: blur(8px);
  opacity: 0.45;
  user-select: none;
  pointer-events: none;
}

.frosted-veil {
  position: absolute;
  inset: 0;
  background: rgba(247, 242, 235, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.recall-overlay {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  max-width: 420px;
}

.recall-halo {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.recall-title {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-primary);
}

.recall-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.reopen-row {
  display: flex;
  justify-content: flex-end;
}

.reopen-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  background: var(--glass-sub-bg);
  border: 1px solid var(--border-subtle);
  font-size: var(--text-xs);
  color: var(--text-muted);
  cursor: pointer;
}

.content-zone {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.check-guide-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--color-sage-bg);
}

.check-guide-tag {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--color-zen-sage);
  color: #FFFFFF;
  font-size: 10.5px;
  font-weight: 600;
  flex-shrink: 0;
}

.check-guide-text {
  font-size: var(--text-xs);
  color: var(--color-sage-ink);
}

.content-scroll {
  max-height: 360px;
}

.content-paper {
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
}

.study-actions {
  padding-top: 4px;
  display: flex;
}

.study-btn-wide {
  width: 100%;
  height: 44px;
}

.study-actions-row {
  width: 100%;
  display: flex;
  gap: 10px;
}

.study-btn {
  flex: 1;
  height: 44px;
}

.rate-pill {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  background: var(--color-bg-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.rate-pill:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rate-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.rate-dot.is-again {
  background: var(--color-danger);
}

.rate-dot.is-hard {
  background: var(--color-warning);
}

.rate-dot.is-good {
  background: var(--color-zen-sage);
}

.milestone-card {
  min-height: 360px;
  padding: 44px 32px;
  border-radius: 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}

.milestone-halo {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.milestone-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.milestone-subtitle,
.feedback-summary {
  font-size: var(--text-sm);
  color: var(--text-muted);
  max-width: 440px;
  line-height: 1.5;
}

.milestone-actions {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .review-pane {
    padding: 20px 22px 84px;
  }

  .plan-card {
    padding: 28px 28px;
    min-height: 0;
  }

  .plan-top {
    gap: 28px;
  }

  .plan-title {
    font-size: 28px;
  }

  .mastery-ring {
    width: 144px;
    height: 144px;
  }

  .ring-conic-track {
    -webkit-mask: radial-gradient(circle, transparent 53px, #000 54px);
    mask: radial-gradient(circle, transparent 53px, #000 54px);
  }

  .ring-percent {
    font-size: 30px;
  }

  .study-card {
    padding: 24px 24px;
    min-height: 0;
  }
}

@media (max-width: 720px) {
  .review-pane {
    padding: 16px 16px 84px;
    justify-content: flex-start;
  }

  .plan-top {
    flex-direction: column;
    align-items: flex-start;
  }

  .panels-grid {
    grid-template-columns: 1fr;
  }
}
</style>
