<template>
  <scroll-view scroll-y :show-scrollbar="false" class="review-pane-scroll">
    <view class="review-pane">
      <!-- 1. 规划总览态 -->
      <template v-if="!inRound">
        <view class="review-header">
          <text class="review-header-title">学科复习</text>
          <text class="review-header-desc">通过回忆、核对和必要时的重新学习，逐步巩固本学科知识。</text>
        </view>

        <view v-if="statesError" class="pane-notice is-error" role="alert">
          <text class="notice-text">{{ statesError }}</text>
          <button
            class="ui-btn ui-btn-secondary sm"
            :disabled="statesLoading"
            @click="loadPlanningStates"
          >重试</button>
        </view>

        <view class="dashboard-wrap">
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
                        <LineIcon name="book" size="18px" color="var(--text-muted)" />
                      </view>
                      <view class="action-name-row">
                        <text class="action-name">待学习</text>
                        <text class="action-count num-tabular">· {{ statesLoaded ? summary.pendingLearningCount : '—' }} 个</text>
                      </view>
                    </view>
                    <view class="action-cta">
                      <text>进入学习</text>
                      <LineIcon name="chevron-right" size="11px" color="var(--text-primary)" />
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
                        <LineIcon name="rotate" size="18px" color="#728258" />
                      </view>
                      <view class="action-name-row">
                        <text class="action-name">待复习</text>
                        <text class="action-count num-tabular">· {{ statesLoaded ? summary.dueReviewCount : '—' }} 个</text>
                      </view>
                    </view>
                    <view class="action-cta">
                      <text>进入复习</text>
                      <LineIcon name="chevron-right" size="11px" color="var(--text-primary)" />
                    </view>
                  </view>
                  <text class="action-hint num-tabular">{{ reviewPanelHint }}</text>
                </view>
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
              <LineIcon name="chevron-left" size="14px" color="var(--text-secondary)" />
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
              <text class="mode-badge">{{ modeBadgeLabel }}</text>
              <text class="study-title">{{ activeBlock.title || '未命名知识块' }}</text>
            </view>
            <text class="study-pos num-tabular">{{ cardPositionText }}</text>
          </view>

          <view v-if="isRecallHidden" class="recall-zone">
            <view class="frosted-canvas">
              <text class="frosted-blurred-text" aria-hidden="true">{{ blurredPreview }}</text>
              <view class="frosted-veil" aria-hidden="true"></view>
            </view>

            <view v-if="phase === 'REVIEW_RECALL'" class="recall-hint">
              <view class="recall-hint-dot"></view>
              <text class="recall-hint-text">请在脑海中主动回忆该知识块的核心概念与要点，并依据提取的清晰度与完整性进行客观评估：</text>
            </view>
          </view>

          <view v-else-if="isContentVisible" class="content-zone">
            <scroll-view scroll-y :show-scrollbar="false" class="content-scroll">
              <view class="content-body">
                <MarkdownText :content="activeBlock.content || '该知识块暂无正文内容'" />
              </view>
            </scroll-view>
          </view>

          <view v-if="phase === 'REVIEW_CHECK'" class="check-guide-bar">
            <text class="check-guide-tag">核对中</text>
            <text class="check-guide-text">请对照正文核对你的回忆：确认无误点击「下一个」，若回忆有误请点击「记错了」</text>
          </view>

          <view v-if="!hasPendingCommand" class="study-actions">
            <view v-if="phase === 'LEARNING_READ'" class="ratings-row">
              <button
                class="reveal-btn"
                :disabled="submitting"
                @click="beginLearningRecall"
              >
                <text>开始回忆</text>
                <LineIcon name="chevron-right" size="14px" color="var(--text-primary)" />
              </button>
            </view>

            <view v-else-if="phase === 'LEARNING_RECALL'" class="ratings-row">
              <button
                class="reveal-btn"
                :disabled="submitting"
                @click="revealAnswer"
              >
                <text>展开核对</text>
                <LineIcon name="chevron-right" size="14px" color="var(--text-primary)" />
              </button>
            </view>

            <view v-else-if="phase === 'LEARNING_CHECK'" class="ratings-row">
              <button class="rate-btn is-good" :disabled="submitting" @click="completeLearning">
                <view class="rate-dot is-good"></view>
                <text>完成学习</text>
              </button>
              <button class="rate-btn is-again" :disabled="submitting" @click="failLearning">
                <view class="rate-dot is-again"></view>
                <text>继续学习</text>
              </button>
            </view>

            <view v-else-if="phase === 'REVIEW_RECALL'" class="ratings-row is-tiled">
              <button class="rate-btn is-good" :disabled="submitting" @click="selectRating('GOOD')">
                <view class="rate-dot is-good"></view>
                <text>认识</text>
              </button>
              <button class="rate-btn is-hard" :disabled="submitting" @click="selectRating('HARD')">
                <view class="rate-dot is-hard"></view>
                <text>模糊</text>
              </button>
              <button class="rate-btn is-again" :disabled="submitting" @click="selectRating('AGAIN')">
                <view class="rate-dot is-again"></view>
                <text>忘记了</text>
              </button>
            </view>

            <view v-else-if="phase === 'FUZZY_RECALL'" class="ratings-row">
              <button class="reveal-btn" :disabled="submitting" @click="revealAnswer">
                <LineIcon name="eye" size="15px" color="var(--text-primary)" />
                <text>展开核对</text>
              </button>
              <button class="rate-btn is-again" :disabled="submitting" @click="correctReview">
                <view class="rate-dot is-again"></view>
                <text>忘记了</text>
              </button>
            </view>

            <view v-else-if="phase === 'REVIEW_CHECK' || phase === 'FUZZY_CHECK'" class="ratings-row">
              <button class="rate-btn is-good" :disabled="submitting" @click="confirmReview">
                <view class="rate-dot is-good"></view>
                <text>下一个</text>
              </button>
              <button class="rate-btn is-again" :disabled="submitting" @click="correctReview">
                <view class="rate-dot is-again"></view>
                <text>记错了</text>
              </button>
            </view>
          </view>

          <view v-if="isMasteredCard && phase === 'REVIEW_RECALL' && !hasPendingCommand" class="reopen-row">
            <button class="reopen-btn" :disabled="submitting" @click="reopenMasteredBlock">
              <text>重新学习这块</text>
            </button>
          </view>
        </view>

        <view v-else-if="!roundNeedsRestart" class="milestone-card zen-card">
          <view class="milestone-halo">
            <LineIcon
              :name="loading ? 'refresh' : (loadError || hasPendingCommand) ? 'alert' : 'check'"
              size="28px"
              color="var(--color-zen-sage)"
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
            <button v-if="phase === 'GROUP_COMPLETE'" class="milestone-primary-btn" @click="continueNextGroup">
              <text>继续下一组（{{ nextGroupCount }} 个）</text>
              <LineIcon name="chevron-right" size="15px" color="#FFFFFF" />
            </button>

            <button v-if="loadError" class="milestone-primary-btn" @click="reloadCurrentRound">
              <LineIcon name="refresh" size="15px" color="#FFFFFF" />
              <text>重试</text>
            </button>

            <button
              v-if="phase === 'ROUND_COMPLETE' && selfTestCount > 0"
              class="milestone-primary-btn"
              @click="startSelfTestRound(groupSize)"
            >
              <text>再来一组自测</text>
              <LineIcon name="chevron-right" size="15px" color="#FFFFFF" />
            </button>

            <button class="nav-end-btn" @click="exitRound">
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
import { useSyncStore } from '@/store/useSyncStore'
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
const syncStore = useSyncStore()

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
    return `今日无到期知识块 · 可通过上方“自测复习”随机抽查自测（共 ${summary.value.selfTestCount} 个）`
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

watch(
  () => syncStore.lastSyncedAt,
  (syncedAt) => {
    if (syncedAt && authStore.isAuthenticated && props.subjectId && !inRound.value) {
      void loadPlanningStates()
    }
  },
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

const blurredPreview = computed(() => (
  plainMarkdownExcerpt(activeBlock.value?.content || '') || '该知识块核心要点与定义内容'
))

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
  max-width: 1240px;
  min-height: 100%;
  margin: 0 auto;
  padding: 24px 32px 48px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 20px;
  box-sizing: border-box;
}

.review-header {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.review-header-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  line-height: 1.25;
}

.review-header-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.45;
}

.dashboard-wrap {
  width: min(92%, 1120px);
  margin: 8px auto 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.pane-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-card, #FFFFFF);
  box-sizing: border-box;
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
.voluntary-btn,
.nav-back-btn,
.nav-end-btn,
.reopen-btn,
.rate-btn,
.reveal-btn,
.milestone-primary-btn {
  margin: 0;
  line-height: 1;
}

.pane-notice .ui-btn::after,
.voluntary-btn::after,
.nav-back-btn::after,
.nav-end-btn::after,
.reopen-btn::after,
.rate-btn::after,
.reveal-btn::after,
.milestone-primary-btn::after {
  border: none;
}

.plan-card {
  min-height: clamp(440px, 56vh, 580px);
  padding: 44px 52px;
  border-radius: 28px;
  background: var(--color-bg-card, #FFFFFF);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 32px -12px rgba(28, 28, 26, 0.06);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 28px;
  width: 100%;
  box-sizing: border-box;
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
  width: 100%;
}

.plan-meta {
  flex: 1;
  min-width: 0;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.plan-badge {
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: rgba(139, 154, 110, 0.12);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  margin-bottom: 2px;
}

.plan-title {
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.02em;
  line-height: 1.25;
}

.plan-subtitle {
  font-size: 15.5px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

.segment-wrap {
  margin-top: 20px;
  width: 100%;
  max-width: 540px;
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
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.segment-legend {
  display: flex;
  align-items: center;
  gap: 14px;
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
  flex-shrink: 0;
}

.legend-dot.is-learning {
  background: #88929E;
}

.legend-dot.is-reviewing {
  background: #C49A6C;
}

.legend-dot.is-mastered {
  background: var(--color-zen-sage, #8B9A6E);
}

.progress-track {
  height: 8px;
  width: 100%;
  border-radius: var(--radius-full);
  background: rgba(139, 154, 110, 0.08);
  border: 1px solid rgba(139, 154, 110, 0.2);
  overflow: hidden;
  display: flex;
  box-sizing: border-box;
}

.progress-fill {
  height: 100%;
  transition: width 0.35s var(--ease-out);
}

.progress-fill.is-learning {
  background: #88929E;
}

.progress-fill.is-reviewing {
  background: #C49A6C;
}

.progress-fill.is-mastered {
  background: var(--color-zen-sage, #8B9A6E);
}

.mastery-ring-box {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mastery-ring {
  position: relative;
  width: 188px;
  height: 188px;
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
  stroke-width: 5.6;
}

.ring-progress {
  stroke: var(--color-zen-sage, #8B9A6E);
  stroke-width: 6.4;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.35s var(--ease-out);
}

.ring-conic-track {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  -webkit-mask: radial-gradient(circle, transparent 70px, #000 71px);
  mask: radial-gradient(circle, transparent 70px, #000 71px);
}

.ring-inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.ring-percent {
  font-size: 40px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.01em;
}

.ring-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.ring-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-zen-sage, #8B9A6E);
}

.ring-pill-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 1.2;
}

.panels-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;
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
  gap: 3px;
  height: 28px;
  padding: 2px 4px 2px 10px;
  border-radius: 8px;
  background: #FFFFFF;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 3px 10px -2px rgba(0, 0, 0, 0.04);
  user-select: none;
  box-sizing: border-box;
}

.group-size-label {
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
  margin-right: 2px;
}

.group-size-btn {
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.group-size-btn.active {
  background: var(--color-bg-tertiary, #FAF7F2);
  border-color: var(--border-subtle);
  color: var(--text-primary);
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.voluntary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  background: #FFFFFF;
  border: 1px solid var(--border-subtle);
  color: #4A5E30;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 3px 10px -2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

/* #ifdef H5 */
.voluntary-btn:hover:not(:disabled) {
  background: rgba(139, 154, 110, 0.12);
  border-color: rgba(139, 154, 110, 0.35);
  color: #384A22;
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.18);
}
/* #endif */

.voluntary-btn.is-disabled,
.voluntary-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  box-shadow: none;
}

.panels-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.action-panel {
  padding: 22px 26px;
  min-height: 112px;
  border-radius: 16px;
  background: var(--color-bg-tertiary, #FAF7F2);
  border: 1.5px solid var(--border-subtle);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 4px 16px -3px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

/* #ifdef H5 */
.action-panel:hover:not(.is-disabled) {
  border-color: rgba(139, 154, 110, 0.5);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04), 0 10px 24px -4px rgba(0, 0, 0, 0.09), 0 3px 8px -1px rgba(139, 154, 110, 0.15);
  transform: translateY(-2px);
}
/* #endif */

.action-panel.is-disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.action-panel.is-disabled .action-cta {
  opacity: 0.45;
  box-shadow: none;
}

.action-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.action-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.action-icon-wrap.is-learn {
  background: rgba(0, 0, 0, 0.04);
}

.action-icon-wrap.is-review {
  background: rgba(139, 154, 110, 0.16);
}

.action-name-row {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.action-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.action-count {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-muted);
}

.action-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 29px;
  padding: 0 14px;
  border-radius: 9999px;
  background: #FFFFFF;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

/* #ifdef H5 */
.action-panel:not(.is-disabled):hover .action-cta {
  border-color: var(--border-default);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.06);
}
/* #endif */

.action-hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}

.round-stage {
  width: min(92%, 1120px);
  margin: 8px auto 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  box-sizing: border-box;
}

.round-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
}

.round-nav-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.nav-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 16px;
  border-radius: 9999px;
  background: var(--color-bg-card, #FFFFFF);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.16s ease;
}

.nav-end-btn,
.reopen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 16px;
  border-radius: 9999px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
}

/* #ifdef H5 */
.nav-back-btn:hover:not(:disabled) {
  background: var(--color-bg-secondary);
  border-color: var(--border-default);
  color: var(--text-primary);
}

.nav-end-btn:hover:not(:disabled),
.reopen-btn:hover:not(:disabled) {
  background: var(--color-bg-secondary);
  color: var(--text-primary);
}
/* #endif */

.round-progress-pill {
  padding: 7px 16px;
  border-radius: 9999px;
  background: var(--color-bg-card, #FFFFFF);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.round-tag {
  padding: 5px 12px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.16);
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 600;
}

.study-card {
  padding: 44px 52px 36px;
  border-radius: 28px;
  min-height: clamp(460px, 58vh, 640px);
  background: var(--color-bg-card, #FFFFFF);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 10px 36px -10px rgba(28, 28, 26, 0.06);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
  box-sizing: border-box;
}

.study-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.study-head-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-badge {
  align-self: flex-start;
  padding: 5px 14px;
  border-radius: 9999px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.study-title {
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.3;
  letter-spacing: 0.02em;
}

.study-pos {
  padding: 6px 16px;
  border-radius: 9999px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 14.5px;
  font-weight: 600;
  flex-shrink: 0;
}

.recall-zone {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 1;
  gap: 18px;
  padding-top: 6px;
  text-align: left;
  width: 100%;
}

.frosted-canvas {
  position: relative;
  width: 100%;
  min-height: 260px;
  max-height: 360px;
  flex: 1;
  padding: 24px 32px;
  border-radius: 20px;
  background: var(--color-bg-secondary);
  border: 1.5px solid var(--border-subtle);
  box-shadow: 0 10px 32px -6px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  user-select: none;
  box-sizing: border-box;
}

.frosted-blurred-text {
  display: block;
  font-size: 15px;
  line-height: 1.85;
  color: var(--text-secondary);
  filter: blur(7.5px);
  opacity: 0.5;
  user-select: none;
  pointer-events: none;
  text-align: left;
}

.frosted-veil {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: none;
}

.recall-hint {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 4px 2px;
  color: var(--text-muted);
  font-size: 13.5px;
  line-height: 1.6;
}

.recall-hint-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.5;
  flex-shrink: 0;
}

.recall-hint-text {
  font-size: 13.5px;
  color: var(--text-muted);
  line-height: 1.5;
}

.content-zone {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.content-scroll {
  max-height: 46vh;
}

.content-body {
  padding: 12px 6px;
}

.check-guide-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--color-bg-card, #FFFFFF);
  border: 1px solid rgba(139, 154, 110, 0.24);
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.04);
  width: 100%;
  box-sizing: border-box;
}

.check-guide-tag {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-zen-sage, #8B9A6E);
  background: rgba(139, 154, 110, 0.1);
  border: 1px solid rgba(139, 154, 110, 0.24);
  padding: 2.5px 9px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.check-guide-text {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
}

.study-actions {
  display: flex;
  width: 100%;
  padding-top: 4px;
}

.ratings-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  width: 100%;
}

.ratings-row.is-tiled {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.rate-btn,
.reveal-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 36px;
  border-radius: 9999px;
  background: #FFFFFF;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  color: var(--text-primary);
  font-size: 15.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
}

.ratings-row.is-tiled .rate-btn {
  width: 100%;
  height: 52px;
  padding: 0 16px;
  font-size: 16px;
}

/* #ifdef H5 */
.reveal-btn:hover:not(:disabled) {
  border-color: var(--border-default);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(0, 0, 0, 0.12), 0 3px 8px -1px rgba(0, 0, 0, 0.06);
}

.rate-btn.is-good:hover:not(:disabled) {
  border-color: rgba(139, 154, 110, 0.6);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(139, 154, 110, 0.22), 0 3px 8px -1px rgba(0, 0, 0, 0.06);
}

.rate-btn.is-hard:hover:not(:disabled) {
  border-color: rgba(230, 162, 60, 0.6);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(230, 162, 60, 0.22), 0 3px 8px -1px rgba(0, 0, 0, 0.06);
}

.rate-btn.is-again:hover:not(:disabled) {
  border-color: rgba(229, 115, 115, 0.6);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(229, 115, 115, 0.22), 0 3px 8px -1px rgba(0, 0, 0, 0.06);
}
/* #endif */

.rate-btn:active:not(:disabled),
.reveal-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.rate-btn:disabled,
.reveal-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.rate-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rate-dot.is-again {
  background: var(--color-danger, #E57373);
}

.rate-dot.is-hard {
  background: var(--color-warning, #E6A23C);
}

.rate-dot.is-good {
  background: var(--color-zen-sage, #8B9A6E);
}

.reopen-row {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.milestone-card {
  margin: auto;
  width: min(90%, 580px);
  max-width: 580px;
  padding: 52px 40px 46px;
  border-radius: 28px;
  background: var(--color-bg-card, #FFFFFF);
  border: 1px solid rgba(139, 154, 110, 0.35);
  box-shadow: 0 16px 48px -12px rgba(139, 154, 110, 0.22), 0 4px 16px -2px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 16px;
  box-sizing: border-box;
}

.milestone-halo {
  width: 64px;
  height: 64px;
  border-radius: 9999px;
  background: rgba(139, 154, 110, 0.12);
  border: 1.5px solid rgba(139, 154, 110, 0.4);
  box-shadow: 0 4px 16px -2px rgba(139, 154, 110, 0.24);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.milestone-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.35;
}

.milestone-subtitle,
.feedback-summary {
  font-size: 13.5px;
  color: var(--text-muted);
  max-width: 440px;
  line-height: 1.55;
}

.milestone-actions {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.milestone-primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 36px;
  border-radius: 9999px;
  background: var(--color-zen-sage, #8B9A6E);
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 4px 16px -2px rgba(139, 154, 110, 0.45), 0 2px 6px -1px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

/* #ifdef H5 */
.milestone-primary-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
}
/* #endif */

@media (max-width: 960px) {
  .review-pane {
    padding: 20px 22px 48px;
  }

  .dashboard-wrap,
  .round-stage {
    width: 100%;
  }

  .plan-card {
    padding: 30px 28px;
    min-height: 0;
  }

  .plan-top {
    gap: 28px;
  }

  .plan-title {
    font-size: 30px;
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
    padding: 28px 28px;
    min-height: 0;
  }

  .study-title {
    font-size: 28px;
  }
}

@media (max-width: 720px) {
  .review-pane {
    padding: 16px 16px 48px;
  }

  .plan-top {
    flex-direction: column;
    align-items: flex-start;
  }

  .panels-grid {
    grid-template-columns: 1fr;
  }

  .ratings-row.is-tiled {
    grid-template-columns: 1fr;
  }
}
</style>
