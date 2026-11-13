import assert from 'node:assert/strict'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import axios from 'axios'

let activeFocusAdapter = async (config) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config })
axios.defaults.adapter = (config) => activeFocusAdapter(config)

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

const { createPinia, setActivePinia } = await import('pinia')
const { useAuthStore } = await import('../src/store/useAuthStore.ts')
const { usePomodoroStore } = await import('../src/store/usePomodoroStore.ts')
const { useFocusSessionApi } = await import('../src/api/useFocusSessionApi.ts')
const { getFocusSessionRepository } = await import('../src/services/localDb.ts')
const runtimeModule = await import('../src/services/pomodoroSessionRuntime.ts').catch(() => null)
const repositoryModule = await import('../src/services/focusSessionRepository.ts').catch(() => null)
const localSchemaModule = await import('../src/services/localSchema.ts').catch(() => null)

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForSignal(promise, label, timeoutMs = 2000) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

test('focus elapsed time excludes pauses and survives runtime serialization', () => {
  assert.ok(runtimeModule, 'persistent Pomodoro runtime must be implemented')
  const { createPomodoroRuntime, startPomodoro, pausePomodoro, resumePomodoro, tickPomodoro, elapsedFocusSeconds } = runtimeModule
  let runtime = createPomodoroRuntime({ focusDurationSeconds: 60, breakDurationSeconds: 15, longBreakDurationSeconds: 30 })
  runtime = startPomodoro(runtime, { nowMs: 0, taskId: 'task-a', clientSessionId: 'session-a' })
  runtime = pausePomodoro(runtime, 20_000)
  assert.equal(elapsedFocusSeconds(runtime, 90_000), 20)

  runtime = JSON.parse(JSON.stringify(runtime))
  runtime = resumePomodoro(runtime, 100_000)
  const result = tickPomodoro(runtime, 140_000)
  assert.equal(result.finalizedSession?.clientSessionId, 'session-a')
  assert.equal(result.finalizedSession?.taskId, 'task-a')
  assert.equal(result.finalizedSession?.durationSeconds, 60)
  assert.equal(result.finalizedSession?.completed, true)
  assert.equal(result.runtime.completedInCycle, 1)
  assert.equal(result.runtime.phase, 'break')
  assert.equal(tickPomodoro(result.runtime, 200_000).finalizedSession, undefined)
})

test('skip saves elapsed focus as interrupted and does not count a completed round', () => {
  assert.ok(runtimeModule, 'Pomodoro transitions must be implemented')
  const { createPomodoroRuntime, startPomodoro, pausePomodoro, resumePomodoro, skipPomodoro } = runtimeModule
  let runtime = createPomodoroRuntime({ focusDurationSeconds: 60, breakDurationSeconds: 15, longBreakDurationSeconds: 30 })
  runtime = startPomodoro(runtime, { nowMs: 0, taskId: 'task-b', clientSessionId: 'session-b' })
  runtime = pausePomodoro(runtime, 10_000)
  runtime = resumePomodoro(runtime, 100_000)
  const result = skipPomodoro(runtime, 110_000)
  assert.equal(result.finalizedSession?.durationSeconds, 20)
  assert.equal(result.finalizedSession?.completed, false)
  assert.equal(result.finalizedSession?.taskId, 'task-b')
  assert.equal(result.runtime.completedInCycle, 0)
  assert.equal(result.runtime.phase, 'break')
})

test('break time changes phase without creating a focus session or completion count', () => {
  assert.ok(runtimeModule, 'Pomodoro phase transitions must be implemented')
  const { createPomodoroRuntime, startPomodoro, tickPomodoro } = runtimeModule
  let runtime = createPomodoroRuntime({ focusDurationSeconds: 60, breakDurationSeconds: 15, longBreakDurationSeconds: 30 })
  runtime = startPomodoro(runtime, { nowMs: 0, taskId: null, clientSessionId: 'session-focus' })
  const focus = tickPomodoro(runtime, 60_000)
  assert.equal(focus.finalizedSession?.completed, true)
  assert.equal(focus.runtime.completedInCycle, 1)

  const breakRun = startPomodoro(focus.runtime, { nowMs: 61_000, taskId: 'task-ignored-during-break', clientSessionId: 'unused' })
  const rest = tickPomodoro(breakRun, 76_000)
  assert.equal(rest.finalizedSession, undefined)
  assert.equal(rest.runtime.phase, 'focus')
  assert.equal(rest.runtime.completedInCycle, 1)
})

test('focus session outbox is durable, idempotent, acknowledged, and user/device scoped', async () => {
  assert.ok(repositoryModule, 'durable focus-session repository must be implemented')
  const { FocusSessionRepository } = repositoryModule
  const storage = createMemoryStorage()
  const firstScope = new FocusSessionRepository('user-a', 'device-a', { storage })
  const sameScope = new FocusSessionRepository('user-a', 'device-a', { storage })
  const otherScope = new FocusSessionRepository('user-b', 'device-a', { storage })
  const runtime = { phase: 'focus', completedInCycle: 0, phaseDurationSeconds: 1500, elapsedBeforeRunMs: 0, runStartedAtMs: null, activeSession: null, durations: { focusDurationSeconds: 1500, breakDurationSeconds: 300, longBreakDurationSeconds: 900 } }
  const event = {
    clientSessionId: '7d46ed84-e1d4-4fc6-88a8-9f14c72fd2a2', taskId: null,
    startedAt: '2026-10-01T00:00:00.000Z', endedAt: '2026-10-01T00:04:00.000Z',
    durationSeconds: 240, completed: false,
  }

  await firstScope.finalize(runtime, event)
  await firstScope.finalize(runtime, event)
  assert.deepEqual(await sameScope.listPending(), [event])
  assert.deepEqual(await otherScope.listPending(), [])
  assert.deepEqual(await sameScope.loadRuntime(), runtime)

  await sameScope.acknowledge(event.clientSessionId)
  assert.deepEqual(await firstScope.listPending(), [])
  const localHistory = await sameScope.listSessions()
  assert.equal(localHistory.length, 1)
  assert.equal(localHistory[0].syncStatus, 'synced')
})

test('browser storage scope encoding cannot alias distinct owner identifiers', async () => {
  assert.ok(repositoryModule, 'focus-session repository must be implemented')
  const { FocusSessionRepository } = repositoryModule
  const storage = createMemoryStorage()
  const slashId = new FocusSessionRepository('user/id', 'device-a', { storage })
  const encodedLikeId = new FocusSessionRepository('user_2Fid', 'device-a', { storage })
  const runtime = { phase: 'focus', completedInCycle: 0, phaseDurationSeconds: 1500, elapsedBeforeRunMs: 0, runStartedAtMs: null, activeSession: null, durations: { focusDurationSeconds: 1500, breakDurationSeconds: 300, longBreakDurationSeconds: 900 } }
  const event = {
    clientSessionId: '6d46ed84-e1d4-4fc6-88a8-9f14c72fd2a2', taskId: null,
    startedAt: '2026-10-01T00:00:00.000Z', endedAt: '2026-10-01T00:01:00.000Z',
    durationSeconds: 60, completed: false,
  }

  await slashId.finalize(runtime, event)
  assert.deepEqual(await encodedLikeId.listPending(), [])
})

test('SQLite schema reserves durable timer and focus outbox tables', async () => {
  const schema = await readFile(new URL('../src/services/localSchema.ts', import.meta.url), 'utf8')
  const version = Number(schema.match(/LOCAL_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1])
  assert.ok(version >= 10, 'focus schema must be included in a monotonic local migration')
  assert.match(schema, /CREATE TABLE IF NOT EXISTS pomodoro_timer_state/)
  assert.match(schema, /CREATE TABLE IF NOT EXISTS pomodoro_focus_sessions/)
  assert.match(schema, /PRIMARY KEY \(user_id, device_id, client_session_id\)/)
})

test('SQLite schema upgrade preserves Overview cache and supports the durable focus outbox', async () => {
  assert.ok(localSchemaModule, 'versioned local schema must be loadable')
  assert.ok(repositoryModule, 'focus-session repository must be implemented')
  const sqlite = new TemporarySqlite()
  try {
    await sqlite.execute('CREATE TABLE local_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    await sqlite.execute('INSERT INTO local_schema_migrations (version, applied_at) VALUES ($1, $2)', [9, '2026-09-30T00:00:00.000Z'])
    const overviewSql = localSchemaModule.VERSIONED_LOCAL_SCHEMA_SQL.find((sql) => sql.includes('CREATE TABLE IF NOT EXISTS ai_overview_cache'))
    assert.ok(overviewSql, 'existing Overview cache schema must be present')
    await sqlite.execute(overviewSql)
    await sqlite.execute(`INSERT INTO ai_overview_cache
      (user_id,device_id,scope_type,scope_id,revision_key,schema_version,title,summary_json,status,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    ['user-a','device-a','FILE','source-a','revision-a',1,'Existing overview','{"summary":"keep"}','READY','2026-09-30T00:00:00.000Z'])

    await localSchemaModule.createVersionedLocalSchema(sqlite)
    assert.ok(sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pomodoro_timer_state'").get())
    assert.ok(sqlite.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pomodoro_focus_sessions'").get())
    const preservedOverview = sqlite.database.prepare('SELECT title, summary_json FROM ai_overview_cache WHERE scope_id = ?').get('source-a')
    assert.equal(preservedOverview.title, 'Existing overview')
    assert.equal(preservedOverview.summary_json, '{"summary":"keep"}')
    const migrationVersions = sqlite.database.prepare('SELECT version FROM local_schema_migrations ORDER BY version').all().map((row) => row.version)
    assert.ok(migrationVersions.includes(9))
    assert.ok(migrationVersions.includes(localSchemaModule.LOCAL_SCHEMA_VERSION))

    const { FocusSessionRepository } = repositoryModule
    const repository = new FocusSessionRepository('user-a', 'device-a', { sql: sqlite, schemaReady: Promise.resolve() })
    const runtime = { phase: 'focus', completedInCycle: 0, phaseDurationSeconds: 1500, elapsedBeforeRunMs: 0, runStartedAtMs: null, activeSession: null, durations: { focusDurationSeconds: 1500, breakDurationSeconds: 300, longBreakDurationSeconds: 900 } }
    const event = {
      clientSessionId: '8d46ed84-e1d4-4fc6-88a8-9f14c72fd2a2', taskId: 'task-a',
      startedAt: '2026-10-01T00:00:00.000Z', endedAt: '2026-10-01T00:05:00.000Z',
      durationSeconds: 300, completed: false,
    }
    await repository.finalize(runtime, event)
    const reloaded = new FocusSessionRepository('user-a', 'device-a', { sql: sqlite, schemaReady: Promise.resolve() })
    assert.deepEqual(await reloaded.listPending(), [event])
    await reloaded.acknowledge(event.clientSessionId)
    assert.deepEqual(await repository.listPending(), [])
    assert.equal((await repository.listSessions())[0].syncStatus, 'synced')
  } finally {
    sqlite.close()
  }
})

test('a task-specific focus rejection preserves the event and lets the next event upload after service recovery', async (t) => {
  const originalAdapter = activeFocusAdapter
  t.after(() => { activeFocusAdapter = originalAdapter })
  const attempted = []
  let status = 503
  activeFocusAdapter = async (config) => {
    if (config.url === '/api/auth/me/avatar') return { data: new Blob([]), status: 200, statusText: 'OK', headers: {}, config }
    assert.equal(config.url, '/api/focus-sessions')
    const event = JSON.parse(config.data)
    attempted.push(event)
    if (event.taskId) {
      const error = new Error('Focus upload rejected')
      error.config = config
      error.response = {
        status, headers: {}, config,
        data: { title: error.message, status, code: status === 404 ? 'RESOURCE_NOT_FOUND' : 'SERVICE_UNAVAILABLE' },
      }
      throw error
    }
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }

  setActivePinia(createPinia())
  const userId = 'focus-recovery-owner'
  const serverDeviceId = 'focus-recovery-device'
  const repository = await getFocusSessionRepository(userId, serverDeviceId)
  const runtime = runtimeModule.createPomodoroRuntime()
  const linkedEvent = {
    clientSessionId: '9d46ed84-e1d4-4fc6-88a8-9f14c72fd2a2', taskId: '11111111-1111-4111-8111-111111111111',
    startedAt: '2026-10-01T00:00:00.000Z', endedAt: '2026-10-01T00:01:00.000Z',
    durationSeconds: 60, completed: false,
  }
  const freeEvent = { ...linkedEvent, clientSessionId: 'ad46ed84-e1d4-4fc6-88a8-9f14c72fd2a2', taskId: null }
  await repository.finalize(runtime, linkedEvent)
  await repository.finalize(runtime, freeEvent)
  useAuthStore().setSession({
    user: { id: userId, email: 'focus-recovery@example.test' },
    tokens: { accessToken: 'focus-recovery-token', refreshToken: 'focus-recovery-refresh' },
    sessionId: 'focus-recovery-session',
    serverDeviceId,
  })
  const pomodoroStore = usePomodoroStore()

  assert.equal(await pomodoroStore.flushPending(), 0)
  assert.deepEqual(attempted, [linkedEvent])
  assert.deepEqual(await repository.listPending(), [linkedEvent, freeEvent])

  status = 404
  assert.equal(await pomodoroStore.flushPending(), 1)
  assert.deepEqual(attempted, [linkedEvent, linkedEvent, freeEvent])
  assert.deepEqual(await repository.listPending(), [linkedEvent])
  assert.deepEqual(pomodoroStore.pendingSessions, [linkedEvent])
})

test('starting focus works when LAN HTTP exposes no crypto.randomUUID', async (t) => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } })
  t.after(() => Object.defineProperty(globalThis, 'crypto', originalCrypto))

  setActivePinia(createPinia())
  useAuthStore().setSession({
    user: { id: 'focus-lan-owner', email: 'focus-lan@example.test' },
    tokens: { accessToken: 'focus-lan-token', refreshToken: 'focus-lan-refresh' },
    sessionId: 'focus-lan-session',
    serverDeviceId: 'focus-lan-device',
  })
  const pomodoroStore = usePomodoroStore()
  t.after(() => pomodoroStore.pause())
  await pomodoroStore.start()

  assert.equal(pomodoroStore.isRunning, true)
  assert.match(pomodoroStore.runtime.activeSession.clientSessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('a delayed focus-session 401 after account switch cannot retry the outbox row with the next account', async () => {
  const originalAdapter = activeFocusAdapter
  const originalCreate = useFocusSessionApi.create
  const requestStarted = createDeferred()
  const releaseAResponse = createDeferred()
  const requestLog = []
  let focusCreatePromise
  let aSessionAttempts = 0
  activeFocusAdapter = async (config) => {
    const url = config.url ?? ''
    const authorization = typeof config.headers?.get === 'function'
      ? config.headers.get('Authorization')
      : config.headers?.Authorization
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    requestLog.push({ url, authorization, payload })

    if (url === '/api/auth/me/avatar') return { data: new Blob([]), status: 200, statusText: 'OK', headers: {}, config }
    if (url === '/api/focus-sessions' && authorization === 'Bearer focus-token-a') {
      aSessionAttempts += 1
      if (aSessionAttempts === 1) {
        requestStarted.resolve()
        await releaseAResponse.promise
        const error = new Error('adapter returned 401')
        error.config = config
        error.response = { status: 401, data: {}, headers: {}, config }
        throw error
      }
    }
    if (url === '/api/auth/refresh') return {
      data: { tokens: { accessToken: 'focus-token-b2', refreshToken: 'focus-refresh-b2' } },
      status: 200, statusText: 'OK', headers: {}, config,
    }
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  }

  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  const pomodoroStore = usePomodoroStore()
  const setSession = (userId, deviceId, sessionId, accessToken, refreshToken) => authStore.setSession({
    user: { id: userId, email: `${userId}@example.test` },
    tokens: { accessToken, refreshToken },
    sessionId,
    serverDeviceId: deviceId,
  })
  const userA = 'focus-session-delayed-401-a'
  const deviceA = 'focus-device-delayed-401-a'
  const userB = 'focus-session-delayed-401-b'
  const deviceB = 'focus-device-delayed-401-b'
  useFocusSessionApi.create = (...args) => {
    focusCreatePromise = originalCreate(...args)
    return focusCreatePromise
  }
  setSession(userA, deviceA, 'focus-session-a', 'focus-token-a', 'focus-refresh-a')

  try {
    await pomodoroStore.initialize()
    await pomodoroStore.start(null)
    pomodoroStore.runtime = { ...pomodoroStore.runtime, runStartedAtMs: Date.now() - 1500 }
    await pomodoroStore.skip()
    assert.equal(pomodoroStore.pendingSessions.length, 1, 'skipping a focus run should create an outbox row')
    await waitForSignal(requestStarted.promise, 'A focus-session upload')
    assert.ok(focusCreatePromise, 'the outbox should start an upload')
    const firstRequest = requestLog.find((entry) => entry.url === '/api/focus-sessions')
    assert.equal(firstRequest?.authorization, 'Bearer focus-token-a')

    setSession(userB, deviceB, 'focus-session-b', 'focus-token-b', 'focus-refresh-b')
    await pomodoroStore.initialize()
    releaseAResponse.resolve()
    await assert.rejects(focusCreatePromise, (error) => error?.code === 'SYNC_SCOPE_CHANGED')

    assert.equal(requestLog.filter((entry) => entry.url === '/api/auth/refresh').length, 0,
      'a stale A request must not start a refresh with B credentials')
    assert.equal(requestLog.filter((entry) => entry.url === '/api/focus-sessions').length, 1,
      'A focus-session data must not be retried under B')
    assert.equal(authStore.user?.id, userB)
    assert.equal(authStore.token, 'focus-token-b')
    const repositoryA = await getFocusSessionRepository(userA, deviceA)
    assert.equal((await repositoryA.listPending()).length, 1,
      'the A outbox row must remain pending until A can retry it')
  } finally {
    releaseAResponse.resolve()
    useFocusSessionApi.create = originalCreate
    activeFocusAdapter = originalAdapter
  }
})

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }
}

class TemporarySqlite {
  database = new DatabaseSync(':memory:')

  async execute(sql, bindValues = []) {
    this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues)
  }

  async select(sql, bindValues = []) {
    return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues)
  }

  async transaction(operation) {
    await this.execute('BEGIN IMMEDIATE')
    try {
      const result = await operation(this)
      await this.execute('COMMIT')
      return result
    } catch (error) {
      await this.execute('ROLLBACK')
      throw error
    }
  }

  close() {
    this.database.close()
  }
}
