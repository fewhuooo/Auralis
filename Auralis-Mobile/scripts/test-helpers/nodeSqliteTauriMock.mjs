import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const REGISTRY_KEY = Symbol.for('auralis.mobile.test.nodeSqliteTauriMock.registry')

function getRegistryMap() {
  if (!globalThis[REGISTRY_KEY]) {
    globalThis[REGISTRY_KEY] = new Map()
  }
  return globalThis[REGISTRY_KEY]
}

function resolveTsCandidate(baseUrl, relPath) {
  if (/\.[a-z0-9]+$/i.test(relPath)) return null
  const tsUrl = new URL(`${relPath}.ts`, baseUrl)
  if (existsSync(fileURLToPath(tsUrl))) return tsUrl.href
  const indexTsUrl = new URL(`${relPath}/index.ts`, baseUrl)
  if (existsSync(fileURLToPath(indexTsUrl))) return indexTsUrl.href
  return null
}

/** Rewrites $1, $2 positional placeholders outside quotes to ?1, ?2 for Node node:sqlite. */
export function rewriteDollarPlaceholders(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'" || ch === '"') {
      const quote = ch
      out += ch
      i += 1
      while (i < sql.length) {
        out += sql[i]
        if (sql[i] === quote) {
          if (i + 1 < sql.length && sql[i + 1] === quote) {
            out += sql[i + 1]
            i += 2
            continue
          }
          i += 1
          break
        }
        i += 1
      }
      continue
    }
    if (ch === '$') {
      let j = i + 1
      while (j < sql.length && sql[j] >= '0' && sql[j] <= '9') {
        j += 1
      }
      if (j > i + 1) {
        out += `?${sql.slice(i + 1, j)}`
        i = j
        continue
      }
    }
    out += ch
    i += 1
  }
  return out
}

function normalizeBindValues(bindValues = []) {
  return bindValues.map((value) => {
    if (value === undefined) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value)
    return value
  })
}

/**
 * Installs an isolated @tauri-apps/plugin-sql mock backed by real in-memory
 * node:sqlite DatabaseSync connections, plus an in-memory globalThis.localStorage.
 */
export function installLocalDbTestEnv(context, options = {}) {
  const storage = new Map()
  const hadOwnStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prevStorage = globalThis.localStorage

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, val) => {
        if (options.onSet && options.onSet(key, String(val)) === false) {
          return
        }
        storage.set(key, String(val))
      },
      removeItem: (key) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
    },
  })

  const dbs = new Map()
  const openPaths = new Set()
  const closedPaths = []
  const instanceId = `mock-sql-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const state = {
    getOrCreateDb(path) {
      let db = dbs.get(path)
      if (!db) {
        db = new DatabaseSync(':memory:')
        dbs.set(path, db)
      }
      openPaths.add(path)
      return db
    },
    ensureOpen(path) {
      if (!openPaths.has(path) || !dbs.has(path)) {
        throw new Error(`Database ${path} is not loaded`)
      }
      return dbs.get(path)
    },
    async execute(path, query, bindValues = []) {
      const db = this.ensureOpen(path)
      if (options.onExecute) {
        await options.onExecute(path, query, bindValues)
      }
      const normalizedSql = rewriteDollarPlaceholders(query)
      const params = normalizeBindValues(bindValues)
      const stmt = db.prepare(normalizedSql)
      const info = stmt.run(...params)
      return {
        rowsAffected: Number(info?.changes ?? 0),
        lastInsertId: Number(info?.lastInsertRowid ?? 0),
      }
    },
    async select(path, query, bindValues = []) {
      const db = this.ensureOpen(path)
      if (options.onSelect) {
        await options.onSelect(path, query, bindValues)
      }
      const normalizedSql = rewriteDollarPlaceholders(query)
      const params = normalizeBindValues(bindValues)
      const stmt = db.prepare(normalizedSql)
      const rows = stmt.all(...params)
      return rows.map((row) => ({ ...row }))
    },
    async close(targetPath) {
      if (targetPath) {
        openPaths.delete(targetPath)
        closedPaths.push(targetPath)
        return true
      }
      for (const path of openPaths) {
        closedPaths.push(path)
      }
      openPaths.clear()
      return true
    },
  }

  const registry = getRegistryMap()
  registry.set(instanceId, state)

  const srcRootUrl = new URL('../../src/', import.meta.url)
  const virtualSqlUrl = `auralis-mock://tauri-sql/${instanceId}`

  const loader = registerHooks({
    resolve(specifier, ctx, nextResolve) {
      if (specifier === '@tauri-apps/plugin-sql') {
        return { url: virtualSqlUrl, shortCircuit: true }
      }
      if (specifier.startsWith('@/')) {
        const target = resolveTsCandidate(srcRootUrl, `./${specifier.slice(2)}`)
        return nextResolve(target ?? new URL(`./${specifier.slice(2)}.ts`, srcRootUrl).href, ctx)
      }
      if ((specifier.startsWith('./') || specifier.startsWith('../')) && ctx.parentURL?.includes('Auralis-Mobile')) {
        const target = resolveTsCandidate(ctx.parentURL, specifier)
        if (target) return nextResolve(target, ctx)
      }
      return nextResolve(specifier, ctx)
    },
    load(url, ctx, nextLoad) {
      if (url === virtualSqlUrl) {
        const source = `
          const state = globalThis[Symbol.for('auralis.mobile.test.nodeSqliteTauriMock.registry')].get(${JSON.stringify(instanceId)});
          export default class Database {
            constructor(path) {
              this.path = path;
            }
            static async load(path) {
              state.getOrCreateDb(path);
              return new Database(path);
            }
            static get(path) {
              return new Database(path);
            }
            async execute(query, bindValues) {
              return state.execute(this.path, query, bindValues);
            }
            async select(query, bindValues) {
              return state.select(this.path, query, bindValues);
            }
            async close(db) {
              return state.close(db);
            }
          }
        `
        return { format: 'module', source, shortCircuit: true }
      }
      return nextLoad(url, ctx)
    },
  })

  context.after(() => {
    loader.deregister()
    registry.delete(instanceId)
    for (const db of dbs.values()) {
      try {
        db.close()
      } catch {
        // Ignore cleanup errors on already-closed test databases
      }
    }
    dbs.clear()
    openPaths.clear()
    if (hadOwnStorage) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage })
    } else {
      delete globalThis.localStorage
    }
  })

  return {
    storage,
    openPaths,
    closedPaths,
    getRawDb: (path) => dbs.get(path) ?? null,
  }
}
