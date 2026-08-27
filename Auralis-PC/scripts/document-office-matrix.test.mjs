import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'scripts', 'fixtures', 'document-parser', 'office-manifest.json')
const legacyPptGeneratorPath = path.join(root, 'scripts', 'fixtures', 'document-parser', 'GenerateLegacyPpt.java')
const bridgePath = path.join(root, 'src', 'services', 'documentParser', 'fileViewerBridge.ts')
const hostPath = path.join(root, 'src', 'components', 'preview', 'BackgroundParserHost.vue')

test('office parser matrix has real DOC/DOCX/PPT/PPTX fixtures and explicit outcomes', () => {
  assert.ok(existsSync(manifestPath), 'office fixture manifest must exist')
  assert.ok(existsSync(legacyPptGeneratorPath), 'legacy PPT generator source must exist')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.formats.length, 4)
  assert.deepEqual(manifest.formats.map((entry) => entry.extension), ['.doc', '.docx', '.ppt', '.pptx'])
  for (const entry of manifest.formats) {
    const fixturePath = path.resolve(root, '..', entry.fixture)
    assert.ok(existsSync(fixturePath), `${entry.extension} fixture must exist`)
    const fixtureBytes = readFileSync(fixturePath)
    assert.ok(fixtureBytes.length > 512, `${entry.extension} fixture must be non-empty`)
    if (entry.extension === '.ppt') {
      assert.deepEqual(
        [...fixtureBytes.subarray(0, 8)],
        [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
        'legacy PPT fixture must be an OLE compound document, not a renamed PPTX',
      )
    }
    assert.ok(entry.expected.includes('extract'))
    assert.ok(entry.expected.includes('bitmap-fallback'))
    assert.ok(entry.expected.includes('OFFICE_TEXT_UNAVAILABLE'))
  }
})

test('background host loads Office files outside the visible preview without display:none', () => {
  assert.ok(existsSync(bridgePath), 'file viewer parser bridge must exist')
  assert.ok(existsSync(hostPath), 'background parser host must exist')
  const bridge = readFileSync(bridgePath, 'utf8')
  const host = readFileSync(hostPath, 'utf8')
  for (const method of ['prepare', 'extractChunks', 'extractAnchors', 'renderPageBitmap', 'dispose']) {
    assert.match(bridge, new RegExp(method))
  }
  assert.match(host, /defineExpose/)
  assert.match(host, /width:\s*1024px/)
  assert.match(host, /height:\s*768px/)
  assert.doesNotMatch(host, /display\s*:\s*none/)
})

test('Office extraction keeps chunks and anchors ordered or returns stable fallback', () => {
  const bridge = readFileSync(bridgePath, 'utf8')
  assert.match(bridge, /OFFICE_TEXT_UNAVAILABLE/)
  assert.match(bridge, /sort|ordinal|index/i)
  assert.match(bridge, /bitmap-fallback|renderPageBitmap/)
})
