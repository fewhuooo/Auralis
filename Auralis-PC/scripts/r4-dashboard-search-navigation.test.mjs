import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const searchPalette = await readFile(new URL('../src/components/SearchPalette.vue', import.meta.url), 'utf8')
const dashboard = await readFile(new URL('../src/views/Dashboard/index.vue', import.meta.url), 'utf8')

test('search result navigation carries its block id through the Dashboard route lifecycle', () => {
  assert.match(searchPalette, /router\.push\(\{\s*path:\s*'\/'\s*,\s*query:\s*\{\s*openBlock:\s*block\.id\s*\}\s*\}\)/)

  const watchStart = dashboard.indexOf("() => route.query.openBlock")
  const watchEnd = dashboard.indexOf("onUnmounted(() => {", watchStart)
  assert.notEqual(watchStart, -1)
  assert.notEqual(watchEnd, -1)
  const consumer = dashboard.slice(watchStart, watchEnd)
  const loadIndex = consumer.indexOf('await knowledgeStore.loadLocalBlocks()')
  const resolveIndex = consumer.indexOf('recentBlocks.value.find((candidate) => candidate.id === blockId)')
  const clearIndex = consumer.indexOf('delete query.openBlock')
  const replaceIndex = consumer.indexOf('await router.replace({ path: route.path, query, hash: route.hash })')
  assert.ok(loadIndex >= 0 && loadIndex < resolveIndex)
  assert.ok(resolveIndex < clearIndex && clearIndex < replaceIndex)
  assert.match(consumer, /\{ immediate: true \}/)
})

test('Dashboard retains the detail event listener used by direct in-page callers', () => {
  assert.match(dashboard, /window\.addEventListener\('open-block-detail', handleOpenBlockDetailEvent\)/)
  assert.match(dashboard, /window\.removeEventListener\('open-block-detail', handleOpenBlockDetailEvent\)/)
})
