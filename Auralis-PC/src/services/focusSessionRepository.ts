import type { FocusSessionEvent, PomodoroRuntimeState } from './pomodoroSessionRuntime'

export interface FocusSessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export interface FocusSessionSqlDatabase {
  execute(sql: string, bindValues?: unknown[]): Promise<unknown>
  select<T>(sql: string, bindValues?: unknown[]): Promise<T[]>
  transaction?<T>(operation: (transaction: FocusSessionSqlDatabase) => Promise<T>): Promise<T>
}

export interface FocusSessionRepositoryOptions {
  storage?: FocusSessionStorage
  sql?: FocusSessionSqlDatabase
  schemaReady?: Promise<void>
  now?: () => string
}

export interface FocusSessionRecord extends FocusSessionEvent {
  syncStatus: 'pending' | 'synced'
}

interface FocusOutboxRow {
  client_session_id: string
  task_id: string | null
  started_at: string
  ended_at: string
  duration_seconds: number
  completed: number | boolean
  sync_status: 'pending' | 'synced'
}

interface BrowserSnapshot {
  runtime: PomodoroRuntimeState | null
  sessions: FocusSessionRecord[]
}

function browserStorage(): FocusSessionStorage {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function encodeScopePart(value: string): string {
  return encodeURIComponent(value)
}

function sameEvent(left: FocusSessionEvent, right: FocusSessionEvent): boolean {
  return left.clientSessionId === right.clientSessionId
    && left.taskId === right.taskId
    && left.startedAt === right.startedAt
    && left.endedAt === right.endedAt
    && left.durationSeconds === right.durationSeconds
    && left.completed === right.completed
}

function validateEvent(event: FocusSessionEvent): void {
  if (!event.clientSessionId.trim()) throw new Error('FOCUS_SESSION_ID_REQUIRED')
  if (event.taskId !== null && !event.taskId.trim()) throw new Error('FOCUS_SESSION_TASK_ID_INVALID')
  if (!Number.isInteger(event.durationSeconds) || event.durationSeconds < 0) throw new Error('FOCUS_SESSION_DURATION_INVALID')
  if (!Number.isFinite(Date.parse(event.startedAt)) || !Number.isFinite(Date.parse(event.endedAt))) {
    throw new Error('FOCUS_SESSION_TIME_INVALID')
  }
  if (Date.parse(event.endedAt) < Date.parse(event.startedAt)) throw new Error('FOCUS_SESSION_TIME_RANGE_INVALID')
}

function eventFromRow(row: FocusOutboxRow): FocusSessionEvent {
  return {
    clientSessionId: row.client_session_id,
    taskId: row.task_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: Number(row.duration_seconds),
    completed: Boolean(row.completed),
  }
}

export class FocusSessionRepository {
  readonly userId: string
  readonly serverDeviceId: string

  private readonly storage: FocusSessionStorage
  private readonly sql?: FocusSessionSqlDatabase
  private readonly schemaReady?: Promise<void>
  private readonly now: () => string
  private readonly browserKey: string
  private sqlReady: Promise<void> | null = null

  constructor(userId: string, serverDeviceId: string, options: FocusSessionRepositoryOptions = {}) {
    if (!userId.trim()) throw new Error('FocusSessionRepository requires a userId')
    if (!serverDeviceId.trim()) throw new Error('FocusSessionRepository requires a serverDeviceId')
    if (options.sql && options.storage) throw new Error('FocusSessionRepository accepts either sql or storage, not both')
    this.userId = userId
    this.serverDeviceId = serverDeviceId
    this.storage = options.storage ?? browserStorage()
    this.sql = options.sql
    this.schemaReady = options.schemaReady
    this.now = options.now ?? (() => new Date().toISOString())
    this.browserKey = `auralis:v1:focus-sessions:${encodeScopePart(userId)}:${encodeScopePart(serverDeviceId)}`
  }

  private async ensureSql(): Promise<void> {
    if (!this.sql) return
    if (!this.sqlReady) this.sqlReady = this.schemaReady ?? Promise.resolve()
    await this.sqlReady
  }

  private readBrowserSnapshot(): BrowserSnapshot {
    const raw = this.storage.getItem(this.browserKey)
    if (!raw) return { runtime: null, sessions: [] }
    try {
      const snapshot = JSON.parse(raw) as BrowserSnapshot
      if (!snapshot || !Array.isArray(snapshot.sessions)) throw new Error('invalid snapshot')
      return { runtime: snapshot.runtime ?? null, sessions: snapshot.sessions }
    } catch {
      throw new Error('FOCUS_SESSION_LOCAL_DATA_INVALID')
    }
  }

  private writeBrowserSnapshot(snapshot: BrowserSnapshot): void {
    this.storage.setItem(this.browserKey, JSON.stringify(snapshot))
  }

  async loadRuntime(): Promise<PomodoroRuntimeState | null> {
    if (!this.sql) return this.readBrowserSnapshot().runtime
    await this.ensureSql()
    const rows = await this.sql.select<{ state_json: string }>(
      'SELECT state_json FROM pomodoro_timer_state WHERE user_id = $1 AND device_id = $2',
      [this.userId, this.serverDeviceId],
    )
    if (!rows[0]) return null
    try {
      return JSON.parse(rows[0].state_json) as PomodoroRuntimeState
    } catch {
      throw new Error('FOCUS_SESSION_LOCAL_DATA_INVALID')
    }
  }

  async saveRuntime(runtime: PomodoroRuntimeState): Promise<void> {
    if (!this.sql) {
      const snapshot = this.readBrowserSnapshot()
      this.writeBrowserSnapshot({ ...snapshot, runtime })
      return
    }
    await this.ensureSql()
    await this.sql.execute(
      `INSERT INTO pomodoro_timer_state (user_id, device_id, state_json, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, device_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
      [this.userId, this.serverDeviceId, JSON.stringify(runtime), this.now()],
    )
  }

  async finalize(runtime: PomodoroRuntimeState, event: FocusSessionEvent): Promise<void> {
    validateEvent(event)
    if (!this.sql) {
      const snapshot = this.readBrowserSnapshot()
      const existing = snapshot.sessions.find((item) => item.clientSessionId === event.clientSessionId)
      if (existing && !sameEvent(existing, event)) throw new Error('FOCUS_SESSION_ID_CONFLICT')
      const sessions = existing ? snapshot.sessions : [...snapshot.sessions, { ...event, syncStatus: 'pending' as const }]
      this.writeBrowserSnapshot({ runtime, sessions })
      return
    }

    await this.ensureSql()
    const persist = async (database: FocusSessionSqlDatabase) => {
      const rows = await database.select<FocusOutboxRow>(
        `SELECT client_session_id, task_id, started_at, ended_at, duration_seconds, completed
         FROM pomodoro_focus_sessions WHERE user_id = $1 AND device_id = $2 AND client_session_id = $3`,
        [this.userId, this.serverDeviceId, event.clientSessionId],
      )
      if (rows[0] && !sameEvent(eventFromRow(rows[0]), event)) throw new Error('FOCUS_SESSION_ID_CONFLICT')
      if (!rows[0]) {
        await database.execute(
          `INSERT INTO pomodoro_focus_sessions
            (user_id, device_id, client_session_id, task_id, started_at, ended_at, duration_seconds, completed, sync_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
          [this.userId, this.serverDeviceId, event.clientSessionId, event.taskId, event.startedAt,
            event.endedAt, event.durationSeconds, event.completed ? 1 : 0, this.now()],
        )
      }
      await database.execute(
        `INSERT INTO pomodoro_timer_state (user_id, device_id, state_json, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, device_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
        [this.userId, this.serverDeviceId, JSON.stringify(runtime), this.now()],
      )
    }
    if (this.sql.transaction) await this.sql.transaction(persist)
    else await persist(this.sql)
  }

  async listPending(): Promise<FocusSessionEvent[]> {
    if (!this.sql) return this.readBrowserSnapshot().sessions.filter((session) => session.syncStatus === 'pending').map((session) => ({
      clientSessionId: session.clientSessionId,
      taskId: session.taskId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
      completed: session.completed,
    }))
    await this.ensureSql()
    const rows = await this.sql.select<FocusOutboxRow>(
      `SELECT client_session_id, task_id, started_at, ended_at, duration_seconds, completed, sync_status
       FROM pomodoro_focus_sessions WHERE user_id = $1 AND device_id = $2 AND sync_status = 'pending' ORDER BY created_at, client_session_id`,
      [this.userId, this.serverDeviceId],
    )
    return rows.map(eventFromRow)
  }

  async listSessions(): Promise<FocusSessionRecord[]> {
    if (!this.sql) return this.readBrowserSnapshot().sessions
    await this.ensureSql()
    const rows = await this.sql.select<FocusOutboxRow>(
      `SELECT client_session_id, task_id, started_at, ended_at, duration_seconds, completed, sync_status
       FROM pomodoro_focus_sessions WHERE user_id = $1 AND device_id = $2 ORDER BY ended_at, client_session_id`,
      [this.userId, this.serverDeviceId],
    )
    return rows.map((row) => ({ ...eventFromRow(row), syncStatus: row.sync_status }))
  }

  async acknowledge(clientSessionId: string): Promise<void> {
    if (!this.sql) {
      const snapshot = this.readBrowserSnapshot()
      const sessions = snapshot.sessions.map((session) => session.clientSessionId === clientSessionId
        ? { ...session, syncStatus: 'synced' as const }
        : session)
      this.writeBrowserSnapshot({
        ...snapshot,
        sessions,
      })
      return
    }
    await this.ensureSql()
    await this.sql.execute(
      `UPDATE pomodoro_focus_sessions SET sync_status = 'synced', synced_at = $1
       WHERE user_id = $2 AND device_id = $3 AND client_session_id = $4`,
      [this.now(), this.userId, this.serverDeviceId, clientSessionId],
    )
  }
}
