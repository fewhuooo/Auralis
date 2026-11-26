<template>
  <AppPageLayout>
    <div class="learn-page">
      <div class="status-bar-spacer"></div>

      <div class="top-bar">
        <div class="masthead-main-row">
          <span class="page-title">学习</span>
          <div v-if="syncStore.isSyncing" class="sync-dot" aria-label="同步中"></div>
        </div>
        <span class="masthead-subtitle num-tabular">
          {{ subjectStore.subjects.length }} 门学科 · {{ totalBlockCount }} 个知识块
        </span>
      </div>

      <div v-if="subjectStore.subjects.length === 0" class="learn-empty-stage">
        <div class="empty-hall-card zen-card">
          <div class="empty-halo">
            <LineIcon name="book" size="24px" color="var(--color-sage-ink)" />
          </div>
          <span class="empty-title">暂无学科空间</span>
          <span class="empty-subtitle">可在此直接创建第一门学科，或等待其他端同步</span>
          <div class="empty-quick-create">
            <input
              v-model="quickSubjectName"
              class="ui-input empty-quick-input"
              maxlength="20"
              placeholder="输入学科名称…"
              :disabled="creatingQuickSubject"
              @keydown="handleEnterKey($event, createQuickSubject)"
            />
            <button
              type="button"
              class="ui-btn ui-btn-primary empty-quick-btn"
              :class="{ 'is-loading': creatingQuickSubject }"
              :disabled="creatingQuickSubject || !quickSubjectName.trim()"
              @click="createQuickSubject"
            >
              创建
            </button>
          </div>
        </div>
      </div>

      <template v-else>
        <div ref="stripWrapRef" class="subject-strip-wrap">
          <div
            ref="stripScrollRef"
            class="subject-strip-scroll zen-scroll-x"
          >
            <div class="subject-strip">
              <div
                v-for="(sub, idx) in subjectStore.subjects"
                :id="`subject-pill-${idx}`"
                :key="sub.id"
                class="subject-pill"
                :class="{ active: sub.id === activeSubjectId }"
                role="button"
                :aria-pressed="sub.id === activeSubjectId"
                :aria-label="`切换学科 ${sub.name}`"
                @click="selectSubject(sub.id)"
              >
                <LineIcon
                  :name="resolveSubjectIcon(sub.icon)"
                  size="14px"
                  :color="sub.id === activeSubjectId ? '#FFFFFF' : '#556B3D'"
                />
                <span class="subject-pill-name">{{ sub.name }}</span>
                <span
                  v-if="(badgeCountMap[sub.id] ?? 0) > 0"
                  class="subject-pill-badge num-tabular"
                >
                  {{ formatBadgeCount(badgeCountMap[sub.id]) }}
                </span>
              </div>
            </div>
          </div>

          <div
            class="subject-expand-btn"
            :class="{ 'is-open': showSubjectPicker }"
            role="button"
            :aria-expanded="showSubjectPicker"
            aria-label="展开全部学科"
            @click="toggleSubjectPicker"
          >
            <LineIcon
              :name="showSubjectPicker ? 'chevron-up' : 'grid'"
              size="15px"
              color="var(--color-sage-ink)"
            />
          </div>
        </div>

        <div class="learn-content">
          <div class="plan-card">
            <div class="plan-top-row">
              <div class="plan-subject-meta">
                <div class="hero-icon-badge">
                  <LineIcon
                    :name="resolveSubjectIcon(activeSubject?.icon)"
                    size="14px"
                    color="var(--color-sage-ink)"
                  />
                </div>
                <span class="hero-subject-name">{{ activeSubject?.name || '当前学科' }}</span>
              </div>

              <div class="mastery-pill num-tabular">
                <div class="mastery-dot"></div>
                <span v-if="!hasLoadedReviewStates && statesLoading">同步状态中…</span>
                <span v-else>掌握 {{ heroSummary.masteryPercent }}% · {{ heroSummary.masteredCount }}/{{ heroSummary.blockCount }}</span>
              </div>
            </div>

            <div
              class="distribution-track"
              role="progressbar"
              :aria-valuenow="heroSummary.masteryPercent"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <template v-if="heroSummary.blockCount > 0">
                <div
                  v-if="heroSummary.pendingLearningCount > 0"
                  class="dist-seg dist-learning"
                  :style="{ width: `${heroSummary.distributionPercents.learning}%` }"
                ></div>
                <div
                  v-if="heroSummary.reviewingCount > 0"
                  class="dist-seg dist-reviewing"
                  :style="{ width: `${heroSummary.distributionPercents.reviewing}%` }"
                ></div>
                <div
                  v-if="heroSummary.masteredCount > 0"
                  class="dist-seg dist-mastered"
                  :style="{ width: `${heroSummary.distributionPercents.mastered}%` }"
                ></div>
              </template>
            </div>

            <div class="plan-action-grid">
              <div
                class="plan-tile tile-learn"
                :class="{ 'is-idle': !canStartLearning }"
                role="button"
                aria-label="进入学习"
                @click="startStudyMode('learn')"
              >
                <div class="tile-head">
                  <span class="tile-label tile-label-learn">待学习</span>
                  <LineIcon
                    name="arrow-right"
                    size="14px"
                    :color="canStartLearning ? '#4B5F36' : 'var(--text-muted)'"
                  />
                </div>
                <div class="tile-metric-row">
                  <span class="tile-number tile-number-learn num-tabular">{{ hasLoadedReviewStates ? heroSummary.pendingLearningCount : '—' }}</span>
                </div>
                <span class="tile-hint num-tabular">{{ learnTileHint }}</span>
              </div>

              <div
                class="plan-tile tile-review"
                :class="{ 'is-selftest-mode': !canStartReview }"
                role="button"
                :aria-label="canStartReview ? '进入复习' : '进入自由自测'"
                @click="handleRightPlanCardClick"
              >
                <template v-if="canStartReview">
                  <div class="tile-head">
                    <span class="tile-label tile-label-review">待复习</span>
                    <LineIcon name="arrow-right" size="14px" color="var(--color-warning-ink)" />
                  </div>
                  <div class="tile-metric-row">
                    <span class="tile-number num-tabular">{{ heroSummary.dueReviewCount }}</span>
                  </div>
                  <div class="tile-foot-row">
                    <span class="tile-hint num-tabular">{{ reviewTileHint }}</span>
                    <span
                      v-if="canStartSelfTest"
                      class="tile-inline-action"
                      role="button"
                      @click.stop="startStudyMode('self-test')"
                    >
                      自由自测
                    </span>
                  </div>
                </template>
                <template v-else>
                  <div class="tile-head">
                    <span class="tile-label tile-label-muted num-tabular">待复习 {{ hasLoadedReviewStates ? 0 : '—' }}</span>
                    <LineIcon
                      name="rotate"
                      size="13px"
                      :color="canStartSelfTest ? 'var(--color-sage-ink)' : 'var(--text-muted)'"
                    />
                  </div>
                  <div class="tile-metric-row">
                    <span class="tile-action-title" :class="{ 'is-muted': !canStartSelfTest }">自由自测</span>
                  </div>
                  <span class="tile-hint num-tabular">{{ selfTestTileHint }}</span>
                </template>
              </div>
            </div>

            <div class="plan-footer-row">
              <div class="group-size-inline" role="group" aria-label="每组数量">
                <span class="group-inline-label">每组</span>
                <span
                  class="group-inline-opt num-tabular"
                  :class="{ active: groupSize === 5 }"
                  role="button"
                  @click="groupSize = 5"
                >
                  5 个
                </span>
                <span class="group-inline-sep" aria-hidden="true">/</span>
                <span
                  class="group-inline-opt num-tabular"
                  :class="{ active: groupSize === 10 }"
                  role="button"
                  @click="groupSize = 10"
                >
                  10 个
                </span>
              </div>

              <div
                v-if="statesError"
                class="hero-retry-link"
                role="button"
                @click="retrySubjectReviewState"
              >
                <LineIcon name="refresh" size="12px" color="var(--color-sage-ink)" />
                <span>复习状态加载失败，重试</span>
              </div>
            </div>
          </div>

          <div class="blocks-panel">
            <div class="blocks-toolbar">
              <div class="search-box">
                <LineIcon name="search" size="14px" color="var(--text-muted)" />
                <input
                  v-model="searchQuery"
                  class="search-input"
                  placeholder="搜索当前学科知识块…"
                />
                <div
                  v-if="searchQuery"
                  class="search-clear"
                  role="button"
                  aria-label="清空搜索"
                  @click="searchQuery = ''"
                >
                  <LineIcon name="close" size="12px" color="var(--text-muted)" />
                </div>
              </div>

              <div
                class="add-block-btn"
                role="button"
                aria-label="新建知识块"
                @click="openCreateBlockModal"
              >
                <LineIcon name="plus" size="16px" color="var(--color-sage-ink)" />
              </div>
            </div>

            <div v-if="filteredBlocks.length === 0" class="blocks-empty">
              <span class="empty-whisper">
                {{ searchQuery.trim() ? '无匹配知识块' : '当前学科暂无知识块' }}
              </span>
              <div
                v-if="searchQuery.trim()"
                class="ui-btn ui-btn-secondary empty-small-btn"
                role="button"
                @click="searchQuery = ''"
              >
                <span>清空搜索</span>
              </div>
              <div
                v-else
                class="ui-btn ui-btn-primary empty-small-btn"
                role="button"
                @click="openCreateBlockModal"
              >
                <LineIcon name="plus" size="14px" color="#FFFFFF" />
                <span>新建知识块</span>
              </div>
            </div>

            <div v-else class="blocks-scroll zen-scroll-y">
              <div class="blocks-list">
                <div
                  v-for="item in filteredBlocks"
                  :key="item.id"
                  class="block-card"
                  role="button"
                  :aria-label="`阅读知识块 ${item.title}`"
                  @click="openReader(item.id)"
                >
                  <div class="block-card-head">
                    <span class="block-card-title">{{ item.title }}</span>
                    <span
                      v-if="hasLoadedReviewStates"
                      class="stage-pill"
                      :class="`tone-${stageForBlock(item.id).tone}`"
                    >
                      {{ stageForBlock(item.id).label }}
                    </span>
                  </div>

                  <span class="block-card-excerpt">{{ excerptForBlock(item.preview) }}</span>

                  <div class="block-card-foot">
                    <span class="block-card-meta num-tabular">{{ formatBlockMeta(item.source, item.time) }}</span>
                    <div class="block-read-more">
                      <span>全文</span>
                      <LineIcon name="chevron-right" size="12px" color="var(--color-sage-ink)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #overlay>
      <div
        v-if="readingBlock"
        class="zen-sheet-mask learn-sheet-mask"
        @click="closeReader"
      >
        <div
          class="zen-sheet-body reader-sheet-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="readingBlock.title"
          @click.stop
        >
          <div class="sheet-drag-bar" aria-hidden="true"></div>

          <div class="reader-head">
            <div class="reader-head-main">
              <div class="reader-tags">
                <span class="reader-subject-pill">{{ readingBlock.subject || activeSubject?.name }}</span>
                <span
                  v-if="hasLoadedReviewStates"
                  class="stage-pill"
                  :class="`tone-${stageForBlock(readingBlock.id).tone}`"
                >
                  {{ stageForBlock(readingBlock.id).label }}
                </span>
              </div>
              <span class="reader-title">{{ readingBlock.title }}</span>
              <span
                v-if="formatBlockMeta(readingBlock.source, readingBlock.time)"
                class="reader-meta num-tabular"
              >
                {{ formatBlockMeta(readingBlock.source, readingBlock.time) }}
              </span>
            </div>

            <div class="sheet-close-btn" role="button" aria-label="关闭" @click="closeReader">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </div>
          </div>

          <div class="reader-body-scroll zen-scroll-y">
            <div class="reader-body-inner">
              <MarkdownText :content="readingBlock.preview || ''" />
            </div>
          </div>

          <div class="reader-actions">
            <div
              class="ui-btn ui-btn-secondary reader-copy-btn"
              role="button"
              @click="copyReadingBlock"
            >
              <LineIcon
                :name="copiedReading ? 'check' : 'copy'"
                size="14px"
                color="var(--color-sage-ink)"
              />
              <span>{{ copiedReading ? '已复制' : '复制全文' }}</span>
            </div>

            <div
              class="ui-btn ui-btn-secondary reader-edit-btn"
              :class="{ 'is-disabled': isReadingBlockBusy }"
              role="button"
              @click="openEditBlockModal(readingBlock)"
            >
              <LineIcon name="edit" size="14px" color="var(--text-primary)" />
              <span>编辑</span>
            </div>

            <div
              class="ui-btn ui-btn-danger reader-delete-btn"
              :class="{ 'is-disabled': isReadingBlockBusy }"
              role="button"
              aria-label="删除知识块"
              @click="confirmDeleteBlock(readingBlock)"
            >
              <LineIcon name="trash" size="14px" color="var(--color-danger)" />
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="showSubjectPicker"
        class="subject-dropdown-mask"
        @click="closeSubjectPicker"
      >
        <div
          class="subject-dropdown-panel"
          :style="{ marginTop: `${subjectDropdownTop}px` }"
          role="dialog"
          aria-modal="true"
          aria-label="全部学科"
          @click.stop
        >
          <div class="picker-head">
            <div class="picker-title-row">
              <span class="picker-title">全部学科</span>
              <span class="picker-count-pill num-tabular">{{ subjectStore.subjects.length }} 门</span>
            </div>
            <div class="sheet-close-btn" role="button" aria-label="收起" @click="closeSubjectPicker">
              <LineIcon name="chevron-up" size="15px" color="var(--text-muted)" />
            </div>
          </div>

          <div class="subject-picker-scroll zen-scroll-y">
            <div class="subject-grid">
              <div
                v-for="sub in subjectStore.subjects"
                :key="sub.id"
                class="subject-grid-card"
                :class="{ active: sub.id === activeSubjectId }"
                role="button"
                :aria-pressed="sub.id === activeSubjectId"
                :aria-label="`选择学科 ${sub.name}`"
                @click="selectSubjectFromPicker(sub.id)"
              >
                <div class="subject-grid-top">
                  <div
                    class="subject-grid-icon"
                    :class="{ active: sub.id === activeSubjectId }"
                  >
                    <LineIcon
                      :name="resolveSubjectIcon(sub.icon)"
                      size="14px"
                      :color="sub.id === activeSubjectId ? '#FFFFFF' : '#556B3D'"
                    />
                  </div>

                  <div class="subject-grid-indicators">
                    <span
                      v-if="(badgeCountMap[sub.id] ?? 0) > 0"
                      class="subject-grid-badge num-tabular"
                    >
                      {{ formatBadgeCount(badgeCountMap[sub.id]) }}
                    </span>
                    <div
                      v-if="sub.id === activeSubjectId"
                      class="subject-grid-check"
                    >
                      <LineIcon name="check" size="11px" color="#FFFFFF" />
                    </div>
                  </div>
                </div>

                <span class="subject-grid-name">{{ sub.name }}</span>
                <span class="subject-grid-meta num-tabular">
                  {{ subjectBlockCountMap[sub.id] ?? sub.blockCount ?? 0 }} 个知识块
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="showBlockModal"
        class="zen-modal-mask learn-modal-mask"
        @click="closeBlockModal"
      >
        <div
          class="zen-modal-body learn-modal-card"
          role="dialog"
          aria-modal="true"
          :aria-label="editingBlockId ? '编辑知识块' : '新建知识块'"
          @click.stop
        >
          <div class="modal-head">
            <span class="modal-title">
              {{ editingBlockId ? '编辑知识块' : `新建知识块 · ${activeSubject?.name || ''}` }}
            </span>
            <div class="sheet-close-btn" role="button" aria-label="关闭" @click="closeBlockModal">
              <LineIcon name="close" size="16px" color="var(--text-muted)" />
            </div>
          </div>

          <div class="modal-form">
            <div class="field-group">
              <span class="field-label">标题</span>
              <input
                v-model="blockForm.title"
                class="ui-input"
                maxlength="120"
                placeholder="请输入知识块标题…"
                :disabled="savingBlock"
                @keydown="handleEnterKey($event, submitBlockModal)"
              />
            </div>

            <div class="field-group">
              <span class="field-label">正文内容（支持 Markdown / 公式）</span>
              <textarea
                v-model="blockForm.preview"
                class="ui-textarea learn-textarea"
                maxlength="20000"
                placeholder="记录核心概念、公式或要点…"
                :disabled="savingBlock"
              />
            </div>

            <div class="field-group">
              <span class="field-label">来源说明（可选）</span>
              <input
                v-model="blockForm.source"
                class="ui-input"
                maxlength="80"
                placeholder="可选，如教材章节或资料名"
                :disabled="savingBlock"
                @keydown="handleEnterKey($event, submitBlockModal)"
              />
            </div>

            <span v-if="blockModalError" class="modal-error">{{ blockModalError }}</span>
          </div>

          <div class="modal-foot">
            <button
              type="button"
              class="ui-btn ui-btn-secondary modal-capsule-btn"
              :disabled="savingBlock"
              @click="closeBlockModal"
            >
              取消
            </button>
            <button
              type="button"
              class="ui-btn ui-btn-primary modal-capsule-btn"
              :class="{ 'is-loading': savingBlock }"
              :disabled="savingBlock || !canSubmitBlock"
              @click="submitBlockModal"
            >
              {{ savingBlock ? '保存中…' : editingBlockId ? '保存修改' : '保存知识块' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </AppPageLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ApiProblemError } from '@/api/protocol'
import { reviewApi, type ReviewState } from '@/api/reviewApi'
import AppPageLayout from '@/components/AppPageLayout.vue'
import LineIcon from '@/components/LineIcon.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { confirmDialog, showToast } from '@/platform/feedback'
import { onPageShow } from '@/platform/lifecycle'
import { navigateTo } from '@/platform/navigation'
import { localDb } from '@/services/localDb'
import { useAuthStore } from '@/store/useAuthStore'
import { useBlockStore, type KnowledgeBlock } from '@/store/useBlockStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import { handleEnterKey } from '@/utils/domHelpers'
import { plainMarkdownExcerpt } from '@/utils/markdown'
import {
  buildMobileReviewUrl,
  computeLeadingScrollLeft,
  copyTextWithFallback,
  filterSubjectBlocks,
  formatBlockMeta,
  resolveBlockReviewStage,
  resolveInitialLearnSubjectId,
  summarizeSubjectReview,
  type BlockReviewStageBadge,
  type MobileGroupSize,
  type MobileStudyMode,
} from '@/utils/mobileLearning'
import { preloadRoute, scheduleSiblingPreload } from '@/utils/pagePreload'
import { isSubjectIconKey } from '@/utils/subjectIcon'

const EMPTY_DUE_IDS = new Set<string>()

const authStore = useAuthStore()
const subjectStore = useSubjectStore()
const blockStore = useBlockStore()
const syncStore = useSyncStore()

const stripWrapRef = ref<HTMLElement | null>(null)
const stripScrollRef = ref<HTMLElement | null>(null)

const selectedSubjectId = ref('')
const groupSize = ref<MobileGroupSize>(5)
const searchQuery = ref('')
const badgeCountMap = ref<Record<string, number>>({})
const reviewStatesByScope = ref<Record<string, ReviewState[]>>({})
const statesLoading = ref(false)
const statesError = ref('')
const showSubjectPicker = ref(false)
const subjectDropdownTop = ref(120)

const readingBlockId = ref('')
const copiedReading = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const showBlockModal = ref(false)
const editingBlockId = ref('')
const savingBlock = ref(false)
const blockModalError = ref('')
const quickSubjectName = ref('')
const creatingQuickSubject = ref(false)
const blockForm = reactive({
  title: '',
  preview: '',
  source: '',
})

let stopReviewPreload: (() => void) | null = null
let badgeCountReqId = 0
let subjectReviewReqId = 0
let lastAuthScope = ''
let hasShownOnce = false
let refreshInFlight: { scope: string; promise: Promise<void> } | null = null
let stripScrollTimer: ReturnType<typeof setTimeout> | null = null
let isPageUnmounted = false

function scopeKeyForAuth(): string {
  return `${authStore.user?.id || 'anon'}:${authStore.serverDeviceId || 'dev'}`
}

function subjectCacheKey(subjectId: string): string {
  return `${scopeKeyForAuth()}:${subjectId}`
}

function isSameAuthSnapshot(
  generation: symbol,
  userId?: string,
  serverDeviceId?: string,
): boolean {
  return (
    generation === authStore.getLoginGeneration()
    && userId === authStore.user?.id
    && serverDeviceId === authStore.serverDeviceId
  )
}

function resolveSubjectIcon(icon?: string | null): string {
  return icon && isSubjectIconKey(icon) ? `subj-${icon.trim()}` : 'subj-book'
}

function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

const activeSubject = computed(() => (
  subjectStore.subjects.find(item => item.id === selectedSubjectId.value)
  || subjectStore.subjects[0]
  || null
))

const activeSubjectId = computed(() => activeSubject.value?.id || '')

const totalBlockCount = computed(() => (
  blockStore.recentBlocks.filter(item => !item.is_deleted).length
))

const subjectBlockCountMap = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const item of blockStore.recentBlocks) {
    if (item.is_deleted || !item.subjectId) continue
    counts[item.subjectId] = (counts[item.subjectId] ?? 0) + 1
  }
  return counts
})

const activeSubjectBlocks = computed(() => (
  selectedSubjectId.value ? filterSubjectBlocks(blockStore.recentBlocks, selectedSubjectId.value, '') : []
))

const filteredBlocks = computed(() => (
  selectedSubjectId.value ? filterSubjectBlocks(blockStore.recentBlocks, selectedSubjectId.value, searchQuery.value) : []
))

const activeCachedStates = computed(() => (
  selectedSubjectId.value ? reviewStatesByScope.value[subjectCacheKey(selectedSubjectId.value)] : undefined
))

const hasLoadedReviewStates = computed(() => Array.isArray(activeCachedStates.value))

const activeStateByBlockId = computed(() => {
  const map = new Map<string, ReviewState>()
  for (const state of activeCachedStates.value || []) {
    if (state.knowledgeBlockId) map.set(state.knowledgeBlockId, state)
  }
  return map
})

const heroSummary = computed(() => (
  summarizeSubjectReview(
    activeSubjectBlocks.value,
    activeCachedStates.value || [],
    EMPTY_DUE_IDS,
  )
))

const canStartLearning = computed(() => Boolean(
  activeSubject.value && hasLoadedReviewStates.value && heroSummary.value.pendingLearningCount > 0,
))

const canStartReview = computed(() => Boolean(
  activeSubject.value && hasLoadedReviewStates.value && heroSummary.value.dueReviewCount > 0,
))

const canStartSelfTest = computed(() => Boolean(
  activeSubject.value && hasLoadedReviewStates.value && heroSummary.value.selfTestCount > 0,
))

const learnTileHint = computed(() => {
  if (!hasLoadedReviewStates.value) return statesLoading.value ? '状态加载中…' : '等待状态同步'
  if (heroSummary.value.unsyncedLearningCount > 0) {
    return `含 ${heroSummary.value.unsyncedLearningCount} 个离线待同步`
  }
  if (heroSummary.value.pendingLearningCount > 0) return '新知与错题重学'
  return '当前已全部学完'
})

const reviewTileHint = computed(() => {
  if (!hasLoadedReviewStates.value) return statesLoading.value ? '状态加载中…' : '等待状态同步'
  if (heroSummary.value.pendingCheckCount > 0) {
    return `待核对 ${heroSummary.value.pendingCheckCount} 个`
  }
  return '今日到期复习'
})

const selfTestTileHint = computed(() => {
  if (!hasLoadedReviewStates.value) return statesLoading.value ? '状态加载中…' : '等待状态同步'
  if (canStartSelfTest.value) return '随机抽查本学科知识块'
  return '完成初学后可随机抽查'
})

const readingBlock = computed(() => (
  readingBlockId.value
    ? blockStore.recentBlocks.find(item => !item.is_deleted && item.id === readingBlockId.value) || null
    : null
))

const isReadingBlockBusy = computed(() => (
  Boolean(readingBlock.value && blockStore.updatingBlockIds.includes(readingBlock.value.id))
))

const canSubmitBlock = computed(() => (
  Boolean(blockForm.title.trim() && blockForm.preview.trim())
))

function stageForBlock(blockId: string): BlockReviewStageBadge {
  return resolveBlockReviewStage(activeStateByBlockId.value.get(blockId), EMPTY_DUE_IDS)
}

function excerptForBlock(preview: string): string {
  return plainMarkdownExcerpt(preview || '') || '暂无正文内容'
}

useEscapeKey(() => showBlockModal.value, closeBlockModal)
useEscapeKey(() => showSubjectPicker.value && !showBlockModal.value, closeSubjectPicker)
useEscapeKey(
  () => Boolean(readingBlock.value) && !showBlockModal.value && !showSubjectPicker.value,
  closeReader,
)

async function fetchPagedStates(subjectId: string, isCurrent: () => boolean): Promise<ReviewState[] | null> {
  const collected: ReviewState[] = []
  let cursor: string | undefined
  do {
    const page = await reviewApi.states(subjectId, cursor)
    if (!isCurrent()) return null
    for (const item of page.items ?? []) {
      if (item.knowledgeBlockId) collected.push(item)
    }
    if (page.hasMore && !page.nextCursor) throw new Error('Review states cursor is missing')
    cursor = page.hasMore ? page.nextCursor : undefined
  } while (cursor)
  return collected
}

async function loadDueCounts(excludeSubjectId?: string) {
  if (!authStore.isAuthenticated || subjectStore.subjects.length === 0) {
    badgeCountMap.value = {}
    return
  }
  const targets = excludeSubjectId
    ? subjectStore.subjects.filter(sub => sub.id !== excludeSubjectId)
    : subjectStore.subjects
  if (targets.length === 0) return

  const reqId = ++badgeCountReqId
  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const entries = await Promise.all(
    targets.map(async (sub) => {
      const localBlocks = filterSubjectBlocks(blockStore.recentBlocks, sub.id, '')
      const isStillCurrent = () => (
        reqId === badgeCountReqId && isSameAuthSnapshot(generation, userId, serverDeviceId)
      )
      try {
        const states = await fetchPagedStates(sub.id, isStillCurrent)
        if (!states) return null
        void localDb.replaceSubjectReviewStates(sub.id, states).catch(() => {})
        const summary = summarizeSubjectReview(localBlocks, states, EMPTY_DUE_IDS)
        return { id: sub.id, badgeCount: summary.badgeCount }
      } catch (err) {
        const isPendingLocalSubject = (sub.version ?? 0) === 0
          && err instanceof ApiProblemError
          && (err.status === 404 || err.code === 'RESOURCE_NOT_FOUND')
        if (isPendingLocalSubject) return { id: sub.id, badgeCount: 0 }
        try {
          const [cached, loadedMarker] = await Promise.all([
            localDb.getReviewStatesBySubject(sub.id),
            localDb.hasLoadedReviewStates(sub.id),
          ])
          if (!isStillCurrent()) return null
          if (cached.length > 0 || loadedMarker) {
            const summary = summarizeSubjectReview(localBlocks, cached, EMPTY_DUE_IDS)
            return { id: sub.id, badgeCount: summary.badgeCount }
          }
        } catch {
          // Ignore local cache fallback failure
        }
        return null
      }
    }),
  )
  if (reqId !== badgeCountReqId || !isSameAuthSnapshot(generation, userId, serverDeviceId)) return
  const next: Record<string, number> = { ...badgeCountMap.value }
  for (const item of entries) {
    if (item) next[item.id] = item.badgeCount
  }
  badgeCountMap.value = next
}

async function loadActiveSubjectReview(subjectId: string) {
  if (!subjectId || !authStore.isAuthenticated) {
    statesError.value = ''
    return
  }
  const targetSubject = subjectStore.subjects.find(item => item.id === subjectId)
  const reqId = ++subjectReviewReqId
  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const cacheKey = `${userId || 'anon'}:${serverDeviceId || 'dev'}:${subjectId}`

  const isCurrent = () => (
    reqId === subjectReviewReqId
    && selectedSubjectId.value === subjectId
    && isSameAuthSnapshot(generation, userId, serverDeviceId)
  )

  statesLoading.value = true
  statesError.value = ''
  try {
    if (!Array.isArray(reviewStatesByScope.value[cacheKey])) {
      try {
        const [cached, loadedMarker] = await Promise.all([
          localDb.getReviewStatesBySubject(subjectId),
          localDb.hasLoadedReviewStates(subjectId),
        ])
        if (!isCurrent()) return
        if (cached.length > 0 || loadedMarker) {
          reviewStatesByScope.value = {
            ...reviewStatesByScope.value,
            [cacheKey]: cached,
          }
          const summary = summarizeSubjectReview(
            filterSubjectBlocks(blockStore.recentBlocks, subjectId, ''),
            cached,
            EMPTY_DUE_IDS,
          )
          badgeCountMap.value = {
            ...badgeCountMap.value,
            [subjectId]: summary.badgeCount,
          }
        }
      } catch {
        // Ignore local review cache failure and proceed to network fetch.
      }
    }

    const states = await fetchPagedStates(subjectId, isCurrent)
    if (!states || !isCurrent()) return
    void localDb.replaceSubjectReviewStates(subjectId, states).catch(() => {})
    reviewStatesByScope.value = {
      ...reviewStatesByScope.value,
      [cacheKey]: states,
    }
    const summary = summarizeSubjectReview(
      filterSubjectBlocks(blockStore.recentBlocks, subjectId, ''),
      states,
      EMPTY_DUE_IDS,
    )
    badgeCountMap.value = {
      ...badgeCountMap.value,
      [subjectId]: summary.badgeCount,
    }
  } catch (err) {
    if (!isCurrent()) return
    const isPendingLocalSubject = (targetSubject?.version ?? 0) === 0
      && err instanceof ApiProblemError
      && (err.status === 404 || err.code === 'RESOURCE_NOT_FOUND')
    if (isPendingLocalSubject) {
      statesError.value = ''
      reviewStatesByScope.value = {
        ...reviewStatesByScope.value,
        [cacheKey]: [],
      }
      return
    }
    console.warn('[Mobile Learn] Failed to load subject review state:', err)
    statesError.value = '复习状态读取失败'
  } finally {
    if (isCurrent()) statesLoading.value = false
  }
}

function reconcileActiveSubject(): boolean {
  const list = subjectStore.subjects
  if (list.length === 0) {
    selectedSubjectId.value = ''
    statesError.value = ''
    return false
  }
  if (selectedSubjectId.value && list.some(item => item.id === selectedSubjectId.value)) {
    return false
  }
  const resolvedId = resolveInitialLearnSubjectId(
    list,
    subjectStore.activeSubjectId,
    badgeCountMap.value,
  )
  selectedSubjectId.value = resolvedId
  subjectStore.setActiveSubject(resolvedId || null)
  searchQuery.value = ''
  statesError.value = ''
  return Boolean(resolvedId)
}

function refreshPageData(): Promise<void> {
  const scope = scopeKeyForAuth()
  if (refreshInFlight?.scope === scope) return refreshInFlight.promise
  const task = (async () => {
    const generation = authStore.getLoginGeneration()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    await Promise.all([
      subjectStore.loadSubjects(),
      blockStore.loadLocalBlocks(),
    ])
    if (!isSameAuthSnapshot(generation, userId, serverDeviceId)) return

    reconcileActiveSubject()
    void loadDueCounts(selectedSubjectId.value || undefined)
    if (selectedSubjectId.value) {
      void loadActiveSubjectReview(selectedSubjectId.value)
    }
  })().finally(() => {
    if (refreshInFlight?.promise === task) {
      refreshInFlight = null
    }
  })
  refreshInFlight = { scope, promise: task }
  return task
}

async function createQuickSubject() {
  if (creatingQuickSubject.value) return
  const name = quickSubjectName.value.trim()
  if (!name) {
    showToast('请输入学科名称')
    return
  }
  const generation = authStore.getLoginGeneration()
  creatingQuickSubject.value = true
  try {
    const createdId = await subjectStore.addSubject(name, '', 'other')
    if (generation !== authStore.getLoginGeneration()) return
    quickSubjectName.value = ''
    if (createdId) {
      selectedSubjectId.value = createdId
      subjectStore.setActiveSubject(createdId)
    }
    await refreshPageData()
    showToast('已创建学科')
  } catch (err) {
    if (generation !== authStore.getLoginGeneration()) return
    showToast(err instanceof Error ? err.message : '创建学科失败')
  } finally {
    if (generation === authStore.getLoginGeneration()) {
      creatingQuickSubject.value = false
    }
  }
}

function selectSubject(subjectId: string) {
  if (selectedSubjectId.value === subjectId) return
  selectedSubjectId.value = subjectId
  subjectStore.setActiveSubject(subjectId)
  searchQuery.value = ''
  readingBlockId.value = ''
  void loadActiveSubjectReview(subjectId)
}

function clearStripScrollTimer() {
  if (stripScrollTimer) {
    clearTimeout(stripScrollTimer)
    stripScrollTimer = null
  }
}

function scrollActiveSubjectToStart() {
  if (isPageUnmounted || !activeSubjectId.value) return
  const activeIdx = subjectStore.subjects.findIndex(item => item.id === activeSubjectId.value)
  const containerEl = stripScrollRef.value
  if (activeIdx < 0 || !containerEl) return

  const containerRect = containerEl.getBoundingClientRect()
  const pillEl = containerEl.querySelector(`#subject-pill-${activeIdx}`) as HTMLElement | null
  const firstPillEl = containerEl.querySelector('#subject-pill-0') as HTMLElement | null
  const pillRect = pillEl?.getBoundingClientRect() ?? null
  const firstPillRect = firstPillEl?.getBoundingClientRect() ?? null
  if (!pillRect || containerRect.width <= 0 || pillRect.width <= 0) return

  if (containerRect.bottom > 0) {
    subjectDropdownTop.value = Math.max(88, Math.round(containerRect.bottom + 6))
  }

  const currentScrollLeft = containerEl.scrollLeft
  const maxScrollLeft = Math.max(0, containerEl.scrollWidth - containerRect.width)
  const leadingInset = firstPillRect
    ? Math.max(0, (firstPillRect.left - containerRect.left) + currentScrollLeft)
    : 20
  const target = computeLeadingScrollLeft({
    containerLeft: containerRect.left,
    containerWidth: containerRect.width,
    currentScrollLeft,
    itemLeft: pillRect.left,
    leadingInset,
    maxScrollLeft,
  })

  if (Math.abs(currentScrollLeft - target) < 2) return
  if (typeof containerEl.scrollTo === 'function') {
    containerEl.scrollTo({ left: target, behavior: 'smooth' })
    return
  }
  containerEl.scrollLeft = target
}

function measureSubjectDropdownTop() {
  if (isPageUnmounted) return
  const rect = stripWrapRef.value?.getBoundingClientRect()
  if (rect && rect.bottom > 0) {
    subjectDropdownTop.value = Math.max(88, Math.round(rect.bottom + 6))
  }
}

function scheduleStripAlign(delayMs = 40) {
  clearStripScrollTimer()
  stripScrollTimer = setTimeout(() => {
    stripScrollTimer = null
    if (isPageUnmounted) return
    void nextTick(() => {
      scrollActiveSubjectToStart()
    })
  }, delayMs)
}

function toggleSubjectPicker() {
  if (showSubjectPicker.value) {
    closeSubjectPicker()
    return
  }
  if (subjectStore.subjects.length === 0) return
  measureSubjectDropdownTop()
  showSubjectPicker.value = true
}

function closeSubjectPicker() {
  showSubjectPicker.value = false
}

function selectSubjectFromPicker(subjectId: string) {
  showSubjectPicker.value = false
  if (selectedSubjectId.value !== subjectId) {
    selectSubject(subjectId)
  }
  scheduleStripAlign(40)
}

function retrySubjectReviewState() {
  if (!selectedSubjectId.value) return
  void loadActiveSubjectReview(selectedSubjectId.value)
}

function startStudyMode(mode: MobileStudyMode) {
  const subject = activeSubject.value
  if (!subject || !hasLoadedReviewStates.value) return
  if (mode === 'learn' && !canStartLearning.value) return
  if (mode === 'review' && !canStartReview.value) return
  if (mode === 'self-test' && !canStartSelfTest.value) return
  subjectStore.setActiveSubject(subject.id)
  void preloadRoute('/pages/mobile/review/index')
  navigateTo(buildMobileReviewUrl(subject.id, mode, groupSize.value))
}

function handleRightPlanCardClick() {
  if (canStartReview.value) {
    startStudyMode('review')
    return
  }
  if (canStartSelfTest.value) {
    startStudyMode('self-test')
    return
  }
  if (hasLoadedReviewStates.value) {
    showToast('完成初学后即可自由自测')
  }
}

function openReader(blockId: string) {
  copiedReading.value = false
  readingBlockId.value = blockId
}

function closeReader() {
  if (copyTimer) {
    clearTimeout(copyTimer)
    copyTimer = null
  }
  copiedReading.value = false
  readingBlockId.value = ''
}

async function copyReadingBlock() {
  const block = readingBlock.value
  if (!block) return
  const payload = block.preview ? `${block.title}\n\n${block.preview}` : block.title
  const ok = await copyTextWithFallback(payload)
  if (!ok) {
    showToast('复制失败，请长按正文复制')
    return
  }
  copiedReading.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyTimer = null
    copiedReading.value = false
  }, 1800)
}

function openCreateBlockModal() {
  if (!activeSubject.value) return
  editingBlockId.value = ''
  blockForm.title = ''
  blockForm.preview = ''
  blockForm.source = ''
  blockModalError.value = ''
  showBlockModal.value = true
}

function openEditBlockModal(block: KnowledgeBlock) {
  if (blockStore.updatingBlockIds.includes(block.id)) return
  const rawSource = (block.source || '').trim()
  editingBlockId.value = block.id
  blockForm.title = block.title
  blockForm.preview = block.preview || ''
  blockForm.source = rawSource && rawSource !== '自主整理' ? rawSource : ''
  blockModalError.value = ''
  showBlockModal.value = true
}

function closeBlockModal() {
  if (savingBlock.value) return
  showBlockModal.value = false
}

async function submitBlockModal() {
  if (savingBlock.value) return
  const subject = activeSubject.value
  const title = blockForm.title.trim()
  const preview = blockForm.preview.trim()
  if (!subject) {
    blockModalError.value = '当前暂无可用学科'
    return
  }
  if (!title) {
    blockModalError.value = '请输入知识块标题'
    return
  }
  if (!preview) {
    blockModalError.value = '请输入正文内容'
    return
  }

  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  savingBlock.value = true
  blockModalError.value = ''
  const nextSource = blockForm.source.trim()
  try {
    if (editingBlockId.value) {
      const existing = blockStore.recentBlocks.find(item => item.id === editingBlockId.value)
      if (!existing) throw new Error('知识块不存在或已被删除')
      await blockStore.updateBlock({
        ...existing,
        title,
        preview,
        source: nextSource,
        time: new Date().toISOString(),
        subject: subject.name,
        subjectId: subject.id,
      })
    } else {
      await blockStore.addBlock({
        subject: subject.name,
        subjectId: subject.id,
        title,
        preview,
        source: nextSource,
        color: '',
      })
    }
    if (!isSameAuthSnapshot(generation, userId, serverDeviceId)) return
    showBlockModal.value = false
    await subjectStore.loadSubjects()
    if (!isSameAuthSnapshot(generation, userId, serverDeviceId)) return
    showToast(editingBlockId.value ? '已保存修改' : '已保存知识块')
    void loadDueCounts()
    if (selectedSubjectId.value) void loadActiveSubjectReview(selectedSubjectId.value)
  } catch (err) {
    if (!isSameAuthSnapshot(generation, userId, serverDeviceId)) return
    blockModalError.value = err instanceof Error ? err.message : '保存失败，请重试'
  } finally {
    if (isSameAuthSnapshot(generation, userId, serverDeviceId)) {
      savingBlock.value = false
    }
  }
}

async function confirmDeleteBlock(block: KnowledgeBlock) {
  if (blockStore.updatingBlockIds.includes(block.id)) return
  const generation = authStore.getLoginGeneration()
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const confirmed = await confirmDialog({
    title: '删除知识块',
    content: `确定删除「${block.title}」？删除后将同步移除。`,
    confirmText: '删除',
    confirmTone: 'danger',
  })
  if (!confirmed || !isSameAuthSnapshot(generation, userId, serverDeviceId)) return
  try {
    await blockStore.removeBlock(block.id)
    if (!isSameAuthSnapshot(generation, userId, serverDeviceId)) return
    if (readingBlockId.value === block.id) closeReader()
    await subjectStore.loadSubjects()
    if (!isSameAuthSnapshot(generation, userId, serverDeviceId)) return
    showToast('已删除')
    void loadDueCounts()
    if (selectedSubjectId.value) void loadActiveSubjectReview(selectedSubjectId.value)
  } catch {
    if (!isSameAuthSnapshot(generation, userId, serverDeviceId)) return
    showToast('删除失败，请重试')
  }
}

watch(
  () => `${authStore.isAuthenticated ? '1' : '0'}:${scopeKeyForAuth()}`,
  (nextScope) => {
    if (lastAuthScope && lastAuthScope !== nextScope) {
      badgeCountReqId += 1
      subjectReviewReqId += 1
      refreshInFlight = null
      badgeCountMap.value = {}
      reviewStatesByScope.value = {}
      statesLoading.value = false
      statesError.value = ''
      searchQuery.value = ''
      readingBlockId.value = ''
      showSubjectPicker.value = false
      showBlockModal.value = false
      savingBlock.value = false
      editingBlockId.value = ''
      blockModalError.value = ''
      selectedSubjectId.value = ''
      if (stripScrollRef.value) {
        stripScrollRef.value.scrollLeft = 0
      }
      clearStripScrollTimer()
      if (authStore.isAuthenticated) {
        void refreshPageData()
      }
    }
    lastAuthScope = nextScope
  },
  { immediate: true },
)

watch(
  () => subjectStore.subjects,
  () => {
    const changed = reconcileActiveSubject()
    const inSameRefresh = refreshInFlight?.scope === scopeKeyForAuth()
    if (changed && !inSameRefresh && selectedSubjectId.value) {
      void loadDueCounts(selectedSubjectId.value)
      void loadActiveSubjectReview(selectedSubjectId.value)
    }
  },
  { immediate: true },
)

watch(
  [activeSubjectId, () => subjectStore.subjects.length],
  ([nextId]) => {
    if (nextId) {
      scheduleStripAlign(40)
    }
  },
  { flush: 'post' },
)

watch(
  () => syncStore.lastSyncedAt,
  (syncedAt) => {
    if (!syncedAt || !authStore.isAuthenticated) return
    void loadDueCounts(selectedSubjectId.value || undefined)
    if (selectedSubjectId.value) {
      void loadActiveSubjectReview(selectedSubjectId.value)
    }
  },
)

onPageShow(() => {
  if (!hasShownOnce) {
    hasShownOnce = true
    return
  }
  void refreshPageData().then(() => {
    if (!isPageUnmounted && activeSubjectId.value) {
      scheduleStripAlign(80)
    }
  })
})

onMounted(() => {
  isPageUnmounted = false
  void refreshPageData().then(() => {
    if (!isPageUnmounted && activeSubjectId.value) {
      scheduleStripAlign(120)
    }
  })
  stopReviewPreload = scheduleSiblingPreload(['/pages/mobile/review/index'], '/pages/mobile/learn/index', 240)
})

onUnmounted(() => {
  isPageUnmounted = true
  clearStripScrollTimer()
  stopReviewPreload?.()
  stopReviewPreload = null
  if (copyTimer) {
    clearTimeout(copyTimer)
    copyTimer = null
  }
})
</script>

<style scoped>
.learn-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.status-bar-spacer {
  height: var(--status-bar-height, 0px);
  height: max(var(--status-bar-height, 0px), env(safe-area-inset-top));
  flex-shrink: 0;
}

.top-bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 26px 20px 10px;
  padding-top: clamp(24px, 3.2vh, 34px);
  flex-shrink: 0;
}

.masthead-main-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-title {
  font-size: 24px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  letter-spacing: -0.025em;
  line-height: 1.1;
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-zen-sage);
}

.masthead-subtitle {
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  flex-shrink: 0;
}

.learn-empty-stage {
  flex: 1;
  min-height: 0;
  padding: 20px 20px var(--tabbar-clearance);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-hall-card {
  width: 100%;
  max-width: 340px;
  padding: 28px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
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
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.empty-subtitle {
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.5;
}

.empty-quick-create {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.empty-quick-input {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.empty-quick-btn {
  height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.subject-strip-wrap {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  padding-right: 20px;
  margin-bottom: 8px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.subject-strip-scroll {
  flex: 1;
  min-width: 0;
  margin-right: 6px;
  white-space: nowrap;
  mask-image: linear-gradient(90deg, transparent 0px, #000 14px, #000 calc(100% - 22px), transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0px, #000 14px, #000 calc(100% - 22px), transparent 100%);
}

.subject-strip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 22px 6px 20px;
}

.subject-pill {
  height: 34px;
  padding: 0 13px;
  border-radius: var(--radius-full);
  background-color: var(--glass-bg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-subtle);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), border-color 0.16s ease;
}

.subject-pill:active {
  transform: scale(0.96);
}

.subject-pill.active {
  background-color: var(--color-sage-dark);
  background-image: var(--accent-gradient);
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.subject-pill-name {
  font-size: 12.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.subject-pill.active .subject-pill-name {
  color: #FFFFFF;
  font-weight: var(--font-weight-bold);
}

.subject-pill-badge {
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 10.5px;
  font-weight: var(--font-weight-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.subject-pill.active .subject-pill-badge {
  background-color: rgba(255, 255, 255, 0.24);
  color: #FFFFFF;
}

.subject-expand-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  margin-top: -2px;
  border-radius: var(--radius-full);
  background-color: var(--glass-bg);
  backdrop-filter: var(--glass-blur-soft);
  -webkit-backdrop-filter: var(--glass-blur-soft);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), background-color 0.16s ease, border-color 0.16s ease;
}

.subject-expand-btn.is-open {
  background-color: var(--color-sage-bg);
  border-color: var(--border-accent);
}

.subject-expand-btn:active {
  transform: scale(0.94);
}

.learn-content {
  flex: 1;
  min-height: 0;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plan-card {
  padding: 14px 15px;
  border-radius: var(--radius-card);
  background-color: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  display: flex;
  flex-direction: column;
  gap: 11px;
  flex-shrink: 0;
}

.plan-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plan-subject-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}

.hero-icon-badge {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hero-subject-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mastery-pill {
  height: 24px;
  padding: 0 9px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.mastery-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-sage-ink);
}

.distribution-track {
  width: 100%;
  height: 6px;
  border-radius: var(--radius-full);
  background-color: rgba(45, 55, 40, 0.08);
  overflow: hidden;
  display: flex;
}

.dist-seg {
  height: 100%;
  transition: width 0.28s var(--ease-out);
}

.dist-learning {
  background-color: var(--color-warning);
}

.dist-reviewing {
  background-color: var(--color-zen-sage);
}

.dist-mastered {
  background-color: var(--color-sage-ink);
}

.plan-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.plan-tile {
  padding: 12px 13px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out);
  box-sizing: border-box;
}

.plan-tile:active {
  transform: scale(0.98);
}

.plan-tile.tile-learn {
  background-color: #EEF2E6;
  border: 1px solid #DCE3CE;
}

.plan-tile.tile-learn.is-idle {
  background-color: #F3F5EE;
  border-color: #E3E8D9;
}

.plan-tile.tile-learn.is-idle:active {
  transform: none;
}

.plan-tile.tile-review {
  background-color: #F8F4EC;
  border: 1px solid #EAE1D2;
}

.tile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.tile-label {
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.2;
}

.tile-label-learn {
  color: var(--color-sage-ink);
}

.tile-label-review {
  color: var(--color-warning-ink);
}

.tile-label-muted {
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.tile-metric-row {
  min-height: 30px;
  display: flex;
  align-items: center;
}

.tile-number {
  font-size: 26px;
  font-weight: var(--font-weight-bold);
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--text-primary);
}

.tile-number-learn {
  color: #2B3B1E;
}

.plan-tile.tile-learn.is-idle .tile-number-learn {
  color: var(--text-muted);
}

.tile-action-title {
  font-size: 18px;
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
  color: var(--text-primary);
  letter-spacing: -0.015em;
}

.tile-action-title.is-muted {
  color: var(--text-secondary);
}

.tile-foot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.tile-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-inline-action {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
  flex-shrink: 0;
  padding: 1px 2px;
}

.plan-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 1px;
}

.group-size-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.group-inline-label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.group-inline-opt {
  font-size: 11.5px;
  font-weight: var(--font-weight-medium);
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 3px;
}

.group-inline-opt.active {
  color: var(--color-sage-ink);
  font-weight: var(--font-weight-bold);
}

.group-inline-sep {
  font-size: 11px;
  color: var(--border-strong);
}

.hero-retry-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: var(--font-weight-medium);
  color: var(--color-sage-ink);
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
}

.blocks-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.blocks-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.search-box {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
}

.search-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
}

.search-clear {
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.add-block-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
}

.blocks-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 16px var(--tabbar-clearance);
}

.empty-whisper {
  font-size: 13px;
  color: var(--text-muted);
}

.empty-small-btn {
  height: 34px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
}

.blocks-scroll {
  flex: 1;
  height: 0;
  min-height: 0;
}

.blocks-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding-bottom: var(--tabbar-clearance);
}

.block-card {
  padding: 14px 16px;
  border-radius: var(--radius-card);
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 7px;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), border-color 0.16s ease;
}

.block-card:active {
  transform: scale(0.99);
}

.block-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.block-card-title {
  flex: 1;
  min-width: 0;
  font-size: 14.5px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.38;
}

.stage-pill {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
}

.stage-pill.tone-warning {
  background-color: var(--color-warning-bg);
  color: var(--color-warning-ink);
}

.stage-pill.tone-sage {
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
}

.stage-pill.tone-muted {
  background-color: rgba(45, 55, 40, 0.06);
  color: var(--text-muted);
}

.block-card-excerpt {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.block-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.block-card-meta {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.block-read-more {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-sage-ink);
  flex-shrink: 0;
}

.subject-dropdown-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  margin: 0 auto;
  padding: 0 20px 24px;
  background-color: rgba(28, 28, 26, 0.24);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  z-index: var(--z-index-sheet);
  box-sizing: border-box;
  animation: dropdownMaskIn 0.18s ease-out both;
}

@media (hover: hover) and (pointer: fine) and (min-width: 600px) {
  .subject-dropdown-mask {
    max-width: 440px;
  }
}

.subject-dropdown-panel {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  max-height: 64vh;
  max-height: 64dvh;
  padding: 16px 16px 14px;
  border-radius: 18px;
  background-color: var(--color-bg-primary, #F7F2EB);
  border: 1px solid var(--glass-border);
  box-shadow: 0 16px 40px rgba(45, 55, 40, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.88);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  transform-origin: top right;
  animation: dropdownSlideDown 0.22s var(--ease-out) both;
}

@keyframes dropdownMaskIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes dropdownSlideDown {
  0% { opacity: 0; transform: translateY(-10px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}

.picker-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.picker-title {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.picker-count-pill {
  height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  display: inline-flex;
  align-items: center;
}

.subject-picker-scroll {
  flex: 1 1 auto;
  min-height: 100px;
  max-height: 50vh;
}

.subject-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  padding-bottom: 4px;
}

.subject-grid-card {
  padding: 11px 12px;
  border-radius: 14px;
  background-color: var(--color-bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  cursor: pointer;
  transition: transform 0.14s var(--ease-out), border-color 0.16s ease, background-color 0.16s ease;
}

.subject-grid-card:active {
  transform: scale(0.975);
}

.subject-grid-card.active {
  background-color: rgba(139, 154, 110, 0.12);
  border-color: var(--color-zen-sage);
  box-shadow: 0 4px 14px rgba(118, 135, 88, 0.14);
}

.subject-grid-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.subject-grid-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background-color: var(--color-sage-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.subject-grid-icon.active {
  background-color: var(--color-sage-dark);
  background-image: var(--accent-gradient);
}

.subject-grid-indicators {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.subject-grid-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 10.5px;
  font-weight: var(--font-weight-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.subject-grid-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: var(--color-sage-dark);
  background-image: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
}

.subject-grid-name {
  font-size: 13.5px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subject-grid-card.active .subject-grid-name {
  font-weight: var(--font-weight-bold);
  color: var(--color-sage-ink);
}

.subject-grid-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.zen-sheet-body.reader-sheet-panel {
  max-height: 82vh;
  max-height: 82dvh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-primary, #F7F2EB);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.sheet-drag-bar {
  width: 34px;
  height: 4px;
  border-radius: var(--radius-full);
  background-color: var(--border-strong);
  margin: -4px auto 12px;
  flex-shrink: 0;
}

.reader-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.reader-head-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.reader-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.reader-subject-pill {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background-color: var(--color-sage-bg);
  color: var(--color-sage-ink);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
}

.reader-title {
  font-size: 17px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1.35;
}

.reader-meta {
  font-size: 11.5px;
  color: var(--text-muted);
}

.sheet-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--border-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
}

.reader-body-scroll {
  flex: 1 1 auto;
  min-height: 120px;
  max-height: 50vh;
}

.reader-body-inner {
  padding: 14px 2px;
}

.reader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.reader-copy-btn {
  flex: 1;
  height: 38px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.reader-edit-btn {
  height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.reader-delete-btn {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.learn-modal-card {
  max-width: 430px;
  max-height: 86vh;
  max-height: 86dvh;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background-color: var(--color-bg-primary, #F7F2EB);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.modal-title {
  font-size: 16px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.learn-textarea {
  min-height: 120px;
  line-height: 1.55;
}

.modal-error {
  font-size: 12px;
  color: var(--color-danger);
}

.modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.modal-capsule-btn {
  height: 36px;
  padding: 0 18px;
  border-radius: var(--radius-full);
  font-size: 13px;
}

.modal-capsule-btn::after {
  border: none;
}

@media (max-width: 390px) {
  .top-bar,
  .learn-content,
  .subject-dropdown-mask {
    padding-left: 16px;
    padding-right: 16px;
  }

  .subject-strip-wrap {
    padding-right: 16px;
  }

  .subject-strip {
    padding-left: 16px;
    padding-right: 18px;
  }
}
</style>
