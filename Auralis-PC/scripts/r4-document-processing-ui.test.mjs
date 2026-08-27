import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

test('document processing exposes a compact status dot and profile progress center', async () => {
  const dot = await source('src/components/documentProcessing/DocumentProcessingDot.vue')
  assert.match(dot, /v-if="visible"/)
  assert.match(dot, /phase !== 'READY'/)
  assert.match(dot, /FAILED_SERVER/)
  const center = await source('src/components/documentProcessing/DocumentProcessingCenter.vue')
  assert.match(center, /store\.retry/)
  assert.match(center, /store\.cancel/)
  const profile = await source('src/views/Profile/index.vue')
  assert.match(profile, /DocumentProcessingCenter/)
  const workspace = await source('src/views/SubjectWorkspace/index.vue')
  assert.match(workspace, /DocumentProcessingDot/)
  assert.match(workspace, /DocumentNotReadyDialog/)
  assert.match(workspace, /showProcessingRequired/)
})
