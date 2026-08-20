import request from './request.ts'
import type { components } from './generated/schema.ts'

export type StatsOverviewView = components['schemas']['StatsOverviewView']
export type WeeklyStatsView = components['schemas']['WeeklyStatsView']
export type DayStats = components['schemas']['Day']

export interface StatsQuery {
  at?: string
}

export interface WeeklyStatsQuery {
  from: string
  to: string
}

export const useStatsApi = {
  getOverview(params?: StatsQuery): Promise<StatsOverviewView> {
    return request.get('/api/stats/overview', { params }) as unknown as Promise<StatsOverviewView>
  },
  getStatsOverview(params?: StatsQuery): Promise<StatsOverviewView> {
    return request.get('/api/stats/overview', { params }) as unknown as Promise<StatsOverviewView>
  },
  getWeekly(params?: WeeklyStatsQuery): Promise<WeeklyStatsView> {
    return request.get('/api/stats/weekly', { params }) as unknown as Promise<WeeklyStatsView>
  },
  getWeeklyStats(params?: WeeklyStatsQuery): Promise<WeeklyStatsView> {
    return request.get('/api/stats/weekly', { params }) as unknown as Promise<WeeklyStatsView>
  },
}

export const getOverview = useStatsApi.getOverview
export const getStatsOverview = useStatsApi.getStatsOverview
export const getWeekly = useStatsApi.getWeekly
export const getWeeklyStats = useStatsApi.getWeeklyStats
