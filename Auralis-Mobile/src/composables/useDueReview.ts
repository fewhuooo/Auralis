import { computed, onUnmounted, ref, watch } from 'vue'
import type { reviewApi, ReviewAttemptRequest, ReviewResolutionRequest, ReviewState } from '@/api/reviewApi'
import { ApiProblemError } from '@/api/protocol'
import { useAuthStore } from '@/store/useAuthStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { uuidv7 } from '@/utils/uuid'

type PendingReview = { attempt: ReviewAttemptRequest; confirmation?: ReviewResolutionRequest }

export function useDueReview(api: typeof reviewApi) {
  const auth = useAuthStore()
  const subjects = useSubjectStore()
  const sessionQueue = ref<ReviewState[]>([])
  const currentIndex = ref(0)
  const completedCount = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const isFlipped = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const refreshRequired = ref(false)
  const activeCard = ref<{ title: string; preview: string; subject?: string } | null>(null)
  const remainingCount = computed(() => sessionQueue.value.length - currentIndex.value)
  let revision = 0
  let cardStartedAt = 0
  let pending: PendingReview | null = null

  function scope() {
    const generation = auth.getLoginGeneration()
    const userId = auth.user?.id
    const serverDeviceId = auth.serverDeviceId
    const capturedRevision = revision
    return () => Boolean(userId && serverDeviceId && capturedRevision === revision
      && generation === auth.getLoginGeneration() && userId === auth.user?.id
      && serverDeviceId === auth.serverDeviceId)
  }

  function clear() {
    revision++
    sessionQueue.value = []
    currentIndex.value = 0
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

  watch(() => [auth.sessionId, auth.serverDeviceId, auth.user?.id], clear, { flush: 'sync' })
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
      || !('content' in block) || typeof block.content !== 'string' || typeof block.title !== 'string') {
      throw new Error('Review knowledge block revision changed')
    }
    activeCard.value = {
      title: block.title,
      preview: block.content,
      subject: subjects.subjects.find(subject => subject.id === block.subjectId)?.name,
    }
    cardStartedAt = Date.now()
  }

  async function loadReview() {
    if (loading.value || saving.value || !auth.isAuthenticated) return
    const discardPending = refreshRequired.value ? pending?.attempt.clientCommandId : undefined
    clear()
    const isCurrent = scope()
    if (!isCurrent()) return
    try {
      const key = pendingKey()
      pending = uni.getStorageSync<PendingReview | ''>(key) || null
      if (pending && pending.attempt.clientCommandId === discardPending) {
        uni.removeStorageSync(key)
        pending = null
      }
    } catch (error) {
      console.error('[Review] Failed to read the pending review:', error)
      loadError.value = '复习记录读取失败，请刷新'
      return
    }
    if (pending) {
      saveError.value = '有一条复习结果等待保存，请重试'
      return
    }
    await loadQueue(isCurrent)
  }

  async function loadQueue(isCurrent: () => boolean) {
    loading.value = true
    const at = new Date().toISOString()
    const states: ReviewState[] = []
    try {
      let cursor: string | undefined
      do {
        const page = await api.queue(at, cursor)
        if (!isCurrent()) return
        states.push(...(page.items ?? []))
        if (page.hasMore && !page.nextCursor) throw new Error('Review queue cursor is missing')
        cursor = page.hasMore ? page.nextCursor : undefined
      } while (cursor)
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

  async function nextCard(isCurrent: () => boolean) {
    saveError.value = ''
    currentIndex.value++
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

  async function submit(rating?: 'GOOD' | 'AGAIN') {
    const state = sessionQueue.value[currentIndex.value]
    if (loading.value || saving.value || refreshRequired.value) return
    const isCurrent = scope()
    if (!isCurrent()) return
    const isCurrentSubmission = () => isCurrent() && state === sessionQueue.value[currentIndex.value]
    if (!pending) {
      if (!state || !activeCard.value) return
      if (!rating) {
        await nextCard(isCurrent)
        return
      }
      if (!state.contentHash || !state.knowledgeBlockId || state.knowledgeBlockVersion == null || state.version == null) {
        saveError.value = '此卡片缺少复习版本信息，请刷新；旧记录可先跳过'
        return
      }
      pending = {
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
    const command = pending
    const attempt = command.attempt
    const key = pendingKey()
    saving.value = true
    saveError.value = ''
    try {
      uni.setStorageSync(key, command)
      if (!command.confirmation) {
        const selected = await api.attempt(attempt)
        if (!isCurrentSubmission()) return
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
      }
      const saved = uni.getStorageSync<PendingReview | ''>(key)
      if (saved && saved.attempt.clientCommandId === attempt.clientCommandId) {
        uni.removeStorageSync(key)
      }
      pending = null
      completedCount.value++
      if (state) {
        await nextCard(isCurrent)
      } else {
        await loadQueue(isCurrent)
      }
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

  const retrySave = () => pending ? submit() : loadReview()
  const skipCard = () => pending ? undefined : submit()
  const rateCard = (rating: 'GOOD' | 'AGAIN') => pending ? undefined : submit(rating)

  return {
    sessionQueue, currentIndex, completedCount, remainingCount, activeCard, isFlipped,
    loading, saving, loadError, saveError, refreshRequired, loadReview, retrySave, skipCard, rateCard,
  }
}
