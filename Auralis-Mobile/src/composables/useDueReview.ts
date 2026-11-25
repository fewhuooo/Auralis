import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type {
  LearningCompletionRequest,
  reviewApi,
  ReviewAttemptRequest,
  ReviewResolutionRequest,
  ReviewState,
} from '@/api/reviewApi'
import { ApiProblemError } from '@/api/protocol'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { uuidv7 } from '@/utils/uuid'

type PendingReview = {
  attempt?: ReviewAttemptRequest
  confirmation?: ReviewResolutionRequest
  learning?: LearningCompletionRequest
  subjectId?: string
}

interface DueReviewScope {
  subjectId: () => string | undefined
  enabled: () => boolean
  circularQueue?: boolean
  pcCompletion?: boolean
  initialMode?: () => ReviewRoundMode
  initialSelfTestCount?: () => number
}

function pendingClientCommandId(item: PendingReview | null | ''): string | undefined {
  if (!item) return undefined
  return item.learning?.clientCommandId ?? item.attempt?.clientCommandId
}

export type ReviewRoundMode = 'due' | 'self-test'

function shuffleStates(items: ReviewState[]): ReviewState[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

export function useDueReview(api: typeof reviewApi, options?: DueReviewScope) {
  const auth = useAuthStore()
  const subjects = useSubjectStore()
  const reviewMode = ref<ReviewRoundMode>('due')
  const subjectStates = ref<ReviewState[]>([])
  const sessionQueue = ref<ReviewState[]>([])
  const currentIndex = ref(0)
  const completedCount = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const isFlipped = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const refreshRequired = ref(false)
  const activeCard = ref<{ title: string; preview: string; subject?: string; subjectId?: string } | null>(null)
  const skippedIndices = ref<number[]>([])
  const resolvedIndices = ref<Set<number>>(new Set())
  const pendingIndices = computed(() =>
    sessionQueue.value.map((_, index) => index).filter(index => !resolvedIndices.value.has(index)),
  )
  const remainingCount = computed(() => (
    options?.circularQueue
      ? pendingIndices.value.length
      : sessionQueue.value.slice(currentIndex.value).filter((_, offset) => !resolvedIndices.value.has(currentIndex.value + offset)).length
  ))
  const canGoPrev = computed(() => (
    options?.circularQueue
      ? pendingIndices.value.length > 1 && !loading.value && !saving.value && !refreshRequired.value
      : skippedIndices.value.length > 0 && !loading.value && !saving.value && !refreshRequired.value
  ))
  const activeNeedsLearning = computed(() => Boolean(sessionQueue.value[currentIndex.value]?.needsLearning))
  const activeMastered = computed(() => Boolean(sessionQueue.value[currentIndex.value]?.mastered))
  const selfTestCount = computed(() => (
    subjectStates.value.filter(item => Boolean(item.knowledgeBlockId) && !item.needsLearning).length
  ))
  const subjectId = computed(() => options?.subjectId())
  const enabled = computed(() => !options || Boolean(options.enabled() && subjectId.value))
  let revision = 0
  let cardStartedAt = 0
  let pending: PendingReview | null = null

  function scope() {
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
    const serverDeviceId = auth.serverDeviceId
    const currentSubjectId = subjectId.value
    const capturedRevision = revision
    return () => Boolean(enabled.value && subjectId.value === currentSubjectId
      && userId && serverDeviceId && capturedRevision === revision
      && generation === auth.getLoginGeneration() && userId === auth.user?.id
      && serverDeviceId === auth.serverDeviceId)
  }

  function clear() {
    revision++
    reviewMode.value = 'due'
    subjectStates.value = []
    sessionQueue.value = []
    currentIndex.value = 0
    skippedIndices.value = []
    resolvedIndices.value = new Set()
    completedCount.value = 0
    activeCard.value = null
    isFlipped.value = false
    loading.value = false
    saving.value = false
    loadError.value = ''
    saveError.value = ''
    refreshRequired.value = false
    pending = null
  }

  function syncSubjectState(knowledgeBlockId: string | undefined, patch?: Partial<ReviewState> | null) {
    if (!knowledgeBlockId || !patch) return
    const exists = subjectStates.value.some(item => item.knowledgeBlockId === knowledgeBlockId)
    subjectStates.value = exists
      ? subjectStates.value.map(item => (
          item.knowledgeBlockId === knowledgeBlockId ? { ...item, ...patch } : item
        ))
      : [...subjectStates.value, { knowledgeBlockId, ...patch } as ReviewState]
  }

  function prepareSessionStart(targetMode: ReviewRoundMode): (() => boolean) | null {
    if (loading.value || saving.value || !enabled.value || !auth.isAuthenticated) return null
    const discardPending = refreshRequired.value ? pendingClientCommandId(pending) : undefined
    const preservedStates = targetMode === 'self-test' ? subjectStates.value : []
    clear()
    reviewMode.value = targetMode
    if (preservedStates.length) subjectStates.value = preservedStates
    const isCurrent = scope()
    if (!isCurrent()) return null
    try {
      const key = pendingKey()
      pending = uni.getStorageSync<PendingReview | ''>(key) || null
      if (pending && pendingClientCommandId(pending) === discardPending) {
        uni.removeStorageSync(key)
        pending = null
      }
    } catch (error) {
      console.error('[Review] Failed to read the pending review:', error)
      loadError.value = '复习记录读取失败，请刷新'
      return null
    }
    if (pending) {
      saveError.value = subjectId.value && pending.subjectId !== subjectId.value
        ? '此前有一条复习结果等待保存，请重试后继续'
        : '有一条复习结果等待保存，请重试'
      return null
    }
    return isCurrent
  }

  async function fetchAllStates(currentSubjectId: string, isCurrent: () => boolean): Promise<ReviewState[] | null> {
    if (typeof api.states !== 'function') return []
    const collected: ReviewState[] = []
    let stateCursor: string | undefined
    do {
      const statePage = await api.states(currentSubjectId, stateCursor)
      if (!isCurrent()) return null
      for (const item of statePage.items ?? []) {
        if (item.knowledgeBlockId) collected.push(item)
      }
      if (statePage.hasMore && !statePage.nextCursor) throw new Error('Review states cursor is missing')
      stateCursor = statePage.hasMore ? statePage.nextCursor : undefined
    } while (stateCursor)
    return collected
  }

  watch([() => auth.sessionId, () => auth.serverDeviceId, () => auth.user?.id, enabled, subjectId], () => {
    clear()
    if (!options || !enabled.value) return
    const capturedRevision = revision
    void nextTick(() => {
      if (revision !== capturedRevision) return
      if (options.initialMode?.() === 'self-test') {
        void startSelfTest(options.initialSelfTestCount?.() ?? 5)
        return
      }
      void loadReview()
    })
  }, { flush: 'sync', immediate: Boolean(options) })
  onUnmounted(clear)

  async function loadCard(isCurrent: () => boolean) {
    activeCard.value = null
    isFlipped.value = false
    const state = sessionQueue.value[currentIndex.value]
    if (!state) return
    if (!state.knowledgeBlockId) throw new Error('Review queue item has no knowledge block ID')
    const block = await api.block(state.knowledgeBlockId)
    if (!isCurrent() || state !== sessionQueue.value[currentIndex.value]) return
    if (block.id !== state.knowledgeBlockId || block.version !== state.knowledgeBlockVersion
      || (subjectId.value && block.subjectId !== subjectId.value)
      || !('content' in block) || typeof block.content !== 'string' || typeof block.title !== 'string') {
      throw new Error('Review knowledge block revision changed')
    }
    activeCard.value = {
      title: block.title,
      preview: block.content,
      subject: subjects.subjects.find(subject => subject.id === block.subjectId)?.name,
      subjectId: block.subjectId,
    }
    cardStartedAt = Date.now()
  }

  async function loadReview() {
    const isCurrent = prepareSessionStart('due')
    if (!isCurrent) return
    await loadQueue(isCurrent)
  }

  async function loadQueue(isCurrent: () => boolean) {
    reviewMode.value = 'due'
    loading.value = true
    const at = new Date().toISOString()
    const currentSubjectId = subjectId.value
    const states: ReviewState[] = []
    const seenBlockIds = new Set<string>()
    try {
      let cursor: string | undefined
      do {
        const page = await api.queue(at, cursor, currentSubjectId)
        if (!isCurrent()) return
        for (const item of page.items ?? []) {
          if (item.knowledgeBlockId) seenBlockIds.add(item.knowledgeBlockId)
          states.push(item)
        }
        if (page.hasMore && !page.nextCursor) throw new Error('Review queue cursor is missing')
        cursor = page.hasMore ? page.nextCursor : undefined
      } while (cursor)

      if (options?.pcCompletion && currentSubjectId && typeof api.states === 'function') {
        const allStates = await fetchAllStates(currentSubjectId, isCurrent)
        if (!allStates) return
        subjectStates.value = allStates
        for (const item of allStates) {
          if (!item.knowledgeBlockId || seenBlockIds.has(item.knowledgeBlockId)) continue
          if (item.needsLearning) {
            seenBlockIds.add(item.knowledgeBlockId)
            states.push(item)
          }
        }
      } else {
        subjectStates.value = []
      }

      currentIndex.value = 0
      skippedIndices.value = []
      resolvedIndices.value = new Set()
      sessionQueue.value = states
      await loadCard(isCurrent)
    } catch (error) {
      if (!isCurrent()) return
      console.error('[Review] Failed to load due reviews:', error)
      loadError.value = '复习数据加载失败，请刷新'
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  async function startSelfTest(maxCount = 5) {
    const currentSubjectId = subjectId.value
    if (!currentSubjectId || typeof api.states !== 'function') return
    const isCurrent = prepareSessionStart('self-test')
    if (!isCurrent) return
    loading.value = true
    try {
      const allStates = await fetchAllStates(currentSubjectId, isCurrent)
      if (!allStates) return
      subjectStates.value = allStates
      const candidates = shuffleStates(allStates.filter(item => Boolean(item.knowledgeBlockId) && !item.needsLearning))
      const limit = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : candidates.length
      currentIndex.value = 0
      skippedIndices.value = []
      resolvedIndices.value = new Set()
      sessionQueue.value = candidates.slice(0, limit)
      await loadCard(isCurrent)
    } catch (error) {
      if (!isCurrent()) return
      console.error('[Review] Failed to load self-test blocks:', error)
      loadError.value = '自测题目加载失败，请重试'
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  function findNextUnresolvedIndex(fromIndex: number): number {
    const nextOffset = sessionQueue.value.slice(fromIndex).findIndex((_, offset) => !resolvedIndices.value.has(fromIndex + offset))
    return nextOffset === -1 ? sessionQueue.value.length : fromIndex + nextOffset
  }

  async function jumpToIndex(nextIndex: number, isCurrent: () => boolean) {
    saveError.value = ''
    if (nextIndex === currentIndex.value && activeCard.value) {
      isFlipped.value = false
      cardStartedAt = Date.now()
      return
    }
    currentIndex.value = nextIndex
    loading.value = true
    try {
      await loadCard(isCurrent)
    } catch (error) {
      if (!isCurrent()) return
      console.error('[Review] Failed to load knowledge block:', error)
      loadError.value = '复习卡片有更新或加载失败，请刷新'
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  async function rotateCircular(step: 1 | -1, isCurrent: () => boolean) {
    const pendingList = pendingIndices.value
    if (!pendingList.length) {
      saveError.value = ''
      currentIndex.value = sessionQueue.value.length
      activeCard.value = null
      isFlipped.value = false
      return
    }
    if (pendingList.length === 1) {
      await jumpToIndex(pendingList[0], isCurrent)
      return
    }
    const pos = pendingList.indexOf(currentIndex.value)
    const safePos = pos === -1 ? 0 : pos
    const targetIdx = pendingList[(safePos + step + pendingList.length) % pendingList.length]
    await jumpToIndex(targetIdx, isCurrent)
  }

  async function nextCard(isCurrent: () => boolean) {
    if (options?.circularQueue) {
      const pendingList = pendingIndices.value
      if (!pendingList.length) {
        saveError.value = ''
        currentIndex.value = sessionQueue.value.length
        activeCard.value = null
        isFlipped.value = false
        return
      }
      const nextIdx = pendingList.find(index => index > currentIndex.value) ?? pendingList[0]
      await jumpToIndex(nextIdx, isCurrent)
      return
    }
    await jumpToIndex(findNextUnresolvedIndex(currentIndex.value + 1), isCurrent)
  }

  async function submit(rating?: 'GOOD' | 'AGAIN') {
    const state = sessionQueue.value[currentIndex.value]
    if (loading.value || saving.value || refreshRequired.value) return
    const isCurrent = scope()
    if (!isCurrent()) return
    const isCurrentSubmission = () => isCurrent() && state === sessionQueue.value[currentIndex.value]
    if (!pending) {
      if (!state || !activeCard.value) return
      if (!rating) {
        if (options?.circularQueue) {
          await rotateCircular(1, isCurrent)
          return
        }
        skippedIndices.value = [...skippedIndices.value, currentIndex.value]
        await nextCard(isCurrent)
        return
      }
      if (!state.contentHash || !state.knowledgeBlockId || state.knowledgeBlockVersion == null || state.version == null) {
        saveError.value = '此卡片缺少复习版本信息，请刷新；旧记录可先跳过'
        return
      }
      if (options?.pcCompletion && state.needsLearning) {
        if (rating === 'AGAIN') {
          await rotateCircular(1, isCurrent)
          return
        }
        pending = {
          subjectId: activeCard.value.subjectId,
          learning: {
            clientCommandId: uuidv7(),
            knowledgeBlockId: state.knowledgeBlockId,
            knowledgeBlockVersion: state.knowledgeBlockVersion,
            contentHash: state.contentHash,
            baseVersion: state.version,
            ...(state.lastReviewId ? { reviewId: state.lastReviewId } : {}),
          },
        }
      } else {
        pending = {
          subjectId: activeCard.value.subjectId,
          attempt: {
            clientCommandId: uuidv7(),
            knowledgeBlockId: state.knowledgeBlockId,
            knowledgeBlockVersion: state.knowledgeBlockVersion,
            contentHash: state.contentHash,
            baseVersion: state.version,
            reviewId: uuidv7(),
            rating,
            durationSeconds: Math.max(0, Math.round((Date.now() - cardStartedAt) / 1000)),
          },
        }
      }
    }
    const command = pending
    const key = pendingKey()
    saving.value = true
    saveError.value = ''
    try {
      uni.setStorageSync(key, command)
      if (command.learning) {
        const completed = await api.completeLearning(command.learning)
        if (!isCurrentSubmission()) return
        if (completed.state?.needsLearning) throw new Error('Learning completion did not clear needsLearning')
        const saved = uni.getStorageSync<PendingReview | ''>(key)
        if (saved && pendingClientCommandId(saved) === command.learning.clientCommandId) {
          uni.removeStorageSync(key)
        }
        pending = null
        if (!subjectId.value || command.subjectId === subjectId.value) {
          completedCount.value++
          syncSubjectState(command.learning.knowledgeBlockId, completed.state ?? { needsLearning: false })
        }
        if (state) {
          if (completed.state) {
            sessionQueue.value = sessionQueue.value.map((item, idx) => (
              idx === currentIndex.value ? { ...item, ...completed.state } : item
            ))
          }
          resolvedIndices.value = new Set([...resolvedIndices.value, currentIndex.value])
          await nextCard(isCurrent)
          return
        }
        await loadQueue(isCurrent)
        return
      }

      const attempt = command.attempt
      if (!attempt) throw new Error('Pending review command is empty')
      let selectedState: ReviewState | undefined
      let confirmedState: ReviewState | undefined
      if (!command.confirmation) {
        const selected = await api.attempt(attempt)
        if (!isCurrentSubmission()) return
        selectedState = selected.state
        if (attempt.rating === 'GOOD') {
          if (selected.state?.version == null) throw new Error('Review state version is missing')
          command.confirmation = {
            clientCommandId: uuidv7(),
            knowledgeBlockId: attempt.knowledgeBlockId,
            knowledgeBlockVersion: attempt.knowledgeBlockVersion,
            contentHash: attempt.contentHash,
            baseVersion: selected.state.version,
          }
          uni.setStorageSync(key, command)
        } else if (selected.effectiveReview?.effectiveRating !== 'AGAIN') {
          throw new Error('Review retry result is missing')
        }
      }
      if (command.confirmation) {
        const confirmed = await api.confirm(attempt.reviewId, command.confirmation)
        if (!isCurrentSubmission()) return
        if (confirmed.effectiveReview?.effectiveRating !== 'GOOD') throw new Error('Review confirmation is missing')
        confirmedState = confirmed.state
      }
      const saved = uni.getStorageSync<PendingReview | ''>(key)
      if (saved && pendingClientCommandId(saved) === attempt.clientCommandId) {
        uni.removeStorageSync(key)
      }
      pending = null
      if (options?.pcCompletion && attempt.rating === 'AGAIN') {
        if (!subjectId.value || command.subjectId === subjectId.value) {
          syncSubjectState(attempt.knowledgeBlockId, selectedState
            ? { ...selectedState, needsLearning: selectedState.needsLearning ?? true, lastReviewId: selectedState.lastReviewId ?? attempt.reviewId }
            : { needsLearning: true, lastReviewId: attempt.reviewId })
        }
        if (state) {
          sessionQueue.value = sessionQueue.value.map((item, idx) => (
            idx === currentIndex.value
              ? {
                  ...item,
                  ...selectedState,
                  needsLearning: selectedState?.needsLearning ?? true,
                  lastReviewId: selectedState?.lastReviewId ?? attempt.reviewId,
                }
              : item
          ))
          await rotateCircular(1, isCurrent)
          return
        }
        await loadQueue(isCurrent)
        return
      }
      if (!subjectId.value || command.subjectId === subjectId.value) {
        completedCount.value++
        syncSubjectState(attempt.knowledgeBlockId, confirmedState ?? selectedState)
      }
      if (state) {
        resolvedIndices.value = new Set([...resolvedIndices.value, currentIndex.value])
        await nextCard(isCurrent)
        return
      }
      await loadQueue(isCurrent)
    } catch (error) {
      if (!isCurrentSubmission()) return
      console.error('[Review] Failed to record review:', error)
      refreshRequired.value = error instanceof ApiProblemError && [400, 404, 409].includes(error.status)
      saveError.value = refreshRequired.value ? '复习状态已更新，请刷新队列' : '复习结果尚未确认，请重试保存'
    } finally {
      if (isCurrent()) saving.value = false
    }
  }

  function pendingKey() {
    return `auralis:review:pending:${auth.user?.id}:${auth.serverDeviceId}`
  }

  async function prevCard() {
    if (loading.value || saving.value || refreshRequired.value || pending) return
    const isCurrent = scope()
    if (!isCurrent()) return
    if (options?.circularQueue) {
      await rotateCircular(-1, isCurrent)
      return
    }
    const prevIdx = skippedIndices.value[skippedIndices.value.length - 1]
    if (prevIdx === undefined) return
    skippedIndices.value = skippedIndices.value.slice(0, -1)
    await jumpToIndex(prevIdx, isCurrent)
  }

  const retrySave = () => pending ? submit() : loadReview()
  const skipCard = () => pending ? undefined : submit()
  const rateCard = (rating: 'GOOD' | 'AGAIN') => pending ? undefined : submit(rating)

  return {
    reviewMode, subjectStates, selfTestCount, sessionQueue, currentIndex, completedCount, remainingCount, canGoPrev,
    activeCard, activeNeedsLearning, activeMastered, isFlipped, loading, saving, loadError, saveError, refreshRequired,
    loadReview, startSelfTest, retrySave, skipCard, prevCard, rateCard,
  }
}
