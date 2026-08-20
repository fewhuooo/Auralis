import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient'

export type StatsOverview = components['schemas']['StatsOverviewView']
export type WeeklyStats = components['schemas']['WeeklyStatsView']

export function createStatsApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    overview: (at = new Date().toISOString()) => client.request(
      '/api/stats/overview', 'get', { query: { at } },
    ) as Promise<StatsOverview>,
    weekly: (from: string, to: string) => client.request(
      '/api/stats/weekly', 'get', { query: { from, to } },
    ) as Promise<WeeklyStats>,
  }
}

export const statsApi = createStatsApi()
