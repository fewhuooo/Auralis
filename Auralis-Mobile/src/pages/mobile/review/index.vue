<template>
  <AppPageLayout :show-tab-bar="false">
    <view class="review-page">
      <view class="status-bar-spacer"></view>

      <view class="review-toolbar">
        <view
          class="back-pill"
          role="button"
          aria-label="返回学习页"
          @click="handleBack"
        >
          <LineIcon name="chevron-left" size="15px" color="var(--color-sage-ink)" />
          <text class="back-label">学习</text>
        </view>

        <text class="toolbar-subject">{{ activeSubjectLabel }}</text>

        <view class="progress-indicator">
          <view class="progress-track">
            <view class="progress-fill" :style="{ width: `${progressPercent}%` }"></view>
          </view>
          <text class="summary-text num-tabular">{{ counterText }}</text>
        </view>
      </view>

      <view v-if="unsyncedBlockCount > 0 && roundMode === 'learn'" class="info-banner zen-card">
        <text class="info-banner-text">
          有 {{ unsyncedBlockCount }} 个离线新建知识块尚未同步，联网同步后即可进入学习。
        </text>
      </view>

      <view v-if="roundNeedsRestart" class="error-banner zen-card" role="alert">
        <text class="error-banner-text">{{ actionError || '知识块版本已在其他端更新，请刷新后重新开始本轮。' }}</text>
        <view class="banner-actions">
          <view class="ui-btn ui-btn-primary banner-btn" role="button" @click="handleReloadAfterConflict">
            <text>刷新本轮</text>
          </view>
          <view class="ui-btn ui-btn-secondary banner-btn" role="button" @click="handleBack">
            <text>返回</text>
          </view>
        </view>
      </view>

      <view v-else-if="hasPendingCommand && actionError" class="error-banner zen-card" role="alert">
        <text class="error-banner-text">{{ actionError }}</text>
        <view class="banner-actions">
          <view
            v-if="!pendingIsConflict"
            class="ui-btn ui-btn-primary banner-btn"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="retryPending"
          >
            <text>{{ submitting ? '确认中…' : '原样重试' }}</text>
          </view>
          <view
            class="ui-btn ui-btn-secondary banner-btn"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="discardPendingAndReload"
          >
            <text>刷新状态</text>
          </view>
        </view>
      </view>

      <view v-else-if="actionError && activeBlock" class="error-banner zen-card" role="alert">
        <text class="error-banner-text">{{ actionError }}</text>
        <view class="ui-btn ui-btn-secondary banner-btn" role="button" @click="actionError = ''">
          <text>关闭</text>
        </view>
      </view>

      <view class="study-stage">
        <view v-if="activeBlock && !roundNeedsRestart" class="study-card zen-card">
          <view class="card-head">
            <view class="card-head-left">
              <text class="mode-badge" :class="`tone-${modeBadgeTone}`">{{ modeBadgeLabel }}</text>
              <text v-if="currentMode === 'FUZZY'" class="fuzzy-tag">末尾巩固</text>
            </view>
            <text class="card-pos num-tabular">{{ cardPositionText }}</text>
          </view>

          <text class="card-title">{{ activeBlock.title || '未命名知识块' }}</text>

          <view v-if="isRecallHidden" class="recall-zone">
            <view class="frosted-canvas">
              <text class="frosted-blurred-text" aria-hidden="true">{{ blurredPreview }}</text>
              <view class="frosted-veil" aria-hidden="true"></view>
              <view class="recall-prompt-overlay">
                <view class="recall-halo">
                  <LineIcon
                    :name="phase === 'LEARNING_RECALL' ? 'eye-off' : 'book'"
                    size="20px"
                    color="var(--color-sage-ink)"
                  />
                </view>
                <text class="recall-prompt-title">{{ recallPromptTitle }}</text>
                <text class="recall-prompt-desc">{{ recallPromptSubtitle }}</text>
              </view>
            </view>

            <view
              v-if="isMasteredCard && phase === 'REVIEW_RECALL' && !hasPendingCommand"
              class="reopen-action-row"
            >
              <view
                class="reopen-pill"
                :class="{ 'is-disabled': submitting }"
                role="button"
                @click="reopenMasteredBlock"
              >
                <LineIcon name="rotate" size="12px" color="var(--text-muted)" />
                <text>重新学习这块</text>
              </view>
            </view>
          </view>

          <view v-else-if="isContentVisible" class="content-zone">
            <view v-if="phase === 'REVIEW_CHECK'" class="check-guide-bar">
              <text class="check-guide-tag">核对中</text>
              <text class="check-guide-text">请对照正文检查回忆，无误点「下一个」，记错点「记错了」</text>
            </view>

            <scroll-view scroll-y :show-scrollbar="false" class="content-scroll">
              <view class="content-inner">
                <MarkdownText :content="activeBlock.content || '该知识块暂无正文内容'" />
              </view>
            </scroll-view>
          </view>
        </view>

        <view v-else-if="!roundNeedsRestart" class="milestone-card zen-card">
          <view class="empty-halo">
            <LineIcon
              :name="loading ? 'refresh' : (loadError || hasPendingCommand) ? 'alert' : 'check'"
              size="24px"
              color="var(--color-sage-ink)"
            />
          </view>

          <text class="empty-title">{{ milestoneTitle }}</text>
          <text v-if="milestoneSubtitle" class="empty-subtitle">{{ milestoneSubtitle }}</text>

          <text
            v-if="phase === 'ROUND_COMPLETE' && roundMode !== 'learn' && totalFeedbackCount > 0"
            class="feedback-summary num-tabular"
          >
            首次评估：认识 {{ firstFeedbackCounts.GOOD }} · 模糊 {{ firstFeedbackCounts.HARD }} · 忘记 {{ firstFeedbackCounts.AGAIN }}
          </text>

          <view
            v-if="!loading && !loadError && !hasPendingCommand && phase !== 'GROUP_COMPLETE' && selfTestCount > 5"
            class="selftest-size-group"
            role="group"
            aria-label="每组自测题量"
          >
            <text class="selftest-size-label">每组</text>
            <view
              class="selftest-size-chip num-tabular"
              :class="{ active: selfTestSize === 5 }"
              role="button"
              @click="selfTestSize = 5"
            >
              <text>5 个</text>
            </view>
            <view
              class="selftest-size-chip num-tabular"
              :class="{ active: selfTestSize === 10 }"
              role="button"
              @click="selfTestSize = 10"
            >
              <text>10 个</text>
            </view>
          </view>

          <view v-if="!loading" class="milestone-actions">
            <view
              v-if="phase === 'GROUP_COMPLETE'"
              class="ui-btn ui-btn-primary action-capsule"
              role="button"
              @click="continueNextGroup"
            >
              <text>继续下一组（{{ nextGroupCount }} 个）</text>
              <LineIcon name="chevron-right" size="14px" color="#FFFFFF" />
            </view>

            <view
              v-if="loadError"
              class="ui-btn ui-btn-primary action-capsule"
              role="button"
              @click="reloadCurrentRound"
            >
              <LineIcon name="refresh" size="14px" color="#FFFFFF" />
              <text>重试</text>
            </view>

            <view
              v-if="!loadError && !hasPendingCommand && phase !== 'GROUP_COMPLETE' && selfTestCount > 0"
              class="ui-btn action-capsule"
              :class="phase === 'ROUND_COMPLETE' ? 'ui-btn-secondary' : 'ui-btn-primary'"
              role="button"
              @click="handleStartSelfTest"
            >
              <text>{{ roundMode === 'self-test' ? '再来一组自测' : '开启自测复习' }}</text>
            </view>

            <view
              v-if="!loadError && !hasPendingCommand && roundMode === 'self-test' && phase === 'IDLE'"
              class="ui-btn ui-btn-secondary action-capsule"
              role="button"
              @click="switchToDueReview"
            >
              <text>查看待复习</text>
            </view>

            <view
              class="ui-btn action-capsule"
              :class="phase === 'ROUND_COMPLETE' ? 'ui-btn-primary' : 'ui-btn-secondary'"
              role="button"
              @click="handleBack"
            >
              <text>{{ phase === 'ROUND_COMPLETE' ? '完成并返回' : '返回学习页' }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="activeBlock && !roundNeedsRestart && !hasPendingCommand" class="action-dock">
        <view
          v-if="phase === 'LEARNING_READ'"
          class="ui-btn ui-btn-primary dock-btn dock-single"
          :class="{ 'is-disabled': submitting }"
          role="button"
          @click="beginLearningRecall"
        >
          <text>开始回忆</text>
          <LineIcon name="chevron-right" size="15px" color="#FFFFFF" />
        </view>

        <view
          v-else-if="phase === 'LEARNING_RECALL'"
          class="ui-btn ui-btn-primary dock-btn dock-single"
          :class="{ 'is-disabled': submitting }"
          role="button"
          @click="revealAnswer"
        >
          <LineIcon name="eye" size="15px" color="#FFFFFF" />
          <text>展开核对</text>
        </view>

        <view v-else-if="phase === 'LEARNING_CHECK'" class="dock-row-2">
          <view
            class="ui-btn ui-btn-secondary dock-btn"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="failLearning"
          >
            <text>继续学习</text>
          </view>
          <view
            class="ui-btn ui-btn-primary dock-btn"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="completeLearning"
          >
            <LineIcon name="check" size="14px" color="#FFFFFF" />
            <text>{{ submitting ? '提交中…' : '完成学习' }}</text>
          </view>
        </view>

        <view v-else-if="phase === 'REVIEW_RECALL'" class="dock-row-3">
          <view
            class="dock-rate-btn rate-again"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="selectRating('AGAIN')"
          >
            <view class="rate-dot dot-again"></view>
            <text>忘记了</text>
          </view>
          <view
            class="dock-rate-btn rate-hard"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="selectRating('HARD')"
          >
            <view class="rate-dot dot-hard"></view>
            <text>模糊</text>
          </view>
          <view
            class="dock-rate-btn rate-good"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="selectRating('GOOD')"
          >
            <view class="rate-dot dot-good"></view>
            <text>{{ submitting ? '保存中…' : '认识' }}</text>
          </view>
        </view>

        <view v-else-if="phase === 'FUZZY_RECALL'" class="dock-row-2">
          <view
            class="dock-rate-btn rate-again"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="correctReview"
          >
            <view class="rate-dot dot-again"></view>
            <text>{{ submitting ? '处理中…' : '忘记了' }}</text>
          </view>
          <view
            class="ui-btn ui-btn-primary dock-btn"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="revealAnswer"
          >
            <LineIcon name="eye" size="15px" color="#FFFFFF" />
            <text>展开核对</text>
          </view>
        </view>

        <view v-else-if="phase === 'REVIEW_CHECK' || phase === 'FUZZY_CHECK'" class="dock-row-2">
          <view
            class="dock-rate-btn rate-again"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="correctReview"
          >
            <view class="rate-dot dot-again"></view>
            <text>{{ submitting ? '处理中…' : '记错了' }}</text>
          </view>
          <view
            class="ui-btn ui-btn-primary dock-btn"
            :class="{ 'is-disabled': submitting }"
            role="button"
            @click="confirmReview"
          >
            <text>{{ submitting ? '确认中…' : '下一个' }}</text>
            <LineIcon name="chevron-right" size="15px" color="#FFFFFF" />
          </view>
        </view>
      </view>
    </view>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { reviewApi } from '@/api/reviewApi'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { useMobileLifecycleReview } from '@/composables/useMobileLifecycleReview'
import { onPageLoad } from '@/platform/lifecycle'
import { canNavigateBack, navigateBack, redirectTo } from '@/platform/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { useLayoutStore } from '@/store/useLayoutStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { plainMarkdownExcerpt } from '@/utils/markdown'
import {
  parseMobileReviewQuery,
  type MobileGroupSize,
  type MobileStudyMode,
} from '@/utils/mobileLearning'

const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const subjectStore = useSubjectStore()

let lastReviewAuthScope = `${authStore.isAuthenticated ? '1' : '0'}:${authStore.user?.id || 'anon'}:${authStore.serverDeviceId || 'dev'}`

const selectedSubjectId = ref('')
const routeSubjectParam = ref('')
const initialMode = ref<MobileStudyMode>('review')
const initialGroupSize = ref<MobileGroupSize>(5)
const selfTestSize = ref<MobileGroupSize>(5)
const queryReady = ref(false)

const {
  roundMode,
  groupSize,
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
  queue,
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
  continueNextGroup,
  startSelfTestRound,
  switchToDueReview,
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
} = useMobileLifecycleReview(reviewApi, {
  subjectId: () => selectedSubjectId.value || undefined,
  enabled: () => queryReady.value && Boolean(selectedSubjectId.value),
  initialMode: () => initialMode.value,
  initialGroupSize: () => initialGroupSize.value,
})

const activeSubjectLabel = computed(() => {
  if (!subjectStore.subjects.length) return '学习'
  return subjectStore.subjects.find(item => item.id === selectedSubjectId.value)?.name || subjectStore.subjects[0].name
})

const progressPercent = computed(() => {
  if (phase.value === 'GROUP_COMPLETE' || phase.value === 'ROUND_COMPLETE') return 100
  const total = progressTotal.value
  if (!total) return 0
  const done = Math.max(0, total - queue.value.length)
  return Math.min(100, Math.round((done / total) * 100))
})

const counterText = computed(() => {
  if (phase.value === 'GROUP_COMPLETE' || phase.value === 'ROUND_COMPLETE') {
    const total = progressTotal.value
    return total ? `${total} / ${total}` : '0 / 0'
  }
  const total = progressTotal.value
  if (!total) return '0 / 0'
  return `${progressCurrent.value} / ${total}`
})

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

const blurredPreview = computed(() => {
  const raw = activeBlock.value?.content || ''
  return plainMarkdownExcerpt(raw) || '该知识块核心要点与定义内容'
})

const recallPromptTitle = computed(() => {
  if (phase.value === 'LEARNING_RECALL') return '合上正文，主动回忆'
  if (phase.value === 'FUZZY_RECALL') return '再回想刚才标为「模糊」的要点'
  return '在脑海中回忆该知识块要点'
})

const recallPromptSubtitle = computed(() => {
  if (phase.value === 'LEARNING_RECALL') return '回忆核心定义与关键结论，再展开正文逐项核对'
  if (phase.value === 'FUZZY_RECALL') return '巩固记忆提取后点击下方「展开核对」确认掌握'
  return '依据提取清晰度客观评估：认识 / 模糊 / 忘记了'
})

const totalFeedbackCount = computed(() => (
  firstFeedbackCounts.value.GOOD + firstFeedbackCounts.value.HARD + firstFeedbackCounts.value.AGAIN
))

const nextGroupCount = computed(() => Math.min(groupSize.value, remainingIds.value.length))

const milestoneTitle = computed(() => {
  if (!subjectsHydrated.value || loading.value) return '正在准备学习队列…'
  if (hasPendingCommand.value) return '存在待确认的学习操作'
  if (loadError.value) return loadError.value
  if (!subjectStore.subjects.length) return '暂无学科'
  if (phase.value === 'GROUP_COMPLETE') {
    return roundMode.value === 'learn' ? '本组内容已学完' : '本组复习已完成'
  }
  if (phase.value === 'ROUND_COMPLETE') {
    if (roundMode.value === 'learn') return '本次学习已完成'
    if (roundMode.value === 'self-test') return '本轮自测已完成'
    return '本轮复习已完成'
  }
  if (roundMode.value === 'learn') {
    return unsyncedBlockCount.value > 0 ? '暂无已同步待学习内容' : '本学科暂无待学习知识块'
  }
  if (roundMode.value === 'self-test') return '暂无可自测知识点'
  return '本学科今日待复习已清空'
})

const milestoneSubtitle = computed(() => {
  if (!subjectsHydrated.value || loading.value) return ''
  if (hasPendingCommand.value) {
    return '请点击上方「原样重试」确认上次提交，或点击「刷新状态」同步最新进度'
  }
  if (loadError.value || !subjectStore.subjects.length) return ''
  if (phase.value === 'GROUP_COMPLETE') {
    return `本轮还剩 ${remainingIds.value.length} 个知识点待${roundMode.value === 'learn' ? '学习' : '复习'}`
  }
  if (phase.value === 'ROUND_COMPLETE') {
    const verb = roundMode.value === 'learn' ? '学习' : roundMode.value === 'self-test' ? '自测' : '复习'
    return `本次共完成 ${completedCount.value} 个知识点的${verb}`
  }
  if (roundMode.value === 'learn' && unsyncedBlockCount.value > 0) {
    return `检测到 ${unsyncedBlockCount.value} 个离线新建知识块，请先联网同步后再进入学习`
  }
  if (selfTestCount.value > 0) {
    return `本学科已学 ${selfTestCount.value} 个知识点，可直接开启自测抽查巩固`
  }
  return '可先在学习页新建或同步知识块，完成首次学习后即可进入复习与自测'
})

onPageLoad((query) => {
  const parsed = parseMobileReviewQuery(query)
  initialMode.value = parsed.mode
  initialGroupSize.value = parsed.groupSize
  selfTestSize.value = parsed.groupSize
  if (parsed.subjectId) {
    routeSubjectParam.value = parsed.subjectId
    selectedSubjectId.value = parsed.subjectId
    subjectStore.setActiveSubject(parsed.subjectId)
  }
  queryReady.value = true
})

const subjectsHydrated = ref(false)

async function hydrateSubjectsForScope() {
  const gen = authStore.getLoginGeneration()
  try {
    await subjectStore.loadSubjects()
  } finally {
    if (gen === authStore.getLoginGeneration()) {
      subjectsHydrated.value = true
    }
  }
}

watch(
  () => `${authStore.isAuthenticated ? '1' : '0'}:${authStore.user?.id || 'anon'}:${authStore.serverDeviceId || 'dev'}`,
  (nextScope) => {
    if (nextScope === lastReviewAuthScope) return
    lastReviewAuthScope = nextScope
    subjectsHydrated.value = false
    routeSubjectParam.value = ''
    selectedSubjectId.value = ''
    if (authStore.isAuthenticated) {
      void hydrateSubjectsForScope()
    }
  },
)

watch(
  () => subjectStore.subjects,
  (list) => {
    if (!list.length) {
      if (!routeSubjectParam.value) selectedSubjectId.value = ''
      return
    }
    if (routeSubjectParam.value) {
      if (list.some(item => item.id === routeSubjectParam.value)) {
        selectedSubjectId.value = routeSubjectParam.value
        return
      }
      routeSubjectParam.value = ''
    }
    if (selectedSubjectId.value && list.some(item => item.id === selectedSubjectId.value)) return
    const preferred = subjectStore.activeSubjectId
    selectedSubjectId.value = list.some(item => item.id === preferred) ? (preferred as string) : list[0].id
  },
  { immediate: true },
)

onMounted(() => {
  if (!queryReady.value) queryReady.value = true
  void hydrateSubjectsForScope()
})

function handleStartSelfTest() {
  void startSelfTestRound(selfTestSize.value)
}

function handleReloadAfterConflict() {
  void discardPendingAndReload()
}

function handleBack() {
  layoutStore.triggerReturn(360)
  if (canNavigateBack()) {
    navigateBack()
    return
  }
  redirectTo('/pages/mobile/learn/index')
}
</script>

<style scoped>
.review-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(14px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background-color: transparent;
  overflow: hidden;
}

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  height: max(var(--status-bar-height, 0px), env(safe-area-inset-top));
  flex-shrink: 0;
}

.review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 18px 8px;
  flex-shrink: 0;
}

.back-pill {
  height: 32px;
  padding: 0 12px 0 8px;
  background-color: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  box-shadow: var(--glass-shadow-subtle);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  cursor: pointer;
}

.back-label {
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
}

.toolbar-subject {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.progress-track {
  width: 52px;
  height: 4px;
  border-radius: var(--radius-full);
  background-color: rgba(139, 154, 110, 0.18);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent-gradient);
  transition: width 0.28s var(--ease-out);
}

.summary-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
}

.info-banner,
.error-banner {
  margin: 4px 18px 4px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.error-banner {
  background-color: rgba(201, 59, 59, 0.08);
  border-color: rgba(201, 59, 59, 0.24);
}

.info-banner-text {
  font-size: 12px;
  color: var(--color-warning-ink);
  line-height: 1.45;
}

.error-banner-text {
  font-size: 12.5px;
  color: var(--color-danger);
  line-height: 1.45;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.banner-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  font-size: 12px;
}

.study-stage {
  flex: 1;
  min-height: 0;
  padding: 6px 18px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.study-card {
  width: 100%;
  max-width: 440px;
  flex: 1;
  min-height: 0;
  padding: 18px 18px 16px;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.card-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mode-badge {
  padding: 3px 9px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
}

.mode-badge.tone-warning {
  background-color: var(--color-warning-bg);
  color: var(--color-warning-ink);
}

.mode-badge.tone-sage {
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
}

.fuzzy-tag {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  background-color: rgba(45, 55, 40, 0.06);
  color: var(--text-muted);
}

.card-pos {
  font-size: 11.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
}

.card-title {
  font-size: 19px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.35;
  flex-shrink: 0;
  word-break: break-word;
}

.recall-zone {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.frosted-canvas {
  position: relative;
  flex: 1;
  min-height: 160px;
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  padding: 18px 16px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.frosted-blurred-text {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  filter: blur(8px);
  -webkit-filter: blur(8px);
  opacity: 0.42;
  user-select: none;
  pointer-events: none;
  text-align: left;
  word-break: break-word;
}

.frosted-veil {
  position: absolute;
  inset: 0;
  background-color: rgba(250, 247, 242, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  pointer-events: none;
}

.recall-prompt-overlay {
  position: absolute;
  inset: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
}

.recall-halo {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.recall-prompt-title {
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.recall-prompt-desc {
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 28ch;
}

.reopen-action-row {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

.reopen-pill {
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

.content-zone {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-guide-bar {
  padding: 8px 11px;
  border-radius: var(--radius-md);
  background-color: var(--color-sage-bg);
  border: 1px solid var(--border-accent);
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}

.check-guide-tag {
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-ink);
  color: #FFFFFF;
  font-size: 10.5px;
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
}

.check-guide-text {
  flex: 1;
  font-size: 11.5px;
  color: var(--color-sage-ink);
  line-height: 1.4;
}

.content-scroll {
  flex: 1;
  height: 0;
  min-height: 140px;
  border-top: 1px solid var(--border-subtle);
}

.content-inner {
  padding: 12px 2px 6px;
}

.milestone-card {
  width: 100%;
  max-width: 380px;
  min-height: 300px;
  padding: 28px 22px;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  box-sizing: border-box;
}

.empty-halo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  font-size: 16.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.empty-subtitle {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
  max-width: 28ch;
}

.feedback-summary {
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text-secondary);
}

.selftest-size-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 10px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-accent);
}

.selftest-size-label {
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  margin-right: 2px;
}

.selftest-size-chip {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  cursor: pointer;
}

.selftest-size-chip.active {
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
}

.milestone-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  max-width: 260px;
  gap: 9px;
  margin-top: 4px;
}

.action-capsule {
  height: 40px;
  padding: 0 18px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
}

.action-dock {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 6px 18px 6px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.dock-single {
  width: 100%;
}

.dock-row-2 {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 10px;
}

.dock-row-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}

.dock-btn {
  height: 44px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
}

.dock-rate-btn {
  height: 44px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.12s var(--ease-out);
}

.dock-rate-btn:active:not(.is-disabled) {
  transform: scale(0.97);
}

.rate-again {
  background-color: var(--color-danger-bg);
  border-color: rgba(201, 59, 59, 0.24);
  color: var(--color-danger);
}

.rate-hard {
  background-color: var(--color-warning-bg);
  border-color: rgba(200, 155, 109, 0.34);
  color: var(--color-warning-ink);
}

.rate-good {
  background: var(--accent-gradient);
  color: #FFFFFF;
  box-shadow: var(--accent-glow);
}

.rate-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot-again {
  background-color: var(--color-danger);
}

.dot-hard {
  background-color: var(--color-warning-ink);
}

.dot-good {
  background-color: #FFFFFF;
}

.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
