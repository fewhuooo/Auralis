import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('subject file registration validates prerequisites and exposes upload state', async () => {
  const source = await readFile(new URL('../src/views/SubjectWorkspace/index.vue', import.meta.url), 'utf8')

  assert.match(source, /!registerForm\.subjectId\s*\|\|\s*!droppedFile\s*\|\|\s*isUploading/)
  assert.match(source, /const isUploading = ref\(false\)/)
  assert.match(source, /isUploading\.value = true/)
  assert.match(source, /finally\s*\{[\s\S]*?isUploading\.value = false/)
  assert.match(source, /const asset = await assetStore\.upload\(currentFile\)/)
  assert.match(source, /await sourceStore\.createFileSource\(targetSubjectId, registerForm\.value\.name\.trim\(\), asset\.id\)/)
  assert.match(source, /ElNotification\(\{ title: '录入失败'/)
})
