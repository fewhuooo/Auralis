import assert from 'node:assert/strict'
import { test } from 'node:test'
import { studyMetrics } from '../src/utils/studyMetrics.ts'

test('显示真实专注和任务完成，排除复习耗时和待办数量', () => {
  const metrics = studyMetrics(
    { activeKnowledgeBlocks: 12, activeTasks: 20, focusSeconds: 5400, focusCompletedCount: 3 },
    { days: [
      { completedTaskCount: 2, createdKnowledgeCount: 1, studySeconds: 7200 },
      { completedTaskCount: 1, createdKnowledgeCount: 4, studySeconds: 3600 },
    ] },
  )

  assert.deepEqual(metrics, [
    { label: '知识块', value: 12 },
    { label: '本周完成任务', value: 3 },
    { label: '累计专注', value: '1.5 小时' },
    { label: '完成番茄', value: 3 },
    { label: '本周新增知识块', value: 5 },
  ])
})
