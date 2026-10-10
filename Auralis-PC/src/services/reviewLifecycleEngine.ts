import type {
  LifecycleStateView,
  LifecycleAction,
  LifecycleRating,
  NextReviewStage,
  LifecycleCommandResponse,
  EffectiveReviewView,
} from '@/api/useReviewApi'

export interface ReviewSchedulingBaseline {
  dueAt: string | null
  mastered: boolean
  stableSuccessCount: number
  nextReviewStage: NextReviewStage
  lastPracticeAt: string | null
  stability: number
}

export interface LifecycleEngineOptions {
  reviewId?: string
  selectedRating?: LifecycleRating | null
  selectedAt?: string | null
  schedulingBaseline?: ReviewSchedulingBaseline | null
  previousEffectiveReview?: EffectiveReviewView | null
}

function makeUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function addDuration(value: string, milliseconds: number): string {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d\d:\d\d$)/)?.[1] ?? ''
  const subMillisecond = fraction.length > 3 ? fraction.slice(3, 9) : ''
  const result = new Date(Date.parse(value) + milliseconds).toISOString()
  return subMillisecond ? result.replace(/\.(\d{3})Z$/, `.$1${subMillisecond}Z`) : result
}

function addDays(value: string, days: number): string {
  return addDuration(value, days * 24 * 60 * 60 * 1000)
}

function addMinutes(value: string, minutes: number): string {
  return addDuration(value, minutes * 60 * 1000)
}

function instantMicros(value: string): bigint {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d\d:\d\d$)/)?.[1] ?? ''
  const subMillisecond = (fraction + '000000').slice(3, 6)
  return BigInt(Date.parse(value)) * 1000n + BigInt(subMillisecond)
}

function baselineFor(state: LifecycleStateView): ReviewSchedulingBaseline {
  return {
    dueAt: state.dueAt ?? null,
    mastered: state.mastered,
    stableSuccessCount: state.stableSuccessCount,
    nextReviewStage: state.nextReviewStage,
    lastPracticeAt: state.lastPracticeAt,
    stability: Number((state as LifecycleStateView & { stability?: number }).stability ?? 0),
  }
}

function applyRating(
  state: LifecycleStateView,
  rating: LifecycleRating,
  occurredAt: string,
  baseline: ReviewSchedulingBaseline,
): void {
  state.lastPracticeAt = occurredAt
  state.stability = baseline.stability
  if (rating === 'AGAIN') {
    state.dueAt = addMinutes(occurredAt, 10)
    state.needsLearning = true
    state.mastered = false
    state.stableSuccessCount = 0
    state.nextReviewStage = 'EARLY_RECALL'
  } else if (rating === 'HARD') {
    state.dueAt = addDays(occurredAt, 1)
    state.needsLearning = false
    state.mastered = false
    state.stableSuccessCount = 0
    state.nextReviewStage = 'CROSS_DAY'
  } else {
    state.needsLearning = false
    state.mastered = baseline.mastered
    state.stableSuccessCount = baseline.stableSuccessCount
    if (baseline.mastered) {
      state.dueAt = baseline.dueAt ?? state.dueAt
      state.nextReviewStage = null
    } else if (baseline.nextReviewStage === 'EARLY_RECALL') {
      state.dueAt = addDays(occurredAt, 3)
      state.nextReviewStage = 'CROSS_DAY'
    } else if (baseline.dueAt && instantMicros(occurredAt) < instantMicros(baseline.dueAt)) {
      state.dueAt = baseline.stableSuccessCount >= 3 ? addDays(occurredAt, 30) : baseline.dueAt
      state.nextReviewStage = baseline.stableSuccessCount >= 3
        ? 'FINAL_VERIFICATION'
        : baseline.nextReviewStage ?? 'CROSS_DAY'
    } else {
      state.stableSuccessCount = Math.min(3, baseline.stableSuccessCount + 1)
      const intervalDays = baseline.stableSuccessCount === 0 ? 7 : baseline.stableSuccessCount === 1 ? 14 : 30
      state.dueAt = addDays(occurredAt, intervalDays)
      state.mastered = baseline.stableSuccessCount >= 3 && (!baseline.lastPracticeAt
        || instantMicros(occurredAt) >= instantMicros(addDays(baseline.lastPracticeAt, 30)))
      state.nextReviewStage = state.mastered ? null : baseline.stableSuccessCount >= 2 ? 'FINAL_VERIFICATION' : 'CROSS_DAY'
    }
  }
}

export class ReviewLifecycleEngine {
  static processCommand(
    currentState: LifecycleStateView | null,
    kbId: string,
    action: LifecycleAction,
    rating: LifecycleRating | null,
    occurredAt: string,
    clientCommandId: string,
    baseVersion: number,
    knowledgeBlockVersion: number,
    contentHash: string,
    options: LifecycleEngineOptions = {},
  ): LifecycleCommandResponse {
    const state: LifecycleStateView & { stability?: number; reps?: number; lapses?: number } = currentState
      ? { ...currentState }
      : {
          knowledgeBlockId: kbId,
          dueAt: occurredAt,
          version: baseVersion,
          knowledgeBlockVersion,
          needsLearning: true,
          mastered: false,
          stableSuccessCount: 0,
          nextReviewStage: null,
          lastPracticeAt: null,
          lastReviewId: null,
          pendingReviewId: null,
          contentHash,
          stability: 0,
          reps: 0,
          lapses: 0,
        }
    const before = options.schedulingBaseline ?? baselineFor(state)
    const reviewId = options.reviewId ?? state.pendingReviewId ?? makeUuid()
    let effectiveReview: EffectiveReviewView | null = null

    if (action === 'LEARNING_COMPLETED') {
      state.needsLearning = false
      state.mastered = false
      state.stableSuccessCount = 0
      state.pendingReviewId = null
      if (currentState) {
        state.dueAt = addMinutes(occurredAt, 10)
        state.nextReviewStage = 'EARLY_RECALL'
      } else {
        state.dueAt = addDays(occurredAt, 3)
        state.nextReviewStage = 'CROSS_DAY'
      }
      state.lastPracticeAt = occurredAt
    } else if (action === 'LEARNING_REOPENED') {
      state.needsLearning = true
      state.mastered = false
      state.stableSuccessCount = 0
      state.nextReviewStage = 'EARLY_RECALL'
      state.dueAt = occurredAt
      state.lastReviewId = options.reviewId ?? null
      state.pendingReviewId = null
      effectiveReview = options.previousEffectiveReview ?? null
    } else if (action === 'REVIEW_SELECTED') {
      if (!rating) throw new Error('复习初选缺少评分。')
      state.lastReviewId = reviewId
      effectiveReview = {
        reviewId,
        selectedRating: rating,
        effectiveRating: null,
        selectedAt: occurredAt,
        resolvedAt: null,
        resolution: null,
        schedulingBaseline: before,
      }
      if (rating === 'AGAIN') {
        applyRating(state, rating, occurredAt, before)
        state.pendingReviewId = null
        state.lastReviewId = reviewId
        effectiveReview = {
          ...effectiveReview,
          effectiveRating: 'AGAIN',
          resolvedAt: occurredAt,
          resolution: 'AGAIN_SELECTED',
        }
      } else {
        state.pendingReviewId = reviewId
        state.dueAt = before.dueAt ?? state.dueAt
        state.mastered = before.mastered
        state.stableSuccessCount = before.stableSuccessCount
        state.nextReviewStage = before.nextReviewStage
        state.lastPracticeAt = occurredAt
        state.stability = before.stability
        if (rating === 'HARD') {
          state.dueAt = addDays(occurredAt, 1)
          state.mastered = false
          state.stableSuccessCount = 0
          state.nextReviewStage = 'CROSS_DAY'
        } else if (before.mastered) {
          state.nextReviewStage = null
        } else if (before.nextReviewStage === 'EARLY_RECALL') {
          state.dueAt = addDays(occurredAt, 3)
          state.nextReviewStage = 'CROSS_DAY'
        } else if (before.dueAt && instantMicros(occurredAt) < instantMicros(before.dueAt)) {
          if (before.stableSuccessCount >= 3) {
            state.dueAt = addDays(occurredAt, 30)
            state.nextReviewStage = 'FINAL_VERIFICATION'
          } else {
            state.nextReviewStage = before.nextReviewStage ?? 'CROSS_DAY'
          }
        } else {
          state.dueAt = addDays(occurredAt, before.stableSuccessCount === 0 ? 7 : before.stableSuccessCount === 1 ? 14 : 30)
          state.nextReviewStage = before.stableSuccessCount >= 2 ? 'FINAL_VERIFICATION' : 'CROSS_DAY'
        }
      }
    } else if (action === 'REVIEW_CONFIRMED' || action === 'REVIEW_CORRECTED') {
      const selectedRating = options.selectedRating ?? rating
      if (!selectedRating) throw new Error('复习核对缺少已保存的初选评分。')
      const selectedAt = options.selectedAt ?? occurredAt
      const correction = action === 'REVIEW_CORRECTED'
      const effectiveRating = correction ? 'AGAIN' : selectedRating
      if (effectiveRating === 'AGAIN') {
        applyRating(state, 'AGAIN', occurredAt, before)
      } else {
        applyRating(state, effectiveRating, selectedAt, before)
      }
      state.pendingReviewId = null
      state.lastReviewId = reviewId
      effectiveReview = {
        reviewId,
        selectedRating,
        effectiveRating,
        selectedAt,
        resolvedAt: occurredAt,
        resolution: correction ? 'CORRECTED_AGAIN' : 'CONFIRMED',
        schedulingBaseline: before,
      }
    }

    // Hibernate assigns @Version=0 on the first insert. Later commands update
    // that persisted row and increment the version as usual.
    state.version = currentState ? baseVersion + 1 : baseVersion
    state.knowledgeBlockVersion = knowledgeBlockVersion
    state.contentHash = contentHash
    return {
      commandId: makeUuid(),
      clientCommandId,
      action,
      occurredAt,
      knowledgeBlockVersion,
      state,
      effectiveReview,
    } as LifecycleCommandResponse
  }
}
