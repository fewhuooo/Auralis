import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const apiSource = fs.readFileSync(path.join(root, 'src', 'api', 'tauri.ts'), 'utf8')
const rustSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'document_packager.rs'), 'utf8')
const libSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8')

test('document cache API exposes only bounded package commands', () => {
  for (const name of ['documentPackageBegin', 'documentPackageAppend', 'documentPackageFinish', 'documentCacheDelete']) {
    assert.match(apiSource, new RegExp(`export const ${name}`))
  }
  assert.match(apiSource, /text\.length > 100_000/)
  assert.doesNotMatch(apiSource, /documentCacheOpen|openDecryptedReader/)
})

test('Rust cache reader stays internal and commands do not accept arbitrary paths', () => {
  assert.match(rustSource, /open_decrypted_reader/)
  assert.match(rustSource, /cache_path\(&cache_id\)/)
  assert.doesNotMatch(rustSource, /path:\s*String.*document_package_begin/s)
  assert.match(libSource, /document_packager::document_package_begin/)
  assert.match(libSource, /document_packager::document_cache_delete/)
  assert.doesNotMatch(libSource, /document_packager::open_decrypted_reader/)
})
