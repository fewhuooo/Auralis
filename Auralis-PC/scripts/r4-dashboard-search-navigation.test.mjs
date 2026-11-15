import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { t } from '../src/i18n.ts'
import { computed, defineComponent, effectScope, nextTick, ref, watch } from 'vue'

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

test('the search palette accepts only current results after debounce and local reads', async () => {
  const timers = new Map()
  const navigations = []
  const reads = []
  const scope = effectScope()
  const search = scope.run(() => setupComponent(searchPalette, {}, {
    '@/store/useAuthStore': { useAuthStore: () => ({ isAuthenticated: true, loginGeneration: Symbol() }) },
    '@/store/useKnowledgeStore': {
      useKnowledgeStore: () => ({ readLocalBlocks: () => new Promise(resolve => reads.push(resolve)) }),
    },
    'vue-router': { useRouter: () => ({ push: location => navigations.push(location.query.openBlock) }) },
  }, {
    setTimeout: callback => {
      const id = Symbol()
      timers.set(id, callback)
      return id
    },
    clearTimeout: id => timers.delete(id),
  }))
  const startRead = () => {
    assert.equal(timers.size, 1)
    const [id, callback] = timers.entries().next().value
    timers.delete(id)
    return callback()
  }
  const enter = () => search.handleKeyNav({ key: 'Enter', preventDefault() {} })
  const blocks = [
    { id: 'a', title: 'Alpha', subject: '', content: '' },
    { id: 'b', title: 'Beta', subject: '', content: '' },
    { id: 'c', title: 'Gamma', subject: '', content: '' },
  ]
  try {
    search.open()
    search.query.value = 'alpha'
    const alphaRead = startRead()
    reads[0](blocks)
    await alphaRead
    const oldResult = search.searchResults.value[0]
    assert.equal(oldResult.id, 'a')
    search.handleKeyNav({ key: 'Enter', isComposing: true, preventDefault: assert.fail })
    assert.deepEqual(navigations, [])

    search.query.value = 'beta'
    enter()
    search.selectResult(oldResult)
    assert.deepEqual(navigations, [])
    const betaRead = startRead()
    enter()
    search.selectResult(oldResult)
    assert.deepEqual(navigations, [])

    search.query.value = 'gamma'
    const gammaRead = startRead()
    reads[2](blocks)
    await gammaRead
    reads[1](blocks)
    await betaRead
    search.selectResult(oldResult)
    assert.deepEqual(navigations, [])
    enter()
    assert.deepEqual(navigations, ['c'])

    search.open()
    search.query.value = 'alpha'
    const clearedRead = startRead()
    search.query.value = ''
    reads[3](blocks)
    await clearedRead
    assert.equal(search.searchResults.value.length, 0)
    assert.equal(search.isSearching.value, false)

    search.query.value = 'beta'
    const closedRead = startRead()
    search.close()
    search.open()
    reads[4](blocks)
    await closedRead
    assert.equal(search.searchResults.value.length, 0)
    assert.equal(search.isSearching.value, false)
  } finally {
    scope.stop()
  }
})

test('the palette and shared knowledge projection discard reads from a replaced login', async (t) => {
  const root = new URL('../src/', import.meta.url)
  const loader = registerHooks({
    resolve(specifier, context, nextResolve) {
      const withExtension = /\.[cm]?[jt]s$/.test(specifier) ? specifier : specifier + '.ts'
      if (specifier.startsWith('@/')) return nextResolve(new URL(withExtension.slice(2), root).href, context)
      if (specifier.startsWith('.') && context.parentURL?.startsWith(root.href)) {
        return nextResolve(new URL(withExtension, context.parentURL).href, context)
      }
      return nextResolve(specifier, context)
    },
  })
  const pinia = createPinia()
  const scope = effectScope()
  t.after(() => {
    scope.stop()
    disposePinia(pinia)
    loader.deregister()
  })
  const { useAuthStore } = await import('../src/store/useAuthStore.ts')
  const { useKnowledgeStore } = await import('../src/store/useKnowledgeStore.ts')
  const { getLocalRepository } = await import('../src/services/localDb.ts')
  setActivePinia(pinia)
  const auth = useAuthStore()
  const knowledge = useKnowledgeStore()
  const logIn = (id) => auth.setSession({
    user: { id, hasAvatar: false },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
    sessionId: `${id}-session`,
    serverDeviceId: 'search-device',
  })
  let timer
  const createPalette = () => scope.run(() => setupComponent(searchPalette, {}, {
    '@/store/useAuthStore': { useAuthStore },
    '@/store/useKnowledgeStore': { useKnowledgeStore },
    'vue-router': { useRouter: () => ({ push: assert.fail }) },
  }, {
    setTimeout: callback => { timer = callback; return 1 },
    clearTimeout: () => { timer = undefined },
  }))
  const anonymous = createPalette()
  anonymous.handleKeydown({ ctrlKey: true, key: 'k', preventDefault: assert.fail })
  anonymous.openEvent()
  assert.equal(anonymous.isVisible.value, false)

  logIn('search-user-a')
  const repoA = await getLocalRepository(auth.user.id, auth.serverDeviceId)
  for (const id of ['a', 'b']) {
    await repoA.upsert('KNOWLEDGE_BLOCK', id, { id, title: id, subjectId: id, content: 'fixture body' }, { version: 1 })
  }
  await knowledge.loadLocalBlocks(undefined, 'a')
  const palette = createPalette()
  palette.openEvent()
  palette.query.value = 'fixture'
  await timer()
  assert.deepEqual(Array.from(palette.searchResults.value, (block) => block.id).sort(), ['a', 'b'])
  assert.deepEqual(knowledge.recentBlocks.map(block => block.id), ['a'])

  auth.applyRefresh({ accessToken: 'rotated', refreshToken: 'rotated-refresh' }, 'rotated-session-id')
  assert.equal(palette.isVisible.value, true)
  assert.equal(palette.searchResults.value.length, 2)

  const started = Promise.withResolvers()
  const pending = Promise.withResolvers()
  const list = repoA.list.bind(repoA)
  t.mock.method(repoA, 'list', async (resource, options) => {
    if (resource === 'KNOWLEDGE_BLOCK') {
      started.resolve()
      await pending.promise
    }
    return list(resource, options)
  })
  palette.query.value = 'body'
  const search = timer()
  const projection = knowledge.fetchBlocks()
  await started.promise
  logIn('search-user-b')
  assert.equal(auth.isAuthenticated, true)
  assert.equal(palette.isVisible.value, false)
  assert.equal(palette.query.value, '')
  assert.equal(palette.searchResults.value.length, 0)
  assert.deepEqual(knowledge.recentBlocks, [])

  const repoB = await getLocalRepository(auth.user.id, auth.serverDeviceId)
  const blockB = { id: 'c', title: 'c', subjectId: 'c', content: 'fixture body' }
  await repoB.upsert('KNOWLEDGE_BLOCK', blockB.id, blockB, { version: 1 })
  await knowledge.loadLocalBlocks()
  pending.resolve()
  await search
  assert.deepEqual(await projection, [])
  assert.equal(palette.searchResults.value.length, 0)
  assert.equal(palette.isSearching.value, false)
  assert.deepEqual(knowledge.recentBlocks.map(block => block.id), ['c'])
})

test('the Dashboard detail copies raw text or reports an unsuccessful write', async () => {
  const source = await readFile(new URL('../src/components/knowledge/KnowledgeBlockViewDialog.vue', import.meta.url), 'utf8')
  const content = '# 知识块\n原始正文'
  for (const mode of ['native', 'missing', 'rejected', 'declined', 'throws']) {
    const feedback = []
    const writes = []
    const activeFields = new Set()
    let selectedField
    let focusRestored = false
    const originalRange = {}
    const ranges = [originalRange]
    class HTMLElement {
      focus() { focusRestored = true }
    }
    const navigator = mode === 'missing' ? {} : {
      clipboard: { writeText: async (text) => {
        if (mode !== 'native') throw new Error('permission denied')
        writes.push(text)
      } },
    }
    const dialog = setupComponent(source, { modelValue: true, block: { content } }, {
      'vue-router': { useRouter: () => ({}) },
      '@/utils/markdown': { renderMarkdown: value => value },
      '@/components/modal/ModalShell.vue': {},
      'element-plus': { ElMessage: {
        success: () => feedback.push('success'),
        error: () => feedback.push('error'),
      } },
    }, {
      navigator,
      HTMLElement,
      setTimeout: () => {},
      document: {
        activeElement: new HTMLElement(),
        getSelection: () => ({
          rangeCount: ranges.length,
          getRangeAt: index => ({ cloneRange: () => ranges[index] }),
          removeAllRanges: () => { ranges.length = 0 },
          addRange: range => ranges.push(range),
        }),
        body: { append: field => activeFields.add(field) },
        createElement(tag) {
          assert.equal(tag, 'textarea')
          return {
            style: {},
            select() {
              selectedField = this
              ranges.length = 0
            },
            remove() { activeFields.delete(this) },
          }
        },
        execCommand(command) {
          assert.equal(command, 'copy')
          assert.ok(activeFields.has(selectedField))
          if (mode === 'throws') throw new Error('copy blocked')
          if (mode === 'declined') return false
          writes.push(selectedField.value)
          return true
        },
      },
    })
    await dialog.handleCopy()
    const succeeded = mode !== 'declined' && mode !== 'throws'
    assert.deepEqual(writes, succeeded ? [content] : [], mode)
    assert.deepEqual(feedback, [succeeded ? 'success' : 'error'], mode)
    assert.equal(dialog.copied.value, succeeded, mode)
    assert.equal(activeFields.size, 0, mode)
    assert.equal(focusRestored, mode !== 'native', mode)
    assert.deepEqual(ranges, [originalRange], mode)
  }
})

function setupComponent(source, props, imports, globals) {
  const { descriptor } = parse(source)
  const { content } = compileScript(descriptor, { id: 'dashboard-search-navigation' })
  const { outputText } = ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const modules = {
    vue: { computed, defineComponent, nextTick, ref, watch, onMounted() {}, onUnmounted() {} },
    '@tabler/icons-vue': {},
    '@/i18n': { t },
    ...imports,
  }
  const exports = {}
  runInNewContext(outputText, {
    ...globals,
    exports,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), name)
      return modules[name]
    },
  })
  return exports.default.setup(props, { expose() {}, emit: assert.fail })
}
