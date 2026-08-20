import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStatsApi, type StatsQuery, type WeeklyStatsQuery } from '@/api/useStatsApi'
import { mapStatsOverviewView, type StatsOverviewModel } from '@/services/domainMappers'

export interface WeeklyStatsDayModel {
  date: string
  reviewedCount: number
  studySeconds: number
  completedTaskCount: number
  createdKnowledgeCount: number
}

export interface WeeklyStatsModel {
  days: WeeklyStatsDayModel[]
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function currentWeekQuery(): WeeklyStatsQuery {
  const today = new Date()
  const day = today.getUTCDay() || 7
  const from = new Date(today)
  from.setUTCDate(today.getUTCDate() - day + 1)
  const to = new Date(from)
  to.setUTCDate(from.getUTCDate() + 6)
  return { from: isoDate(from), to: isoDate(to) }
}

export const useStatsStore = defineStore('stats', () => {
  const overview = ref<StatsOverviewModel>({
    activeKnowledgeBlocks: 0,
    activeTasks: 0,
    dueReviews: 0,
    completedReviewEvents: 0,
    activeSources: 0,
  })
  const weekly = ref<WeeklyStatsModel>({ days: [] })
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  async function loadOverview(params: StatsQuery = { at: new Date().toISOString() }): Promise<StatsOverviewModel> {
    const view = await useStatsApi.getOverview(params)
    overview.value = mapStatsOverviewView(view)
    return overview.value
  }

  async function loadWeekly(params: WeeklyStatsQuery = currentWeekQuery()): Promise<WeeklyStatsModel> {
    const view = await useStatsApi.getWeekly(params)
    weekly.value = {
      days: (view.days ?? []).map((day) => ({
        date: day.date || '',
        reviewedCount: day.reviewedCount ?? 0,
        studySeconds: day.studySeconds ?? 0,
        completedTaskCount: day.completedTaskCount ?? 0,
        createdKnowledgeCount: day.createdKnowledgeCount ?? 0,
      })),
    }
    return weekly.value
  }

  async function loadDashboard(): Promise<void> {
    isLoading.value = true
    lastError.value = null
    try {
      await Promise.all([loadOverview(), loadWeekly()])
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '统计数据加载失败'
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const totalStudySeconds = computed(() => weekly.value.days.reduce((sum, day) => sum + day.studySeconds, 0))

  return {
    overview,
    weekly,
    isLoading,
    lastError,
    totalStudySeconds,
    loadOverview,
    loadWeekly,
    loadDashboard,
  }
})
