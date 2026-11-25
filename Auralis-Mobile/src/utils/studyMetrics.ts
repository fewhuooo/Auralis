import type { StatsOverview, WeeklyStats } from '../api/statsApi'

export function studyMetrics(overview: StatsOverview, weekly: WeeklyStats) {
  return [
    { label: '知识块', value: overview.activeKnowledgeBlocks ?? '—' },
    { label: '本周完成任务', value: weekly.days?.reduce((sum, day) => sum + (day.completedTaskCount ?? 0), 0) ?? '—' },
    { label: '累计专注', value: overview.focusSeconds == null ? '—' : `${(overview.focusSeconds / 3600).toFixed(1)} 小时` },
    { label: '完成番茄', value: overview.focusCompletedCount ?? '—' },
    { label: '本周新增知识块', value: weekly.days?.reduce((sum, day) => sum + (day.createdKnowledgeCount ?? 0), 0) ?? '—' },
  ]
}
