import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createOptimisticMutation,
  isCanonicalTaskStatus,
  mapAssetView,
  mapKnowledgeBlockView,
  mapReviewStateView,
  mapStatsOverviewView,
  mapTaskView,
  mapSourceView,
  mapSubjectView,
  nextPageCursor,
} from '../src/services/domainMappers.ts'
import { readFile } from 'node:fs/promises'

test('SubjectCreateModal preserves subject version for edit operations', async () => {
  const root = new URL('../src/', import.meta.url)
  const modal = await readFile(new URL('components/subject/SubjectCreateModal.vue', root), 'utf8')

  // The concurrency contract requires that an edit provides the existing baseVersion.
  // We check that the component maps the version field into its internal form state.
  assert.match(
    modal,
    /version:\s*props\.subjectData\.version/,
    'SubjectCreateModal must preserve the subject version to satisfy the baseVersion contract',
  )
})

test('PC subject views use the global theme instead of removed Subject.color', async () => {
  const root = new URL('../src/', import.meta.url)
  const [dashboard, home, timeline] = await Promise.all([
    readFile(new URL('views/Dashboard/index.vue', root), 'utf8'),
    readFile(new URL('views/Home/index.vue', root), 'utf8'),
    readFile(new URL('views/Timeline/index.vue', root), 'utf8'),
  ])

  for (const page of [dashboard, home, timeline]) {
    assert.doesNotMatch(page, /\b(?:subj|selectedSubj|subjObj|activeSubject)\??\.color\b/)
    assert.doesNotMatch(page, /\bactiveSubject\.value\.color\b/)
  }
  assert.match(home, /subjectStore\.addSubject\(formData\.name, formData\.description, formData\.icon\)/)
  assert.doesNotMatch(home, /formData\.color/)
})

test('maps current subject DTO to the PC view model without legacy fields', () => {
  const subject = mapSubjectView({
    id: 'subject-1',
    name: 'Algorithms',
    description: 'Core algorithms',
    iconKey: 'book',
    version: 4,
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-08-20T01:00:00Z',
    deletedAt: null,
  }, { blockCount: 2, fileCount: 1 })

  assert.equal(subject.id, 'subject-1')
  assert.equal(subject.icon, 'book')
  assert.equal(subject.version, 4)
  assert.equal(subject.blockCount, 2)
  assert.equal(subject.fileCount, 1)
  assert.equal('created_at' in subject, false)
  assert.equal('color' in subject, false, 'Subject model must not expose color')
})

test('maps source DTO fields and preserves deletedAt/version', () => {
  const source = mapSourceView({
    id: 'source-1',
    subjectId: 'subject-1',
    type: 'FILE',
    title: 'notes.pdf',
    assetId: 'asset-1',
    assetSizeBytes: 3982329,
    outline: '[{"title":"Chapter 1","sections":[]}]',
    ingestionStatus: 'READY',
    version: 3,
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-08-20T01:00:00Z',
    deletedAt: '2026-08-20T02:00:00Z',
  })

  assert.deepEqual({
    id: source.id,
    subjectId: source.subjectId,
    name: source.name,
    filePath: source.filePath,
    fileType: source.fileType,
    catalogJson: source.catalogJson,
    version: source.version,
    deletedAt: source.deletedAt,
  }, {
    id: 'source-1',
    subjectId: 'subject-1',
    name: 'notes.pdf',
    filePath: 'asset-1',
    fileType: 'application/octet-stream',
    catalogJson: '[{"title":"Chapter 1","sections":[]}]',
    version: 3,
    deletedAt: '2026-08-20T02:00:00Z',
  })
  assert.equal(source.fileSize, 3982329)
})

test('maps knowledge block and asset DTOs to stable UI fields', () => {
  const block = mapKnowledgeBlockView({
    id: 'block-1',
    subjectId: 'subject-1',
    sourceId: 'source-1',
    title: 'Big O',
    summary: 'Complexity summary',
    content: 'Content',
    tags: ['complexity'],
    colorOverride: '#abc',
    version: 2,
    deletedAt: null,
  })
  const asset = mapAssetView({
    id: 'asset-1',
    originalName: 'notes.pdf',
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    uploadStatus: 'READY',
    createdAt: '2026-08-20T00:00:00Z',
  })

  assert.equal(block.preview, 'Complexity summary')
  assert.equal(block.sourceFileId, 'source-1')
  assert.equal(block.version, 2)
  assert.equal(asset.name, 'notes.pdf')
  assert.equal(asset.sizeBytes, 1024)
  assert.equal(asset.status, 'READY')
})

test('records optimistic mutations with baseVersion and clientMutationId', () => {
  const mutation = createOptimisticMutation({
    resourceType: 'SUBJECT',
    resourceId: 'subject-1',
    mutationType: 'UPDATE',
    baseVersion: 4,
    payload: { name: 'Algorithms 2' },
    clientMutationId: 'mutation-1',
  })

  assert.deepEqual(mutation, {
    clientMutationId: 'mutation-1',
    resourceType: 'SUBJECT',
    resourceId: 'subject-1',
    mutationType: 'UPDATE',
    baseVersion: 4,
    payload: { name: 'Algorithms 2' },
  })
})

test('advances only with a declared next page cursor', () => {
  assert.equal(nextPageCursor({ hasMore: true, nextCursor: 'cursor-2' }), 'cursor-2')
  assert.equal(nextPageCursor({ hasMore: false, nextCursor: 'cursor-ignored' }), undefined)
  assert.equal(nextPageCursor({ hasMore: true }), undefined)
})

test('recognizes only API task statuses as canonical DTO statuses', () => {
  assert.equal(isCanonicalTaskStatus('TODO'), true)
  assert.equal(isCanonicalTaskStatus('IN_PROGRESS'), true)
  assert.equal(isCanonicalTaskStatus('DONE'), true)
  assert.equal(isCanonicalTaskStatus('CANCELLED'), true)
  assert.equal(isCanonicalTaskStatus('completed'), false)
  assert.equal(isCanonicalTaskStatus('pending'), false)
})

test('maps task DTO fields without reusing legacy UI field names', () => {
  const task = mapTaskView({
    id: 'task-1',
    subjectId: 'subject-1',
    title: 'Review algorithms',
    description: 'Spaced repetition',
    status: 'IN_PROGRESS',
    scheduledAt: '2026-08-20T09:30:00Z',
    dueAt: '2026-08-21T00:00:00Z',
    durationMinutes: 45,

    sortKey: 'a',
    version: 7,
    deletedAt: null,
  })

  assert.deepEqual(task, {
    id: 'task-1',
    subjectId: 'subject-1',
    title: 'Review algorithms',
    description: 'Spaced repetition',
    status: 'IN_PROGRESS',
    scheduledAt: '2026-08-20T09:30:00Z',
    dueAt: '2026-08-21T00:00:00Z',
    durationMinutes: 45,

    sortKey: 'a',
    version: 7,
    createdAt: undefined,
    updatedAt: undefined,
    deletedAt: null,
  })
  assert.equal('startTime' in task, false)
  assert.equal('loadText' in task, false)
})

test('maps review and stats DTOs with stable defaults and query-safe fields', () => {
  const review = mapReviewStateView({
    knowledgeBlockId: 'block-1',
    dueAt: '2026-08-20T10:00:00Z',
    difficulty: 4.2,
    stability: 2.5,
    reps: 3,
    lapses: 1,
    version: 2,
  })
  const stats = mapStatsOverviewView({
    activeKnowledgeBlocks: 12,
    activeTasks: 5,
    dueReviews: 3,
    completedReviewEvents: 8,
    activeSources: 4,
  })

  assert.equal(review.knowledgeBlockId, 'block-1')
  assert.equal(review.reps, 3)
  assert.equal(review.version, 2)
  assert.deepEqual(stats, {
    activeKnowledgeBlocks: 12,
    activeTasks: 5,
    dueReviews: 3,
    completedReviewEvents: 8,
    activeSources: 4,
  })
})
