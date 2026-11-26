import type { ReviewState } from '../api/reviewApi.ts'
import { copyText } from '../platform/clipboard.ts'
import type { KnowledgeBlock } from '../store/useBlockStore.ts'
import type { Subject } from '../store/useSubjectStore.ts'
import { plainMarkdownExcerpt } from './markdown.ts'

export type MobileStudyMode = 'learn' | 'review' | 'self-test'
export type MobileGroupSize = 5 | 10

export type BlockReviewStageKey =
  | 'needs-learning'
  | 'pending-check'
  | 'due'
  | 'scheduled'
  | 'mastered'
  | 'unstarted'

export interface BlockReviewStageBadge {
  key: BlockReviewStageKey
  label: string
  tone: 'warning' | 'sage' | 'muted'
}

export interface SubjectReviewSummary {
  blockCount: number
  pendingLearningCount: number
  unsyncedLearningCount: number
  reviewingCount: number
  masteredCount: number
  dueReviewCount: number
  pendingCheckCount: number
  selfTestCount: number
  masteryPercent: number
  distributionPercents: {
    learning: number
    reviewing: number
    mastered: number
  }
  badgeCount: number
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function isDueReviewState(state: ReviewState | undefined, dueBlockIds: ReadonlySet<string>, nowMs: number): boolean {
  if (!state || state.needsLearning) return false
  if (state.pendingReviewId) return true
  if (state.mastered) return false
  if (state.knowledgeBlockId && dueBlockIds.has(state.knowledgeBlockId)) return true
  const dueMs = state.dueAt ? Date.parse(state.dueAt) : Number.NaN
  return Number.isFinite(dueMs) && dueMs <= nowMs
}

export function resolveBlockReviewStage(
  state: ReviewState | undefined,
  dueBlockIds: ReadonlySet<string>,
  nowMs = Date.now(),
): BlockReviewStageBadge {
  if (!state) {
    return { key: 'unstarted', label: '待学习', tone: 'muted' }
  }
  if (state.needsLearning) {
    return { key: 'needs-learning', label: '待巩固', tone: 'warning' }
  }
  if (state.pendingReviewId) {
    return { key: 'pending-check', label: '待核对', tone: 'warning' }
  }
  if (state.mastered) {
    return { key: 'mastered', label: '已掌握', tone: 'muted' }
  }
  const dueMs = state.dueAt ? Date.parse(state.dueAt) : Number.NaN
  if ((state.knowledgeBlockId && dueBlockIds.has(state.knowledgeBlockId)) || (Number.isFinite(dueMs) && dueMs <= nowMs)) {
    return { key: 'due', label: '待复习', tone: 'sage' }
  }
  return { key: 'scheduled', label: '已学', tone: 'muted' }
}

export function summarizeSubjectReview(
  blocks: readonly KnowledgeBlock[],
  states: readonly ReviewState[],
  dueQueueIds: ReadonlySet<string> = new Set(),
  nowMs = Date.now(),
): SubjectReviewSummary {
  const deletedIds = new Set(blocks.filter(item => item.is_deleted).map(item => item.id))
  const activeBlocks = blocks.filter(item => !item.is_deleted)
  const activeBlockById = new Map(activeBlocks.map(item => [item.id, item]))
  const stateById = new Map<string, ReviewState>()
  const effectiveIds: string[] = []
  const seenIds = new Set<string>()

  for (const item of activeBlocks) {
    if (!item.id || seenIds.has(item.id)) continue
    seenIds.add(item.id)
    effectiveIds.push(item.id)
  }
  for (const state of states) {
    const id = state.knowledgeBlockId
    if (!id) continue
    stateById.set(id, state)
    if (!deletedIds.has(id) && !seenIds.has(id)) {
      seenIds.add(id)
      effectiveIds.push(id)
    }
  }

  let pendingLearningCount = 0
  let unsyncedLearningCount = 0
  let reviewingCount = 0
  let masteredCount = 0
  let dueReviewCount = 0
  let pendingCheckCount = 0
  let selfTestCount = 0

  for (const id of effectiveIds) {
    const state = stateById.get(id)
    const block = activeBlockById.get(id)
    if (!state || state.needsLearning) {
      pendingLearningCount++
      if (block?.sync_status === 'pending_create') unsyncedLearningCount++
      continue
    }
    selfTestCount++
    if (state.pendingReviewId) {
      pendingCheckCount++
      dueReviewCount++
      if (state.mastered) {
        masteredCount++
        continue
      }
      reviewingCount++
      continue
    }
    if (state.mastered) {
      masteredCount++
      continue
    }
    reviewingCount++
    if (isDueReviewState(state, dueQueueIds, nowMs)) {
      dueReviewCount++
    }
  }

  const blockCount = effectiveIds.length
  const masteryPercent = blockCount === 0 ? 0 : Math.min(100, Math.round((masteredCount / blockCount) * 100))
  const masteredPct = blockCount === 0 ? 0 : Number(((masteredCount / blockCount) * 100).toFixed(1))
  const reviewingPct = blockCount === 0 ? 0 : Number(((reviewingCount / blockCount) * 100).toFixed(1))
  const learningPct = blockCount === 0 ? 0 : Number(Math.max(0, 100 - masteredPct - reviewingPct).toFixed(1))

  return {
    blockCount,
    pendingLearningCount,
    unsyncedLearningCount,
    reviewingCount,
    masteredCount,
    dueReviewCount,
    pendingCheckCount,
    selfTestCount,
    masteryPercent,
    distributionPercents: {
      learning: learningPct,
      reviewing: reviewingPct,
      mastered: masteredPct,
    },
    badgeCount: dueReviewCount + pendingLearningCount,
  }
}

export function selectStudyCandidateIds(input: {
  mode: MobileStudyMode
  blocks: readonly KnowledgeBlock[]
  states: readonly ReviewState[]
  groupSize: MobileGroupSize
  nowMs?: number
  random?: () => number
}): { ids: string[]; unsyncedCount: number } {
  const nowMs = input.nowMs ?? Date.now()
  const random = input.random ?? Math.random
  const deletedIds = new Set(input.blocks.filter(item => item.is_deleted).map(item => item.id))
  const activeBlocks = input.blocks.filter(item => !item.is_deleted)
  const unsyncedIds = new Set(
    activeBlocks.filter(item => item.sync_status === 'pending_create').map(item => item.id),
  )

  const stateById = new Map<string, ReviewState>()
  const visibleStateIds: string[] = []
  for (const state of input.states) {
    const id = state.knowledgeBlockId
    if (!id || deletedIds.has(id)) continue
    if (!stateById.has(id)) visibleStateIds.push(id)
    stateById.set(id, state)
  }

  if (input.mode === 'learn') {
    const orderedIds: string[] = []
    const seen = new Set<string>()
    for (const item of activeBlocks) {
      if (!item.id || unsyncedIds.has(item.id) || seen.has(item.id)) continue
      const state = stateById.get(item.id)
      if (!state || state.needsLearning) {
        seen.add(item.id)
        orderedIds.push(item.id)
      }
    }
    for (const id of visibleStateIds) {
      if (seen.has(id) || unsyncedIds.has(id)) continue
      if (stateById.get(id)?.needsLearning) {
        seen.add(id)
        orderedIds.push(id)
      }
    }
    return { ids: orderedIds, unsyncedCount: unsyncedIds.size }
  }

  if (input.mode === 'self-test') {
    const pool = visibleStateIds.filter((id) => {
      const state = stateById.get(id)
      return Boolean(state && !state.needsLearning && !unsyncedIds.has(id))
    })
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return { ids: pool.slice(0, input.groupSize), unsyncedCount: unsyncedIds.size }
  }

  const pendingCheckIds: string[] = []
  const dueIds: string[] = []
  const emptyDueSet = new Set<string>()
  for (const id of visibleStateIds) {
    const state = stateById.get(id)
    if (!state || state.needsLearning || unsyncedIds.has(id)) continue
    if (state.pendingReviewId) {
      pendingCheckIds.push(id)
      continue
    }
    if (isDueReviewState(state, emptyDueSet, nowMs)) {
      dueIds.push(id)
    }
  }
  dueIds.sort((leftId, rightId) => {
    const leftMs = Date.parse(stateById.get(leftId)?.dueAt ?? '')
    const rightMs = Date.parse(stateById.get(rightId)?.dueAt ?? '')
    return leftMs - rightMs
  })
  return { ids: [...pendingCheckIds, ...dueIds], unsyncedCount: unsyncedIds.size }
}

export function filterSubjectBlocks(
  blocks: readonly KnowledgeBlock[],
  subjectId: string,
  query: string,
): KnowledgeBlock[] {
  const scoped = blocks.filter(item => !item.is_deleted && item.subjectId === subjectId)
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return scoped
  return scoped.filter((item) => (
    item.title.toLowerCase().includes(trimmed)
    || item.preview.toLowerCase().includes(trimmed)
    || plainMarkdownExcerpt(item.preview || '').toLowerCase().includes(trimmed)
    || (item.source || '').toLowerCase().includes(trimmed)
  ))
}

export function resolveInitialLearnSubjectId(
  subjects: readonly Pick<Subject, 'id'>[],
  preferredSubjectId?: string | null,
  dueCounts?: Readonly<Record<string, number>>,
): string {
  if (subjects.length === 0) return ''
  if (preferredSubjectId && subjects.some(item => item.id === preferredSubjectId)) {
    return preferredSubjectId
  }
  const withDue = dueCounts ? subjects.find(item => (dueCounts[item.id] ?? 0) > 0) : undefined
  return withDue?.id ?? subjects[0].id
}

export function buildMobileReviewUrl(
  subjectId: string,
  mode: MobileStudyMode = 'review',
  groupSize: MobileGroupSize = 5,
): string {
  const encoded = encodeURIComponent(subjectId)
  return `/pages/mobile/review/index?subjectId=${encoded}&mode=${mode}&groupSize=${groupSize}`
}

export function parseMobileReviewQuery(query?: Record<string, unknown>): {
  subjectId: string
  mode: MobileStudyMode
  groupSize: MobileGroupSize
} {
  const rawSubject = typeof query?.subjectId === 'string' ? query.subjectId.trim() : ''
  let subjectId = rawSubject
  if (rawSubject) {
    try {
      subjectId = decodeURIComponent(rawSubject)
    } catch {
      subjectId = rawSubject
    }
  }
  const rawMode = query?.mode
  const mode: MobileStudyMode = rawMode === 'learn'
    ? 'learn'
    : rawMode === 'self-test'
      ? 'self-test'
      : 'review'
  const rawSize = Number(query?.groupSize)
  const groupSize: MobileGroupSize = rawSize === 10 ? 10 : 5
  return { subjectId, mode, groupSize }
}

export function formatBlockTimestamp(raw?: string): string {
  if (!raw) return ''
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return ''
  const date = new Date(ms)
  const now = new Date()
  const timeText = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  ) {
    return `今天 ${timeText}`
  }
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${timeText}`
}

export function formatBlockMeta(source?: string | null, time?: string | null): string {
  const rawSource = (source || '').trim()
  const visibleSource = rawSource && rawSource !== '自主整理' ? rawSource : ''
  const formattedTime = formatBlockTimestamp(time || undefined)
  if (visibleSource && formattedTime) return `${visibleSource} · ${formattedTime}`
  return visibleSource || formattedTime
}

export function computeLeadingScrollLeft(input: {
  containerLeft: number
  containerWidth: number
  currentScrollLeft: number
  itemLeft: number
  leadingInset?: number
  maxScrollLeft?: number
}): number {
  if (input.containerWidth <= 0) return 0
  const inset = Math.max(0, input.leadingInset ?? 0)
  const itemOffsetLeft = (input.itemLeft - input.containerLeft) + input.currentScrollLeft
  const target = Math.max(0, Math.round(itemOffsetLeft - inset))
  if (typeof input.maxScrollLeft === 'number' && Number.isFinite(input.maxScrollLeft)) {
    return Math.min(Math.max(0, Math.round(input.maxScrollLeft)), target)
  }
  return target
}

export function copyTextWithFallback(text: string): Promise<boolean> {
  return copyText(text)
}
