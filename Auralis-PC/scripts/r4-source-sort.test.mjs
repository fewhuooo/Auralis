import assert from 'node:assert/strict'
import test from 'node:test'
import { sortSources } from '../src/services/domainMappers.ts'

test('sortSources remains deterministic when uploaded source timestamps are equal or missing', () => {
  const base = { subjectId: 'subject', name: '', filePath: '', fileType: '', fileSize: 0, catalogJson: '[]', blockCount: 0, version: 0, deletedAt: null }
  const input = [
    { ...base, id: 'b', createdAt: '2026-01-01T00:00:00.000Z' },
    { ...base, id: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
    { ...base, id: 'z', createdAt: undefined },
  ]
  assert.deepEqual(sortSources(input).map(item => item.id), ['b', 'a', 'z'])
  assert.deepEqual(sortSources([...input].reverse()).map(item => item.id), ['b', 'a', 'z'])
})
