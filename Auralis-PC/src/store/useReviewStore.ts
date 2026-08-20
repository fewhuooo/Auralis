import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  useReviewApi,
  type EventRequest,
  type ReviewHistoryQuery,
  type ReviewQuery,
  type ReviewEventView,
} from '@/api/useReviewApi'
import { mapReviewStateView, type ReviewStateModel } from '@/services/domainMappers'

export const useReviewStore = defineStore('review', () => {
  const queue = ref<ReviewStateModel[]>([])
  const history = ref<ReviewEventView[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  async function loadQueue(params: ReviewQuery = { at: new Date().toISOString(), limit: 100 }): Promise<ReviewStateModel[]> {
    isLoading.value = true
    lastError.value = null
    try {
      const views = await useReviewApi.getReviewQueue(params)
      queue.value = (views ?? []).map(mapReviewStateView).filter((item) => item.knowledgeBlockId)
      return queue.value
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '复习队列加载失败'
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function recordEvent(input: EventRequest): Promise<void> {
    const response = await useReviewApi.recordEvent(input)
    if (response.state) {
      const next = mapReviewStateView(response.state)
      queue.value = queue.value.map((item) => item.knowledgeBlockId === next.knowledgeBlockId ? next : item)
    }
  }

  async function loadHistory(params: ReviewHistoryQuery): Promise<ReviewEventView[]> {
    const views = await useReviewApi.getHistory(params)
    history.value = views ?? []
    return history.value
  }

  return {
    queue,
    history,
    isLoading,
    lastError,
    loadQueue,
    recordEvent,
    loadHistory,
  }
})
