import type { SubjectStatsView } from '@/api/useStatsApi'
import type { LocalSqlDatabase } from '@/services/localSchema'
import type { LocalRepository } from '@/services/localRepository'
import { ReviewRepository } from '@/services/reviewRepository'
import { LocalReviewService } from '@/services/localReviewService'

type LocalValue = Record<string, unknown>
type DayTotals = {
  date: string
  nonSkipReviewEventCount: number
  distinctReviewedKnowledgeBlockCount: number
  firstLearningKnowledgeBlockCount: number
  subsequentReviewKnowledgeBlockCount: number
  createdKnowledgeBlockCount: number
  completedTaskCount: number
  learningCompletionCount: number
  distinctStudiedKnowledgeBlockCount: number
  studiedIds: Set<string>
  reviewedIds: Set<string>
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length ? value : null
}

function dateOnly(instant: string, timeZone: string): string | null {
  const date = new Date(instant)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  return year && month && day ? `${year}-${month}-${day}` : null
}

function todayInZone(timeZone: string): string {
  return dateOnly(new Date().toISOString(), timeZone)!
}

function recentDates(days: number, timeZone: string): string[] {
  const today = todayInZone(timeZone)
  const cursor = new Date(`${today}T00:00:00.000Z`)
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(cursor)
    date.setUTCDate(cursor.getUTCDate() - (days - index - 1))
    return date.toISOString().slice(0, 10)
  })
}

function subjectOf(value: LocalValue): string | null {
  return stringValue(value.subjectId ?? value.subject_id)
}

function sourceKind(value: LocalValue): 'FILE' | 'TEXT' | 'URL' | null {
  const kind = value.type ?? value.sourceType
  return kind === 'FILE' || kind === 'TEXT' || kind === 'URL' ? kind : null
}

function taskStatus(value: LocalValue): 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | null {
  const status = value.status
  if (status === 'TODO' || status === 'pending' || status === 'scheduled') return 'TODO'
  if (status === 'IN_PROGRESS' || status === 'learning' || status === 'to_review') return 'IN_PROGRESS'
  if (status === 'DONE' || status === 'completed') return 'DONE'
  if (status === 'CANCELLED' || status === 'cancelled') return 'CANCELLED'
  return null
}

function hasValidInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function mergeSourceAliases(value: LocalValue, rowId: string): string[] {
  return [
    rowId,
    stringValue(value.id),
    stringValue(value.serverSourceId),
    stringValue(value.server_source_id),
    stringValue(value.localSourceId),
    stringValue(value.local_source_id),
  ].filter((item): item is string => !!item)
}

export class LocalSubjectStats {
  static async compute(
    db: LocalSqlDatabase | 'localstorage',
    userId: string,
    deviceId: string,
    subjectId: string,
    days: 7 | 30,
    timeZone: string,
    localRepository?: LocalRepository,
  ): Promise<SubjectStatsView> {
    const repository = localRepository
    if (!repository) throw new Error('无法打开当前账号的本地资料。')

    // Reading state also checks current local body hashes and persists any reset.
    const reviewService = new LocalReviewService(db, repository)
    const states = (await reviewService.getSubjectStates(userId, deviceId, subjectId)).items ?? []
    const [subjects, blockRows, sourceRows, taskRows, reviewRecords] = await Promise.all([
      repository.list<LocalValue>('SUBJECT', { includeDeleted: true }),
      repository.list<LocalValue>('KNOWLEDGE_BLOCK', { includeDeleted: true }),
      repository.list<LocalValue>('SOURCE', { includeDeleted: true }),
      repository.list<LocalValue>('TASK', { includeDeleted: true }),
      new ReviewRepository(db, repository).getSubjectRecords(userId, deviceId, subjectId),
    ])
    if (!subjects.some(row => row.id === subjectId && !row.deletedAt)) {
      throw new Error('本地学科资料暂不可用。')
    }

    const subjectBlocks = blockRows.filter(row => subjectOf(row.value) === subjectId)
    const blocks = subjectBlocks.filter(row => !row.deletedAt)
    const tasks = taskRows.filter(row => !row.deletedAt && subjectOf(row.value) === subjectId)
    const completedTasks = taskRows.filter(row => subjectOf(row.value) === subjectId && taskStatus(row.value) === 'DONE')
    const sources = sourceRows.filter(row => !row.deletedAt && subjectOf(row.value) === subjectId)
    const reviewRecordById = new Map(reviewRecords.map(record => [record.knowledgeBlockId, record]))
    const pendingReviewCommandCount = (await new ReviewRepository(db, repository)
      .getUnresolvedIntents(userId, deviceId, blocks.map(block => block.id))).length

    const seenSourceIds = new Set<string>()
    let fileSourceCount = 0
    let textSourceCount = 0
    let urlSourceCount = 0
    for (const source of sources) {
      const aliases = mergeSourceAliases(source.value, source.id)
      if (aliases.some(alias => seenSourceIds.has(alias))) continue
      aliases.forEach(alias => seenSourceIds.add(alias))
      const type = sourceKind(source.value)
      if (type === 'FILE') fileSourceCount += 1
      else if (type === 'TEXT') textSourceCount += 1
      else if (type === 'URL') urlSourceCount += 1
    }

    const stateById = new Map(states.map(state => [state.knowledgeBlockId, state]))
    let pendingLearningCount = 0
    let reviewingCount = 0
    let masteredCount = 0
    let dueReviewCount = 0
    let scheduledReviewCount = 0
    let newLearningCount = 0
    const now = Date.now()
    for (const block of blocks) {
      const state = stateById.get(block.id)
      if (!state || state.needsLearning) {
        pendingLearningCount += 1
        const presence = state as (typeof state & {
          statePresenceKnown?: boolean
          persistedStatePresent?: boolean
        }) | undefined
        if (presence?.statePresenceKnown === true && presence.persistedStatePresent === false) newLearningCount += 1
      } else if (state.mastered) {
        masteredCount += 1
      } else {
        reviewingCount += 1
        if (hasValidInstant(state.dueAt) && Date.parse(state.dueAt) <= now) dueReviewCount += 1
        else scheduledReviewCount += 1
      }
    }

    let todoTaskCount = 0
    let inProgressTaskCount = 0
    let doneTaskCount = 0
    let cancelledTaskCount = 0
    for (const task of tasks) {
      switch (taskStatus(task.value)) {
        case 'TODO': todoTaskCount += 1; break
        case 'IN_PROGRESS': inProgressTaskCount += 1; break
        case 'DONE': doneTaskCount += 1; break
        case 'CANCELLED': cancelledTaskCount += 1; break
      }
    }

    const dateRange = recentDates(days, timeZone)
    const dailyByDate = new Map(dateRange.map(date => [date, {
      date,
      nonSkipReviewEventCount: 0,
      distinctReviewedKnowledgeBlockCount: 0,
      firstLearningKnowledgeBlockCount: 0,
      subsequentReviewKnowledgeBlockCount: 0,
      createdKnowledgeBlockCount: 0,
      completedTaskCount: 0,
      learningCompletionCount: 0,
      distinctStudiedKnowledgeBlockCount: 0,
      studiedIds: new Set<string>(),
      reviewedIds: new Set<string>(),
    } satisfies DayTotals]))
    let historyComplete = blocks.every(block => {
      const record = reviewRecordById.get(block.id)
      return record?.historyImported === true
    })

    const touch = (date: string, kbId: string, studied: boolean, reviewed: boolean): DayTotals | null => {
      const day = dailyByDate.get(date)
      if (!day) return null
      if (studied) day.studiedIds.add(kbId)
      if (reviewed) day.reviewedIds.add(kbId)
      return day
    }

    for (const block of subjectBlocks) {
      const createdAt = stringValue(block.value.createdAt ?? block.value.created_at ?? block.value.time)
      if (createdAt) {
        const date = dateOnly(createdAt, timeZone)
        const day = date ? dailyByDate.get(date) : null
        if (day) day.createdKnowledgeBlockCount += 1
      }
    }
    for (const task of completedTasks) {
      const completedAt = stringValue(task.value.completedAt ?? task.value.completed_at)
      if (!completedAt) {
        historyComplete = false
        continue
      }
      const date = dateOnly(completedAt, timeZone)
      const day = date ? dailyByDate.get(date) : null
      if (day) day.completedTaskCount += 1
    }

    const ratingCounts = { againCount: 0, hardCount: 0, goodCount: 0, easyCount: 0 }
    const addRating = (rating: unknown): void => {
      if (rating === 'AGAIN') ratingCounts.againCount += 1
      else if (rating === 'HARD') ratingCounts.hardCount += 1
      else if (rating === 'GOOD') ratingCounts.goodCount += 1
      else if (rating === 'EASY') ratingCounts.easyCount += 1
    }
    for (const record of reviewRecords) {
      const blockId = record.knowledgeBlockId
      const commands = new Set<string>()
      for (const command of record.history ?? []) {
        if (command.action !== 'LEARNING_COMPLETED' || commands.has(command.clientCommandId)) continue
        commands.add(command.clientCommandId)
        const date = dateOnly(command.occurredAt, timeZone)
        if (!date) continue
        const day = dailyByDate.get(date)
        if (!day) continue
        day.learningCompletionCount += 1
        touch(date, blockId, true, false)
      }
      const effectiveByReview = new Map<string, (typeof record.effectiveReviews)[number]>()
      for (const review of record.effectiveReviews) effectiveByReview.set(review.reviewId, review)
      for (const review of effectiveByReview.values()) {
        if (!review.resolvedAt || !review.effectiveRating || review.resolution === 'SUPERSEDED') continue
        const date = dateOnly(review.selectedAt, timeZone)
        const day = date ? dailyByDate.get(date) : null
        if (!date || !day) continue
        day.nonSkipReviewEventCount += 1
        addRating(review.effectiveRating)
        touch(date, blockId, true, true)
      }
    }
    for (const day of dailyByDate.values()) {
      day.distinctReviewedKnowledgeBlockCount = day.reviewedIds.size
      day.distinctStudiedKnowledgeBlockCount = day.studiedIds.size
    }

    return {
      subjectId,
      generatedAt: new Date().toISOString(),
      timeZone,
      from: dateRange[0],
      to: dateRange[dateRange.length - 1],
      overview: {
        fileSourceCount,
        textSourceCount,
        urlSourceCount,
        activeKnowledgeBlockCount: blocks.length,
        activeTaskCount: todoTaskCount + inProgressTaskCount + doneTaskCount,
        todoTaskCount,
        inProgressTaskCount,
        doneTaskCount,
        cancelledTaskCount,
        newLearningCount,
        dueReviewCount,
        scheduledReviewCount,
        pendingLearningCount,
        reviewingCount,
        masteredCount,
      },
      daily: [...dailyByDate.values()].map(({ studiedIds: _studiedIds, reviewedIds: _reviewedIds, ...day }) => day),
      ratingCounts,
      historyCoverage: historyComplete ? 'COMPLETE' : 'INCOMPLETE',
      pendingReviewCommandCount,
    } as SubjectStatsView
  }
}
