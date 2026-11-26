import type { OverviewResultView } from '@/api/overviewApi';
import type { ReviewState } from '@/api/reviewApi';
import type { SourceView } from '@/api/sourceApi';
import type { SubjectStats } from '@/api/statsApi';
import type { KnowledgeBlock } from '@/store/useBlockStore';
import type { Task } from '@/store/useTaskStore';
import { buildSyncedBlockRecord } from '@/utils/blockSyncMapper';
import { formatLocalTimeHHmm } from '@/utils/dateKey';
import { normalizeTaskPosition } from '@/utils/taskSyncMapper';
import { getStorageItem, removeStorageItem, setStorageItem } from '@/platform/storage';
import { localDataScope } from './localDataScope.ts';
import { deleteCachedDocument } from './localDocumentCache.ts';

function databaseIdentity() {
  const scope = localDataScope.current();
  return {
    name: `auralis_${scope}`,
    path: `_doc/auralis_${scope}.db`,
  };
}

declare const plus: any;

const isH5 = typeof plus === 'undefined' || !plus.sqlite;

export type TaskMutationPayloadCleanupResult =
  | { status: 'changed'; payload: string }
  | { status: 'unchanged'; payload: string }
  | { status: 'invalid'; payload: string }

let nativeInvalidTaskPayloadWarningEmitted = false
let h5InvalidTaskPayloadWarningEmitted = false

export function cleanTaskMutationPayload(payload: unknown): TaskMutationPayloadCleanupResult {
  const rawPayload = typeof payload === 'string' ? payload : (JSON.stringify(payload) ?? '')
  try {
    const parsed = JSON.parse(rawPayload)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { status: 'invalid', payload: rawPayload }
    }
    const hasColor = Object.prototype.hasOwnProperty.call(parsed, 'color')
    const hasColorOverride = Object.prototype.hasOwnProperty.call(parsed, 'colorOverride')
    if (!hasColor && !hasColorOverride) return { status: 'unchanged', payload: rawPayload }
    if (hasColor) delete parsed.color
    if (hasColorOverride) delete parsed.colorOverride
    return { status: 'changed', payload: JSON.stringify(parsed) }
  } catch {
    return { status: 'invalid', payload: rawPayload }
  }
}

function warnInvalidTaskPayload(native: boolean): void {
  if (native) {
    if (nativeInvalidTaskPayloadWarningEmitted) return
    nativeInvalidTaskPayloadWarningEmitted = true
  } else {
    if (h5InvalidTaskPayloadWarningEmitted) return
    h5InvalidTaskPayloadWarningEmitted = true
  }
  console.warn(`[SQLite Mobile] Preserving invalid TASK color payload during ${native ? 'native' : 'H5'} migration`)
}

function parseNumericVersion(record: Record<string, unknown>): number | null {
  const raw = record.version ?? record.sync_version
  if (raw === undefined || raw === null || raw === '') return null
  const num = Number(raw)
  return Number.isFinite(num) && num >= 0 ? num : null
}

export function preserveMutationBaseVersion(incoming: unknown, priorRaw: unknown): unknown {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming
  let prior: Record<string, unknown> | null = null
  if (typeof priorRaw === 'string') {
    try {
      const parsed = JSON.parse(priorRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        prior = parsed as Record<string, unknown>
      }
    } catch {
      prior = null
    }
  } else if (priorRaw && typeof priorRaw === 'object' && !Array.isArray(priorRaw)) {
    prior = priorRaw as Record<string, unknown>
  }
  if (!prior) return incoming
  const next = { ...(incoming as Record<string, unknown>) }
  const priorVer = parseNumericVersion(prior)
  if (next.sync_version === undefined && prior.sync_version !== undefined) {
    next.sync_version = prior.sync_version
  } else if (priorVer !== null && next.sync_version !== undefined && priorVer > Number(next.sync_version)) {
    next.sync_version = priorVer
  }
  if (next.version === undefined && prior.version !== undefined) {
    next.version = prior.version
  } else if (priorVer !== null && next.version !== undefined && priorVer > Number(next.version)) {
    next.version = priorVer
  }
  return next
}

// H5 模式下使用 localStorage 模拟 SQLite 数据表结构
const h5Db = {
  getTable(name: string): any[] {
    const key = `auralis:local:${localDataScope.current()}:${name}`;
    const data = getStorageItem(key);
    return data ? JSON.parse(data) : [];
  },
  saveTable(name: string, data: any[]): void {
    const key = `auralis:local:${localDataScope.current()}:${name}`;
    setStorageItem(key, JSON.stringify(data));
  }
};

function parseSqlValues(str: string): any[] {
  const result: any[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let wasQuoted = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (char === stringChar) {
        if (i + 1 < str.length && str[i + 1] === stringChar) {
          current += stringChar;
          i++;
        } else {
          inString = false;
        }
      } else {
        current += char;
      }
    } else if (char === "'" || char === '"') {
      inString = true;
      stringChar = char;
      wasQuoted = true;
      current = '';
    } else if (char === ',') {
      result.push(wasQuoted ? current : cleanValue(current));
      current = '';
      wasQuoted = false;
    } else if (!wasQuoted) {
      current += char;
    }
  }
  result.push(wasQuoted ? current : cleanValue(current));
  return result;
}

function cleanValue(val: string): any {
  const trimmed = val.trim();
  if (trimmed.toUpperCase() === 'NULL') return null;
  if (!isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
  return trimmed;
}

interface WhereCondition {
  col: string;
  op: '=' | '!=' | 'IS' | 'IS NOT' | 'LIKE';
  val: any;
}

function advanceSqlQuote(sql: string, index: number): number {
  let i = index + 1;
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (i + 1 < sql.length && sql[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i;
    }
    i++;
  }
  return sql.length - 1;
}

function findTopLevelKeyword(
  sql: string,
  pattern: RegExp,
  startIndex = 0
): { index: number; length: number } | null {
  for (let i = startIndex; i < sql.length; i++) {
    if (sql[i] === "'") {
      i = advanceSqlQuote(sql, i);
      continue;
    }
    pattern.lastIndex = i;
    const match = pattern.exec(sql);
    if (match) {
      return { index: match.index, length: match[0].length };
    }
  }
  return null;
}

function splitTopLevel(str: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "'") {
      i = advanceSqlQuote(str, i);
      continue;
    }
    if (str[i] === delimiter) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

function splitTopLevelKeyword(str: string, keyword: string): string[] {
  const parts: string[] = [];
  const pattern = new RegExp(`\\s+${keyword}\\s+`, 'iy');
  let start = 0;
  while (start <= str.length) {
    const match = findTopLevelKeyword(str, pattern, start);
    if (!match) break;
    parts.push(str.slice(start, match.index));
    start = match.index + match.length;
  }
  parts.push(str.slice(start));
  return parts;
}

function findTopLevelOperator(str: string, op: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "'") {
      i = advanceSqlQuote(str, i);
      continue;
    }
    if (str.startsWith(op, i)) {
      return i;
    }
  }
  return -1;
}

function parseWhereClause(clause: string | undefined): WhereCondition[] {
  if (!clause) return [];
  const parts = splitTopLevelKeyword(clause, 'AND');
  const conditions: WhereCondition[] = [];

  parts.forEach(rawPart => {
    const part = rawPart.trim();
    if (!part) return;
    const upper = part.toUpperCase();
    if (!part.endsWith("'") && upper.endsWith('IS NOT NULL')) {
      const col = part.substring(0, upper.indexOf('IS NOT NULL')).trim();
      conditions.push({ col: col.toLowerCase(), op: 'IS NOT', val: null });
    } else if (!part.endsWith("'") && upper.endsWith('IS NULL')) {
      const col = part.substring(0, upper.indexOf('IS NULL')).trim();
      conditions.push({ col: col.toLowerCase(), op: 'IS', val: null });
    } else {
      const neIdx = findTopLevelOperator(part, '!=');
      if (neIdx !== -1) {
        const col = part.slice(0, neIdx).trim().toLowerCase();
        const valStr = part.slice(neIdx + 2).trim();
        conditions.push({ col, op: '!=', val: cleanSqlString(valStr) });
        return;
      }
      const eqIdx = findTopLevelOperator(part, '=');
      if (eqIdx !== -1) {
        const col = part.slice(0, eqIdx).trim().toLowerCase();
        const valStr = part.slice(eqIdx + 1).trim();
        conditions.push({ col, op: '=', val: cleanSqlString(valStr) });
      }
    }
  });
  return conditions;
}

function cleanSqlString(valStr: string): any {
  if (valStr.length >= 2 && valStr.startsWith("'") && valStr.endsWith("'")) {
    return valStr.slice(1, -1).replace(/''/g, "'");
  }
  return cleanValue(valStr);
}

function matchRow(row: any, conditions: WhereCondition[]): boolean {
  for (const cond of conditions) {
    const rowVal = row[cond.col];
    if (cond.op === '=') {
      if (String(rowVal) !== String(cond.val)) return false;
    } else if (cond.op === '!=') {
      if (String(rowVal) === String(cond.val)) return false;
    } else if (cond.op === 'IS') {
      if (rowVal != null) return false;
    } else if (cond.op === 'IS NOT') {
      if (rowVal == null) return false;
    }
  }
  return true;
}

function executeH5Query(sql: string) {
  const trimmed = sql.trim();
  const upperStart = trimmed.toUpperCase();
  if (upperStart.startsWith('CREATE TABLE') || upperStart.startsWith('ALTER TABLE')) {
    return;
  }
  if (trimmed.toUpperCase().startsWith('INSERT INTO')) {
    const insertMatch = trimmed.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]+)\)/i);
    if (!insertMatch) throw new Error('Unparseable INSERT SQL: ' + sql);
    const tableName = insertMatch[1].toLowerCase();
    const cols = insertMatch[2].split(',').map(s => s.trim().toLowerCase());
    const vals = parseSqlValues(insertMatch[3]);
    
    const row: any = {};
    cols.forEach((col, idx) => {
      row[col] = vals[idx];
    });
    
    const table = h5Db.getTable(tableName);
    if (tableName === 'local_mutations' && row.id == null) {
      const maxId = table.reduce((max, item) => Math.max(max, Number(item?.id) || 0), 0);
      row.id = maxId + 1;
    }
    table.push(row);
    h5Db.saveTable(tableName, table);
    return;
  }
  if (trimmed.toUpperCase().startsWith('UPDATE')) {
    const header = trimmed.match(/^UPDATE\s+(\w+)\s+SET\s+/i);
    if (!header) throw new Error('Unparseable UPDATE SQL: ' + sql);
    const tableName = header[1].toLowerCase();
    const body = trimmed.slice(header[0].length);
    const whereKeyword = findTopLevelKeyword(body, /\s+WHERE\s+/iy);
    const setClause = whereKeyword ? body.slice(0, whereKeyword.index) : body;
    const whereClause = whereKeyword ? body.slice(whereKeyword.index + whereKeyword.length) : undefined;

    const sets: { [key: string]: any } = {};
    const setPairs = splitTopLevel(setClause, ',');
    setPairs.forEach(pair => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx !== -1) {
        const col = pair.slice(0, eqIdx).trim().toLowerCase();
        const valStr = pair.slice(eqIdx + 1).trim();
        sets[col] = cleanSqlString(valStr);
      }
    });

    const where = parseWhereClause(whereClause);
    let table = h5Db.getTable(tableName);
    table = table.map(row => {
      if (matchRow(row, where)) {
        return { ...row, ...sets };
      }
      return row;
    });
    h5Db.saveTable(tableName, table);
    return;
  }
  if (trimmed.toUpperCase().startsWith('DELETE FROM')) {
    const deleteMatch = trimmed.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+))?$/i);
    if (!deleteMatch) throw new Error('Unparseable DELETE SQL: ' + sql);
    const tableName = deleteMatch[1].toLowerCase();
    const whereClause = deleteMatch[2];
    
    const where = parseWhereClause(whereClause);
    let table = h5Db.getTable(tableName);
    table = table.filter(row => !matchRow(row, where));
    h5Db.saveTable(tableName, table);
    return;
  }
  if (trimmed) {
    console.warn('[H5 DB] Unhandled SQL statement:', trimmed);
  }
}

function selectH5Query(sql: string): any[] {
  const trimmed = sql.trim();
  if (trimmed.toUpperCase().startsWith('SELECT')) {
    const header = trimmed.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)/i);
    if (!header) throw new Error('Unparseable SELECT SQL: ' + sql);
    const tableName = header[2].toLowerCase();
    const rest = trimmed.slice(header[0].length);
    const orderKeyword = findTopLevelKeyword(rest, /\s+ORDER\s+BY\s+/iy);
    const beforeOrder = orderKeyword ? rest.slice(0, orderKeyword.index) : rest;
    const orderByClause = orderKeyword ? rest.slice(orderKeyword.index + orderKeyword.length) : undefined;
    const whereMatch = beforeOrder.match(/^\s*WHERE\s+([\s\S]+)$/i);
    const whereClause = whereMatch ? whereMatch[1] : undefined;
    
    let table = h5Db.getTable(tableName);
    
    if (whereClause) {
      const where = parseWhereClause(whereClause);
      table = table.filter(row => matchRow(row, where));
    }
    
    if (orderByClause) {
      const parts = orderByClause.trim().split(/\s+/);
      const col = parts[0].toLowerCase();
      const isDesc = parts[1] && parts[1].toUpperCase() === 'DESC';
      table.sort((a, b) => {
        const valA = a[col];
        const valB = b[col];
        if (valA === valB) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;
        return isDesc ? (valA > valB ? -1 : 1) : (valA > valB ? 1 : -1);
      });
    }
    
    return table;
  }
  return [];
}

const initializedScopes = new Set<string>();
const initializingScopes = new Map<string, Promise<void>>();
const openingDatabases = new Map<string, Promise<void>>();

// Helper to wrap plus.sqlite in Promises
const sqlite = {
  isOpen(): boolean {
    if (isH5) return true;
    return plus.sqlite.isOpenDatabase(databaseIdentity());
  },

  open(): Promise<void> {
    if (isH5 || this.isOpen()) {
      return Promise.resolve();
    }
    const identity = databaseIdentity();
    const existing = openingDatabases.get(identity.name);
    if (existing) {
      return existing;
    }
    const pending = new Promise<void>((resolve, reject) => {
      plus.sqlite.openDatabase({
        ...identity,
        success: () => resolve(),
        fail: (e: any) => reject(new Error('Failed to open database: ' + JSON.stringify(e))),
      });
    });
    openingDatabases.set(identity.name, pending);
    const cleanup = () => {
      if (openingDatabases.get(identity.name) === pending) {
        openingDatabases.delete(identity.name);
      }
    };
    pending.then(cleanup, cleanup);
    return pending;
  },

  async executeRaw(sql: string): Promise<void> {
    await this.open();
    if (isH5) {
      executeH5Query(sql);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      plus.sqlite.executeSql({
        name: databaseIdentity().name,
        sql,
        success: () => resolve(),
        fail: (e: any) => reject(new Error(`Failed to execute SQL: ${sql}. Error: ${JSON.stringify(e)}`)),
      });
    });
  },

  async selectRaw(sql: string): Promise<any[]> {
    await this.open();
    if (isH5) {
      return selectH5Query(sql);
    }
    return new Promise<any[]>((resolve, reject) => {
      plus.sqlite.selectSql({
        name: databaseIdentity().name,
        sql,
        success: (data: any) => resolve(data || []),
        fail: (e: any) => reject(new Error(`Failed to select SQL: ${sql}. Error: ${JSON.stringify(e)}`)),
      });
    });
  },

  async execute(sql: string): Promise<void> {
    await ensureInitialized();
    return this.executeRaw(sql);
  },

  async select(sql: string): Promise<any[]> {
    await ensureInitialized();
    return this.selectRaw(sql);
  },
};

async function ensureInitialized(): Promise<void> {
  const scope = safeCurrentScope() || 'legacy-unassigned';
  if (initializedScopes.has(scope)) {
    return;
  }
  const pending = initializingScopes.get(scope);
  if (pending) {
    return pending;
  }
  const run = (async () => {
    await sqlite.open();
    await localDb.createTables();
    await localDb.runMigrations();
    initializedScopes.add(scope);
  })();
  initializingScopes.set(scope, run);
  const cleanup = () => {
    if (initializingScopes.get(scope) === run) {
      initializingScopes.delete(scope);
    }
  };
  run.then(cleanup, cleanup);
  return run;
}

const inFlightMutationIds = new Set<string>();
const cacheWriteQueues = new Map<string, Promise<void>>();

function escSql(val: string | null | undefined): string {
  return (val || '').replace(/'/g, "''");
}

function parseJsonSafely<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeFiniteInt(raw: unknown, fallback = 0): number {
  const num = Number(raw);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function reviewStatesLoadedMetaKey(subjectId: string): string {
  return `review_states_loaded:${subjectId}`;
}

function subjectOverviewCacheKey(subjectId: string): string {
  return `SUBJECT:${subjectId}:subject-v1`;
}

function sourceOverviewCacheKey(sourceId: string, revisionKey: string): string {
  return `FILE:${sourceId}:${revisionKey}`;
}

function subjectStatsCacheKey(subjectId: string, days: 7 | 30, timeZone: string): string {
  return `${subjectId}:${days}:${timeZone}`;
}

function safeCurrentScope(): string | null {
  try {
    return localDataScope.current();
  } catch {
    return null;
  }
}

/**
 * Serializes derived-cache writes per scope/table and verifies scope invariance
 * right before committing so account switches or H5 storage quota limits cannot corrupt state.
 */
function serializeCacheWrite(bucket: string, operation: () => Promise<void>): Promise<void> {
  const expectedScope = safeCurrentScope();
  if (!expectedScope) return Promise.resolve();
  const queueKey = `${expectedScope}:${bucket}`;
  const previous = cacheWriteQueues.get(queueKey) ?? Promise.resolve();
  const run = previous.then(async () => {
    const activeScope = safeCurrentScope();
    if (!activeScope || activeScope !== expectedScope) return;
    try {
      await operation();
    } catch (error) {
      if (typeof uni === 'undefined' && typeof plus === 'undefined') return;
      console.warn(`[SQLite Mobile] Cache persistence skipped (${bucket}):`, error);
    }
  });
  const tail = run.then(() => undefined, () => undefined);
  cacheWriteQueues.set(queueKey, tail);
  void tail.finally(() => {
    if (cacheWriteQueues.get(queueKey) === tail) {
      cacheWriteQueues.delete(queueKey);
    }
  });
  return run;
}

export const localDb = {
  async executeSql(sql: string, params?: any[]): Promise<any> {
    let formattedSql = sql;
    if (params && params.length > 0) {
      let idx = 0;
      formattedSql = sql.replace(/\?/g, () => {
        const val = params[idx++];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        const esc = String(val).replace(/'/g, "''");
        return `'${esc}'`;
      });
    }
    if (formattedSql.trim().toUpperCase().startsWith('SELECT')) {
      return sqlite.select(formattedSql);
    } else {
      return sqlite.execute(formattedSql);
    }
  },

  async init() {
    try {
      const scope = safeCurrentScope() || 'legacy-unassigned';
      const inFlight = initializingScopes.get(scope);
      if (inFlight) {
        await inFlight;
      }
      initializedScopes.delete(scope);
      await ensureInitialized();
      console.log('[SQLite Mobile] Native database and tables initialized.');
    } catch (e) {
      console.error('[SQLite Mobile] Database initialization failed:', e);
      throw e;
    }
  },

  async createTables() {
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS local_mutations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        entity_type TEXT,
        entity_id TEXT,
        action TEXT,
        payload TEXT,
        created_at INTEGER,
        sync_status TEXT DEFAULT 'pending'
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS knowledge_blocks (
        id TEXT PRIMARY KEY,
        subject TEXT,
        title TEXT,
        preview TEXT,
        time TEXT,
        source TEXT,
        color TEXT,
        sync_status TEXT DEFAULT 'synced',
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        subject_id TEXT,
        source_file_id TEXT,
        tags TEXT,
        difficulty TEXT,
        mastery INTEGER DEFAULT 0,
        review_at TEXT,
        related_block_ids TEXT
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS task_blocks (
        id TEXT PRIMARY KEY,
        name TEXT,
        subject TEXT,
        desc TEXT,
        duration INTEGER,

        status TEXT,
        startTime TEXT,
        scheduled_at TEXT,
        due_at TEXT,
        sync_status TEXT DEFAULT 'synced',
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        position TEXT DEFAULT '0',
        subject_id TEXT
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        sort_key TEXT,
        created_at INTEGER,
        version INTEGER DEFAULT 0
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS source_files (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        name TEXT NOT NULL,
        file_path TEXT,
        file_type TEXT,
        file_size INTEGER,
        catalog_json TEXT,
        block_count INTEGER DEFAULT 0,
        created_at INTEGER,
        version INTEGER DEFAULT 0,
        payload_json TEXT
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS ai_overview_cache (
        cache_key TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        subject_id TEXT,
        revision_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS review_states_cache (
        knowledge_block_id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS subject_stats_cache (
        cache_key TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        days INTEGER NOT NULL,
        time_zone TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await sqlite.executeRaw(`
      CREATE TABLE IF NOT EXISTS tablet_notes (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        subject_id TEXT,
        asset_id TEXT,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  },

  async runMigrations() {
    if (isH5) {
      const tasks = h5Db.getTable('task_blocks').map((task: any) => {
        const currentTask = { ...task };
        delete currentTask.load;
        delete currentTask.loadtext;
        delete currentTask.loadText;
        delete currentTask.cognitiveLoad;
        delete currentTask.color;
        delete currentTask.colorOverride;
        currentTask.position = normalizeTaskPosition(currentTask.position);
        if (typeof currentTask.name === 'number') currentTask.name = String(currentTask.name);
        if (typeof currentTask.subject === 'number') currentTask.subject = String(currentTask.subject);
        if (typeof currentTask.desc === 'number') currentTask.desc = String(currentTask.desc);
        return currentTask;
      });
      h5Db.saveTable('task_blocks', tasks);
      const rawMutations = h5Db.getTable('local_mutations');
      let nextMutationId = rawMutations.reduce((max, item) => Math.max(max, Number(item?.id) || 0), 0);
      const mutations = rawMutations.map((mutation: any) => {
        const withId = mutation?.id == null ? { ...mutation, id: ++nextMutationId } : mutation;
        if (withId.entity_type !== 'task') return withId;
        const result = cleanTaskMutationPayload(withId.payload);
        if (result.status === 'invalid') warnInvalidTaskPayload(false);
        if (result.status === 'changed') return { ...withId, payload: result.payload };
        return withId;
      });
      h5Db.saveTable('local_mutations', mutations);
    }

    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN sync_version INTEGER DEFAULT 0");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks ADD COLUMN sync_version INTEGER DEFAULT 0");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks ADD COLUMN position TEXT DEFAULT '0'");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN subject_id TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN source_file_id TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN tags TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN difficulty TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN mastery INTEGER DEFAULT 0");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN review_at TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE knowledge_blocks ADD COLUMN related_block_ids TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks ADD COLUMN subject_id TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks ADD COLUMN scheduled_at TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks ADD COLUMN due_at TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE subjects ADD COLUMN version INTEGER DEFAULT 0");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE subjects ADD COLUMN sort_key TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE source_files ADD COLUMN version INTEGER DEFAULT 0");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE source_files ADD COLUMN payload_json TEXT");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE subjects DROP COLUMN color");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks DROP COLUMN load");
    } catch (e) {}
    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks DROP COLUMN loadText");
    } catch (e) {}

    try {
      await sqlite.executeRaw("ALTER TABLE task_blocks DROP COLUMN color");
    } catch (e) {}

    if (!isH5) {
      const taskMutations = await sqlite.selectRaw("SELECT id, payload FROM local_mutations WHERE entity_type = 'task'");
      for (const mutation of taskMutations) {
        if (!mutation.payload) continue;
        const result = cleanTaskMutationPayload(mutation.payload);
        if (result.status === 'invalid') warnInvalidTaskPayload(true)
        if (result.status === 'changed') {
          const sanitized = result.payload.replace(/'/g, "''");
          const esc = (value: string) => value.replace(/'/g, "''");
          await sqlite.executeRaw(`UPDATE local_mutations SET payload = '${sanitized}' WHERE id = '${esc(String(mutation.id))}'`);
        }
      }
    }
  },

  // Sync Metadata Key-Value helpers
  async getMetadata(key: string): Promise<string | null> {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const rows = await sqlite.select(`SELECT value FROM sync_metadata WHERE key = '${esc(key)}'`);
    if (rows && rows.length > 0) {
      return rows[0].value;
    }
    return null;
  },

  async setMetadata(key: string, value: string) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT key FROM sync_metadata WHERE key = '${esc(key)}'`);
    if (exists && exists.length > 0) {
      await sqlite.execute(`UPDATE sync_metadata SET value = '${esc(value)}' WHERE key = '${esc(key)}'`);
    } else {
      await sqlite.execute(`INSERT INTO sync_metadata (key, value) VALUES ('${esc(key)}', '${esc(value)}')`);
    }
  },

  // Knowledge Blocks
  async getBlocks(subject?: string, subjectId?: string): Promise<KnowledgeBlock[]> {
    let query = 'SELECT * FROM knowledge_blocks WHERE is_deleted = 0';
    if (subjectId) {
      query += ` AND subject_id = '${subjectId.replace(/'/g, "''")}'`;
    } else if (subject) {
      query += ` AND subject = '${subject.replace(/'/g, "''")}'`;
    }
    query += ' ORDER BY time DESC';
    const records = await sqlite.select(query);
    return records.map((r: any) => ({
      id: r.id,
      subject: r.subject,
      title: r.title,
      preview: r.preview,
      time: r.time,
      source: r.source,
      color: r.color,
      sync_status: r.sync_status,
      sync_version: r.sync_version || 0,
      is_deleted: r.is_deleted === 1,
      subjectId: r.subject_id || undefined,
      sourceFileId: r.source_file_id || undefined,
      tags: r.tags ? JSON.parse(r.tags) : [],
      mastery: r.mastery || 0,
      reviewAt: r.review_at || undefined,
      relatedBlockIds: r.related_block_ids ? JSON.parse(r.related_block_ids) : []
    }));
  },

  async saveBlock(block: KnowledgeBlock, syncStatus = 'synced', syncVersion = 0) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT id FROM knowledge_blocks WHERE id = '${esc(block.id)}'`);
    const isDeletedVal = block.is_deleted ? 1 : 0;
    const versionVal = block.sync_version || syncVersion || 0;

    const subjectIdVal = block.subjectId || '';
    const sourceFileIdVal = block.sourceFileId || '';
    const tagsVal = block.tags ? JSON.stringify(block.tags) : '[]';
    const masteryVal = block.mastery || 0;
    const reviewAtVal = block.reviewAt || '';
    const relatedBlockIdsVal = block.relatedBlockIds ? JSON.stringify(block.relatedBlockIds) : '[]';

    if (exists && exists.length > 0) {
      await sqlite.execute(`
        UPDATE knowledge_blocks SET
          subject = '${esc(block.subject)}',
          title = '${esc(block.title)}',
          preview = '${esc(block.preview)}',
          time = '${esc(block.time)}',
          source = '${esc(block.source)}',
          color = '${esc(block.color)}',
          sync_status = '${syncStatus}',
          is_deleted = ${isDeletedVal},
          sync_version = ${versionVal},
          subject_id = '${esc(subjectIdVal)}',
          source_file_id = '${esc(sourceFileIdVal)}',
          tags = '${esc(tagsVal)}',
          mastery = ${masteryVal},
          review_at = '${esc(reviewAtVal)}',
          related_block_ids = '${esc(relatedBlockIdsVal)}'
        WHERE id = '${esc(block.id)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO knowledge_blocks (id, subject, title, preview, time, source, color, sync_status, is_deleted, sync_version, subject_id, source_file_id, tags, mastery, review_at, related_block_ids)
        VALUES (
          '${esc(block.id)}',
          '${esc(block.subject)}',
          '${esc(block.title)}',
          '${esc(block.preview)}',
          '${esc(block.time)}',
          '${esc(block.source)}',
          '${esc(block.color)}',
          '${syncStatus}',
          ${isDeletedVal},
          ${versionVal},
          '${esc(subjectIdVal)}',
          '${esc(sourceFileIdVal)}',
          '${esc(tagsVal)}',
          ${masteryVal},
          '${esc(reviewAtVal)}',
          '${esc(relatedBlockIdsVal)}'
        )
      `);
    }
  },

  async deleteBlock(id: string) {
    const record = await sqlite.select(`SELECT sync_status FROM knowledge_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    if (record && record[0] && record[0].sync_status === 'pending_create') {
      await sqlite.execute(`DELETE FROM knowledge_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    } else {
      await sqlite.execute(`UPDATE knowledge_blocks SET is_deleted = 1, sync_status = 'pending_delete' WHERE id = '${id.replace(/'/g, "''")}'`);
    }
  },

  async hardDeleteBlock(id: string) {
    await sqlite.execute(`DELETE FROM knowledge_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async getUnsyncedBlocks(): Promise<any[]> {
    return sqlite.select("SELECT * FROM knowledge_blocks WHERE sync_status != 'synced'");
  },

  async markBlockSynced(id: string) {
    await sqlite.execute(`UPDATE knowledge_blocks SET sync_status = 'synced' WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async mergeBlocksFromServer(serverBlocks: KnowledgeBlock[]) {
    await this.batchMergeBlocks(serverBlocks);
  },

  async batchMergeBlocks(serverBlocks: any[]) {
    for (const block of serverBlocks) {
      if (!block.id) continue;
      const escId = block.id.replace(/'/g, "''");
      const local = await sqlite.select(`SELECT sync_status, sync_version FROM knowledge_blocks WHERE id = '${escId}'`);
      
      if (block.isDeleted || block.is_deleted) {
        if (local && local.length > 0) {
          if (local[0].sync_status !== 'synced') {
            const serverVer = block.syncVersion || block.sync_version || 0;
            const localVer = local[0].sync_version || 0;
            if (serverVer < localVer) {
              continue; // Keep local modifications
            }
          }
          await this.hardDeleteBlock(block.id);
        }
        continue;
      }

      if (local && local.length > 0) {
        if (local[0].sync_status !== 'synced') {
          const serverVer = block.syncVersion || block.sync_version || 0;
          const localVer = local[0].sync_version || 0;
          if (serverVer < localVer) {
            continue; // Keep local modifications
          }
        }
      }

      const mappedBlock: KnowledgeBlock = {
        id: block.id,
        subject: block.subject,
        title: block.title,
        preview: block.preview,
        time: block.time,
        source: block.source,
        color: block.color,
        sync_version: block.syncVersion || block.sync_version || 0,
        is_deleted: false,
        subjectId: block.subjectId || block.subject_id || undefined,
        sourceFileId: block.sourceFileId || block.source_file_id || undefined,
        tags: block.tags ? (typeof block.tags === 'string' ? JSON.parse(block.tags) : block.tags) : [],
        mastery: block.mastery || 0,
        reviewAt: block.reviewAt || block.review_at || undefined,
        relatedBlockIds: block.relatedBlockIds ? (typeof block.relatedBlockIds === 'string' ? JSON.parse(block.relatedBlockIds) : block.relatedBlockIds) : []
      };
      await this.saveBlock(mappedBlock, 'synced', block.syncVersion || block.sync_version || 0);
    }
  },

  // Task Blocks
  async getTasks(): Promise<Task[]> {
    const records = await sqlite.select('SELECT * FROM task_blocks WHERE is_deleted = 0 ORDER BY position ASC');
    return records.map((r: any) => {
      const scheduledAt = r.scheduled_at || undefined;
      return {
        id: r.id,
        name: r.name != null ? String(r.name) : '',
        subject: r.subject != null ? String(r.subject) : '',
        desc: r.desc != null ? String(r.desc) : '',
        duration: r.duration,
        status: r.status,
        scheduledAt,
        dueAt: r.due_at || undefined,
        startTime: scheduledAt ? formatLocalTimeHHmm(scheduledAt) : (r.startTime || r.starttime || undefined),
        sync_status: r.sync_status,
        sync_version: r.sync_version || 0,
        is_deleted: r.is_deleted === 1,
        position: normalizeTaskPosition(r.position),
        subjectId: r.subject_id || undefined,
      };
    });
  },

  async saveTask(task: Task, syncStatus = 'synced', syncVersion = 0) {
    if (!task.id) {
      throw new Error('Cannot save a task without an id')
    }
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const taskId = task.id
    const exists = await sqlite.select(`SELECT id FROM task_blocks WHERE id = '${esc(taskId)}'`);
    const isDeletedVal = task.is_deleted ? 1 : 0;
    const versionVal = task.sync_version || syncVersion || 0;
    const positionVal = task.position || '0';
    const subjectIdVal = task.subjectId || '';
    const scheduledAtSql = task.scheduledAt ? `'${esc(task.scheduledAt)}'` : 'NULL';
    const dueAtSql = task.dueAt ? `'${esc(task.dueAt)}'` : 'NULL';
    const durationVal = Math.max(0, safeFiniteInt(task.duration, 0));
    const startTimeVal = task.scheduledAt ? formatLocalTimeHHmm(task.scheduledAt) : (task.startTime || '');
    const startTimeSql = startTimeVal ? `'${esc(startTimeVal)}'` : 'NULL';
    if (exists && exists.length > 0) {
      await sqlite.execute(`
        UPDATE task_blocks SET
          name = '${esc(task.name)}',
          subject = '${esc(task.subject)}',
          desc = '${esc(task.desc || '')}',
          duration = ${durationVal},
          status = '${esc(task.status)}',
          startTime = ${startTimeSql},
          scheduled_at = ${scheduledAtSql},
          due_at = ${dueAtSql},
          sync_status = '${syncStatus}',
          is_deleted = ${isDeletedVal},
          sync_version = ${versionVal},
          position = '${esc(positionVal)}',
          subject_id = '${esc(subjectIdVal)}'
        WHERE id = '${esc(taskId)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO task_blocks (id, name, subject, desc, duration, status, startTime, scheduled_at, due_at, sync_status, is_deleted, sync_version, position, subject_id)
        VALUES (
          '${esc(taskId)}',
          '${esc(task.name)}',
          '${esc(task.subject)}',
          '${esc(task.desc || '')}',
          ${durationVal},
          '${esc(task.status)}',
          ${startTimeSql},
          ${scheduledAtSql},
          ${dueAtSql},
          '${syncStatus}',
          ${isDeletedVal},
          ${versionVal},
          '${esc(positionVal)}',
          '${esc(subjectIdVal)}'
        )
      `);
    }
  },

  async deleteTask(id: string) {
    const record = await sqlite.select(`SELECT sync_status FROM task_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    if (record && record[0] && record[0].sync_status === 'pending_create') {
      await sqlite.execute(`DELETE FROM task_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    } else {
      await sqlite.execute(`UPDATE task_blocks SET is_deleted = 1, sync_status = 'pending_delete' WHERE id = '${id.replace(/'/g, "''")}'`);
    }
  },

  async hardDeleteTask(id: string) {
    await sqlite.execute(`DELETE FROM task_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async getUnsyncedTasks(): Promise<any[]> {
    return sqlite.select("SELECT * FROM task_blocks WHERE sync_status != 'synced'");
  },

  async markTaskSynced(id: string) {
    await sqlite.execute(`UPDATE task_blocks SET sync_status = 'synced' WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async mergeTasksFromServer(serverTasks: Task[]) {
    await this.batchMergeTasks(serverTasks);
  },

  async batchMergeTasks(serverTasks: any[]) {
    for (const task of serverTasks) {
      if (!task.id) continue;
      const escId = task.id.replace(/'/g, "''");
      const local = await sqlite.select(`SELECT sync_status, sync_version FROM task_blocks WHERE id = '${escId}'`);
      
      if (task.isDeleted || task.is_deleted) {
        if (local && local.length > 0) {
          if (local[0].sync_status !== 'synced') {
            const serverVer = task.syncVersion || task.sync_version || 0;
            const localVer = local[0].sync_version || 0;
            if (serverVer < localVer) {
              continue; // Keep local modifications
            }
          }
          await this.hardDeleteTask(task.id);
        }
        continue;
      }

      if (local && local.length > 0) {
        if (local[0].sync_status !== 'synced') {
          const serverVer = task.syncVersion || task.sync_version || 0;
          const localVer = local[0].sync_version || 0;
          if (serverVer < localVer) {
            continue; // Keep local modifications
          }
        }
      }

      const mappedTask: Task = {
        id: task.id,
        name: task.name,
        subject: task.subject,
        desc: task.desc || '',
        duration: task.duration,
        status: task.status,
        scheduledAt: task.scheduledAt || undefined,
        dueAt: task.dueAt || undefined,
        startTime: task.scheduledAt ? formatLocalTimeHHmm(task.scheduledAt) : (task.startTime || undefined),
        sync_version: task.syncVersion || task.sync_version || 0,
        is_deleted: false,
        position: task.position || '0',
        subjectId: task.subjectId || task.subject_id || undefined
      };
      await this.saveTask(mappedTask, 'synced', task.syncVersion || task.sync_version || 0);
    }
  },

  setInFlightMutationIds(ids: Array<number | string>) {
    inFlightMutationIds.clear();
    for (const id of ids) {
      if (id != null) inFlightMutationIds.add(String(id));
    }
  },

  async rebasePendingMutations(
    entityType: string,
    entityId: string,
    options: { appliedMutationType: string; serverVersion: number | null; deleted: boolean }
  ) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const rows = await sqlite.select(
      `SELECT id, action, payload FROM local_mutations WHERE entity_type = '${esc(entityType)}' AND entity_id = '${esc(entityId)}' AND sync_status = 'pending' ORDER BY id ASC`
    );
    for (const row of rows) {
      if (row.id == null) continue;
      const currentAction = String(row.action || '').toLowerCase();
      if (options.deleted) {
        if (currentAction !== 'create') {
          await sqlite.execute(`DELETE FROM local_mutations WHERE id = ${Number(row.id)}`);
        }
        continue;
      }
      const nextAction = currentAction === 'create' ? 'update' : currentAction;
      let nextPayloadRaw = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload ?? {});
      if (options.serverVersion !== null) {
        try {
          const parsed = JSON.parse(nextPayloadRaw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsed.version = options.serverVersion;
            parsed.sync_version = options.serverVersion;
            nextPayloadRaw = JSON.stringify(parsed);
          }
        } catch {
          // Keep raw payload when not JSON
        }
      }
      await sqlite.execute(
        `UPDATE local_mutations SET action = '${esc(nextAction)}', payload = '${esc(nextPayloadRaw)}' WHERE id = ${Number(row.id)}`
      );
    }
  },

  async addLocalMutation(clientId: string, entityType: string, entityId: string, action: string, payload: any) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const normalizedAction = String(action || '').toLowerCase();
    const createdAt = Date.now();
    const existing = await sqlite.select(
      `SELECT id, action, payload FROM local_mutations WHERE entity_type = '${esc(entityType)}' AND entity_id = '${esc(entityId)}' AND sync_status = 'pending' ORDER BY id ASC`
    );

    const preserveFromRows = (base: any, rows: any[]) => {
      let next = base;
      for (let i = rows.length - 1; i >= 0; i--) {
        next = preserveMutationBaseVersion(next, rows[i].payload);
      }
      return next;
    };

    const mutableExisting = existing.filter(item => !inFlightMutationIds.has(String(item.id)));
    const inFlightExisting = existing.filter(item => inFlightMutationIds.has(String(item.id)));

    if (mutableExisting.length > 0 && normalizedAction !== 'create') {
      const latest = mutableExisting[mutableExisting.length - 1];
      const hasPendingCreate = mutableExisting.some(item => String(item.action).toLowerCase() === 'create');
      const nextPayload = preserveFromRows(preserveFromRows(payload, mutableExisting), inFlightExisting);
      const nextPayloadStr = JSON.stringify(nextPayload);
      if (hasPendingCreate && normalizedAction === 'delete') {
        for (const row of mutableExisting) {
          if (row.id != null) {
            await sqlite.execute(`DELETE FROM local_mutations WHERE id = ${Number(row.id)}`);
          }
        }
        if (inFlightExisting.length === 0) return;
        await sqlite.execute(
          `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
           VALUES ('${esc(clientId)}', '${esc(entityType)}', '${esc(entityId)}', 'delete', '${esc(nextPayloadStr)}', ${createdAt}, 'pending')`
        );
        return;
      }
      if (hasPendingCreate || normalizedAction === 'update') {
        const coalescedAction = hasPendingCreate ? 'create' : 'update';
        const targetId = Number(latest.id);
        await sqlite.execute(
          `UPDATE local_mutations SET client_id = '${esc(clientId)}', action = '${coalescedAction}', payload = '${esc(nextPayloadStr)}', created_at = ${createdAt} WHERE id = ${targetId}`
        );
        for (const extra of mutableExisting.slice(0, -1)) {
          if (extra.id != null) {
            await sqlite.execute(`DELETE FROM local_mutations WHERE id = ${Number(extra.id)}`);
          }
        }
        return;
      }
      if (normalizedAction === 'delete') {
        for (const row of mutableExisting) {
          if (row.id != null) {
            await sqlite.execute(`DELETE FROM local_mutations WHERE id = ${Number(row.id)}`);
          }
        }
        await sqlite.execute(
          `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
           VALUES ('${esc(clientId)}', '${esc(entityType)}', '${esc(entityId)}', 'delete', '${esc(nextPayloadStr)}', ${createdAt}, 'pending')`
        );
        return;
      }
    }

    if (inFlightExisting.length > 0 && normalizedAction !== 'create') {
      const nextPayload = preserveFromRows(payload, inFlightExisting);
      const nextPayloadStr = JSON.stringify(nextPayload);
      await sqlite.execute(
        `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
         VALUES ('${esc(clientId)}', '${esc(entityType)}', '${esc(entityId)}', '${esc(normalizedAction)}', '${esc(nextPayloadStr)}', ${createdAt}, 'pending')`
      );
      return;
    }

    const payloadStr = JSON.stringify(payload);
    await sqlite.execute(
      `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
       VALUES ('${esc(clientId)}', '${esc(entityType)}', '${esc(entityId)}', '${esc(normalizedAction)}', '${esc(payloadStr)}', ${createdAt}, 'pending')`
    );
  },

  async getUnsyncedMutations(): Promise<any[]> {
    return sqlite.select("SELECT * FROM local_mutations WHERE sync_status = 'pending' ORDER BY id ASC");
  },

  async markMutationSynced(id: number | string, clientId?: string) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const idLiteral = typeof id === 'number' || /^\d+$/.test(String(id))
      ? Number(id)
      : `'${esc(String(id))}'`;
    if (clientId) {
      await sqlite.execute(`DELETE FROM local_mutations WHERE id = ${idLiteral} AND client_id = '${esc(clientId)}'`);
      return;
    }
    await sqlite.execute(`DELETE FROM local_mutations WHERE id = ${idLiteral}`);
  },

  async discardLocalMutations(entityType: string, entityId: string) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    await sqlite.execute(
      `DELETE FROM local_mutations WHERE entity_type = '${esc(entityType)}' AND entity_id = '${esc(entityId)}'`
    );
  },

  async applyRemoteMutation(mutation: any) {
    const entityType = mutation.entityType;
    const action = mutation.action;
    const entityId = mutation.entityId;
    const payload = typeof mutation.payload === 'string' ? JSON.parse(mutation.payload) : mutation.payload;

    if (entityType === 'block') {
      if (action === 'create' || action === 'update') {
        const block = buildSyncedBlockRecord(entityId, payload || {}, mutation.createdAt || 0);
        await this.saveBlock(block, 'synced', block.sync_version || 0);
      } else if (action === 'delete') {
        await this.hardDeleteBlock(entityId);
      }
    } else if (entityType === 'task') {
      if (action === 'create' || action === 'update') {
        const scheduledAt = payload.scheduledAt || undefined;
        const task: Task = {
          id: entityId,
          name: payload.name,
          subject: payload.subject || '',
          desc: payload.desc || '',
          duration: payload.duration,
          status: payload.status,
          scheduledAt,
          dueAt: payload.dueAt || undefined,
          startTime: scheduledAt ? formatLocalTimeHHmm(scheduledAt) : (payload.startTime || undefined),
          sync_status: 'synced',
          position: payload.position || '0',
          subjectId: payload.subjectId || payload.subject_id || undefined
        };
        await this.saveTask(task, 'synced', payload.sync_version || mutation.createdAt);
      } else if (action === 'delete') {
        await this.hardDeleteTask(entityId);
      }
    }
  },

  // Subject CRUD
  async getSubjects(): Promise<any[]> {
    const rows = await sqlite.select('SELECT id, name, description, icon, sort_key, created_at, version FROM subjects ORDER BY created_at DESC');
    return (rows || []).map((row: any) => ({
      ...row,
      ...(row?.sort_key ? { sortKey: row.sort_key } : {}),
    }));
  },

  async saveSubject(subject: any): Promise<void> {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT id, sort_key FROM subjects WHERE id = '${esc(subject.id)}'`);
    const existingSortKey = exists && exists.length > 0 && typeof exists[0].sort_key === 'string'
      ? exists[0].sort_key
      : '';
    const rawSortKey = subject.sortKey ?? subject.sort_key;
    const sortKeyVal = typeof rawSortKey === 'string' ? rawSortKey : existingSortKey;
    if (exists && exists.length > 0) {
      await sqlite.execute(`
        UPDATE subjects SET 
          name = '${esc(subject.name)}', 
          description = '${esc(subject.description || '')}', 
          icon = '${esc(subject.icon || '')}',
          sort_key = '${esc(sortKeyVal)}',
          version = ${Number(subject.version || 0)}
        WHERE id = '${esc(subject.id)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO subjects (id, name, description, icon, sort_key, created_at, version)
        VALUES (
          '${esc(subject.id)}', 
          '${esc(subject.name)}', 
          '${esc(subject.description || '')}', 
          '${esc(subject.icon || '')}', 
          '${esc(sortKeyVal)}',
          ${subject.created_at || Date.now()},
          ${Number(subject.version || 0)}
        )
      `);
    }
  },

  async deleteSubject(id: string): Promise<void> {
    const escId = escSql(id);
    const activeScope = safeCurrentScope();
    const subjectSources = await sqlite.select(`SELECT id, payload_json FROM source_files WHERE subject_id = '${escId}'`);
    for (const row of subjectSources) {
      if (row.id) {
        await sqlite.execute(`DELETE FROM ai_overview_cache WHERE scope_type = 'FILE' AND scope_id = '${escSql(String(row.id))}'`);
      }
      const parsed = parseJsonSafely<SourceView>(row.payload_json);
      if (activeScope && parsed?.assetId) {
        void deleteCachedDocument(activeScope, parsed.assetId);
      }
    }
    await sqlite.execute(`DELETE FROM source_files WHERE subject_id = '${escId}'`);
    await sqlite.execute(`DELETE FROM ai_overview_cache WHERE subject_id = '${escId}'`);
    await sqlite.execute(`DELETE FROM review_states_cache WHERE subject_id = '${escId}'`);
    await sqlite.execute(`DELETE FROM subject_stats_cache WHERE subject_id = '${escId}'`);
    await sqlite.execute(`DELETE FROM sync_metadata WHERE key = '${escSql(reviewStatesLoadedMetaKey(id))}'`);
    await sqlite.execute(`UPDATE knowledge_blocks SET subject_id = NULL WHERE subject_id = '${escId}'`);
    await sqlite.execute(`UPDATE task_blocks SET subject_id = NULL WHERE subject_id = '${escId}'`);
    await sqlite.execute(`DELETE FROM subjects WHERE id = '${escId}'`);
  },

  // Source Files CRUD & SourceView Projection
  async getSourceFiles(subjectId: string): Promise<any[]> {
    const escId = escSql(subjectId);
    return sqlite.select(`SELECT * FROM source_files WHERE subject_id = '${escId}' ORDER BY created_at DESC`);
  },

  async saveSourceFile(file: any): Promise<void> {
    const fileId = String(file.id || '');
    const exists = await sqlite.select(
      `SELECT id, subject_id, catalog_json, block_count, payload_json FROM source_files WHERE id = '${escSql(fileId)}'`,
    );
    const existingRow = exists && exists.length > 0 ? exists[0] : null;
    const subjectIdVal = typeof file.subject_id === 'string' && file.subject_id
      ? file.subject_id
      : (typeof existingRow?.subject_id === 'string' ? existingRow.subject_id : '');
    const catalogJsonVal = typeof file.catalog_json === 'string'
      ? file.catalog_json
      : (typeof existingRow?.catalog_json === 'string' ? existingRow.catalog_json : '');
    const blockCountVal = file.block_count !== undefined && file.block_count !== null
      ? safeFiniteInt(file.block_count, 0)
      : safeFiniteInt(existingRow?.block_count, 0);
    const fileSizeVal = Math.max(0, safeFiniteInt(file.file_size ?? file.assetSizeBytes, 0));
    const createdAtVal = safeFiniteInt(file.created_at, Date.now());
    const versionVal = safeFiniteInt(file.version, 0);
    const existingPayload = typeof existingRow?.payload_json === 'string' ? existingRow.payload_json : '';
    const payloadJsonVal = typeof file.payload_json === 'string' && file.payload_json.trim()
      ? file.payload_json
      : existingPayload;

    if (existingRow) {
      await sqlite.execute(`
        UPDATE source_files SET
          subject_id = '${escSql(subjectIdVal)}',
          name = '${escSql(file.name)}',
          file_path = '${escSql(file.file_path)}',
          file_type = '${escSql(file.file_type)}',
          file_size = ${fileSizeVal},
          catalog_json = '${escSql(catalogJsonVal)}',
          block_count = ${blockCountVal},
          version = ${versionVal},
          payload_json = '${escSql(payloadJsonVal)}'
        WHERE id = '${escSql(fileId)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO source_files (id, subject_id, name, file_path, file_type, file_size, catalog_json, block_count, created_at, version, payload_json)
        VALUES (
          '${escSql(fileId)}',
          '${escSql(subjectIdVal)}',
          '${escSql(file.name)}',
          '${escSql(file.file_path)}',
          '${escSql(file.file_type)}',
          ${fileSizeVal},
          '${escSql(catalogJsonVal)}',
          ${blockCountVal},
          ${createdAtVal},
          ${versionVal},
          '${escSql(payloadJsonVal)}'
        )
      `);
    }
  },

  async deleteSourceFile(id: string): Promise<void> {
    const escId = escSql(id);
    const activeScope = safeCurrentScope();
    const rows = await sqlite.select(`SELECT payload_json FROM source_files WHERE id = '${escId}'`) as Array<{ payload_json?: unknown }>;
    const parsed = rows.length > 0 ? parseJsonSafely<SourceView>(rows[0]?.payload_json) : null;
    await sqlite.execute(`DELETE FROM ai_overview_cache WHERE scope_type = 'FILE' AND scope_id = '${escId}'`);
    await sqlite.execute(`DELETE FROM source_files WHERE id = '${escId}'`);
    if (activeScope && parsed?.assetId) {
      void deleteCachedDocument(activeScope, parsed.assetId);
    }
  },

  async upsertSourceView(subjectId: string, item: SourceView): Promise<void> {
    if (!subjectId || !item.id || item.deletedAt) return;
    await serializeCacheWrite(`source_files:${subjectId}`, async () => {
      const createdAtMs = item.createdAt ? Date.parse(item.createdAt) : NaN;
      await this.saveSourceFile({
        id: item.id,
        subject_id: item.subjectId || subjectId,
        name: item.title || '未命名资料',
        file_path: item.originUrl || item.assetId || '',
        file_type: item.type || 'FILE',
        file_size: item.assetSizeBytes ?? 0,
        created_at: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
        version: item.version ?? 0,
        payload_json: JSON.stringify(item),
      });
    });
  },

  async getSourceViews(subjectId: string): Promise<SourceView[]> {
    if (!subjectId) return [];
    const rows = await sqlite.select(
      `SELECT * FROM source_files WHERE subject_id = '${escSql(subjectId)}' ORDER BY created_at DESC`,
    );
    const result: SourceView[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      const parsed = parseJsonSafely<SourceView>(row.payload_json);
      if (parsed && parsed.id) {
        if (!parsed.deletedAt) result.push(parsed);
        continue;
      }
      if (!row.id) continue;
      const rawType = String(row.file_type || '').toUpperCase();
      const sourceType: SourceView['type'] = rawType === 'TEXT' || rawType === 'URL' ? rawType : 'FILE';
      result.push({
        id: String(row.id),
        subjectId: String(row.subject_id || subjectId),
        type: sourceType,
        title: String(row.name || '未命名资料'),
        assetSizeBytes: typeof row.file_size === 'number' && Number.isFinite(row.file_size) ? row.file_size : undefined,
        version: safeFiniteInt(row.version, 0),
        createdAt: typeof row.created_at === 'number' && Number.isFinite(row.created_at)
          ? new Date(row.created_at).toISOString()
          : undefined,
      });
    }
    return result;
  },

  async replaceSubjectSources(subjectId: string, items: SourceView[]): Promise<void> {
    if (!subjectId) return;
    await serializeCacheWrite(`source_files:${subjectId}`, async () => {
      const activeScope = safeCurrentScope();
      const activeItems = items.filter((item): item is SourceView & { id: string } => Boolean(item.id && !item.deletedAt));
      const nextIds = new Set(activeItems.map(item => item.id));
      const existingRows = await sqlite.select(
        `SELECT id, payload_json FROM source_files WHERE subject_id = '${escSql(subjectId)}'`,
      ) as Array<{ id?: unknown; payload_json?: unknown }>;

      for (const row of existingRows) {
        const existingId = row.id ? String(row.id) : '';
        if (existingId && !nextIds.has(existingId)) {
          const parsed = parseJsonSafely<SourceView>(row.payload_json);
          await sqlite.execute(`DELETE FROM ai_overview_cache WHERE scope_type = 'FILE' AND scope_id = '${escSql(existingId)}'`);
          await sqlite.execute(`DELETE FROM source_files WHERE id = '${escSql(existingId)}'`);
          if (activeScope && parsed?.assetId) {
            void deleteCachedDocument(activeScope, parsed.assetId);
          }
        }
      }

      for (const item of activeItems) {
        const createdAtMs = item.createdAt ? Date.parse(item.createdAt) : NaN;
        await this.saveSourceFile({
          id: item.id,
          subject_id: item.subjectId || subjectId,
          name: item.title || '未命名资料',
          file_path: item.originUrl || item.assetId || '',
          file_type: item.type || 'FILE',
          file_size: item.assetSizeBytes ?? 0,
          created_at: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
          version: item.version ?? 0,
          payload_json: JSON.stringify(item),
        });
      }
    });
  },

  // Derived AI Overview Cache (subject-v1 & ingestionRevision-scoped files)
  async getSubjectOverviewCache(subjectId: string): Promise<OverviewResultView | null> {
    if (!subjectId) return null;
    const key = subjectOverviewCacheKey(subjectId);
    const rows = await sqlite.select(
      `SELECT payload_json FROM ai_overview_cache WHERE cache_key = '${escSql(key)}'`,
    ) as Array<{ payload_json?: unknown }>;
    return rows.length > 0 ? parseJsonSafely<OverviewResultView>(rows[0].payload_json) : null;
  },

  async saveSubjectOverviewCache(subjectId: string, view: OverviewResultView): Promise<void> {
    if (!subjectId) return;
    await serializeCacheWrite(`overview:SUBJECT:${subjectId}`, async () => {
      const key = subjectOverviewCacheKey(subjectId);
      const updatedAt = view.updatedAt || new Date().toISOString();
      const payload = JSON.stringify(view);
      const exists = await sqlite.select(
        `SELECT cache_key FROM ai_overview_cache WHERE cache_key = '${escSql(key)}'`,
      );
      if (exists.length > 0) {
        await sqlite.execute(
          `UPDATE ai_overview_cache SET scope_type = 'SUBJECT', scope_id = '${escSql(subjectId)}', subject_id = '${escSql(subjectId)}', revision_key = 'subject-v1', payload_json = '${escSql(payload)}', updated_at = '${escSql(updatedAt)}' WHERE cache_key = '${escSql(key)}'`,
        );
      } else {
        await sqlite.execute(
          `INSERT INTO ai_overview_cache (cache_key, scope_type, scope_id, subject_id, revision_key, payload_json, updated_at) VALUES ('${escSql(key)}', 'SUBJECT', '${escSql(subjectId)}', '${escSql(subjectId)}', 'subject-v1', '${escSql(payload)}', '${escSql(updatedAt)}')`,
        );
      }
    });
  },

  async deleteSubjectOverviewCache(subjectId: string): Promise<void> {
    if (!subjectId) return;
    const key = subjectOverviewCacheKey(subjectId);
    await serializeCacheWrite(`overview:SUBJECT:${subjectId}`, async () => {
      await sqlite.execute(`DELETE FROM ai_overview_cache WHERE cache_key = '${escSql(key)}'`);
    });
  },

  async getSourceOverviewCache(sourceId: string, ingestionRevision?: string): Promise<OverviewResultView | null> {
    if (!sourceId) return null;
    const revision = ingestionRevision?.trim();
    if (revision) {
      const key = sourceOverviewCacheKey(sourceId, revision);
      const rows = await sqlite.select(
        `SELECT payload_json FROM ai_overview_cache WHERE cache_key = '${escSql(key)}'`,
      ) as Array<{ payload_json?: unknown }>;
      return rows.length > 0 ? parseJsonSafely<OverviewResultView>(rows[0].payload_json) : null;
    }
    const rows = await sqlite.select(
      `SELECT payload_json FROM ai_overview_cache WHERE scope_type = 'FILE' AND scope_id = '${escSql(sourceId)}' ORDER BY updated_at DESC`,
    ) as Array<{ payload_json?: unknown }>;
    return rows.length > 0 ? parseJsonSafely<OverviewResultView>(rows[0].payload_json) : null;
  },

  async saveSourceOverviewCache(
    sourceId: string,
    subjectId: string,
    ingestionRevision: string | undefined,
    view: OverviewResultView,
  ): Promise<void> {
    if (!sourceId) return;
    await serializeCacheWrite(`overview:FILE:${sourceId}`, async () => {
      const revisionKey = (ingestionRevision || view.ingestionRevision || 'latest').trim() || 'latest';
      const key = sourceOverviewCacheKey(sourceId, revisionKey);
      const updatedAt = view.updatedAt || new Date().toISOString();
      const payload = JSON.stringify(view);
      // Prune stale ingestion revisions so H5 localStorage stays compact.
      await sqlite.execute(
        `DELETE FROM ai_overview_cache WHERE scope_type = 'FILE' AND scope_id = '${escSql(sourceId)}' AND revision_key != '${escSql(revisionKey)}'`,
      );
      const exists = await sqlite.select(
        `SELECT cache_key FROM ai_overview_cache WHERE cache_key = '${escSql(key)}'`,
      );
      if (exists.length > 0) {
        await sqlite.execute(
          `UPDATE ai_overview_cache SET scope_type = 'FILE', scope_id = '${escSql(sourceId)}', subject_id = '${escSql(subjectId)}', revision_key = '${escSql(revisionKey)}', payload_json = '${escSql(payload)}', updated_at = '${escSql(updatedAt)}' WHERE cache_key = '${escSql(key)}'`,
        );
      } else {
        await sqlite.execute(
          `INSERT INTO ai_overview_cache (cache_key, scope_type, scope_id, subject_id, revision_key, payload_json, updated_at) VALUES ('${escSql(key)}', 'FILE', '${escSql(sourceId)}', '${escSql(subjectId)}', '${escSql(revisionKey)}', '${escSql(payload)}', '${escSql(updatedAt)}')`,
        );
      }
    });
  },

  async deleteSourceOverviewCache(sourceId: string): Promise<void> {
    if (!sourceId) return;
    await serializeCacheWrite(`overview:FILE:${sourceId}`, async () => {
      await sqlite.execute(
        `DELETE FROM ai_overview_cache WHERE scope_type = 'FILE' AND scope_id = '${escSql(sourceId)}'`,
      );
    });
  },

  // Review States Read Projection Cache
  async getReviewStatesBySubject(subjectId: string): Promise<ReviewState[]> {
    if (!subjectId) return [];
    const rows = await sqlite.select(
      `SELECT payload_json FROM review_states_cache WHERE subject_id = '${escSql(subjectId)}'`,
    ) as Array<{ payload_json?: unknown }>;
    const states: ReviewState[] = [];
    for (const row of rows) {
      const parsed = parseJsonSafely<ReviewState>(row.payload_json);
      if (parsed && parsed.knowledgeBlockId) {
        states.push(parsed);
      }
    }
    return states;
  },

  async hasLoadedReviewStates(subjectId: string): Promise<boolean> {
    if (!subjectId) return false;
    return (await this.getMetadata(reviewStatesLoadedMetaKey(subjectId))) === '1';
  },

  async replaceSubjectReviewStates(subjectId: string, states: ReviewState[]): Promise<void> {
    if (!subjectId) return;
    await serializeCacheWrite(`review_states:${subjectId}`, async () => {
      await sqlite.execute(`DELETE FROM review_states_cache WHERE subject_id = '${escSql(subjectId)}'`);
      const now = new Date().toISOString();
      for (const state of states) {
        if (!state.knowledgeBlockId) continue;
        const kbId = state.knowledgeBlockId;
        const payload = JSON.stringify(state);
        const updatedAt = state.updatedAt || now;
        const exists = await sqlite.select(
          `SELECT knowledge_block_id FROM review_states_cache WHERE knowledge_block_id = '${escSql(kbId)}'`,
        );
        if (exists.length > 0) {
          await sqlite.execute(
            `UPDATE review_states_cache SET subject_id = '${escSql(subjectId)}', payload_json = '${escSql(payload)}', updated_at = '${escSql(updatedAt)}' WHERE knowledge_block_id = '${escSql(kbId)}'`,
          );
        } else {
          await sqlite.execute(
            `INSERT INTO review_states_cache (knowledge_block_id, subject_id, payload_json, updated_at) VALUES ('${escSql(kbId)}', '${escSql(subjectId)}', '${escSql(payload)}', '${escSql(updatedAt)}')`,
          );
        }
      }
      await this.setMetadata(reviewStatesLoadedMetaKey(subjectId), '1');
    });
  },

  async upsertReviewState(subjectId: string, state: ReviewState): Promise<void> {
    if (!subjectId || !state.knowledgeBlockId) return;
    await serializeCacheWrite(`review_states:${subjectId}`, async () => {
      const kbId = state.knowledgeBlockId as string;
      const payload = JSON.stringify(state);
      const updatedAt = state.updatedAt || new Date().toISOString();
      const exists = await sqlite.select(
        `SELECT knowledge_block_id FROM review_states_cache WHERE knowledge_block_id = '${escSql(kbId)}'`,
      );
      if (exists.length > 0) {
        await sqlite.execute(
          `UPDATE review_states_cache SET subject_id = '${escSql(subjectId)}', payload_json = '${escSql(payload)}', updated_at = '${escSql(updatedAt)}' WHERE knowledge_block_id = '${escSql(kbId)}'`,
        );
      } else {
        await sqlite.execute(
          `INSERT INTO review_states_cache (knowledge_block_id, subject_id, payload_json, updated_at) VALUES ('${escSql(kbId)}', '${escSql(subjectId)}', '${escSql(payload)}', '${escSql(updatedAt)}')`,
        );
      }
    });
  },

  // Subject Stats Snapshot Cache
  async getSubjectStatsCache(subjectId: string, days: 7 | 30, timeZone: string): Promise<SubjectStats | null> {
    if (!subjectId || !timeZone) return null;
    const key = subjectStatsCacheKey(subjectId, days, timeZone);
    const rows = await sqlite.select(
      `SELECT payload_json FROM subject_stats_cache WHERE cache_key = '${escSql(key)}'`,
    ) as Array<{ payload_json?: unknown }>;
    if (rows.length === 0) return null;
    const parsed = parseJsonSafely<SubjectStats>(rows[0].payload_json);
    return parsed && (!parsed.subjectId || parsed.subjectId === subjectId) ? parsed : null;
  },

  async saveSubjectStatsCache(subjectId: string, days: 7 | 30, timeZone: string, stats: SubjectStats): Promise<void> {
    if (!subjectId || !timeZone) return;
    await serializeCacheWrite(`stats:${subjectId}`, async () => {
      const key = subjectStatsCacheKey(subjectId, days, timeZone);
      const payload = JSON.stringify(stats);
      const updatedAt = stats.generatedAt || new Date().toISOString();
      const exists = await sqlite.select(
        `SELECT cache_key FROM subject_stats_cache WHERE cache_key = '${escSql(key)}'`,
      );
      if (exists.length > 0) {
        await sqlite.execute(
          `UPDATE subject_stats_cache SET subject_id = '${escSql(subjectId)}', days = ${days}, time_zone = '${escSql(timeZone)}', payload_json = '${escSql(payload)}', updated_at = '${escSql(updatedAt)}' WHERE cache_key = '${escSql(key)}'`,
        );
      } else {
        await sqlite.execute(
          `INSERT INTO subject_stats_cache (cache_key, subject_id, days, time_zone, payload_json, updated_at) VALUES ('${escSql(key)}', '${escSql(subjectId)}', ${days}, '${escSql(timeZone)}', '${escSql(payload)}', '${escSql(updatedAt)}')`,
        );
      }
    });
  },

  async clearScopeStorage(scope: string): Promise<void> {
    if (!scope) return;
    initializedScopes.delete(scope);
    const focusKeys = ['focus_state', 'focus_daily', 'focus_outbox'];
    for (const key of focusKeys) {
      try {
        removeStorageItem(`auralis:local:${scope}:${key}`);
      } catch {
        // Ignore storage removal errors
      }
    }
    if (isH5) {
      const tableNames = [
        'sync_metadata',
        'local_mutations',
        'knowledge_blocks',
        'task_blocks',
        'subjects',
        'source_files',
        'ai_overview_cache',
        'review_states_cache',
        'subject_stats_cache',
        'tablet_notes',
      ];
      for (const name of tableNames) {
        try {
          removeStorageItem(`auralis:local:${scope}:${name}`);
        } catch {
          // Ignore storage removal errors
        }
      }
      return;
    }
    const dbIdentity = {
      name: `auralis_${scope}`,
      path: `_doc/auralis_${scope}.db`,
    };
    try {
      if (plus.sqlite.isOpenDatabase(dbIdentity)) {
        await new Promise<void>((resolve) => {
          plus.sqlite.closeDatabase({
            ...dbIdentity,
            success: () => resolve(),
            fail: () => resolve(),
          });
        });
      }
    } catch {
      // Ignore native closeDatabase errors
    }
  }
};
