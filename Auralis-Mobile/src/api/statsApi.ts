import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'

export type StatsOverview = components['schemas']['StatsOverviewView']
export type WeeklyStats = components['schemas']['WeeklyStatsView']
export type SubjectStats = components['schemas']['SubjectStatsView']

export function createStatsApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    overview: (at = new Date().toISOString()) => client.request(
      '/api/stats/overview', 'get', { query: { at } },
    ) as Promise<StatsOverview>,
    weekly: (from: string, to: string, timeZone?: string) => client.request(
      '/api/stats/weekly', 'get', { query: timeZone ? { from, to, timeZone } : { from, to } },
    ) as Promise<WeeklyStats>,
    subject: (subjectId: string, timeZone: string, days = 7) => client.request(
      '/api/stats/subjects/{subjectId}', 'get', { pathParams: { subjectId }, query: { days, timeZone } },
    ) as Promise<SubjectStats>,
  }
}

export const statsApi = createStatsApi()
