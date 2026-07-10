import request from './request'

export const useStatsApi = {
  getOverview(): Promise<Record<string, any>> {
    return request.get('/api/stats/overview')
  },
  getWeekly(): Promise<Record<string, any>> {
    return request.get('/api/stats/weekly')
  }
}
