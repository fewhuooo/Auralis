import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
    && context.parentURL && !/\.(?:ts|js|mjs)$/.test(specifier)) {
    return nextResolve(new URL(specifier + '.ts', context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const ts = await import('typescript')
const { createPinia, setActivePinia } = await import('pinia')
const { ref } = await import('vue')
const { useSubjectStore } = await import('../src/store/useSubjectStore.ts')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { useSyncStore } = await import('../src/store/useSyncStore.ts')
const { getLocalRepository } = await import('../src/services/localDb.ts')

let fixtureNumber = 0

async function readSetupScript(relativePath) {
  const text = await readFile(new URL(relativePath, new URL('../src/', import.meta.url)), 'utf8')
  const match = text.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)
  assert.ok(match, `${relativePath} must contain a TypeScript setup script`)
  return ts.createSourceFile(relativePath, match[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function setupCallback(sourceFile, name, bindings) {
  let initializer
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        initializer = declaration.initializer
        break
      }
    }
    if (initializer) break
  }
  assert.ok(initializer, `expected actual SFC callback ${name}`)
  const compiled = ts.transpile(`return (${initializer.getText(sourceFile)});`, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  })
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings))
}

const modalScript = await readSetupScript('components/subject/SubjectCreateModal.vue')
const hallScript = await readSetupScript('views/SubjectHall/index.vue')

async function createFixture({ includeSubject = true, subjectName = '原学科名称' } = {}) {
  const suffix = ++fixtureNumber
  const userId = `subject-edit-user-${suffix}`
  const deviceId = `subject-edit-device-${suffix}`
  const subjectId = `subject-edit-${suffix}`
  const createdAt = '2026-09-01T12:34:56.000Z'
  const baseVersion = 7

  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = { id: userId, email: `${userId}@example.test` }
  authStore.serverDeviceId = deviceId

  const syncStore = useSyncStore()
  syncStore.requestBackgroundSync = () => undefined

  const repo = await getLocalRepository(userId, deviceId)
  if (includeSubject) {
    await repo.upsert('SUBJECT', subjectId, {
      id: subjectId,
      name: subjectName,
      description: '原学科描述',
      iconKey: 'book',
      sortKey: 'sort-0042',
      version: baseVersion,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      defaultSubject: false,
    }, { version: baseVersion, syncStatus: 'synced' })
  }

  const subjectStore = useSubjectStore()
  await subjectStore.loadSubjects()
  const subject = subjectStore.subjects.find((item) => item.id === subjectId) ?? null
  return { subjectId, createdAt, baseVersion, subjectStore, repo, subject }
}

function createSaveHarness({ subjectStore, subject, formSubjectData = subject }) {
  const showSubjectModal = ref(true)
  const selectedSubjectForEdit = ref(subject)
  const isSavingSubject = ref(false)
  const timers = []
  const notifications = []
  const routes = []
  const pendingSaves = []
  const deferredTimers = (callback, delay) => {
    timers.push({ callback, delay })
    return timers.length
  }
  const closeCreateSubject = setupCallback(hallScript, 'closeCreateSubject', {
    showSubjectModal,
    selectedSubjectForEdit,
    isSavingSubject,
    setTimeout: deferredTimers,
  })
  const openCreateSubject = setupCallback(hallScript, 'openCreateSubject', {
    selectedSubjectForEdit,
    showSubjectModal,
    isSavingSubject,
  })
  const notify = (options) => notifications.push(options)
  notify.error = (options) => notifications.push(typeof options === 'string'
    ? { type: 'error', message: options }
    : { ...options, type: options?.type ?? 'error' })
  const parentSave = setupCallback(hallScript, 'handleSaveSubject', {
    subjectStore,
    selectedSubjectForEdit,
    isSavingSubject,
    closeCreateSubject,
    router: { push: (path) => { routes.push(path); return Promise.resolve() } },
    ElNotification: notify,
  })

  const props = {
    subjectData: formSubjectData,
    modelValue: true,
    get saving() { return isSavingSubject.value },
  }
  const form = ref({})
  const isEdit = ref(false)
  setupCallback(modalScript, 'initForm', { props, form, isEdit })()
  const emit = (event, payload) => {
    if (event === 'save') {
      pendingSave = parentSave(payload)
      pendingSaves.push(pendingSave)
    }
    if (event === 'update:modelValue') showSubjectModal.value = payload
    if (event === 'close') closeCreateSubject()
  }
  const handleClose = setupCallback(modalScript, 'handleClose', { emit, props })
  const handleSave = setupCallback(modalScript, 'handleSave', { form, emit, handleClose, props })
  let pendingSave = Promise.resolve()

  return {
    form,
    handleSave,
    handleClose,
    saveFromParent: parentSave,
    openCreateSubject,
    closeCreateSubject,
    showSubjectModal,
    isSavingSubject,
    selectedSubjectForEdit,
    notifications,
    routes,
    timers,
    pendingSaves,
    get pendingSave() { return pendingSave },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('editing waits for the real local commit, preserves Subject fields, and persists the selected icon key', async () => {
  const fixture = await createFixture()
  assert.ok(fixture.subject)
  const harness = createSaveHarness(fixture)
  harness.form.value.name = '改后的学科名称'
  harness.form.value.description = '改后的描述'
  const iconField = Object.hasOwn(harness.form.value, 'iconKey') ? 'iconKey' : 'icon'
  harness.form.value[iconField] = 'chemistry'

  const originalCommit = fixture.repo.commitMutation.bind(fixture.repo)
  const started = deferred()
  const releaseCommit = deferred()
  fixture.repo.commitMutation = async (input) => {
    started.resolve()
    await releaseCommit.promise
    return originalCommit(input)
  }

  try {
    harness.handleSave()
    await started.promise
    const stayedOpenDuringCommit = harness.showSubjectModal.value
    releaseCommit.resolve()
    await harness.pendingSave

    const stored = await fixture.repo.read('SUBJECT', fixture.subjectId)
    const [mutation] = await fixture.repo.listUnresolved('SUBJECT')
    assert.equal(stayedOpenDuringCommit, true, 'the edit modal must remain open while its durable local save is pending')
    assert.equal(harness.showSubjectModal.value, false, 'a successful edit closes after the local commit')
    assert.equal(stored.value.name, '改后的学科名称')
    assert.equal(stored.value.description, '改后的描述')
    assert.equal(stored.value.iconKey, 'chemistry')
    assert.equal(stored.value.sortKey, 'sort-0042')
    assert.equal(stored.value.createdAt, fixture.createdAt)
    assert.equal(stored.value.version, fixture.baseVersion)
    assert.equal(mutation.baseVersion, fixture.baseVersion)
    assert.equal(mutation.payload.iconKey, 'chemistry')
  } finally {
    releaseCommit.resolve()
    fixture.repo.commitMutation = originalCommit
  }
})

test('SubjectHall preserves the complete existing model in the real local mutation', async () => {
  const fixture = await createFixture()
  assert.ok(fixture.subject)
  const harness = createSaveHarness(fixture)
  harness.form.value.name = '完整模型字段检查'
  harness.form.value.description = '保留旧元数据'
  const iconField = Object.hasOwn(harness.form.value, 'iconKey') ? 'iconKey' : 'icon'
  harness.form.value[iconField] = 'chemistry'

  await harness.saveFromParent({ ...harness.form.value })

  const stored = await fixture.repo.read('SUBJECT', fixture.subjectId)
  const [mutation] = await fixture.repo.listUnresolved('SUBJECT')
  assert.equal(stored.value.sortKey, 'sort-0042')
  assert.equal(stored.value.createdAt, fixture.createdAt)
  assert.equal(stored.value.iconKey, 'chemistry')
  assert.equal(stored.value.version, fixture.baseVersion)
  assert.equal(mutation.baseVersion, fixture.baseVersion)
})

test('a failed local edit stays open with its input, reports the error, and can be retried', async () => {
  const fixture = await createFixture()
  assert.ok(fixture.subject)
  const harness = createSaveHarness(fixture)
  harness.form.value.name = '保留并重试的名称'
  harness.form.value.description = '需要保留的描述'
  const originalCommit = fixture.repo.commitMutation.bind(fixture.repo)
  const firstCommitStarted = deferred()
  const failFirstCommit = deferred()
  let attempts = 0
  fixture.repo.commitMutation = async (input) => {
    attempts += 1
    if (attempts === 1) {
      firstCommitStarted.resolve()
      await failFirstCommit.promise
      throw new Error('SUBJECT_LOCAL_COMMIT_FAILED')
    }
    return originalCommit(input)
  }

  const originalConsoleError = console.error
  console.error = () => undefined
  try {
    harness.handleSave()
    await firstCommitStarted.promise
    const stayedOpenDuringCommit = harness.showSubjectModal.value
    failFirstCommit.resolve()
    await harness.pendingSave

    assert.equal(stayedOpenDuringCommit, true, 'a pending save must not dismiss the edit form')
    assert.equal(harness.showSubjectModal.value, true, 'a failed save must leave the edit form open')
    assert.equal(harness.form.value.name, '保留并重试的名称')
    assert.equal(harness.form.value.description, '需要保留的描述')
    assert.ok(harness.notifications.some((item) => item?.type === 'error'), 'the failure must be visible to the user')
    assert.equal((await fixture.repo.read('SUBJECT', fixture.subjectId)).value.name, '原学科名称')
    assert.equal((await fixture.repo.listUnresolved('SUBJECT')).length, 0)

    harness.handleSave()
    await harness.pendingSave
    assert.equal(attempts, 2)
    assert.equal(harness.showSubjectModal.value, false, 'a successful retry closes the edit form')
    assert.equal((await fixture.repo.read('SUBJECT', fixture.subjectId)).value.name, '保留并重试的名称')
    assert.equal((await fixture.repo.listUnresolved('SUBJECT')).length, 1)
  } finally {
    failFirstCommit.resolve()
    fixture.repo.commitMutation = originalCommit
    console.error = originalConsoleError
  }
})

test('editing a Subject missing from the current store gives visible feedback without creating an UPDATE', async () => {
  const fixture = await createFixture({ includeSubject: false })
  const staleSubject = {
    id: fixture.subjectId,
    name: '已经不存在的学科',
    description: '',
    icon: 'book',
    iconKey: 'book',
    version: fixture.baseVersion,
    createdAt: fixture.createdAt,
  }
  const harness = createSaveHarness({ ...fixture, subject: null, formSubjectData: staleSubject })
  harness.form.value.name = '不应重新创建'
  let commitCalls = 0
  const originalCommit = fixture.repo.commitMutation.bind(fixture.repo)
  fixture.repo.commitMutation = async (input) => {
    commitCalls += 1
    return originalCommit(input)
  }
  const originalConsoleError = console.error
  console.error = () => undefined
  try {
    harness.handleSave()
    await harness.pendingSave
    assert.equal(commitCalls, 0, 'a stale edit must not become a new local Subject projection')
    assert.ok(harness.notifications.some((item) => item?.type === 'error'), 'a missing Subject must produce visible feedback')
    assert.equal(await fixture.repo.read('SUBJECT', fixture.subjectId), null)
    assert.equal((await fixture.repo.listUnresolved('SUBJECT')).length, 0)
    assert.equal(harness.showSubjectModal.value, true)
  } finally {
    fixture.repo.commitMutation = originalCommit
    console.error = originalConsoleError
  }
})

test('creating a Subject still commits locally, closes on success, and opens its workspace', async () => {
  const fixture = await createFixture({ includeSubject: false })
  const harness = createSaveHarness({ ...fixture, subject: null, formSubjectData: null })
  harness.form.value.name = '新学科'
  harness.form.value.description = '新建说明'

  harness.handleSave()
  await harness.pendingSave

  assert.equal(harness.showSubjectModal.value, false)
  assert.equal(fixture.subjectStore.subjects.length, 1)
  const created = fixture.subjectStore.subjects[0]
  assert.equal(created.name, '新学科')
  assert.deepEqual(harness.routes, [`/subject/${created.id}`])
  assert.equal((await fixture.repo.read('SUBJECT', created.id)).value.name, '新学科')
})

test('creating a Subject with the same trimmed name ignores case and leaves the form open without a local write', async () => {
  const fixture = await createFixture({ subjectName: ' Chemistry ' })
  const harness = createSaveHarness({ ...fixture, subject: null, formSubjectData: null })
  harness.form.value.name = ' chemistry '
  harness.form.value.description = '保留的描述'

  harness.handleSave()
  await harness.pendingSave

  assert.equal(harness.showSubjectModal.value, true)
  assert.equal(harness.isSavingSubject.value, false)
  assert.equal(harness.form.value.name, ' chemistry ')
  assert.equal(harness.form.value.description, '保留的描述')
  assert.deepEqual(harness.routes, [])
  assert.equal(harness.notifications[0]?.type, 'error')
  assert.match(harness.notifications[0]?.message, /已有同名学科/)
  assert.deepEqual((await fixture.repo.list('SUBJECT')).map((row) => row.value.id), [fixture.subjectId])
  assert.deepEqual(await fixture.repo.listUnresolved('SUBJECT'), [])
})

test('a pending edit ignores duplicate saves and cannot close or switch to another Subject', async () => {
  const fixture = await createFixture()
  assert.ok(fixture.subject)
  const harness = createSaveHarness(fixture)
  harness.form.value.name = '只提交一次'
  const originalCommit = fixture.repo.commitMutation.bind(fixture.repo)
  const started = deferred()
  const releaseCommit = deferred()
  let commitCalls = 0
  fixture.repo.commitMutation = async (input) => {
    commitCalls += 1
    started.resolve()
    await releaseCommit.promise
    return originalCommit(input)
  }
  const anotherSubject = { id: 'subject-other', name: '另一学科', version: 1 }

  try {
    harness.handleSave()
    await started.promise
    const pendingWasSet = harness.isSavingSubject.value
    harness.handleSave()
    harness.handleClose()
    harness.closeCreateSubject()
    harness.openCreateSubject(anotherSubject)

    const modalStayedOnOriginal = harness.showSubjectModal.value
      && harness.selectedSubjectForEdit.value?.id === fixture.subjectId
    const onlyOneSaveWasEmitted = harness.pendingSaves.length === 1
    releaseCommit.resolve()
    await Promise.all(harness.pendingSaves)

    assert.equal(pendingWasSet, true, 'the parent must set its save guard before awaiting the repository')
    assert.equal(onlyOneSaveWasEmitted, true, 'a second click during the same save must be ignored')
    assert.equal(modalStayedOnOriginal, true, 'pending close/open actions must not switch the modal to another Subject')
    assert.equal(commitCalls, 1, 'one save gesture must create one repository mutation')
    assert.equal(harness.showSubjectModal.value, false, 'the completed original edit closes after pending clears')
    assert.equal(harness.isSavingSubject.value, false)
  } finally {
    releaseCommit.resolve()
    fixture.repo.commitMutation = originalCommit
  }
})

test('the Subject modal disables actions and blocks ModalShell close requests while saving', async () => {
  const modalText = await readFile(new URL('../src/components/subject/SubjectCreateModal.vue', import.meta.url), 'utf8')
  const template = modalText.slice(0, modalText.indexOf('<script setup'))
  assert.match(template, /:prevent-close="(?:props\.)?saving"/)
  const cancelButton = template.match(/<button[^>]*class="modal-btn modal-btn-secondary"[^>]*>/)?.[0]
  const saveButton = template.match(/<button[^>]*class="modal-btn modal-btn-primary"[^>]*>/)?.[0]
  assert.ok(cancelButton)
  assert.ok(saveButton)
  assert.match(cancelButton, /:disabled="[^\"]*saving/)
  assert.match(saveButton, /:disabled="[^\"]*saving/)

  const fixture = await createFixture()
  assert.ok(fixture.subject)
  const harness = createSaveHarness(fixture)
  harness.isSavingSubject.value = true
  const events = []
  const guardedClose = setupCallback(modalScript, 'handleClose', {
    emit: (...args) => events.push(args),
    props: { saving: true },
  })
  const guardedSave = setupCallback(modalScript, 'handleSave', {
    form: harness.form,
    emit: (...args) => events.push(args),
    handleClose: guardedClose,
    props: { saving: true },
  })
  guardedSave()
  guardedClose()
  assert.deepEqual(events, [], 'Escape/backdrop, cancel, and save callbacks must not emit while saving')
})
