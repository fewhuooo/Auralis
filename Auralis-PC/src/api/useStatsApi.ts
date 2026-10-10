import request from './request.ts'
import type { components } from './generated/schema.ts'
import type { SyncRequestScopeTicket, SyncScopedAxiosRequestConfig } from './request.ts'

export type StatsOverviewView = components['schemas']['StatsOverviewView']
export type WeeklyStatsView = components['schemas']['WeeklyStatsView']
export type DayStats = components['schemas']['Day']

export interface FocusStatsFields {
  focusSeconds?: number
  focusCompletedCount?: number
}

export type FocusStatsOverviewView = StatsOverviewView & FocusStatsFields
export type FocusStatsDayView = DayStats & FocusStatsFields
export type FocusWeeklyStatsView = Omit<WeeklyStatsView, 'days'> & { days?: FocusStatsDayView[] }
type GeneratedSubjectStatsView = components['schemas']['SubjectStatsView']
type SubjectStatsOverviewWithLifecycle = NonNullable<GeneratedSubjectStatsView['overview']> & {
  pendingLearningCount?: number
  reviewingCount?: number
  masteredCount?: number
}
type SubjectStatsDailyWithLifecycle = NonNullable<NonNullable<GeneratedSubjectStatsView['daily']>[number]> & {
  learningCompletionCount?: number
  distinctStudiedKnowledgeBlockCount?: number
}
export type SubjectStatsView = Omit<GeneratedSubjectStatsView, 'overview' | 'daily'> & {
  overview?: SubjectStatsOverviewWithLifecycle
  daily?: SubjectStatsDailyWithLifecycle[]
  /** Local-only indicator for dates with no imported, classifiable history. */
  historyCoverage?: 'COMPLETE' | 'INCOMPLETE'
  /** Number of local review commands not yet acknowledged by the server. */
  pendingReviewCommandCount?: number
}

export interface StatsQuery {
  at?: string
}

export interface WeeklyStatsQuery {
  from: string
  to: string
}

export interface SubjectStatsQuery {
  days: 7 | 30
  timeZone: string
}

function scopedConfig(scope?: SyncRequestScopeTicket): SyncScopedAxiosRequestConfig | undefined {
  return scope ? { __auralisSyncScope: scope } : undefined
}

export const useStatsApi = {
  getOverview(params?: StatsQuery): Promise<FocusStatsOverviewView> {
    return request.get('/api/stats/overview', { params }) as unknown as Promise<FocusStatsOverviewView>
  },
  getStatsOverview(params?: StatsQuery): Promise<FocusStatsOverviewView> {
    return request.get('/api/stats/overview', { params }) as unknown as Promise<FocusStatsOverviewView>
  },
  getWeekly(params?: WeeklyStatsQuery): Promise<FocusWeeklyStatsView> {
    return request.get('/api/stats/weekly', { params }) as unknown as Promise<FocusWeeklyStatsView>
  },
  getWeeklyStats(params?: WeeklyStatsQuery): Promise<FocusWeeklyStatsView> {
    return request.get('/api/stats/weekly', { params }) as unknown as Promise<FocusWeeklyStatsView>
  },
  getSubjectStats(subjectId: string, params: SubjectStatsQuery, scope?: SyncRequestScopeTicket): Promise<SubjectStatsView> {
    return request.get(`/api/stats/subjects/${encodeURIComponent(subjectId)}`, {
      params,
      ...scopedConfig(scope),
    }) as unknown as Promise<SubjectStatsView>
  },
}

export const getOverview = useStatsApi.getOverview
export const getStatsOverview = useStatsApi.getStatsOverview
export const getWeekly = useStatsApi.getWeekly
export const getWeeklyStats = useStatsApi.getWeeklyStats
