<template>
  <section class="subject-review">
    <!-- 顶部状态栏 (仅在规划总览时显示) -->
    <header v-if="!round" class="subject-review__header">
      <div class="subject-review__header-left">
        <div>
          <h2>学科复习</h2>
          <p>通过回忆、核对和必要时的重新学习，逐步巩固本学科知识。</p>
        </div>
      </div>
    </header>

    <!-- 异常状态提示条 (仅在规划总览未进入复习轮次时展示，避免复习中闪现弹条) -->
    <template v-if="!round">
      <div v-if="stateError" class="subject-review__notice subject-review__notice--error" role="alert">
        <span>复习状态未完整加载：{{ stateError }}</span>
        <button type="button" :disabled="isLoading" @click="refresh">重试</button>
      </div>
      <div v-if="unsyncedBlocks.length" class="subject-review__notice" role="status">
        <span>{{ unsyncedBlocks.length }} 个本机知识块尚未同步；仍可在本机学习与复习，联网后会继续同步。</span>
        <button type="button" :disabled="syncingPending" @click="syncPendingBlocks">{{ syncingPending ? '正在同步…' : '立即同步' }}</button>
        <span v-if="syncError" role="alert">{{ syncError }}</span>
      </div>

      <div v-if="reviewSyncError" class="subject-review__notice" role="status">{{ reviewSyncError }}</div>
      <div v-for="block in conflictedBlocks" :key="`review-conflict-${block.id}`" class="subject-review__notice subject-review__notice--error" role="alert">
        <span>“{{ block.title || '未命名知识块' }}”的本机复习链与云端进度冲突。选择使用云端进度会归档未被云端接受的本机操作。</span>
        <button type="button" :disabled="adoptingCloudFor === block.id" @click="adoptCloudProgress(block.id)">
          {{ adoptingCloudFor === block.id ? '正在读取云端进度…' : '使用云端进度' }}
        </button>
        <span v-if="conflictAdoptionError" role="alert">{{ conflictAdoptionError }}</span>
      </div>

      <div v-if="localActionError" class="subject-review__notice subject-review__notice--error" role="alert">
        <span>{{ localActionError }}</span>
        <button type="button" @click="localActionError = null">关闭</button>
      </div>
    </template>

    <!-- 加载中 -->
    <div v-if="isLoading && !statesLoaded && !round" class="subject-review__empty" role="status">
      <div class="subject-review__loading-spinner"></div>
      <span>正在加载完整复习状态…</span>
    </div>

    <!-- 主展示区 -->
    <template v-else-if="statesLoaded || round">
      <!-- 1. 未进入轮次时的仪表盘视图：既饱满、又舒展的居中整合计划卡片 -->
      <div v-if="!round" class="subject-review__dashboard">
        <div class="subject-review__plan-card">
          <!-- 头部学科信息与大尺寸仪表 -->
          <div class="subject-review__plan-top">
            <div class="subject-review__plan-meta">
              <span class="subject-review__plan-badge">学科记忆规划</span>
              <h3 class="subject-review__plan-title">{{ currentSubjectName }}</h3>
              <p class="subject-review__plan-subtitle">
                共 {{ activeBlocks.length }} 个知识块
              </p>

              <!-- 知识块掌握分布：置于左侧副标题下方（一体化连续进度条样式） -->
              <div class="subject-review__segment-container">
                <div class="subject-review__segment-header">
                  <span class="subject-review__segment-title">知识块掌握分布</span>
                  <span class="subject-review__segment-meta">
                    <span class="subject-review__legend-item" :title="`待学习: ${counts.pendingLearning} 个 (${distributionPercents.learning}%)`">
                      <span class="subject-review__legend-dot subject-review__legend-dot--learning"></span>
                      待学习 {{ counts.pendingLearning }}
                    </span>
                    <span class="subject-review__legend-item" :title="`待复习: ${counts.reviewing} 个 (${distributionPercents.reviewing}%)`">
                      <span class="subject-review__legend-dot subject-review__legend-dot--reviewing"></span>
                      待复习 {{ counts.reviewing }}
                    </span>
                    <span class="subject-review__legend-item" :title="`已掌握: ${counts.mastered} 个 (${distributionPercents.mastered}%)`">
                      <span class="subject-review__legend-dot subject-review__legend-dot--mastered"></span>
                      已掌握 {{ counts.mastered }}
                    </span>
                  </span>
                </div>
                <div
                  class="subject-review__progress-track"
                  role="progressbar"
                  :aria-valuenow="counts.mastered"
                  :aria-valuemin="0"
                  :aria-valuemax="totalActiveBlocks"
                  :title="totalActiveBlocks ? `待学习 ${counts.pendingLearning} · 待复习 ${counts.reviewing} · 已掌握 ${counts.mastered}` : '暂无知识块'"
                >
                  <template v-if="totalActiveBlocks > 0">
                    <div
                      v-if="counts.pendingLearning > 0"
                      class="subject-review__progress-fill subject-review__progress-fill--learning"
                      :style="{ width: `${distributionPercents.learning}%` }"
                      :title="`待学习: ${counts.pendingLearning} 个 (${distributionPercents.learning}%)`"
                    ></div>
                    <div
                      v-if="counts.reviewing > 0"
                      class="subject-review__progress-fill subject-review__progress-fill--reviewing"
                      :style="{ width: `${distributionPercents.reviewing}%` }"
                      :title="`待复习: ${counts.reviewing} 个 (${distributionPercents.reviewing}%)`"
                    ></div>
                    <div
                      v-if="counts.mastered > 0"
                      class="subject-review__progress-fill subject-review__progress-fill--mastered"
                      :style="{ width: `${distributionPercents.mastered}%` }"
                      :title="`已掌握: ${counts.mastered} 个 (${distributionPercents.mastered}%)`"
                    ></div>
                  </template>
                  <div
                    v-else
                    class="subject-review__progress-fill subject-review__progress-fill--empty"
                  ></div>
                </div>
              </div>
            </div>

            <div class="subject-review__plan-stat-circle-group">
              <div class="subject-review__pomodoro-ring" title="学科知识块总掌握率">
                <svg class="subject-review__pomodoro-svg" viewBox="0 0 100 100">
                  <!-- 背景轨道 -->
                  <circle
                    cx="50"
                    cy="50"
                    :r="ringRadius"
                    fill="none"
                    class="subject-review__pomodoro-track"
                  />
                  <!-- 进度指示环 -->
                  <circle
                    cx="50"
                    cy="50"
                    :r="ringRadius"
                    fill="none"
                    class="subject-review__pomodoro-progress"
                    :stroke-dasharray="ringCircumference"
                    :stroke-dashoffset="ringDashOffset"
                  />
                </svg>
                <div class="subject-review__pomodoro-content">
                  <strong class="subject-review__plan-stat-number">{{ progressPct }}%</strong>
                  <div class="subject-review__pomodoro-pill">
                    <span class="subject-review__pomodoro-pill-dot"></span>
                    <span class="subject-review__pomodoro-pill-text">{{ counts.mastered }}/{{ activeBlocks.length }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部：微色调质感面板容器 -->
          <div class="subject-review__panels-container">
            <!-- 统一操作控制栏：统一提取的每组数量切换 + 自测复习入口 -->
            <div class="subject-review__panels-toolbar">
              <div class="subject-review__group-size" aria-label="下一组知识块数量">
                <span class="subject-review__group-size-label">每组</span>
                <button type="button" :class="{ active: groupSize === 5 }" @click="groupSize = 5">5 个</button>
                <button type="button" :class="{ active: groupSize === 10 }" @click="groupSize = 10">10 个</button>
              </div>

              <button
                type="button"
                class="subject-review__voluntary-btn"
                :class="{ 'is-disabled': voluntaryCount === 0 }"
                :disabled="isLoading || !statesLoaded || voluntaryCount === 0"
                :title="voluntaryCount > 0 ? `自测复习（从已学的 ${voluntaryCount} 个知识块中随机抽查 ${targetVoluntaryCount} 个）` : '暂无已学知识块可自测'"
                aria-label="自测复习入口"
                @click="startVoluntaryReview"
              >
                <span>自测复习</span>
              </button>
            </div>

            <div class="subject-review__panels-grid">
              <!-- 待学习面板 -->
              <div
                class="subject-review__panel subject-review__panel--learn"
                :class="{ 'subject-review__panel--disabled': !canStartLearning }"
                role="button"
                tabindex="0"
                @click="onPanelLearnClick"
                @keydown.enter="startLearning"
              >
                <div class="subject-review__panel-header">
                  <div class="subject-review__panel-title-group">
                    <span class="subject-review__panel-icon-wrap subject-review__panel-icon-wrap--learn">
                      <IconBook :size="18" :stroke-width="2" />
                    </span>
                    <div class="subject-review__panel-name">
                      待学习 <span class="subject-review__panel-count">· {{ statesLoaded ? counts.pendingLearning : '—' }} 个</span>
                    </div>
                  </div>
                  <div class="subject-review__panel-actions">
                    <button
                      type="button"
                      class="subject-review__action-btn subject-review__action-btn--learn"
                      :disabled="isLoading || !statesLoaded || !canStartLearning"
                      @click="startLearning"
                    >
                      <span>进入学习</span>
                      <IconChevronRight :size="11" :stroke-width="2.2" class="subject-review__btn-arrow" />
                    </button>
                  </div>
                </div>
                <div class="subject-review__panel-footer">
                  <span class="subject-review__panel-hint">包含新知导入及错题重学{{ unsyncedBlocks.length ? `（${unsyncedBlocks.length} 个待同步）` : '' }}</span>
                </div>
              </div>

              <!-- 待复习面板 -->
              <div
                class="subject-review__panel subject-review__panel--review"
                :class="{ 'subject-review__panel--disabled': !canStartReview }"
                role="button"
                tabindex="0"
                @click="onPanelReviewClick"
                @keydown.enter="startReviewing"
              >
                <div class="subject-review__panel-header">
                  <div class="subject-review__panel-title-group">
                    <span class="subject-review__panel-icon-wrap subject-review__panel-icon-wrap--review">
                      <IconRotate :size="18" :stroke-width="2" />
                    </span>
                    <div class="subject-review__panel-name">
                      待复习 <span class="subject-review__panel-count">· {{ statesLoaded ? counts.due + ' 个' : '—' }}</span>
                    </div>
                  </div>
                  <div class="subject-review__panel-actions">
                    <button
                      type="button"
                      class="subject-review__action-btn subject-review__action-btn--review"
                      :disabled="isLoading || !statesLoaded || !canStartReview"
                      @click="startReviewing"
                    >
                      <span>进入复习</span>
                      <IconChevronRight :size="11" :stroke-width="2.2" class="subject-review__btn-arrow" />
                    </button>
                  </div>
                </div>
                <div class="subject-review__panel-footer">
                  <span class="subject-review__panel-hint">
                    <template v-if="counts.due > 0">今日到期 {{ counts.due }} · 未掌握 {{ counts.pendingLearning + counts.reviewing }}</template>
                    <template v-else-if="voluntaryCount > 0">今日无到期知识块 · 可通过上方“自测复习”随机抽查自测（共 {{ voluntaryCount }} 个）</template>
                    <template v-else>暂无复习内容</template>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="subject-review__round">
        <div class="subject-review__round-nav">
          <div class="subject-review__round-nav-left">
            <button
              type="button"
              class="subject-review__btn-back"
              @click="endRound"
              title="返回规划总览"
            >
              <IconArrowLeft :size="16" :stroke-width="2.2" />
              <span>返回</span>
            </button>
            <span class="subject-review__round-progress-tag">
              {{ round.currentMode === 'FUZZY' ? `巩固 ${roundProgressCurrent} / ${round.fuzzyQueueIds?.length || 1}` : `本组 ${roundProgressCurrent} / ${round.firstGroupCount}` }}
            </span>
            <span v-if="round.currentMode === 'FUZZY'" class="subject-review__badge-consolidate">
              本轮巩固
            </span>
            <span v-if="currentState?.mastered" class="subject-review__badge-consolidate">已掌握抽查</span>
          </div>

          <div class="subject-review__round-nav-right">
            <button type="button" class="subject-review__btn-ghost" @click="endRound">
              结束本轮
            </button>
          </div>
        </div>

        <article v-if="currentBlock" class="subject-review__card" :class="{ 'subject-review__card--revealed': contentVisible }">
          <div class="subject-review__card-head">
            <div class="subject-review__card-head-left">
              <span class="subject-review__card-mode-badge">{{ round.phase.startsWith('LEARNING') ? '新知学习' : (currentState?.mastered ? '掌握抽查' : '复习自测') }}</span>
              <h3 class="subject-review__word-title">{{ currentBlock.title || '未命名知识块' }}</h3>
            </div>
            <span class="subject-review__card-progress">{{ blockProgress }}</span>
          </div>

          <div v-if="isRecallHidden" class="subject-review__recall-zone">
            <!-- 知识点核心定义毛玻璃模糊遮罩（优雅防剧透，纯净无文字干扰） -->
            <div class="subject-review__frosted-canvas">
              <div
                class="subject-review__frosted-body"
                aria-hidden="true"
                v-html="renderMarkdown(currentBlock.content || '该知识块暂无详细正文内容')"
              ></div>
              <div class="subject-review__frosted-overlay" aria-hidden="true"></div>
            </div>

            <!-- 按钮和正文中间补充提示词（严谨客观、温和舒缓） -->
            <div v-if="round.phase === 'REVIEW_RECALL'" class="subject-review__recall-hint">
              <span class="subject-review__recall-hint-dot"></span>
              <span class="subject-review__recall-hint-text">请在脑海中主动回忆该知识块的核心概念与要点，并依据提取的清晰度与完整性进行客观评估：</span>
            </div>

            <div v-if="round.phase === 'REVIEW_RECALL' && !round.pendingCommand" class="subject-review__ratings subject-review__ratings--tiled">
              <button
                v-for="rating in initialRatings"
                :key="rating.value"
                type="button"
                :class="`subject-review__rating-btn subject-review__rating-btn--${rating.value}`"
                :disabled="!canSubmitCurrentBlock"
                @click="selectRating(rating.value)"
              >
                <span class="subject-review__rating-dot"></span>
                <span>{{ rating.label }}</span>
              </button>
            </div>
            <div v-else-if="round.phase === 'FUZZY_RECALL' && !round.pendingCommand" class="subject-review__ratings">
              <button type="button" class="subject-review__reveal-text-btn subject-review__reveal-text-btn--primary" @click="revealAnswer">
                <IconEye :size="15" :stroke-width="2.2" />
                <span>展开核对</span>
              </button>
              <button type="button" class="subject-review__rating-btn subject-review__rating-btn--AGAIN" :disabled="!canSubmitCurrentBlock" @click="correctCurrentReview">
                <span class="subject-review__rating-dot"></span>
                <span>忘记了</span>
              </button>
            </div>
            <div v-else-if="!round.pendingCommand" class="subject-review__ratings">
              <button
                type="button"
                class="subject-review__reveal-text-btn subject-review__reveal-text-btn--primary"
                @click="round.phase === 'LEARNING_READ' ? beginLearningRecall() : revealAnswer()"
              >
                <span>{{ round.phase === 'LEARNING_READ' ? '开始回忆' : '展开核对' }}</span>
                <IconChevronRight :size="14" :stroke-width="2.2" />
              </button>
            </div>
          </div>

          <div v-if="contentVisible" class="subject-review__content-revealed">
            <div class="subject-review__content-body" v-html="renderMarkdown(currentBlock.content)"></div>
            <div v-if="round.phase === 'LEARNING_READ' && !round.pendingCommand" class="subject-review__ratings">
              <button
                type="button"
                class="subject-review__reveal-text-btn subject-review__reveal-text-btn--primary"
                @click="beginLearningRecall"
              >
                <span>开始回忆</span>
                <IconChevronRight :size="14" :stroke-width="2.2" />
              </button>
            </div>
          </div>


          <div v-if="round.phase === 'REVIEW_CHECK'" class="subject-review__check-bar">
            <span class="subject-review__check-tag">核对中</span>
            <span class="subject-review__check-text">请对照正文核对你的回忆：确认无误点击「下一个」，若回忆有误请点击「记错了」</span>
          </div>

          <div v-if="round.phase === 'REVIEW_CHECK' && !round.pendingCommand" class="subject-review__ratings">
            <button type="button" class="subject-review__rating-btn subject-review__rating-btn--GOOD" :disabled="!canSubmitCurrentBlock" @click="confirmCurrentReview">
              <span class="subject-review__rating-dot"></span>
              <span>下一个</span>
            </button>
            <button type="button" class="subject-review__rating-btn subject-review__rating-btn--AGAIN" :disabled="!canSubmitCurrentBlock" @click="correctCurrentReview">
              <span class="subject-review__rating-dot"></span>
              <span>记错了</span>
            </button>
          </div>

          <div v-if="round.phase === 'FUZZY_CHECK' && !round.pendingCommand" class="subject-review__ratings">
            <button type="button" class="subject-review__rating-btn subject-review__rating-btn--GOOD" @click="confirmCurrentReview">
              <span class="subject-review__rating-dot"></span>
              <span>下一个</span>
            </button>
            <button type="button" class="subject-review__rating-btn subject-review__rating-btn--AGAIN" :disabled="!canSubmitCurrentBlock" @click="correctCurrentReview">
              <span class="subject-review__rating-dot"></span>
              <span>记错了</span>
            </button>
          </div>

          <div v-if="round.phase === 'LEARNING_CHECK' && !round.pendingCommand" class="subject-review__ratings">
            <button type="button" class="subject-review__rating-btn subject-review__rating-btn--GOOD" :disabled="!canSubmitCurrentBlock" @click="completeLearning">
              <span class="subject-review__rating-dot"></span>
              <span>完成学习</span>
            </button>
            <button type="button" class="subject-review__rating-btn subject-review__rating-btn--AGAIN" @click="failLearning">
              <span class="subject-review__rating-dot"></span>
              <span>继续学习</span>
            </button>
          </div>

          <div v-if="currentState?.mastered && round.phase === 'REVIEW_RECALL' && !round.pendingCommand" class="subject-review__reopen-action">
            <button type="button" class="subject-review__btn-ghost" @click="reopenMasteredBlock">重新学习这块</button>
          </div>

        </article>

        <div v-else-if="!localBlocksLoadedForCurrentSubject || currentLocalBlocksLoadError" class="subject-review__card subject-review__card--milestone" :role="currentLocalBlocksLoadError ? 'alert' : 'status'">
          <h3 class="subject-review__milestone-title">
            {{ currentLocalBlocksLoadError ? '无法读取本地知识块' : '正在加载本地知识块…' }}
          </h3>
          <p v-if="currentLocalBlocksLoadError" class="subject-review__milestone-desc">
            {{ currentLocalBlocksLoadError }}
          </p>
          <div v-if="currentLocalBlocksLoadError" class="subject-review__milestone-actions">
            <button type="button" class="subject-review__primary" :disabled="isLoading" @click="refresh">
              <span>重试读取</span>
            </button>
          </div>
        </div>
        <div v-else-if="roundHasNoRenderableBlock" class="subject-review__card subject-review__card--milestone" role="alert">
          <h3 class="subject-review__milestone-title">本轮没有可复习知识块</h3>
          <p class="subject-review__milestone-desc">无法显示空轮次的完成结果，请返回规划后重新开始。</p>
          <div class="subject-review__milestone-actions">
            <button type="button" class="subject-review__primary" @click="endRound">
              <span>返回规划</span>
              <IconChevronRight :size="16" :stroke-width="2.2" />
            </button>
          </div>
        </div>
        <div v-else-if="round.remainingIds.length" class="subject-review__card subject-review__card--milestone">
          <div class="subject-review__milestone-icon">
            <IconCircleCheck :size="28" :stroke-width="2.2" />
          </div>
          <h3 class="subject-review__milestone-title">
            {{ isLearningRound ? '本组内容已学完' : '本组复习已完成' }}
          </h3>
          <p class="subject-review__milestone-desc">
            {{ isLearningRound ? `本轮还剩 ${round.remainingIds.length} 个知识点待学习。` : `本轮还剩 ${round.remainingIds.length} 个知识点待复习。` }}
          </p>
          <div class="subject-review__milestone-actions">
            <button type="button" class="subject-review__primary" @click="reviewStore.nextLifecycleGroup(subjectId)">
              <span>继续下一组（{{ Math.min(round.groupSize, round.remainingIds.length) }} 个）</span>
              <IconChevronRight :size="16" :stroke-width="2.2" />
            </button>
            <button type="button" class="subject-review__btn-ghost" @click="endRound">返回规划</button>
          </div>
        </div>
        <div v-else class="subject-review__card subject-review__card--milestone">
          <div class="subject-review__milestone-icon">
            <IconCircleCheck :size="32" :stroke-width="2.2" />
          </div>
          <h3 class="subject-review__milestone-title">
            {{ isLearningRound ? '本次学习已完成' : '本轮复习已完成' }}
          </h3>
          <p class="subject-review__milestone-desc">
            {{ isLearningRound ? `本次共学习 ${roundCompletedCount} 个知识点。` : `本次共复习 ${roundCompletedCount} 个知识点。` }}
          </p>
          <div class="subject-review__milestone-actions">
            <button type="button" class="subject-review__primary" @click="endRound">
              <span>完成并返回</span>
              <IconChevronRight :size="16" :stroke-width="2.2" />
            </button>
          </div>
        </div>

        <section v-if="firstFeedbackRows.length" class="subject-review__round-summary subject-review__round-summary--hidden" aria-label="本轮首次反馈结果">
          <p class="subject-review__summary-lead">
            首次选择：忘记 {{ firstFeedbackCounts.AGAIN }} · 模糊 {{ firstFeedbackCounts.HARD }} · 认识 {{ firstFeedbackCounts.GOOD }}
          </p>
          <ul class="subject-review__summary-list">
            <li v-for="item in firstFeedbackRows" :key="item.blockId" class="subject-review__summary-item">
              <span class="subject-review__summary-item-text">
                 {{ item.title }} · 首次 {{ ratingLabel(item.selectedRating) }} · 当前结果 {{ ratingLabel(item.rating) }} · 下次 {{ item.dueAt }} · 稳定 {{ item.stableSuccessCount }}/3 · {{ item.consolidation }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/useAuthStore'
import {
  useReviewStore,
  type LifecycleBlockProgress,
  type LifecycleReviewStateModel,
} from '@/store/useReviewStore'
import { useStatsStore } from '@/store/useStatsStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { useSyncStore } from '@/store/useSyncStore'
import type { LifecycleRating } from '@/api/useReviewApi'
import type { KnowledgeBlockView } from '@/api/useKnowledgeApi'
import type { SourceView } from '@/api/useSourceApi'
import type { SubjectView } from '@/api/useSubjectApi'
import { getLocalRepository } from '@/services/localDb'
import { subscribeProjectionChange } from '@/services/localProjectionEvents'
import { mapKnowledgeBlockView, type KnowledgeBlockModel } from '@/services/domainMappers'
import { renderMarkdown } from '@/utils/markdown'
import { IconBook, IconRotate, IconChevronRight, IconArrowLeft, IconEye, IconCircleCheck } from '@tabler/icons-vue'

const props = defineProps<{ subjectId: string }>()
const authStore = useAuthStore()
const reviewStore = useReviewStore()
const statsStore = useStatsStore()
const subjectStore = useSubjectStore()
const syncStore = useSyncStore()
const { reviewSyncError } = storeToRefs(syncStore)

const {
  subjectStatesBySubjectId,
  subjectStatesLoadedBySubjectId,
  subjectStatesLoadingBySubjectId,
  subjectStatesErrorBySubjectId,
  lifecycleRoundsBySubjectId,
  reviewConflictsBySubjectId,
} = storeToRefs(reviewStore)

const groupSize = computed<5 | 10>({
  get: () => reviewStore.getGroupSize(props.subjectId),
  set: (value) => reviewStore.setGroupSize(props.subjectId, value),
})

const localBlocks = ref<KnowledgeBlockModel[]>([])
const localBlocksLoadedScope = ref<{ subjectId: string; identity: string } | null>(null)
const localBlocksLoadFailure = ref<{ subjectId: string; identity: string; message: string } | null>(null)
let localLoadVersion = 0
const unsyncedIds = ref<string[]>([])
const syncingPending = ref(false)
const syncError = ref<string | null>(null)
let syncPendingGeneration = 0
let clockTimer: ReturnType<typeof setInterval> | null = null
const now = ref(Date.now())
const localActionError = ref<string | null>(null)
const hashingBlockId = ref<string | null>(null)
const adoptingCloudFor = ref<string | null>(null)
const conflictAdoptionError = ref<string | null>(null)

function asKnowledgeBlockDto(value: unknown): KnowledgeBlockView | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as KnowledgeBlockView
  return typeof candidate.id === 'string' ? candidate : null
}

async function loadLocalBlocks(userId: string, deviceId: string, subjectId: string): Promise<KnowledgeBlockModel[]> {
  const repo = await getLocalRepository(userId, deviceId)
  const [rows, sourceRows, subjectRows] = await Promise.all([
    repo.list<KnowledgeBlockView>('KNOWLEDGE_BLOCK', { includeDeleted: false }),
    repo.list<SourceView>('SOURCE', { includeDeleted: false }),
    repo.list<SubjectView>('SUBJECT', { includeDeleted: false }),
  ])
  const sourceTitles = new Map(sourceRows.flatMap((row) => {
    const source = row.value
    return source?.id && source.title ? [[source.id, source.title] as const] : []
  }))
  const subjectNames = new Map(subjectRows.flatMap((row) => {
    const subject = row.value
    return subject?.id && subject.name ? [[subject.id, subject.name] as const] : []
  }))
  return rows
    .map((row) => asKnowledgeBlockDto(row.value))
    .filter((value): value is KnowledgeBlockView => value !== null && value.subjectId === subjectId)
    .map((value) => mapKnowledgeBlockView(
      value,
      value.sourceId ? sourceTitles.get(value.sourceId) : undefined,
      value.subjectId ? subjectNames.get(value.subjectId) : undefined,
    ))
}

const currentSubject = computed(() => subjectStore.subjects.find((subject) => subject.id === props.subjectId))
const currentSubjectName = computed(() => currentSubject.value?.name || '学科复习')
const activeBlocks = computed(() => localBlocks.value.filter((block) => block.id && block.subjectId === props.subjectId))
const activeIds = computed(() => activeBlocks.value.map((block) => block.id))
const states = computed(() => subjectStatesBySubjectId.value[props.subjectId] ?? [])
const stateById = computed(() => new Map(states.value.map((state) => [state.knowledgeBlockId, state])))
const statesLoaded = computed(() => subjectStatesLoadedBySubjectId.value[props.subjectId] === true)
const isLoading = computed(() => subjectStatesLoadingBySubjectId.value[props.subjectId] === true)
const stateError = computed(() => subjectStatesErrorBySubjectId.value[props.subjectId] ?? null)
const localBlocksLoadedForCurrentSubject = computed(() => localBlocksLoadedScope.value?.subjectId === props.subjectId
  && localBlocksLoadedScope.value.identity === accountKey())
const currentLocalBlocksLoadError = computed(() => {
  const failure = localBlocksLoadFailure.value
  return failure?.subjectId === props.subjectId && failure.identity === accountKey() ? failure.message : null
})



const round = computed(() => lifecycleRoundsBySubjectId.value[props.subjectId] ?? null)
const isLearningRound = computed(() => round.value?.phase.startsWith('LEARNING') ?? false)
const currentBlock = computed(() => {
  const id = round.value?.currentKnowledgeBlockId
  return id ? activeBlocks.value.find((block) => block.id === id) ?? null : null
})
const roundHasNoRenderableBlock = computed(() => {
  const activeRound = round.value
  if (!activeRound || !localBlocksLoadedForCurrentSubject.value || currentLocalBlocksLoadError.value) return false
  if (activeRound.currentKnowledgeBlockId) return !currentBlock.value
  if (activeRound.queue.length) return true
  return !activeRound.remainingIds.length
    && !activeRound.completedIds.length
    && !activeRound.fuzzyCompletedIds.length
})
const currentState = computed<LifecycleReviewStateModel | null>(() => {
  const id = round.value?.currentKnowledgeBlockId
  return id ? stateById.value.get(id) ?? null : null
})
const unsyncedBlocks = computed(() => activeBlocks.value.filter((block) => unsyncedIds.value.includes(block.id)))
const conflictedBlocks = computed(() => {
  const ids = new Set(reviewConflictsBySubjectId.value[props.subjectId] ?? [])
  return activeBlocks.value.filter((block) => ids.has(block.id))
})
const isRecallHidden = computed(() => ['REVIEW_RECALL', 'LEARNING_RECALL', 'FUZZY_RECALL'].includes(round.value?.phase ?? ''))
const contentVisible = computed(() => ['REVIEW_CHECK', 'LEARNING_READ', 'LEARNING_CHECK', 'FUZZY_CHECK'].includes(round.value?.phase ?? ''))
const initialRatings: Array<{ value: LifecycleRating; label: string }> = [
  { value: 'GOOD', label: '认识' },
  { value: 'HARD', label: '模糊' },
  { value: 'AGAIN', label: '忘记了' },
]

function categoryFor(blockId: string): 'pending-learning' | 'reviewing' | 'mastered' {
  const state = stateById.value.get(blockId)
  if (!state || state.needsLearning) return 'pending-learning'
  if (state.mastered) return 'mastered'
  return 'reviewing'
}

const counts = computed(() => {
  const pendingLearning = activeBlocks.value.filter((block) => categoryFor(block.id) === 'pending-learning').length
  const reviewingBlocks = activeBlocks.value.filter((block) => categoryFor(block.id) === 'reviewing')
  const mastered = activeBlocks.value.filter((block) => categoryFor(block.id) === 'mastered').length
  const due = reviewingBlocks.filter((block) => {
    const state = stateById.value.get(block.id)
    const dueAt = Date.parse(state?.dueAt ?? '')
    return Number.isFinite(dueAt) && dueAt <= now.value
  }).length
  return { pendingLearning, reviewing: reviewingBlocks.length, mastered, due }
})

const learningBlocks = computed(() => {
  if (!statesLoaded.value) return []
  return activeBlocks.value.filter((block) => {
    return categoryFor(block.id) === 'pending-learning'
  })
})

const dueReviewBlocks = computed(() => {
  if (!statesLoaded.value) return []
  return activeBlocks.value.filter((block) => {
    if (categoryFor(block.id) !== 'reviewing') return false
    const dueAt = Date.parse(stateById.value.get(block.id)?.dueAt ?? '')
    return Number.isFinite(dueAt) && dueAt <= now.value
  }).sort((left, right) => Date.parse(stateById.value.get(left.id)?.dueAt ?? '') - Date.parse(stateById.value.get(right.id)?.dueAt ?? ''))
})



const canStartLearning = computed(() => {
  if (isLoading.value || !statesLoaded.value) return false
  return learningBlocks.value.length > 0 || (unsyncedBlocks.value.length > 0 && counts.value.pendingLearning > 0)
})

const voluntaryReviewBlocks = computed(() => {
  if (!statesLoaded.value) return []
  return activeBlocks.value.filter((block) => categoryFor(block.id) !== 'pending-learning')
})

const voluntaryCount = computed(() => voluntaryReviewBlocks.value.length)

const targetVoluntaryCount = computed(() => {
  if (!voluntaryCount.value) return 0
  return Math.min(groupSize.value, voluntaryCount.value)
})

const canStartReview = computed(() => {
  if (isLoading.value || !statesLoaded.value) return false
  return dueReviewBlocks.value.length > 0
})


const progressPct = computed(() => {
  if (activeBlocks.value.length === 0) return 0
  return Math.min(100, Math.round((counts.value.mastered / activeBlocks.value.length) * 100))
})

const ringRadius = 42
const ringCircumference = 2 * Math.PI * ringRadius
const ringDashOffset = computed(() => {
  const pct = Math.max(0, Math.min(100, progressPct.value))
  return ringCircumference * (1 - pct / 100)
})



const totalActiveBlocks = computed(() => activeBlocks.value.length)

const distributionPercents = computed(() => {
  const total = totalActiveBlocks.value
  if (!total) {
    return { mastered: 0, reviewing: 0, learning: 0 }
  }
  const m = (counts.value.mastered / total) * 100
  const r = (counts.value.reviewing / total) * 100
  const l = Math.max(0, 100 - m - r)
  return {
    mastered: Number(m.toFixed(1)),
    reviewing: Number(r.toFixed(1)),
    learning: Number(l.toFixed(1)),
  }
})


const roundProgressCurrent = computed(() => {
  if (!round.value) return 1
  if (round.value.currentMode === 'FUZZY' && round.value.fuzzyQueueIds?.length) {
    const total = round.value.fuzzyQueueIds.length
    const done = Math.max(0, total - round.value.queue.length)
    return Math.min(done + 1, total)
  }
  if (!round.value) return 1
  const total = Math.max(1, round.value.firstGroupCount)
  const done = Math.max(0, total - round.value.queue.length)
  return Math.min(done + 1, total)
})
const roundCompletedCount = computed(() => {
  if (!round.value) return 0
  return new Set([...round.value.completedIds, ...round.value.fuzzyCompletedIds]).size
})
const blockProgress = computed(() => {
  if (!round.value) return ''
  const isFuzzy = round.value.currentMode === 'FUZZY'
  const total = isFuzzy && round.value.fuzzyQueueIds?.length ? round.value.fuzzyQueueIds.length : Math.max(1, round.value.firstGroupCount)
  const prefix = isFuzzy ? '巩固 ' : '本组 '
  const position = prefix + roundProgressCurrent.value + ' / ' + total
  return currentState.value?.mastered ? position + ' · 已掌握抽查' : position
})
const canSubmitCurrentBlock = computed(() => {
  const block = currentBlock.value
  const activeRound = round.value
  if (!block || !activeRound || !activeRound.scopeTicket.isCurrent()) return false
  if (hashingBlockId.value === block.id) return false
  if (!statesLoaded.value && !states.value.length) return false
  if (activeRound.knowledgeBlockVersions[block.id] !== block.version) return false
  return !currentState.value || currentState.value.knowledgeBlockVersion === block.version
})
const firstFeedbackRows = computed(() => {
  const activeRound = round.value
  if (!activeRound) return []
  return Object.entries(activeRound.progressByBlock).map(([blockId, progress]: [string, LifecycleBlockProgress]) => ({
    blockId,
    title: activeBlocks.value.find((block) => block.id === blockId)?.title || '已移除知识块',
    rating: progress.rating,
    selectedRating: progress.selectedRating,
    dueAt: formatDueAt(progress.dueAt || progress.state.dueAt),
    stableSuccessCount: progress.state.stableSuccessCount,
    consolidation: consolidationStatus(blockId),
  }))
})
const firstFeedbackCounts = computed(() => {
  const result: Record<LifecycleRating, number> = { AGAIN: 0, HARD: 0, GOOD: 0 }
  for (const row of firstFeedbackRows.value) result[row.selectedRating] += 1
  return result
})

function accountKey(): string {
  return JSON.stringify([authStore.user?.id ?? null, authStore.serverDeviceId ?? null, authStore.sessionId ?? null])
}

async function checkUnsyncedBlocks(identity = accountKey(), subjectId = props.subjectId, version = localLoadVersion): Promise<void> {
  const userId = authStore.user?.id
  const deviceId = authStore.serverDeviceId
  if (!userId || !deviceId || !authStore.isAuthenticated) {
    unsyncedIds.value = []
    return
  }
  const repo = await getLocalRepository(userId, deviceId)
  const active = new Set(localBlocks.value.filter((block) => block.subjectId === subjectId).map((block) => block.id))
  const unresolved = await repo.listUnresolved('KNOWLEDGE_BLOCK')
  if (accountKey() !== identity || props.subjectId !== subjectId || localLoadVersion !== version) return
  unsyncedIds.value = [...new Set(unresolved.filter((mutation) => active.has(mutation.resourceId)).map((mutation) => mutation.resourceId))]
}

async function refresh(): Promise<void> {
  const subjectId = props.subjectId
  const identity = accountKey()
  const version = ++localLoadVersion
  localBlocksLoadFailure.value = null
  const isCurrentLoad = () => localLoadVersion === version && props.subjectId === subjectId && accountKey() === identity
  const userId = authStore.user?.id
  const deviceId = authStore.serverDeviceId
  if (!userId || !deviceId || !authStore.isAuthenticated) {
    if (isCurrentLoad()) {
      localBlocksLoadFailure.value = { subjectId, identity, message: '复习材料需要已登录的用户和设备' }
    }
    return
  }

  let blocks: KnowledgeBlockModel[]
  try {
    blocks = await loadLocalBlocks(userId, deviceId, subjectId)
  } catch (error) {
    if (isCurrentLoad()) {
      localBlocksLoadFailure.value = {
        subjectId,
        identity,
        message: error instanceof Error ? error.message : '读取本地知识块失败，请重试。',
      }
    }
    return
  }
  if (!isCurrentLoad()) return

  localBlocksLoadFailure.value = null
  localBlocksLoadedScope.value = { subjectId, identity }
  localBlocks.value = blocks
  reviewStore.reconcileSubjectBlocks(subjectId, blocks.map((block) => block.id))

  try {
    await checkUnsyncedBlocks(identity, subjectId, version)
    if (!isCurrentLoad()) return
    await reviewStore.loadSubjectStates(subjectId)
    if (!isCurrentLoad()) return
    await reviewStore.loadSubjectReviewConflicts(subjectId)
  } catch {
    // Review-state failures are exposed by the store's scoped status.
  }
}

async function adoptCloudProgress(knowledgeBlockId: string): Promise<void> {
  const subjectId = props.subjectId
  const identity = accountKey()
  adoptingCloudFor.value = knowledgeBlockId
  conflictAdoptionError.value = null
  try {
    await reviewStore.adoptCloudReviewProgress(subjectId, knowledgeBlockId)
    if (props.subjectId !== subjectId || accountKey() !== identity) return
    statsStore.invalidateSubjectStats(subjectId)
    await refresh()
  } catch (error) {
    if (props.subjectId === subjectId && accountKey() === identity) {
      conflictAdoptionError.value = error instanceof Error ? error.message : '无法读取云端复习进度；本机记录仍已保留。'
    }
  } finally {
    if (adoptingCloudFor.value === knowledgeBlockId) adoptingCloudFor.value = null
  }
}

async function syncPendingBlocks(): Promise<void> {
  const identity = accountKey()
  const subjectId = props.subjectId
  const version = ++syncPendingGeneration
  syncingPending.value = true
  syncError.value = null
  try {
    await syncStore.flushNow()
    if (accountKey() !== identity || props.subjectId !== subjectId || version !== syncPendingGeneration) return
    statsStore.invalidateSubjectStats(subjectId)
    await refresh()
    if (accountKey() !== identity || props.subjectId !== subjectId || version !== syncPendingGeneration) return
    if (unsyncedIds.value.length) syncError.value = '仍有知识块未同步，请检查同步状态后重试。'
  } catch (error) {
    if (accountKey() === identity && props.subjectId === subjectId && version === syncPendingGeneration) {
      syncError.value = error instanceof Error ? error.message : '同步失败，请重试。'
    }
  } finally {
    if (version === syncPendingGeneration) syncingPending.value = false
  }
}

async function startLearning(): Promise<void> {
  localActionError.value = null
  if (!statesLoaded.value) {
    localActionError.value = '正在加载复习状态，请稍候…'
    return
  }
  if (!learningBlocks.value.length) {
    localActionError.value = '当前暂无待学习知识块（新导入或错题重学）。'
    return
  }
  try {
    reviewStore.startLifecycleRound({
      subjectId: props.subjectId,
      knowledgeBlocks: learningBlocks.value.map((block) => ({ id: block.id, version: block.version })),
      groupSize: groupSize.value,
      now: new Date(now.value),
    })
  } catch (error) {
    localActionError.value = error instanceof Error ? error.message : '无法进入学习。'
  }
}

async function startVoluntaryReview(): Promise<void> {
  localActionError.value = null
  if (!statesLoaded.value) {
    localActionError.value = '正在加载复习状态，请稍候…'
    return
  }
  if (!voluntaryReviewBlocks.value.length) {
    localActionError.value = '当前学科暂无可供自主抽查复习的知识块。'
    return
  }
  try {
    reviewStore.endLifecycleRound(props.subjectId, true)
    if (lifecycleRoundsBySubjectId.value[props.subjectId]) {
      delete lifecycleRoundsBySubjectId.value[props.subjectId]
      lifecycleRoundsBySubjectId.value = { ...lifecycleRoundsBySubjectId.value }
    }

    const pool = [...voluntaryReviewBlocks.value]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const count = Math.min(groupSize.value, pool.length)
    const selectedBlocks = pool.slice(0, count)
    const roundGroupSize: 5 | 10 = groupSize.value
    const startedRound = reviewStore.startLifecycleRound({
      subjectId: props.subjectId,
      knowledgeBlocks: selectedBlocks.map((block) => {
        const state = stateById.value.get(block.id)
        return {
          id: block.id,
          version: typeof block.version === 'number' && Number.isInteger(block.version) && block.version >= 0
            ? block.version
            : (state?.knowledgeBlockVersion ?? 1),
        }
      }),
      groupSize: roundGroupSize,
      now: new Date(now.value),
      manualMode: 'VOLUNTARY',
      manualBlockIds: selectedBlocks.map((block) => block.id),
    })
    const expectedCount = Math.min(roundGroupSize, selectedBlocks.length)
    const activeRound = reviewStore.getLifecycleRound(props.subjectId)
    const validRound = activeRound?.roundId === startedRound.roundId
      && startedRound.queue.length === expectedCount
      && startedRound.firstGroupCount === expectedCount
      && startedRound.currentKnowledgeBlockId === startedRound.queue[0]
      && selectedBlocks.some((block) => block.id === startedRound.currentKnowledgeBlockId)
      && activeBlocks.value.some((block) => block.id === startedRound.currentKnowledgeBlockId)
    if (!validRound) {
      if (lifecycleRoundsBySubjectId.value[props.subjectId]?.roundId === startedRound.roundId) {
        reviewStore.endLifecycleRound(props.subjectId, true)
      }
      localActionError.value = '自测复习未能启动：本轮知识块数量与所选不一致，请重新加载复习状态后重试。'
    }
  } catch (error) {
    localActionError.value = error instanceof Error ? error.message : '无法进入自测复习。'
  }
}


async function startReviewing(): Promise<void> {
  localActionError.value = null
  if (!statesLoaded.value) {
    localActionError.value = '正在加载复习状态，请稍候…'
    return
  }
  if (dueReviewBlocks.value.length > 0) {
    try {
      reviewStore.startLifecycleRound({
        subjectId: props.subjectId,
        knowledgeBlocks: dueReviewBlocks.value.map((block) => ({ id: block.id, version: block.version })),
        groupSize: groupSize.value,
        now: new Date(now.value),
      })
    } catch (error) {
      localActionError.value = error instanceof Error ? error.message : '无法进入复习。'
    }
  } else {
    localActionError.value = '当前暂无到期的待复习知识块。可使用旁边的“自测复习”进行提前自测或抽查巩固。'
  }
}

function onPanelLearnClick(e?: MouseEvent): void {
  if (e && (e.target as HTMLElement)?.closest('.subject-review__action-btn')) return
  if (e && (e.target as HTMLElement)?.closest('.subject-review__group-size')) return
  void startLearning()
}

function onPanelReviewClick(e?: MouseEvent): void {
  if (e && (e.target as HTMLElement)?.closest('.subject-review__action-btn')) return
  if (e && (e.target as HTMLElement)?.closest('.subject-review__group-size')) return
  if (e && (e.target as HTMLElement)?.closest('.subject-review__voluntary-entry')) return
  if (!canStartReview.value) return
  void startReviewing()
}

function elapsedSeconds(): number {
  const startedAt = round.value?.currentStartedAt
  return startedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)) : 0
}

async function sha256ExactContent(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function withCurrentContentHash<T>(action: (contentHash: string) => Promise<T> | T | void): Promise<void> {
  const subjectId = props.subjectId
  const identity = accountKey()
  const activeRound = round.value
  const block = currentBlock.value
  const content = block?.content
  const blockId = block?.id
  const phase = activeRound?.phase
  if (!canSubmitCurrentBlock.value || !activeRound || !block || content === undefined || !blockId || !phase) {
    return
  }
  const roundId = activeRound.roundId
  const blockVersion = block.version
  hashingBlockId.value = blockId
  localActionError.value = null
  try {
    const contentHash = await sha256ExactContent(content)
    const latestRound = round.value
    const latestBlock = currentBlock.value
    if (accountKey() !== identity || props.subjectId !== subjectId || latestRound?.roundId !== roundId
      || latestRound.currentKnowledgeBlockId !== blockId || latestRound.phase !== phase
      || latestBlock?.version !== blockVersion || latestBlock.content !== content) return
    const result = await action(contentHash)
    if (result !== undefined && props.subjectId === subjectId && accountKey() === identity) {
      statsStore.invalidateSubjectStats(subjectId)
    }
  } catch (error) {
    if (props.subjectId === subjectId && accountKey() === identity && round.value?.roundId === roundId) {
      localActionError.value = error instanceof Error ? error.message : '操作未能确认，请原样重试。'
    }
  } finally {
    if (hashingBlockId.value === blockId) {
      hashingBlockId.value = null
    }
  }
}

async function selectRating(rating: LifecycleRating): Promise<void> {
  await withCurrentContentHash((contentHash) => reviewStore.selectLifecycleRating(
    props.subjectId,
    rating,
    contentHash,
    elapsedSeconds(),
  ))
}

async function confirmCurrentReview(): Promise<void> {
  if (round.value?.phase === 'FUZZY_CHECK') {
    try {
      reviewStore.confirmLifecycleReview(props.subjectId, '')
    } catch (error) {
      localActionError.value = error instanceof Error ? error.message : '无法完成末尾巩固。'
    }
    return
  }
  await withCurrentContentHash((contentHash) => reviewStore.confirmLifecycleReview(props.subjectId, contentHash))
}

async function correctCurrentReview(): Promise<void> {
  await withCurrentContentHash((contentHash) => reviewStore.correctLifecycleReview(props.subjectId, contentHash))
}

function beginLearningRecall(): void {
  localActionError.value = null
  reviewStore.beginLifecycleRecall(props.subjectId)
}

function revealAnswer(): void {
  localActionError.value = null
  reviewStore.revealLifecycleAnswer(props.subjectId)
}

function failLearning(): void {
  localActionError.value = null
  reviewStore.failLifecycleLearning(props.subjectId)
}

async function completeLearning(): Promise<void> {
  await withCurrentContentHash((contentHash) => reviewStore.completeLifecycleLearning(props.subjectId, contentHash))
}

async function reopenMasteredBlock(): Promise<void> {
  await withCurrentContentHash((contentHash) => reviewStore.reopenCurrentLearning(props.subjectId, contentHash))
}
async function retryPending(): Promise<void> {
  const subjectId = props.subjectId
  const identity = accountKey()
  try {
    await reviewStore.retryLifecyclePending(subjectId)
    if (props.subjectId === subjectId && accountKey() === identity) statsStore.invalidateSubjectStats(subjectId)
  } catch {
    // quiet retry
  }
}

async function reconfirmPending(): Promise<void> {
  const subjectId = props.subjectId
  const identity = accountKey()
  const activeRound = round.value
  const block = currentBlock.value
  const pending = activeRound?.pendingCommand
  if (!activeRound || !block || !pending) return
  const roundId = activeRound.roundId
  try {
    const contentHash = await sha256ExactContent(block.content)
    const latestPending = round.value?.pendingCommand
    if (accountKey() !== identity || props.subjectId !== subjectId || round.value?.roundId !== roundId
      || latestPending?.request.clientCommandId !== pending.request.clientCommandId
      || latestPending.request.contentHash !== contentHash || currentBlock.value?.content !== block.content) {
      return
    }
    await reviewStore.reconfirmLifecyclePending(subjectId)
    if (props.subjectId === subjectId && accountKey() === identity) statsStore.invalidateSubjectStats(subjectId)
  } catch {
    // quiet reconfirm
  }
}

function endRound(): void {
  localActionError.value = null
  try {
    reviewStore.endLifecycleRound(props.subjectId, true)
  } catch {
    // ignore
  }
  if (lifecycleRoundsBySubjectId.value[props.subjectId]) {
    delete lifecycleRoundsBySubjectId.value[props.subjectId]
    lifecycleRoundsBySubjectId.value = { ...lifecycleRoundsBySubjectId.value }
  }
}

function ratingLabel(value?: string | null): string {
  return ({ AGAIN: '忘记', HARD: '模糊', GOOD: '认识', EASY: '熟练', SKIP: '跳过' } as Record<string, string>)[value ?? ''] ?? '未选择'
}

function formatDueAt(value?: string): string {
  if (!value) return '未安排'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : '日期未知'
}

function consolidationStatus(blockId: string): string {
  const currentRound = round.value
  if (!currentRound) return '状态未知'
  if (currentRound.fuzzyCompletedIds.includes(blockId)) return '已完成末尾巩固'
  if (currentRound.fuzzyQueueIds.includes(blockId)) return '末尾巩固中'
  if (currentRound.fuzzyPendingIds.includes(blockId)) return '等待末尾巩固'
  if (currentRound.completedIds.includes(blockId)) return '已完成本组'
  if (currentRound.queue.includes(blockId) || currentRound.remainingIds.includes(blockId)) return '仍在本轮'
  return '状态未知'
}

watch(activeIds, (ids) => {
  if (!localBlocksLoadedForCurrentSubject.value) return
  reviewStore.reconcileSubjectBlocks(props.subjectId, ids)
  void checkUnsyncedBlocks().catch(() => undefined)
})

watch(() => props.subjectId, () => {
  localActionError.value = null
  void refresh()
})

watch(
  () => [round.value?.phase, round.value?.fuzzyPendingIds.length, round.value?.pendingCommand] as const,
  ([phase, fuzzyCount, pendingCommand]) => {
    if (phase === 'GROUP_COMPLETE' && Number(fuzzyCount) > 0 && !pendingCommand) {
      reviewStore.nextLifecycleGroup(props.subjectId)
    }
  },
  { immediate: true, flush: 'sync' }
)

watch(accountKey, () => {
  syncPendingGeneration += 1
  syncingPending.value = false
  syncError.value = null
  localLoadVersion += 1
  localBlocks.value = []
  localBlocksLoadedScope.value = null
  localBlocksLoadFailure.value = null
  unsyncedIds.value = []
  localActionError.value = null
  if (authStore.isAuthenticated) void refresh()
})

let stopProjectionListener: (() => void) | null = null

onMounted(() => {
  clockTimer = setInterval(() => { now.value = Date.now() }, 30_000)
  stopProjectionListener = subscribeProjectionChange((change) => {
    if (change.resourceTypes.has('KNOWLEDGE_BLOCK') || change.resourceTypes.has('SOURCE')
      || change.resourceTypes.has('SUBJECT') || change.resourceTypes.has('REVIEW_STATE')) {
      void refresh()
    }
  })
  window.addEventListener('auralis-review-local-updated', onLocalReviewUpdated)
  void refresh()
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  stopProjectionListener?.()
  window.removeEventListener('auralis-review-local-updated', onLocalReviewUpdated)
})

function onLocalReviewUpdated(event: Event): void {
  const detail = (event as CustomEvent<{ subjectId?: string; userId?: string; deviceId?: string }>).detail
  if (!detail || detail.subjectId !== props.subjectId || detail.userId !== authStore.user?.id
    || detail.deviceId !== authStore.serverDeviceId) return
  statsStore.invalidateSubjectStats(props.subjectId)
  void refresh()
}

defineExpose({
  retryPending,
  reconfirmPending,
})
</script>

<style scoped>
.subject-review {
  display: flex;
  height: 100%;
  flex-direction: column;
  gap: 20px;
  overflow: auto;
  padding: 24px 32px 36px;
  color: var(--text-primary);
  background: var(--color-bg-primary);
  position: relative;
}

/* 顶部标题栏 */
.subject-review__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.subject-review__header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.subject-review__btn-back {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--color-bg-card) !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: var(--radius-full) !important;
  padding: 7px 16px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  color: var(--text-secondary) !important;
  cursor: pointer;
  transition: all var(--transition-fast) !important;
  flex-shrink: 0;
}

.subject-review__btn-back:hover:not(:disabled) {
  background: var(--color-bg-secondary) !important;
  border-color: var(--border-default) !important;
  color: var(--text-primary) !important;
  transform: translateX(-2px);
}

.subject-review__header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.subject-review__header p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.subject-review button {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: inherit;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.subject-review button:hover:not(:disabled) {
  border-color: var(--border-default);
  background: var(--color-bg-card);
}

.subject-review button:active:not(:disabled) {
  transform: scale(0.98);
}

.subject-review button:disabled {
  cursor: default;
  opacity: 0.55;
}

.subject-review__btn-subtle {
  border-radius: var(--radius-full) !important;
  padding: 6px 16px !important;
  font-size: 12px !important;
}

.subject-review__btn-ghost {
  background: transparent !important;
  border-color: transparent !important;
  color: var(--text-muted) !important;
  font-size: 14px !important;
  padding: 7px 16px !important;
  border-radius: var(--radius-full) !important;
}

.subject-review__btn-ghost:hover:not(:disabled) {
  background: var(--color-bg-secondary) !important;
  color: var(--text-primary) !important;
}

/* 提示条 */
.subject-review__notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  padding: 11px 16px;
  font-size: 13px;
}

.subject-review__notice--error {
  border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

/* 1. 仪表盘计划总览：既饱满、又舒展的居中整合计划卡片（占据页面七至八成，宽度增加，高度舒适） */
.subject-review__dashboard {
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(84%, 1500px);
  min-width: min(100%, 860px);
  margin: 16px auto;
}

.subject-review__plan-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: clamp(480px, 60vh, 660px);
  border: 1px solid var(--border-subtle);
  border-radius: 28px;
  background: var(--color-bg-card);
  padding: 48px 64px;
  box-shadow: 0 10px 32px -12px color-mix(in srgb, var(--text-primary) 6%, transparent);
  position: relative;
  overflow: hidden;
  width: 100%;
}

/* 顶部左右两端视觉对称与充裕留白 */
.subject-review__plan-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 64px;
  width: 100%;
}

.subject-review__plan-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  max-width: 640px;
}

.subject-review__plan-badge {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--color-zen-sage) 12%, transparent);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  margin-bottom: 10px;
  letter-spacing: 0.03em;
}

.subject-review__plan-title {
  margin: 0 0 10px;
  font-size: 38px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  line-height: 1.25;
}

.subject-review__plan-subtitle {
  margin: 0;
  font-size: 15.5px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.01em;
}

.subject-review__plan-stat-circle-group {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 番茄钟式大圆环掌握度仪表：放大尺寸与字号 */
.subject-review__pomodoro-ring {
  position: relative;
  width: 196px;
  height: 196px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.subject-review__pomodoro-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.subject-review__pomodoro-track {
  stroke: color-mix(in srgb, var(--color-zen-sage) 12%, var(--border-subtle));
  stroke-width: 5.6;
}

.subject-review__pomodoro-progress {
  stroke: var(--color-zen-sage);
  stroke-width: 6.4;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.subject-review__pomodoro-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
}

.subject-review__plan-stat-number {
  font-size: 42px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

/* 番茄钟胶囊药丸指示器 */
.subject-review__pomodoro-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--color-bg-secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.subject-review__pomodoro-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-zen-sage);
}

.subject-review__pomodoro-pill-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  line-height: 1.2;
}

html.dark .subject-review__pomodoro-pill {
  background: var(--color-bg-secondary);
  border-color: rgba(163, 177, 155, 0.2);
}

/* 2. 现代「分段胶囊进度条」(Segmented Bar) - 移至左侧副标题下方 */
.subject-review__segment-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 28px;
  width: 100%;
  max-width: 540px;
}

.subject-review__segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13.5px;
}

.subject-review__segment-title {
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
}

.subject-review__segment-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--text-muted);
  font-size: 12px;
}

.subject-review__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: default;
}

.subject-review__legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full, 9999px);
  flex-shrink: 0;
}

.subject-review__legend-dot--learning {
  background: #88929E;
}

.subject-review__legend-dot--reviewing {
  background: #C49A6C;
}

.subject-review__legend-dot--mastered {
  background: var(--color-zen-sage, #8B9A6E);
}

/* 进度条轨道与填充段 */
.subject-review__progress-track {
  display: flex;
  align-items: center;
  height: 8px;
  width: 100%;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 8%, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, transparent);
  overflow: hidden;
  position: relative;
}

html.dark .subject-review__progress-track {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
}

.subject-review__progress-fill {
  height: 100%;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

.subject-review__progress-fill--learning {
  background: #88929E;
}

.subject-review__progress-fill--reviewing {
  background: #C49A6C;
}

.subject-review__progress-fill--mastered {
  background: var(--color-zen-sage, #8B9A6E);
}

.subject-review__progress-fill--empty {
  width: 100%;
  background: transparent;
}

/* 3. 底部横向面板容器与操作工具栏 (待学习 vs 待复习) */
.subject-review__panels-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: 28px;
}

.subject-review__panels-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 12px;
}

.subject-review__panels-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  width: 100%;
}

.subject-review__panel-outer {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.subject-review__panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 22px 26px;
  border-radius: 16px;
  border: 1.5px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  background: var(--color-bg-tertiary, #FAF7F2);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  min-height: 112px;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.03),
    0 4px 16px -3px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  user-select: none;
}

html.dark .subject-review__panel {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.09);
  box-shadow: 0 4px 18px -2px rgba(0, 0, 0, 0.35);
}

.subject-review__panel--disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.subject-review__panel:hover:not(.subject-review__panel--disabled) {
  border-color: rgba(139, 154, 110, 0.5);
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.04),
    0 10px 24px -4px rgba(0, 0, 0, 0.09),
    0 3px 8px -1px rgba(139, 154, 110, 0.15);
  transform: translateY(-2px);
}

.subject-review__panel:active:not(.subject-review__panel--disabled) {
  transform: translateY(0);
}

.subject-review__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.subject-review__panel-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.subject-review__panel-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.subject-review__panel-icon-wrap--learn {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted, #7A7A75);
}

html.dark .subject-review__panel-icon-wrap--learn {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.subject-review__panel-icon-wrap--review {
  background: rgba(139, 154, 110, 0.16);
  color: #728258;
}

html.dark .subject-review__panel-icon-wrap--review {
  background: rgba(163, 177, 155, 0.2);
  color: var(--color-zen-sage);
}

.subject-review__panel-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.subject-review__panel-count {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-muted, #7A7A75);
}

/* 自测复习一体化微操作栏：精致、轻盈、克制的高级分段控件 */
.subject-review__voluntary-combo {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 3px;
  border-radius: 8px;
  background: var(--color-bg-primary, #FFFFFF);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.03),
    0 3px 10px -2px rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  z-index: 2;
}

html.dark .subject-review__voluntary-combo {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
}

/* 右侧自测复习触发按钮：与左侧统一每组题量开关高度/风格协调的微操作胶囊 */
.subject-review__voluntary-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  background: var(--color-bg-primary, #FFFFFF);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  color: #4A5E30;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.03),
    0 3px 10px -2px rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  flex-shrink: 0;
  line-height: 1;
}

html.dark .subject-review__voluntary-btn {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.08);
  color: #A3B19B;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
}

.subject-review__voluntary-btn:hover:not(:disabled) {
  background: rgba(139, 154, 110, 0.12);
  border-color: rgba(139, 154, 110, 0.35);
  color: #384A22;
  transform: translateY(-0.5px);
  box-shadow: 0 2px 8px rgba(139, 154, 110, 0.18);
}

html.dark .subject-review__voluntary-btn:hover:not(:disabled) {
  background: rgba(163, 177, 155, 0.18);
  border-color: rgba(163, 177, 155, 0.38);
  color: #BFCCB8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.subject-review__voluntary-btn:active:not(:disabled) {
  transform: translateY(0);
  background: rgba(139, 154, 110, 0.22);
  box-shadow: none;
}

html.dark .subject-review__voluntary-btn:active:not(:disabled) {
  background: rgba(163, 177, 155, 0.26);
}

.subject-review__voluntary-btn:disabled,
.subject-review__voluntary-btn.is-disabled {
  opacity: 0.42;
  cursor: not-allowed;
  pointer-events: none;
  transform: none !important;
  box-shadow: none !important;
}

.subject-review__panel-footer {
  margin-top: 12px;
}

.subject-review__panel-hint {
  font-size: 12px;
  color: var(--text-muted, #7A7A75);
  line-height: 1.4;
}

/* 面板右上角操作区（进入按钮） */
.subject-review__panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.subject-review__group-size {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 28px;
  padding: 2px 4px 2px 10px;
  background: var(--color-bg-primary, #FFFFFF);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.03),
    0 3px 10px -2px rgba(0, 0, 0, 0.04);
  font-size: 11.5px;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

html.dark .subject-review__group-size {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
}

.subject-review__group-size-label {
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
  margin-right: 2px;
}

.subject-review__group-size button {
  border: 1px solid transparent !important;
  background: transparent !important;
  padding: 2px 8px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  line-height: 1.3 !important;
  border-radius: 5px !important;
  color: var(--text-muted) !important;
  cursor: pointer;
  transition: all 0.15s ease !important;
}

.subject-review__group-size button:hover:not(.active) {
  color: var(--text-primary) !important;
  background: rgba(0, 0, 0, 0.04) !important;
}

html.dark .subject-review__group-size button:hover:not(.active) {
  background: rgba(255, 255, 255, 0.08) !important;
}

.subject-review__group-size button.active {
  background: var(--color-bg-tertiary, #FAF7F2) !important;
  color: var(--text-primary) !important;
  font-weight: 700 !important;
  border-color: var(--border-subtle, rgba(0, 0, 0, 0.08)) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important;
}

html.dark .subject-review__group-size button.active {
  background: #383632 !important;
  color: var(--text-primary) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3) !important;
}



/* 面板右上角内嵌动作按钮：立体高浮空、显式粗边框与饱满多层投影 */
.subject-review__action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 13px;
  height: 27px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  flex-shrink: 0;
}

.subject-review__action-btn:focus-visible {
  outline: 2px solid var(--color-zen-sage);
  outline-offset: 2px;
}

/* 进入学习与进入复习：纯白/深色微卡片小胶囊，精致禅意，杜绝大面积色块 */
.subject-review__action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  height: 29px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: var(--color-bg-card, #FFFFFF);
  border: 1.5px solid var(--border-subtle, rgba(0, 0, 0, 0.1));
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  flex-shrink: 0;
}

html.dark .subject-review__action-btn {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.subject-review__action-btn:hover:not(:disabled) {
  border-color: var(--border-default);
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.06);
}

.subject-review__action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.subject-review__btn-arrow {
  transition: transform var(--transition-fast);
}

.subject-review__action-btn:hover:not(:disabled) .subject-review__btn-arrow {
  transform: translateX(2px);
}

/* 2. 沉浸式卡片复习视图：整体占用页面的七成到八成左右，宽度更舒展，高度舒适自然 */
.subject-review__round {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: min(84%, 1500px);
  min-width: min(100%, 860px);
  margin: 16px auto;
  flex: 1;
}

.subject-review__round-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 8px;
}

.subject-review__round-nav-left,
.subject-review__round-nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.subject-review__round-progress-tag {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--color-bg-card);
  padding: 7px 16px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  letter-spacing: 0.02em;
}

.subject-review__badge-consolidate {
  font-size: 12.5px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--color-zen-sage) 16%, transparent);
  padding: 5px 12px;
  border-radius: var(--radius-full);
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* 卡片容器：高度自然收紧，宽度加宽饱满，整体比例和谐占据七至八成 */
.subject-review__card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: 28px;
  background: var(--color-bg-card);
  padding: 48px 64px 40px;
  box-shadow: 0 10px 36px -10px color-mix(in srgb, var(--text-primary) 6%, transparent);
  position: relative;
  min-height: clamp(520px, 64vh, 720px);
  width: 100%;
  transition: all var(--transition-normal);
}

/* 卡片头部：放大上层文字与展开留白 */
.subject-review__card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 24px;
}

.subject-review__card-head-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subject-review__card-mode-badge {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-subtle);
  padding: 5px 14px;
  border-radius: var(--radius-full);
  width: fit-content;
  letter-spacing: 0.04em;
}

.subject-review__word-title {
  margin: 0;
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: var(--text-primary);
  line-height: 1.3;
}

.subject-review__card-progress {
  color: var(--text-muted);
  font-size: 15px;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid var(--border-subtle);
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

/* A. 初见回忆区：严格左对齐，与卡片顶部标题保持一致的垂直视觉基准线 */
.subject-review__recall-zone {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 1;
  gap: 18px;
  padding: 8px 0 0;
  text-align: left;
  width: 100%;
}

/* 核心要点毛玻璃卡片：拉长延展，优雅防剧透，纯净无文字干扰，柔和层次阴影 */
.subject-review__frosted-canvas {
  position: relative;
  width: 100%;
  border-radius: 20px;
  border: 1.5px solid var(--border-subtle);
  background: var(--color-bg-secondary);
  box-shadow: 0 10px 32px -6px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  min-height: 280px;
  max-height: 380px;
  flex: 1;
  display: flex;
  flex-direction: column;
  user-select: none;
}

html.dark .subject-review__frosted-canvas {
  box-shadow: 0 12px 36px -6px rgba(0, 0, 0, 0.55), 0 2px 10px rgba(0, 0, 0, 0.35);
}

.subject-review__frosted-body {
  padding: 28px 36px;
  font-size: 15px;
  line-height: 1.85;
  color: var(--text-secondary);
  filter: blur(7.5px);
  opacity: 0.5;
  user-select: none;
  pointer-events: none;
  overflow: hidden;
  max-height: 380px;
  text-align: left;
}

.subject-review__frosted-body :deep(h1),
.subject-review__frosted-body :deep(h2),
.subject-review__frosted-body :deep(h3),
.subject-review__frosted-body :deep(p),
.subject-review__frosted-body :deep(li) {
  margin: 0 0 10px;
  color: var(--text-primary);
}

.subject-review__frosted-overlay {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  background: color-mix(in srgb, var(--color-bg-card) 55%, transparent);
  pointer-events: none;
}

html.dark .subject-review__frosted-overlay {
  background: color-mix(in srgb, var(--color-bg-secondary) 60%, transparent);
}

/* 回忆提示语：柔和浅灰色文字，舒缓安静 */
.subject-review__recall-hint {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: auto;
  padding: 4px 4px 2px;
  color: color-mix(in srgb, var(--text-muted) 85%, transparent);
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: 0.02em;
}

html.dark .subject-review__recall-hint {
  color: rgba(255, 255, 255, 0.42);
}

.subject-review__recall-hint-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.5;
  flex-shrink: 0;
}

.subject-review__recall-hint-text {
  line-height: 1.5;
}

/* 核对指示条：纯净白底、极简温润，杜绝突兀的大面积绿底色块 */
.subject-review__check-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--color-bg-card, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, transparent);
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.04);
  width: 100%;
}

html.dark .subject-review__check-bar {
  background: var(--color-bg-secondary, #252422);
  border-color: rgba(255, 255, 255, 0.09);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.subject-review__check-tag {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-zen-sage, #8B9A6E);
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 10%, #FFFFFF);
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, transparent);
  padding: 2.5px 9px;
  border-radius: var(--radius-full, 9999px);
  flex-shrink: 0;
}

html.dark .subject-review__check-tag {
  background: color-mix(in srgb, var(--color-zen-sage) 18%, #252422);
  border-color: color-mix(in srgb, var(--color-zen-sage) 35%, transparent);
}

.subject-review__check-text {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
  letter-spacing: 0.01em;
}

/* 按钮操作栏：通用样式 */
.subject-review__ratings {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 18px;
  padding-top: 8px;
  width: 100%;
}

/* 三个评分按钮平铺自适应最底端 */
.subject-review__ratings--tiled {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  width: 100%;
  margin-top: 0;
  padding-top: 2px;
}

.subject-review__ratings--tiled .subject-review__rating-btn {
  width: 100%;
  min-width: 0;
  height: 52px;
  font-size: 16px !important;
  padding: 0 16px !important;
  justify-content: center;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04) !important;
}

html.dark .subject-review__ratings--tiled .subject-review__rating-btn {
  box-shadow: 0 4px 18px -2px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3) !important;
}

/* 核心评分交互按钮（白底宣纸微卡片，立体悬浮柔和阴影） */
.subject-review__rating-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 48px;
  padding: 0 38px !important;
  border-radius: 9999px !important;
  font-size: 15.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0.03em;
  background: var(--color-bg-card, #FFFFFF) !important;
  border: 1.5px solid var(--border-subtle, rgba(0, 0, 0, 0.1)) !important;
  color: var(--text-primary) !important;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  position: relative;
  min-width: 130px;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04) !important;
  user-select: none;
}

html.dark .subject-review__rating-btn {
  background: var(--color-bg-secondary, #252422) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: var(--text-primary) !important;
  box-shadow: 0 4px 18px -2px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3) !important;
}

.subject-review__rating-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.subject-review__rating-btn:hover:not(:disabled) .subject-review__rating-dot {
  transform: scale(1.3);
}

/* 认识 / 下一个 / 完成学习 (GOOD - 禅绿指示点，立体悬浮阴影) */
.subject-review__rating-btn--GOOD .subject-review__rating-dot {
  background: var(--color-zen-sage, #8B9A6E);
}

.subject-review__rating-btn--GOOD:hover:not(:disabled) {
  border-color: rgba(139, 154, 110, 0.6) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-card, #FFFFFF) !important;
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(139, 154, 110, 0.22), 0 3px 8px -1px rgba(0, 0, 0, 0.06) !important;
}

html.dark .subject-review__rating-btn--GOOD:hover:not(:disabled) {
  border-color: var(--color-zen-sage) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-secondary, #252422) !important;
  box-shadow: 0 8px 24px -3px rgba(139, 154, 110, 0.35), 0 3px 8px rgba(0, 0, 0, 0.4) !important;
}

/* 模糊 (HARD - 暖琥珀指示点) */
.subject-review__rating-btn--HARD .subject-review__rating-dot {
  background: var(--color-warning, #E6A23C);
}

.subject-review__rating-btn--HARD:hover:not(:disabled) {
  border-color: rgba(230, 162, 60, 0.6) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-card, #FFFFFF) !important;
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(230, 162, 60, 0.22), 0 3px 8px -1px rgba(0, 0, 0, 0.06) !important;
}

html.dark .subject-review__rating-btn--HARD:hover:not(:disabled) {
  border-color: var(--color-warning) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-secondary, #252422) !important;
  box-shadow: 0 8px 24px -3px rgba(230, 162, 60, 0.35), 0 3px 8px rgba(0, 0, 0, 0.4) !important;
}

/* 忘记了 / 记错了 / 继续学习 (AGAIN - 珊瑚红指示点) */
.subject-review__rating-btn--AGAIN .subject-review__rating-dot {
  background: var(--color-danger, #E57373);
}

.subject-review__rating-btn--AGAIN:hover:not(:disabled) {
  border-color: rgba(229, 115, 115, 0.6) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-card, #FFFFFF) !important;
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(229, 115, 115, 0.22), 0 3px 8px -1px rgba(0, 0, 0, 0.06) !important;
}

html.dark .subject-review__rating-btn--AGAIN:hover:not(:disabled) {
  border-color: var(--color-danger) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-secondary, #252422) !important;
  box-shadow: 0 8px 24px -3px rgba(229, 115, 115, 0.35), 0 3px 8px rgba(0, 0, 0, 0.4) !important;
}

.subject-review__rating-btn:active:not(:disabled) {
  transform: scale(0.97) !important;
}

.subject-review__rating-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* 展开核对 / 开始回忆操作按钮（保持白底宣纸禅意卡片质感，立体阴影） */
.subject-review__reveal-text-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 48px;
  padding: 0 38px !important;
  border-radius: 9999px !important;
  font-size: 15.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0.03em;
  background: var(--color-bg-card, #FFFFFF) !important;
  border: 1.5px solid var(--border-subtle, rgba(0, 0, 0, 0.1)) !important;
  color: var(--text-primary) !important;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04) !important;
  user-select: none;
}

html.dark .subject-review__reveal-text-btn {
  background: var(--color-bg-secondary, #252422) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25) !important;
}

.subject-review__reveal-text-btn:hover {
  border-color: var(--border-default) !important;
  transform: translateY(-2px);
  box-shadow: 0 8px 22px -3px rgba(0, 0, 0, 0.12), 0 3px 8px -1px rgba(0, 0, 0, 0.06) !important;
}

html.dark .subject-review__reveal-text-btn:hover {
  background: var(--color-bg-secondary, #252422) !important;
  box-shadow: 0 8px 24px -3px rgba(0, 0, 0, 0.6), 0 3px 8px rgba(0, 0, 0, 0.4) !important;
}

.subject-review__reveal-text-btn--primary {
  border-color: var(--border-subtle) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-card, #FFFFFF) !important;
}

html.dark .subject-review__reveal-text-btn--primary {
  color: var(--text-primary) !important;
  background: var(--color-bg-secondary, #252422) !important;
}

.subject-review__reveal-text-btn--primary:hover {
  border-color: var(--border-default) !important;
  color: var(--text-primary) !important;
  background: var(--color-bg-card, #FFFFFF) !important;
}

/* 重新学习额外动作栏 */
.subject-review__reopen-action {
  display: flex;
  justify-content: center;
  padding-top: 12px;
}

/* B. 揭晓详情内容 */
.subject-review__content-revealed {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-height: 360px;
  gap: 32px;
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.subject-review__content-body {
  max-height: 60vh;
  overflow: auto;
  overflow-wrap: anywhere;
  line-height: 1.95;
  font-size: 16.5px;
  letter-spacing: 0.025em;
  padding: 18px 10px;
}

.subject-review__content-body :deep(p) {
  margin-bottom: 1.15em;
  letter-spacing: 0.025em;
  line-height: 1.95;
}

.subject-review__content-body :deep(li) {
  margin-bottom: 0.55em;
  letter-spacing: 0.02em;
  line-height: 1.85;
}

.subject-review__content-body :deep(h1),
.subject-review__content-body :deep(h2),
.subject-review__content-body :deep(h3),
.subject-review__content-body :deep(h4) {
  letter-spacing: 0.025em;
  margin-top: 1.25em;
  margin-bottom: 0.6em;
}

.subject-review__content-body :deep(img),
.subject-review__content-body :deep(pre) {
  max-width: 100%;
  overflow: auto;
}

.subject-review__skip {
  margin-left: auto;
  border-radius: var(--radius-full) !important;
  padding: 8px 18px !important;
  background: transparent !important;
  border-color: var(--border-subtle) !important;
  color: var(--text-muted) !important;
  font-size: 12px !important;
}

.subject-review__skip:hover {
  border-color: var(--border-default) !important;
  color: var(--text-primary) !important;
}

/* 历史记录 */
.subject-review__history {
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
}

.subject-review__history ul {
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  color: var(--text-muted);
  font-size: 13px;
}

/* 总结与空态 */
.subject-review__card--milestone {
  margin: auto !important;
  width: min(90%, 580px) !important;
  max-width: 580px !important;
  min-height: auto !important;
  padding: 56px 44px 50px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  gap: 16px !important;
  border-radius: 28px !important;
  background: var(--color-bg-card, #FFFFFF) !important;
  border: 1px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 35%, transparent) !important;
  box-shadow: 0 16px 48px -12px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, rgba(0, 0, 0, 0.08)), 0 4px 16px -2px rgba(0, 0, 0, 0.04) !important;
  animation: milestoneFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes milestoneFadeIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.subject-review__milestone-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-full, 9999px);
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 12%, #FFFFFF);
  border: 1.5px solid color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 40%, transparent);
  color: var(--color-zen-sage, #8B9A6E);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
  box-shadow: 0 4px 16px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 24%, transparent);
}

html.dark .subject-review__milestone-icon {
  background: color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 20%, #252422);
}

.subject-review__card--milestone .subject-review__milestone-title {
  margin: 0;
  font-size: 22px !important;
  font-weight: 800 !important;
  letter-spacing: -0.02em;
  color: var(--text-primary) !important;
  line-height: 1.35;
}

.subject-review__milestone-desc {
  margin: 0 0 10px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-muted);
  max-width: 440px;
}

.subject-review__milestone-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.subject-review__primary {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  height: 48px !important;
  padding: 0 36px !important;
  border-radius: 9999px !important;
  background: var(--color-zen-sage, #8B9A6E) !important;
  border: none !important;
  color: #FFFFFF !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em;
  cursor: pointer !important;
  box-shadow: 0 4px 16px -2px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 45%, transparent), 0 2px 6px -1px rgba(0, 0, 0, 0.06) !important;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.subject-review__primary:hover {
  transform: translateY(-2px) !important;
  filter: brightness(1.06) !important;
  box-shadow: 0 8px 24px -3px color-mix(in srgb, var(--color-zen-sage, #8B9A6E) 55%, transparent), 0 3px 8px -1px rgba(0, 0, 0, 0.08) !important;
}

.subject-review__primary:active {
  transform: translateY(0) !important;
}

.subject-review__round-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
}

.subject-review__summary-lead {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.subject-review__summary-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.subject-review__summary-item {
  font-size: 13px;
  color: var(--text-muted);
  padding: 5px 0;
  border-bottom: 1px dashed var(--border-subtle);
}

.subject-review__summary-item:last-child {
  border-bottom: none;
}

.subject-review__empty {
  display: grid;
  gap: 12px;
  padding: 40px 16px;
  color: var(--text-muted);
  text-align: center;
  align-items: center;
  justify-items: center;
}

.subject-review__empty p {
  margin: 0;
}

.subject-review__error {
  color: var(--color-danger);
  font-size: 12px;
  margin: 6px 0 0;
}

.subject-review__loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-subtle);
  border-top-color: var(--color-zen-sage);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.subject-review__round-summary--hidden {
  display: none !important;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
