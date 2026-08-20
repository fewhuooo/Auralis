import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createOptimisticMutation,
  mapAssetView,
  mapKnowledgeBlockView,
  mapSourceView,
  mapSubjectView,
  nextPageCursor,
} from '../src/services/domainMappers.ts'

test('maps current subject DTO to the PC view model without legacy fields', () => {
  const subject = mapSubjectView({
    id: 'subject-1',
    name: 'Algorithms',
    description: 'Core algorithms',
    iconKey: 'book',
    color: '#7D9372',
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
})

test('maps source DTO fields and preserves deletedAt/version', () => {
  const source = mapSourceView({
    id: 'source-1',
    subjectId: 'subject-1',
    type: 'FILE',
    title: 'notes.pdf',
    assetId: 'asset-1',
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
