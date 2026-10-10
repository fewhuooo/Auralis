import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useStatsApi, type StatsQuery, type SubjectStatsQuery, type SubjectStatsView, type WeeklyStatsQuery } from '@/api/useStatsApi'
import { SyncScopeChangedError, type SyncRequestScopeTicket } from '@/api/request'
import { useAuthStore } from '@/store/useAuthStore'
import { mapStatsOverviewView, type StatsOverviewModel } from '@/services/domainMappers'

export interface WeeklyStatsDayModel {
  date: string
  reviewedCount: number
  studySeconds: number
  focusSeconds: number
  focusCompletedCount: number
  completedTaskCount: number
  createdKnowledgeCount: number
}

export interface WeeklyStatsModel {
  days: WeeklyStatsDayModel[]
}

export interface PcStatsOverviewModel extends StatsOverviewModel {
  focusSeconds: number
  focusCompletedCount: number
}

type RequiredFields<T> = { [K in keyof T]-?: NonNullable<T[K]> }
type SubjectStatsOverviewModel = RequiredFields<NonNullable<SubjectStatsView['overview']>>
type SubjectStatsDailyModel = RequiredFields<NonNullable<NonNullable<SubjectStatsView['daily']>[number]>>
type SubjectStatsRatingsModel = RequiredFields<NonNullable<SubjectStatsView['ratingCounts']>>

export type SubjectStatsModel = RequiredFields<Omit<SubjectStatsView, 'overview' | 'daily' | 'ratingCounts'>> & {
  overview: SubjectStatsOverviewModel
  daily: SubjectStatsDailyModel[]
  ratingCounts: SubjectStatsRatingsModel
}

interface SessionIdentity {
  userId: string
  deviceId: string
  sessionId: string
}

interface StatsScopeTicket extends SyncRequestScopeTicket, SessionIdentity {
  generation: number
}

interface CachedSubjectStats {
  subjectId: string
  value: SubjectStatsModel
}

const overviewCountFields = [
  'fileSourceCount', 'textSourceCount', 'urlSourceCount', 'activeKnowledgeBlockCount', 'activeTaskCount',
  'todoTaskCount', 'inProgressTaskCount', 'doneTaskCount', 'cancelledTaskCount', 'newLearningCount',
  'dueReviewCount', 'scheduledReviewCount', 'pendingLearningCount', 'reviewingCount', 'masteredCount',
] as const
const dailyCountFields = [
  'nonSkipReviewEventCount', 'distinctReviewedKnowledgeBlockCount', 'firstLearningKnowledgeBlockCount',
  'subsequentReviewKnowledgeBlockCount', 'createdKnowledgeBlockCount', 'completedTaskCount',
  'learningCompletionCount', 'distinctStudiedKnowledgeBlockCount',
] as const
const ratingCountFields = ['againCount', 'hardCount', 'goodCount', 'easyCount'] as const

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`学科统计缺少有效的 ${field}。`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`学科统计缺少有效的 ${field}。`)
  return value
}

function requiredCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`学科统计 ${field} 无效。`)
  }
  return value
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function normalizeSubjectStats(
  view: SubjectStatsView,
  subjectId: string,
  query: SubjectStatsQuery,
): SubjectStatsModel {
  const source = requiredObject(view, '响应')
  const responseSubjectId = requiredString(source.subjectId, '学科标识')
  const generatedAt = requiredString(source.generatedAt, '生成时间')
  const timeZone = requiredString(source.timeZone, '时区')
  const from = requiredString(source.from, '起始日期')
  const to = requiredString(source.to, '结束日期')
  if (responseSubjectId !== subjectId) throw new Error('学科统计响应的学科标识不匹配。')
  if (timeZone !== query.timeZone) throw new Error('学科统计响应的时区不匹配。')
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('学科统计生成时间无效。')
  if (!validDateOnly(from) || !validDateOnly(to)) {
    throw new Error('学科统计日期范围无效。')
  }

  const overviewSource = requiredObject(source.overview, '概况')
  const overview = Object.fromEntries(overviewCountFields.map((field) => [field, requiredCount(overviewSource[field], field)])) as SubjectStatsOverviewModel
  if (overview.pendingLearningCount + overview.reviewingCount + overview.masteredCount !== overview.activeKnowledgeBlockCount) {
    throw new Error('学科统计的三类复习状态未覆盖全部活动知识块。')
  }
  if (overview.dueReviewCount > overview.reviewingCount) {
    throw new Error('学科统计的今日到期数量不能超过待复习数量。')
  }
  const ratingSource = requiredObject(source.ratingCounts, '评分分布')
  const ratingCounts = Object.fromEntries(ratingCountFields.map((field) => [field, requiredCount(ratingSource[field], field)])) as SubjectStatsRatingsModel
  if (!Array.isArray(source.daily) || source.daily.length !== query.days) {
    throw new Error(`学科统计应包含完整的 ${query.days} 天趋势数据。`)
  }
  const daily = source.daily.map((rawDay, index) => {
    const day = requiredObject(rawDay, `第 ${index + 1} 天`)
    const date = requiredString(day.date, '趋势日期')
    if (!validDateOnly(date)) {
      throw new Error('学科统计趋势日期无效。')
    }
    const counts = Object.fromEntries(dailyCountFields.map((field) => [field, requiredCount(day[field], field)]))
    return { date, ...counts } as SubjectStatsDailyModel
  })
  if (daily[0]?.date !== from || daily[daily.length - 1]?.date !== to) {
    throw new Error('学科统计日期范围与趋势数据不一致。')
  }
  for (let index = 1; index < daily.length; index += 1) {
    const previous = Date.parse(`${daily[index - 1].date}T00:00:00.000Z`)
    const current = Date.parse(`${daily[index].date}T00:00:00.000Z`)
    if (current - previous !== 24 * 60 * 60 * 1000) throw new Error('学科统计趋势日期不连续。')
  }

  const historyCoverage = source.historyCoverage === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE'
  const pendingReviewCommandCount = requiredCount(source.pendingReviewCommandCount, '待同步复习操作数量')
  return { subjectId: responseSubjectId, generatedAt, timeZone, from, to, overview, daily, ratingCounts, historyCoverage, pendingReviewCommandCount }
}

function currentIdentity(authStore: ReturnType<typeof useAuthStore>): SessionIdentity | null {
  const userId = authStore.user?.id
  const deviceId = authStore.serverDeviceId
  const sessionId = authStore.sessionId
  if (!authStore.isAuthenticated || !userId || !deviceId || !sessionId) return null
  return { userId, deviceId, sessionId }
}

function sameIdentity(left: SessionIdentity | null, right: SessionIdentity | null): boolean {
  return left?.userId === right?.userId
    && left?.deviceId === right?.deviceId
    && left?.sessionId === right?.sessionId
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
  const authStore = useAuthStore()
  const overview = ref<PcStatsOverviewModel>({
    activeKnowledgeBlocks: 0,
    activeTasks: 0,
    dueReviews: 0,
    completedReviewEvents: 0,
    activeSources: 0,
    focusSeconds: 0,
    focusCompletedCount: 0,
  })
  const weekly = ref<WeeklyStatsModel>({ days: [] })
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const subjectStats = ref<SubjectStatsModel | null>(null)
  const subjectStatsStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
  const subjectStatsError = ref<string | null>(null)
  const isSubjectStatsLoading = computed(() => subjectStatsStatus.value === 'loading')

  let subjectStatsGeneration = 0
  let observedIdentity = currentIdentity(authStore)
  let activeSubjectStatsKey: string | null = null
  const subjectStatsCache = new Map<string, CachedSubjectStats>()
  const subjectStatsRequestVersions = new Map<string, number>()

  function clearSubjectStats(): void {
    subjectStatsCache.clear()
    subjectStatsRequestVersions.clear()
    activeSubjectStatsKey = null
    subjectStats.value = null
    subjectStatsStatus.value = 'idle'
    subjectStatsError.value = null
  }

  watch(
    () => currentIdentity(authStore),
    (identity) => {
      if (!sameIdentity(identity, observedIdentity)) {
        observedIdentity = identity
        subjectStatsGeneration += 1
        clearSubjectStats()
      }
    },
    { flush: 'sync' },
  )

  function createSubjectStatsTicket(): StatsScopeTicket {
    const identity = currentIdentity(authStore)
    if (!identity) throw new SyncScopeChangedError()
    const generation = subjectStatsGeneration
    return {
      ...identity,
      generation,
      key: Symbol('subject-stats-scope'),
      isCurrent: () => subjectStatsGeneration === generation && sameIdentity(currentIdentity(authStore), identity),
    }
  }

  async function loadOverview(params: StatsQuery = { at: new Date().toISOString() }): Promise<PcStatsOverviewModel> {
    const view = await useStatsApi.getOverview(params)
    overview.value = {
      ...mapStatsOverviewView(view),
      focusSeconds: view.focusSeconds ?? 0,
      focusCompletedCount: view.focusCompletedCount ?? 0,
    }
    return overview.value
  }

  async function loadWeekly(params: WeeklyStatsQuery = currentWeekQuery()): Promise<WeeklyStatsModel> {
    const view = await useStatsApi.getWeekly(params)
    weekly.value = {
      days: (view.days ?? []).map((day) => ({
        date: day.date || '',
        reviewedCount: day.reviewedCount ?? 0,
        studySeconds: day.studySeconds ?? 0,
        focusSeconds: day.focusSeconds ?? 0,
        focusCompletedCount: day.focusCompletedCount ?? 0,
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

  async function loadSubjectStats(subjectId: string, query: SubjectStatsQuery): Promise<SubjectStatsModel> {
    if (typeof subjectId !== 'string' || !subjectId.trim()) throw new Error('学科标识无效。')
    if (query.days !== 7 && query.days !== 30) throw new Error('统计范围只能是 7 天或 30 天。')
    if (typeof query.timeZone !== 'string' || !query.timeZone.trim()) throw new Error('统计时区不能为空。')
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: query.timeZone }).format(new Date())
    } catch {
      throw new Error('统计时区不是有效的 IANA 时区。')
    }

    const ticket = createSubjectStatsTicket()
    const key = JSON.stringify([
      ticket.generation, ticket.userId, ticket.deviceId, ticket.sessionId,
      subjectId, query.days, query.timeZone,
    ])
    const requestVersion = (subjectStatsRequestVersions.get(key) ?? 0) + 1
    subjectStatsRequestVersions.set(key, requestVersion)
    activeSubjectStatsKey = key
    subjectStats.value = subjectStatsCache.get(key)?.value ?? null
    subjectStatsStatus.value = 'loading'
    subjectStatsError.value = null

    try {
      const { localDb, getLocalSqlDatabase, getLocalRepository } = await import('@/services/localDb')
      const { LocalSubjectStats } = await import('@/services/localSubjectStats')
      await localDb.init()
      const localRepository = await getLocalRepository(ticket.userId, ticket.deviceId)
      const view = await LocalSubjectStats.compute(
        getLocalSqlDatabase(), ticket.userId, ticket.deviceId, subjectId, query.days, query.timeZone, localRepository,
      )
      if (!ticket.isCurrent()) throw new SyncScopeChangedError()
      if (subjectStatsRequestVersions.get(key) !== requestVersion) throw new SyncScopeChangedError()
      const normalized = normalizeSubjectStats(view, subjectId, query)
      subjectStatsCache.set(key, { subjectId, value: normalized })
      if (activeSubjectStatsKey === key) {
        subjectStats.value = normalized
        subjectStatsStatus.value = 'success'
        subjectStatsError.value = null
      }
      return normalized
    } catch (error) {
      if (ticket.isCurrent() && subjectStatsRequestVersions.get(key) === requestVersion && activeSubjectStatsKey === key) {
        subjectStatsError.value = error instanceof Error ? error.message : '学科统计加载失败。'
        subjectStatsStatus.value = subjectStats.value ? 'success' : 'error'
      }
      throw error
    }
  }

  function invalidateSubjectStats(subjectId: string): void {
    for (const [key, entry] of subjectStatsCache) {
      if (entry.subjectId === subjectId) subjectStatsCache.delete(key)
    }
    for (const key of subjectStatsRequestVersions.keys()) {
      if (key.includes(JSON.stringify(subjectId))) {
        subjectStatsRequestVersions.set(key, (subjectStatsRequestVersions.get(key) ?? 0) + 1)
      }
    }
    if (activeSubjectStatsKey?.includes(JSON.stringify(subjectId))) {
      activeSubjectStatsKey = null
      subjectStats.value = null
      subjectStatsStatus.value = 'idle'
      subjectStatsError.value = null
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
    subjectStats,
    subjectStatsStatus,
    subjectStatsError,
    isSubjectStatsLoading,
    loadSubjectStats,
    invalidateSubjectStats,
  }
})
