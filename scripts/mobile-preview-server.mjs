import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import http from 'node:http'
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_DATA_PATH = join(repoRoot, 'scripts', 'fixtures', 'mobile-preview-data.json')
const DEFAULT_STATIC_DIR = join(repoRoot, 'Auralis-Mobile', 'dist', 'build', 'h5')
const DEFAULT_PORT = 4180
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PARAMETER_SET_ID = '01933f00-0099-7000-8000-000000000001'
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

function sha256Hex(text) {
  return createHash('sha256').update(text || '', 'utf8').digest('hex')
}

function isoOffsetHours(hours = 0) {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

function addDaysIso(baseIso, days) {
  return new Date(Date.parse(baseIso) + days * 86_400_000).toISOString()
}

function resolveGoodSchedule(before, selectedAtIso) {
  if (before.mastered) {
    return {
      dueAt: before.dueAt,
      nextReviewStage: null,
      mastered: true,
      stableSuccessCount: before.stableSuccessCount,
    }
  }
  if (before.nextReviewStage === 'EARLY_RECALL') {
    return {
      dueAt: addDaysIso(selectedAtIso, 3),
      nextReviewStage: 'CROSS_DAY',
      mastered: false,
      stableSuccessCount: before.stableSuccessCount,
    }
  }
  const selectedMs = Date.parse(selectedAtIso)
  const dueMs = Date.parse(before.dueAt || '')
  const wasDue = !Number.isFinite(dueMs) || dueMs <= selectedMs
  if (!wasDue) {
    if (before.stableSuccessCount >= 3) {
      return {
        dueAt: addDaysIso(selectedAtIso, 30),
        nextReviewStage: 'FINAL_VERIFICATION',
        mastered: false,
        stableSuccessCount: 3,
      }
    }
    return {
      dueAt: before.dueAt,
      nextReviewStage: before.nextReviewStage || 'CROSS_DAY',
      mastered: false,
      stableSuccessCount: before.stableSuccessCount,
    }
  }
  if (before.stableSuccessCount === 0) {
    return { dueAt: addDaysIso(selectedAtIso, 7), nextReviewStage: 'CROSS_DAY', mastered: false, stableSuccessCount: 1 }
  }
  if (before.stableSuccessCount === 1) {
    return { dueAt: addDaysIso(selectedAtIso, 14), nextReviewStage: 'CROSS_DAY', mastered: false, stableSuccessCount: 2 }
  }
  if (before.stableSuccessCount === 2) {
    return { dueAt: addDaysIso(selectedAtIso, 30), nextReviewStage: 'FINAL_VERIFICATION', mastered: false, stableSuccessCount: 3 }
  }
  const lastPracticeMs = Date.parse(before.lastPracticeAt || '')
  const validated = !Number.isFinite(lastPracticeMs) || selectedMs >= lastPracticeMs + 30 * 86_400_000
  return {
    dueAt: addDaysIso(selectedAtIso, 30),
    nextReviewStage: validated ? null : 'FINAL_VERIFICATION',
    mastered: validated,
    stableSuccessCount: 3,
  }
}

function isoOffsetDays(days = 0, timeStr = '09:00') {
  const [hours, minutes] = String(timeStr).split(':').map(Number)
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return d.toISOString()
}

function localDateKey(dateInput = new Date()) {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseArgs(argv) {
  const options = {
    port: Number(process.env.PORT || DEFAULT_PORT),
    host: process.env.HOST || DEFAULT_HOST,
    dataPath: process.env.MOBILE_PREVIEW_DATA ? resolve(process.env.MOBILE_PREVIEW_DATA) : DEFAULT_DATA_PATH,
    staticDir: process.env.MOBILE_PREVIEW_STATIC === 'none'
      ? null
      : resolve(process.env.MOBILE_PREVIEW_STATIC || DEFAULT_STATIC_DIR),
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port' && argv[i + 1]) options.port = Number(argv[++i])
    else if (arg === '--host' && argv[i + 1]) options.host = argv[++i]
    else if (arg === '--data' && argv[i + 1]) options.dataPath = resolve(argv[++i])
    else if (arg === '--static' && argv[i + 1]) options.staticDir = resolve(argv[++i])
    else if (arg === '--api-only') options.staticDir = null
  }
  return options
}

function buildRuntimeState(rawData) {
  const user = {
    id: rawData.user?.id || randomUUID(),
    username: rawData.user?.username || 'preview',
    displayName: rawData.user?.displayName || 'Preview User',
    email: rawData.user?.email || 'preview@auralis.test',
    version: Number(rawData.user?.version ?? 1),
  }

  const sessions = (rawData.sessions || []).map(item => ({
    id: item.id || randomUUID(),
    deviceName: item.deviceName || 'Web Preview',
    platform: item.platform || 'WEB',
    current: Boolean(item.current),
    lastUsedAt: item.lastUsedAt || isoOffsetHours(item.lastUsedOffsetHours ?? 0),
  }))

  const subjects = (rawData.subjects || []).map((item, index) => ({
    id: item.id || randomUUID(),
    name: item.name,
    description: item.description || '',
    iconKey: item.iconKey || 'book',
    sortKey: item.sortKey || `a${String(index + 1).padStart(3, '0')}`,
    version: Number(item.version ?? 1),
    createdAt: item.createdAt || isoOffsetDays(item.createdOffsetDays ?? -7, '08:00'),
    updatedAt: item.updatedAt || isoOffsetDays(item.createdOffsetDays ?? -7, '08:00'),
    deletedAt: item.deletedAt || null,
  }))

  const subjectMap = new Map(subjects.map(s => [s.id, s]))

  const sources = (rawData.sources || []).map((item) => {
    const createdAt = item.createdAt || isoOffsetDays(item.createdOffsetDays ?? -3, '10:00')
    return {
      id: item.id || randomUUID(),
      subjectId: item.subjectId,
      type: item.type || 'FILE',
      title: item.title || 'Untitled',
      assetId: item.assetId || null,
      assetSizeBytes: Number(item.assetSizeBytes ?? 0),
      ingestionStatus: item.ingestionStatus || 'READY',
      ingestionRevision: item.ingestionRevision || 'rev-1',
      version: Number(item.version ?? 1),
      createdAt,
      updatedAt: item.updatedAt || createdAt,
      deletedAt: item.deletedAt || null,
    }
  })

  const knowledgeBlocks = []
  const reviewStates = new Map()

  for (const item of rawData.knowledgeBlocks || []) {
    const id = item.id || randomUUID()
    const createdAt = item.createdAt || isoOffsetDays(item.createdOffsetDays ?? -3, '10:00')
    const updatedAt = item.updatedAt || createdAt
    const content = item.content || ''
    const version = Number(item.version ?? 1)
    const block = {
      id,
      subjectId: item.subjectId,
      subject: item.subject || subjectMap.get(item.subjectId)?.name || '',
      sourceId: item.sourceId ?? null,
      title: item.title || 'Untitled',
      content,
      colorOverride: item.colorOverride ?? null,
      version,
      createdAt,
      updatedAt,
      deletedAt: item.deletedAt || null,
      contentHash: sha256Hex(content),
    }
    knowledgeBlocks.push(block)

    if (item.review) {
      const reviewCfg = item.review
      const dueAt = reviewCfg.dueAt || isoOffsetHours(reviewCfg.dueOffsetHours ?? -1)
      reviewStates.set(id, {
        id: reviewCfg.id || randomUUID(),
        userId: user.id,
        knowledgeBlockId: id,
        parameterSetId: reviewCfg.parameterSetId || DEFAULT_PARAMETER_SET_ID,
        difficulty: Number(reviewCfg.difficulty ?? 5.0),
        stability: Number(reviewCfg.stability ?? 3.0),
        dueAt,
        lastReviewedAt: reviewCfg.lastReviewedAt || isoOffsetDays(-3, '10:00'),
        reps: Number(reviewCfg.reps ?? 1),
        lapses: Number(reviewCfg.lapses ?? 0),
        version: Number(reviewCfg.version ?? 1),
        createdAt,
        updatedAt,
        knowledgeBlockVersion: version,
        needsLearning: Boolean(reviewCfg.needsLearning ?? false),
        mastered: Boolean(reviewCfg.mastered ?? false),
        stableSuccessCount: Number(reviewCfg.stableSuccessCount ?? 0),
        nextReviewStage: reviewCfg.nextReviewStage || 'CROSS_DAY',
        lastPracticeAt: reviewCfg.lastPracticeAt || isoOffsetDays(-3, '10:00'),
        lastReviewId: reviewCfg.lastReviewId || null,
        pendingReviewId: null,
        contentHash: block.contentHash,
      })
    }
  }

  const tasks = (rawData.tasks || []).map((item, index) => {
    const scheduledAt = item.scheduledAt !== undefined
      ? item.scheduledAt
      : (item.scheduleOffsetDays !== undefined ? isoOffsetDays(item.scheduleOffsetDays, item.scheduleTime || '09:00') : null)
    const dueAt = item.dueAt !== undefined
      ? item.dueAt
      : (item.dueOffsetDays !== undefined ? isoOffsetDays(item.dueOffsetDays, '23:59') : null)
    const createdAt = item.createdAt || isoOffsetDays(-2, '08:00')
    return {
      id: item.id || randomUUID(),
      subjectId: item.subjectId,
      subject: item.subject || subjectMap.get(item.subjectId)?.name || '',
      title: item.title || 'Untitled Task',
      description: item.description || '',
      durationMinutes: Number(item.durationMinutes ?? 60),
      status: item.status || (scheduledAt ? 'IN_PROGRESS' : 'TODO'),
      scheduledAt,
      dueAt,
      sortKey: item.sortKey || `a${String(index + 1).padStart(3, '0')}`,
      version: Number(item.version ?? 1),
      createdAt,
      updatedAt: item.updatedAt || createdAt,
      deletedAt: item.deletedAt || null,
    }
  })

  const conversations = (rawData.conversations || []).map(conv => ({
    id: conv.id || randomUUID(),
    title: conv.title || '新对话',
    createdAt: conv.createdAt || isoOffsetHours(conv.createdOffsetHours ?? -4),
    updatedAt: conv.updatedAt || isoOffsetHours(conv.updatedOffsetHours ?? -3),
    version: Number(conv.version ?? 1),
    chatScopeState: conv.chatScopeState || 'UNBOUND',
    chatScope: conv.chatScope || null,
    messages: Array.isArray(conv.messages) ? [...conv.messages] : [],
  }))

  const aiUsage = {
    hourly: {
      limitTokens: Number(rawData.aiUsage?.hourly?.limitTokens ?? 50000),
      chargedTokens: Number(rawData.aiUsage?.hourly?.chargedTokens ?? 0),
      reservedTokens: Number(rawData.aiUsage?.hourly?.reservedTokens ?? 0),
      resetAt: rawData.aiUsage?.hourly?.resetAt || isoOffsetHours(rawData.aiUsage?.hourly?.resetOffsetHours ?? 1),
    },
    daily: {
      limitTokens: Number(rawData.aiUsage?.daily?.limitTokens ?? 300000),
      chargedTokens: Number(rawData.aiUsage?.daily?.chargedTokens ?? 0),
      reservedTokens: Number(rawData.aiUsage?.daily?.reservedTokens ?? 0),
      resetAt: rawData.aiUsage?.daily?.resetAt || isoOffsetHours(rawData.aiUsage?.daily?.resetOffsetHours ?? 10),
    },
  }
  aiUsage.hourly.remainingTokens = Math.max(0, aiUsage.hourly.limitTokens - aiUsage.hourly.chargedTokens - aiUsage.hourly.reservedTokens)
  aiUsage.daily.remainingTokens = Math.max(0, aiUsage.daily.limitTokens - aiUsage.daily.chargedTokens - aiUsage.daily.reservedTokens)

  return {
    user,
    sessions,
    subjects,
    sources,
    knowledgeBlocks,
    tasks,
    reviewStates,
    subjectOverviews: { ...(rawData.subjectOverviews || {}) },
    sourceOverviews: { ...(rawData.sourceOverviews || {}) },
    conversations,
    aiUsage,
    aiSettings: Array.isArray(rawData.aiSettings) ? rawData.aiSettings.map(s => ({ ...s })) : [],
    statsBaseline: {
      historicalFocusSeconds: Number(rawData.statsBaseline?.historicalFocusSeconds ?? 0),
      historicalFocusCompletedCount: Number(rawData.statsBaseline?.historicalFocusCompletedCount ?? 0),
      historicalReviewedCount: Number(rawData.statsBaseline?.historicalReviewedCount ?? 0),
      historicalCreatedKnowledgeCount: Number(rawData.statsBaseline?.historicalCreatedKnowledgeCount ?? 0),
      historicalCompletedTaskCount: Number(rawData.statsBaseline?.historicalCompletedTaskCount ?? 0),
    },
    focusSessions: new Map(),
    uploadedAssets: new Map(),
    pendingReviewsByReviewId: new Map(),
    reviewCommandReplay: new Map(),
    changeLog: [],
    revision: 0,
    todayCounters: {
      reviewedCount: 0,
      studySeconds: 0,
      createdKnowledgeCount: 0,
      focusSeconds: 0,
      focusCompletedCount: 0,
    },
  }
}

function inferMimeType(name, fallback = 'application/octet-stream') {
  const ext = extname(String(name || '')).toLowerCase()
  const map = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  }
  return map[ext] || fallback
}

function parseRequestUrl(req) {
  const host = typeof req.headers.host === 'string' && req.headers.host.trim()
    ? req.headers.host.trim()
    : `${DEFAULT_HOST}:${DEFAULT_PORT}`
  return new URL(req.url || '/', `http://${host}`)
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  })
  res.end(data === undefined ? '' : JSON.stringify(data))
}

function sendProblem(res, status, code, title, detail = title, extra = {}) {
  sendJson(res, status, {
    type: 'about:blank',
    title,
    status,
    detail,
    code,
    fieldErrors: [],
    ...extra,
  })
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function encodeWsTextFrame(text) {
  const payload = Buffer.from(text, 'utf8')
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
  }
  const header = Buffer.alloc(4)
  header[0] = 0x81
  header[1] = 126
  header.writeUInt16BE(payload.length, 2)
  return Buffer.concat([header, payload])
}

export function createPreviewApp({ dataPath = DEFAULT_DATA_PATH, staticDir = DEFAULT_STATIC_DIR } = {}) {
  let reloadSeq = 0
  let epochToken = ''
  let loadedMtimeMs = 0
  let state = null
  const wsClients = new Set()

  function loadFixtureFromDisk(bumpReload = false) {
    const info = statSync(dataPath)
    const rawText = readFileSync(dataPath, 'utf8')
    const parsed = JSON.parse(rawText)
    loadedMtimeMs = info.mtimeMs
    if (bumpReload) reloadSeq += 1
    epochToken = `${sha256Hex(rawText).slice(0, 8)}v${reloadSeq}`
    state = buildRuntimeState(parsed)
  }

  loadFixtureFromDisk(false)

  function broadcastWs(payload) {
    const frame = encodeWsTextFrame(JSON.stringify(payload))
    for (const socket of wsClients) {
      if (!socket.destroyed) socket.write(frame)
    }
  }

  function reloadIfFixtureChanged() {
    try {
      const info = statSync(dataPath)
      if (info.mtimeMs !== loadedMtimeMs) {
        loadFixtureFromDisk(true)
        broadcastWs({ type: 'SYNC_CHANGED', eventId: randomUUID(), cursor: currentCursor() })
        return true
      }
    } catch {
      // Ignore transient editor write lock until next request
    }
    return false
  }

  function currentCursor() {
    return `preview-e${epochToken}-r${state.revision}`
  }

  function parseCursor(cursor) {
    if (!cursor) return null
    const match = /^preview-e([0-9a-z]+)-r(\d+)$/.exec(String(cursor))
    if (!match) return null
    return { epochToken: match[1], revision: Number(match[2]) }
  }

  function subjectNameFor(subjectId) {
    return state.subjects.find(s => s.id === subjectId && !s.deletedAt)?.name || ''
  }

  function enrichBlock(block) {
    return {
      ...block,
      subject: subjectNameFor(block.subjectId) || block.subject || '',
    }
  }

  function enrichTask(task) {
    return {
      ...task,
      subject: subjectNameFor(task.subjectId) || task.subject || '',
    }
  }

  function recordChange(resourceType, resourceId, mutationType, payload, version) {
    state.revision += 1
    const cursor = currentCursor()
    state.changeLog.push({
      revision: state.revision,
      cursor,
      resourceType,
      resourceId,
      mutationType,
      version,
      payload,
    })
    return cursor
  }

  function applyPushMutation(mutation) {
    const { clientMutationId, resourceType, resourceId, mutationType, payload = {} } = mutation
    const now = new Date().toISOString()

    if (resourceType === 'SUBJECT') {
      const idx = state.subjects.findIndex(s => s.id === resourceId)
      const existing = idx >= 0 ? state.subjects[idx] : null
      const nextVersion = (existing?.version ?? 0) + 1
      if (mutationType === 'DELETE') {
        const deleted = existing ? { ...existing, version: nextVersion, deletedAt: now, updatedAt: now } : { id: resourceId, version: nextVersion, deletedAt: now, updatedAt: now }
        if (idx >= 0) state.subjects[idx] = deleted
        const changeCursor = recordChange('SUBJECT', resourceId, 'DELETE', deleted, nextVersion)
        return { clientMutationId, decision: 'APPLIED', resourceType, resourceId, mutationType, changeCursor, current: deleted, recordedAt: now }
      }
      const next = {
        id: resourceId,
        name: payload.name ?? existing?.name ?? '未命名学科',
        description: payload.description ?? existing?.description ?? '',
        iconKey: payload.iconKey ?? existing?.iconKey ?? 'book',
        sortKey: payload.sortKey ?? existing?.sortKey ?? String(state.subjects.length + 1).padStart(3, '0'),
        version: nextVersion,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      }
      if (idx >= 0) state.subjects[idx] = next
      else state.subjects.unshift(next)
      const changeCursor = recordChange('SUBJECT', resourceId, mutationType, next, nextVersion)
      return { clientMutationId, decision: 'APPLIED', resourceType, resourceId, mutationType, changeCursor, current: next, recordedAt: now }
    }

    if (resourceType === 'TASK') {
      const idx = state.tasks.findIndex(t => t.id === resourceId)
      const existing = idx >= 0 ? state.tasks[idx] : null
      const nextVersion = (existing?.version ?? 0) + 1
      if (mutationType === 'DELETE') {
        const deleted = existing ? { ...existing, version: nextVersion, deletedAt: now, updatedAt: now } : { id: resourceId, version: nextVersion, deletedAt: now, updatedAt: now }
        if (idx >= 0) state.tasks[idx] = deleted
        const changeCursor = recordChange('TASK', resourceId, 'DELETE', deleted, nextVersion)
        return { clientMutationId, decision: 'APPLIED', resourceType, resourceId, mutationType, changeCursor, current: deleted, recordedAt: now }
      }
      const nextStatus = payload.status ?? existing?.status ?? 'TODO'
      const next = enrichTask({
        id: resourceId,
        subjectId: payload.subjectId ?? existing?.subjectId,
        title: payload.title ?? existing?.title ?? 'Untitled Task',
        description: payload.description ?? existing?.description ?? '',
        durationMinutes: Number(payload.durationMinutes ?? existing?.durationMinutes ?? 60),
        status: nextStatus,
        scheduledAt: payload.scheduledAt === null ? null : (payload.scheduledAt ?? existing?.scheduledAt ?? null),
        dueAt: payload.dueAt === null ? null : (payload.dueAt ?? existing?.dueAt ?? null),
        sortKey: payload.sortKey ?? existing?.sortKey ?? '0',
        version: nextVersion,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      })
      if (idx >= 0) state.tasks[idx] = next
      else state.tasks.push(next)
      const changeCursor = recordChange('TASK', resourceId, mutationType, next, nextVersion)
      return { clientMutationId, decision: 'APPLIED', resourceType, resourceId, mutationType, changeCursor, current: next, recordedAt: now }
    }

    if (resourceType === 'KNOWLEDGE_BLOCK') {
      const idx = state.knowledgeBlocks.findIndex(b => b.id === resourceId)
      const existing = idx >= 0 ? state.knowledgeBlocks[idx] : null
      const nextVersion = (existing?.version ?? 0) + 1
      if (mutationType === 'DELETE') {
        const deleted = existing ? { ...existing, version: nextVersion, deletedAt: now, updatedAt: now } : { id: resourceId, version: nextVersion, deletedAt: now, updatedAt: now }
        if (idx >= 0) state.knowledgeBlocks[idx] = deleted
        const changeCursor = recordChange('KNOWLEDGE_BLOCK', resourceId, 'DELETE', deleted, nextVersion)
        return { clientMutationId, decision: 'APPLIED', resourceType, resourceId, mutationType, changeCursor, current: deleted, recordedAt: now }
      }
      const nextContent = payload.content ?? existing?.content ?? ''
      if (!existing) state.todayCounters.createdKnowledgeCount += 1
      const next = enrichBlock({
        id: resourceId,
        subjectId: payload.subjectId ?? existing?.subjectId,
        sourceId: payload.sourceId ?? existing?.sourceId ?? null,
        title: payload.title ?? existing?.title ?? 'Untitled',
        content: nextContent,
        colorOverride: payload.colorOverride ?? existing?.colorOverride ?? null,
        version: nextVersion,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        contentHash: sha256Hex(nextContent),
      })
      if (idx >= 0) state.knowledgeBlocks[idx] = next
      else state.knowledgeBlocks.unshift(next)
      const existingReview = state.reviewStates.get(resourceId)
      if (existingReview) {
        existingReview.knowledgeBlockVersion = nextVersion
        existingReview.contentHash = next.contentHash
        existingReview.updatedAt = now
      }
      const changeCursor = recordChange('KNOWLEDGE_BLOCK', resourceId, mutationType, next, nextVersion)
      return { clientMutationId, decision: 'APPLIED', resourceType, resourceId, mutationType, changeCursor, current: next, recordedAt: now }
    }

    const changeCursor = recordChange(resourceType, resourceId, mutationType, payload, 1)
    return { clientMutationId, decision: 'APPLIED', resourceType, resourceId, mutationType, changeCursor, current: { id: resourceId, ...payload, version: 1 }, recordedAt: now }
  }

  function dueQueueItems(subjectId, atIso) {
    const atMs = Date.parse(atIso) || Date.now()
    const items = []
    for (const block of state.knowledgeBlocks) {
      if (block.deletedAt) continue
      if (subjectId && block.subjectId !== subjectId) continue
      const review = state.reviewStates.get(block.id)
      if (!review || review.needsLearning || review.mastered) continue
      if (Date.parse(review.dueAt) <= atMs) {
        items.push({ ...review, knowledgeBlockVersion: block.version, contentHash: block.contentHash })
      }
    }
    return items.sort((a, b) => (Date.parse(a.dueAt) - Date.parse(b.dueAt)) || a.knowledgeBlockId.localeCompare(b.knowledgeBlockId))
  }

  function buildAuthResult() {
    return {
      user: { ...state.user },
      tokens: { accessToken: 'preview-access-token', refreshToken: 'preview-refresh-token' },
      sessionId: state.sessions[0]?.id || '01933f00-0000-7000-8000-000000000101',
      serverDeviceId: state.sessions[0]?.id || '01933f00-0000-7000-8000-000000000101',
    }
  }

  async function handleApi(req, res, reqUrl) {
    reloadIfFixtureChanged()
    const pathname = reqUrl.pathname

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      await readJsonBody(req)
      return sendJson(res, 200, buildAuthResult())
    }
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await readJsonBody(req)
      if (body.username) state.user.username = String(body.username)
      if (body.email) state.user.email = String(body.email)
      return sendJson(res, 201, buildAuthResult())
    }
    if ((pathname === '/api/auth/register/email-code' || pathname === '/api/auth/password/reset/email-code' || pathname === '/api/auth/password/reset' || pathname === '/api/auth/logout' || pathname === '/api/auth/password') && (req.method === 'POST' || req.method === 'PUT')) {
      return sendJson(res, 204)
    }
    if (pathname === '/api/auth/refresh' && req.method === 'POST') {
      return sendJson(res, 200, buildAuthResult())
    }
    if (pathname === '/api/auth/me') {
      if (req.method === 'PUT') {
        const body = await readJsonBody(req)
        if (typeof body.displayName === 'string' && body.displayName.trim()) {
          state.user.displayName = body.displayName.trim()
          state.user.version += 1
        }
      }
      return sendJson(res, 200, { ...state.user })
    }
    if (pathname === '/api/auth/sessions' && req.method === 'GET') {
      return sendJson(res, 200, { items: state.sessions })
    }
    if (pathname === '/api/auth/sessions/others' && req.method === 'DELETE') {
      state.sessions = state.sessions.filter(s => s.current)
      return sendJson(res, 204)
    }
    if (pathname.startsWith('/api/auth/sessions/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop()
      state.sessions = state.sessions.filter(s => s.id !== id || s.current)
      return sendJson(res, 204)
    }

    if (pathname === '/api/realtime/ticket') {
      const ticket = randomUUID()
      return sendJson(res, 200, { ticket, websocketUrl: `/ws/events?ticket=${ticket}` })
    }

    if (pathname === '/api/sync/snapshot' && req.method === 'GET') {
      return sendJson(res, 200, {
        snapshotCursor: currentCursor(),
        subjects: state.subjects.filter(s => !s.deletedAt),
        sources: state.sources.filter(s => !s.deletedAt),
        knowledgeBlocks: state.knowledgeBlocks.filter(b => !b.deletedAt).map(enrichBlock),
        tasks: state.tasks.filter(t => !t.deletedAt).map(enrichTask),
        relations: [],
      })
    }

    if (pathname === '/api/sync/pull' && req.method === 'GET') {
      const rawCursor = reqUrl.searchParams.get('cursor')
      const limit = Math.max(1, Math.min(200, Number(reqUrl.searchParams.get('limit') || 200)))
      const parsed = parseCursor(rawCursor)
      if (!parsed || parsed.epochToken !== epochToken || parsed.revision > state.revision) {
        return sendJson(res, 200, {
          changes: [],
          nextCursor: currentCursor(),
          hasMore: false,
          resetRequired: true,
        })
      }
      const pending = state.changeLog.filter(c => c.revision > parsed.revision)
      const slice = pending.slice(0, limit)
      const hasMore = pending.length > limit
      const nextCursor = slice.length > 0 ? slice[slice.length - 1].cursor : currentCursor()
      return sendJson(res, 200, {
        changes: slice.map(c => ({
          resourceType: c.resourceType,
          resourceId: c.resourceId,
          mutationType: c.mutationType,
          version: c.version,
          payload: c.payload,
        })),
        nextCursor,
        hasMore,
        resetRequired: false,
      })
    }

    if (pathname === '/api/sync/push' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const results = (body.mutations || []).map(applyPushMutation)
      return sendJson(res, 200, {
        results,
        serverCursor: currentCursor(),
      })
    }

    if (pathname === '/api/reviews/states' && req.method === 'GET') {
      const subjectId = reqUrl.searchParams.get('subjectId')
      if (!subjectId) return sendProblem(res, 400, 'VALIDATION_FAILED', 'subjectId is required')
      const limit = Math.max(1, Math.min(200, Number(reqUrl.searchParams.get('limit') || 50)))
      const offset = Number(reqUrl.searchParams.get('cursor') || 0)
      const allStates = state.knowledgeBlocks
        .filter(b => !b.deletedAt && b.subjectId === subjectId)
        .map((b) => {
          const r = state.reviewStates.get(b.id)
          return r ? { ...r, knowledgeBlockVersion: b.version, contentHash: b.contentHash } : null
        })
        .filter(Boolean)
        .sort((a, b) => a.knowledgeBlockId.localeCompare(b.knowledgeBlockId))
      const page = allStates.slice(offset, offset + limit)
      const hasMore = offset + limit < allStates.length
      return sendJson(res, 200, {
        items: page,
        nextCursor: hasMore ? String(offset + limit) : undefined,
        hasMore,
      })
    }

    if (pathname === '/api/reviews/queue' && req.method === 'GET') {
      const subjectId = reqUrl.searchParams.get('subjectId') || undefined
      const at = reqUrl.searchParams.get('at') || new Date().toISOString()
      const limit = Math.max(1, Math.min(200, Number(reqUrl.searchParams.get('limit') || 50)))
      const offset = Number(reqUrl.searchParams.get('cursor') || 0)
      const allDue = dueQueueItems(subjectId, at)
      const page = allDue.slice(offset, offset + limit)
      const hasMore = offset + limit < allDue.length
      return sendJson(res, 200, {
        items: page,
        nextCursor: hasMore ? String(offset + limit) : undefined,
        hasMore,
      })
    }

    if (pathname.startsWith('/api/knowledge-blocks/') && req.method === 'GET') {
      const id = pathname.split('/').pop()
      const found = state.knowledgeBlocks.find(b => b.id === id && !b.deletedAt)
      if (!found) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Knowledge block not found')
      return sendJson(res, 200, enrichBlock(found))
    }

    if (pathname === '/api/reviews/lifecycle/attempts' && req.method === 'POST') {
      const body = await readJsonBody(req)
      if (body.clientCommandId && state.reviewCommandReplay.has(body.clientCommandId)) {
        return sendJson(res, 200, state.reviewCommandReplay.get(body.clientCommandId))
      }
      const block = state.knowledgeBlocks.find(b => b.id === body.knowledgeBlockId && !b.deletedAt)
      if (!block) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Knowledge block not found')
      const review = state.reviewStates.get(block.id)
      if (!review) return sendProblem(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Review state missing')
      if (review.needsLearning) {
        return sendProblem(res, 409, 'MUTATION_REJECTED', 'Knowledge block must be learned before a review attempt')
      }
      if (Number(body.knowledgeBlockVersion) !== block.version || body.contentHash !== block.contentHash || Number(body.baseVersion) !== review.version) {
        return sendProblem(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Review state version conflict', 'Review state version conflict', { current: review })
      }
      const before = {
        dueAt: review.dueAt,
        mastered: Boolean(review.mastered),
        stableSuccessCount: Number(review.stableSuccessCount ?? 0),
        nextReviewStage: review.nextReviewStage ?? null,
        lastPracticeAt: review.lastPracticeAt ?? null,
      }
      const now = new Date().toISOString()
      review.version += 1
      review.lastReviewedAt = now
      review.lastPracticeAt = now
      review.updatedAt = now
      review.lastReviewId = body.reviewId
      if (body.rating === 'AGAIN') {
        review.lapses += 1
        review.needsLearning = true
        review.mastered = false
        review.stableSuccessCount = 0
        review.nextReviewStage = 'EARLY_RECALL'
        review.pendingReviewId = null
        review.dueAt = new Date(Date.now() + 10 * 60_000).toISOString()
        state.todayCounters.reviewedCount += 1
        state.todayCounters.studySeconds += Number(body.durationSeconds || 0)
        const response = {
          commandId: randomUUID(),
          clientCommandId: body.clientCommandId,
          action: 'REVIEW_SELECTED',
          occurredAt: now,
          knowledgeBlockVersion: block.version,
          state: { ...review },
          effectiveReview: {
            reviewId: body.reviewId,
            selectedRating: 'AGAIN',
            effectiveRating: 'AGAIN',
            selectedAt: now,
            resolvedAt: now,
            resolution: 'AGAIN_SELECTED',
          },
        }
        if (body.clientCommandId) state.reviewCommandReplay.set(body.clientCommandId, response)
        return sendJson(res, 200, response)
      }
      const isHard = body.rating === 'HARD'
      const previewSchedule = resolveGoodSchedule(before, now)
      review.dueAt = isHard ? addDaysIso(now, 1) : previewSchedule.dueAt
      review.nextReviewStage = isHard ? 'CROSS_DAY' : (previewSchedule.nextReviewStage ?? null)
      review.mastered = isHard ? false : before.mastered
      review.stableSuccessCount = isHard ? 0 : before.stableSuccessCount
      review.pendingReviewId = body.reviewId
      state.pendingReviewsByReviewId.set(body.reviewId, {
        blockId: block.id,
        selectedAt: now,
        durationSeconds: Number(body.durationSeconds || 0),
        selectedRating: body.rating || 'GOOD',
        before,
      })
      const response = {
        commandId: randomUUID(),
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_SELECTED',
        occurredAt: now,
        knowledgeBlockVersion: block.version,
        state: { ...review },
        effectiveReview: {
          reviewId: body.reviewId,
          selectedRating: body.rating || 'GOOD',
          effectiveRating: null,
          selectedAt: now,
          resolvedAt: null,
          resolution: null,
        },
      }
      if (body.clientCommandId) state.reviewCommandReplay.set(body.clientCommandId, response)
      return sendJson(res, 200, response)
    }

    if (pathname.startsWith('/api/reviews/lifecycle/attempts/') && pathname.endsWith('/confirmations') && req.method === 'POST') {
      const parts = pathname.split('/')
      const reviewId = parts[5]
      const body = await readJsonBody(req)
      if (body.clientCommandId && state.reviewCommandReplay.has(body.clientCommandId)) {
        return sendJson(res, 200, state.reviewCommandReplay.get(body.clientCommandId))
      }
      const block = state.knowledgeBlocks.find(b => b.id === body.knowledgeBlockId && !b.deletedAt)
      const review = block ? state.reviewStates.get(block.id) : null
      if (!block || !review) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Review state not found')
      if (Number(body.knowledgeBlockVersion) !== block.version || Number(body.baseVersion) !== review.version || body.contentHash !== block.contentHash) {
        return sendProblem(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Review confirmation version conflict', 'Review confirmation version conflict', { current: review })
      }
      if (review.pendingReviewId !== reviewId) {
        return sendProblem(res, 409, 'MUTATION_REJECTED', 'Review attempt is no longer awaiting confirmation')
      }
      const pendingInfo = state.pendingReviewsByReviewId.get(reviewId)
      const now = new Date().toISOString()
      const selectedAt = pendingInfo?.selectedAt || now
      const before = pendingInfo?.before || {
        dueAt: review.dueAt,
        mastered: Boolean(review.mastered),
        stableSuccessCount: Number(review.stableSuccessCount ?? 0),
        nextReviewStage: review.nextReviewStage ?? null,
        lastPracticeAt: review.lastPracticeAt ?? null,
      }
      const confirmedSchedule = pendingInfo?.selectedRating === 'HARD'
        ? {
            dueAt: addDaysIso(selectedAt, 1),
            nextReviewStage: 'CROSS_DAY',
            mastered: false,
            stableSuccessCount: 0,
          }
        : resolveGoodSchedule(before, selectedAt)
      review.version += 1
      review.reps += 1
      review.needsLearning = false
      review.mastered = confirmedSchedule.mastered
      review.stableSuccessCount = confirmedSchedule.stableSuccessCount
      review.nextReviewStage = confirmedSchedule.nextReviewStage
      review.dueAt = confirmedSchedule.dueAt
      review.lastReviewedAt = selectedAt
      review.lastPracticeAt = selectedAt
      review.pendingReviewId = null
      review.updatedAt = now
      state.todayCounters.reviewedCount += 1
      state.todayCounters.studySeconds += pendingInfo?.durationSeconds || 0
      state.pendingReviewsByReviewId.delete(reviewId)
      const response = {
        commandId: randomUUID(),
        clientCommandId: body.clientCommandId,
        action: 'REVIEW_CONFIRMED',
        occurredAt: now,
        knowledgeBlockVersion: block.version,
        state: { ...review },
        effectiveReview: {
          reviewId,
          selectedRating: pendingInfo?.selectedRating || 'GOOD',
          effectiveRating: pendingInfo?.selectedRating || 'GOOD',
          selectedAt,
          resolvedAt: now,
          resolution: 'CONFIRMED',
        },
      }
      if (body.clientCommandId) state.reviewCommandReplay.set(body.clientCommandId, response)
      return sendJson(res, 200, response)
    }

    if (pathname === '/api/reviews/lifecycle/learning-completions' && req.method === 'POST') {
      const body = await readJsonBody(req)
      if (body.clientCommandId && state.reviewCommandReplay.has(body.clientCommandId)) {
        return sendJson(res, 200, state.reviewCommandReplay.get(body.clientCommandId))
      }
      const block = state.knowledgeBlocks.find(b => b.id === body.knowledgeBlockId && !b.deletedAt)
      if (!block) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Knowledge block not found')
      const review = state.reviewStates.get(block.id)
      if (!review) return sendProblem(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Review state missing')
      if (Number(body.knowledgeBlockVersion) !== block.version || body.contentHash !== block.contentHash || Number(body.baseVersion) !== review.version) {
        return sendProblem(res, 409, 'RESOURCE_VERSION_CONFLICT', 'Learning completion version conflict', 'Learning completion version conflict', { current: review })
      }
      if (!review.needsLearning) {
        return sendProblem(res, 409, 'MUTATION_REJECTED', 'Knowledge block is not waiting for learning')
      }
      if (body.reviewId && body.reviewId !== review.lastReviewId) {
        return sendProblem(res, 409, 'MUTATION_REJECTED', 'Learning completion reviewId mismatch')
      }
      const now = new Date().toISOString()
      review.version += 1
      review.needsLearning = false
      review.mastered = false
      review.stableSuccessCount = 0
      review.nextReviewStage = 'EARLY_RECALL'
      review.lastPracticeAt = now
      review.pendingReviewId = null
      review.dueAt = new Date(Date.now() + 10 * 60_000).toISOString()
      review.updatedAt = now
      const response = {
        commandId: randomUUID(),
        clientCommandId: body.clientCommandId,
        action: 'LEARNING_COMPLETED',
        occurredAt: now,
        knowledgeBlockVersion: block.version,
        state: { ...review },
        effectiveReview: null,
      }
      if (body.clientCommandId) state.reviewCommandReplay.set(body.clientCommandId, response)
      return sendJson(res, 200, response)
    }

    if (pathname === '/api/focus-sessions' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const clientSessionId = body.clientSessionId || randomUUID()
      if (!state.focusSessions.has(clientSessionId)) {
        const durationSeconds = Number(body.durationSeconds ?? 1500)
        const session = {
          id: randomUUID(),
          clientSessionId,
          taskId: body.taskId || null,
          startedAt: body.startedAt || new Date().toISOString(),
          endedAt: body.endedAt || new Date().toISOString(),
          durationSeconds,
          completed: body.completed !== false,
        }
        state.focusSessions.set(clientSessionId, session)
        state.todayCounters.focusSeconds += durationSeconds
        if (session.completed) state.todayCounters.focusCompletedCount += 1
      }
      return sendJson(res, 201, state.focusSessions.get(clientSessionId))
    }

    if (pathname === '/api/stats/overview' && req.method === 'GET') {
      const activeBlocks = state.knowledgeBlocks.filter(b => !b.deletedAt).length
      const activeTasks = state.tasks.filter(t => !t.deletedAt && t.status !== 'DONE' && t.status !== 'CANCELLED').length
      const activeSources = state.sources.filter(s => !s.deletedAt).length
      const dueReviews = dueQueueItems(undefined, new Date().toISOString()).length
      return sendJson(res, 200, {
        activeKnowledgeBlocks: activeBlocks,
        activeTasks,
        dueReviews,
        completedReviewEvents: state.statsBaseline.historicalReviewedCount + state.todayCounters.reviewedCount,
        activeSources,
        focusSeconds: state.statsBaseline.historicalFocusSeconds + state.todayCounters.focusSeconds,
        focusCompletedCount: state.statsBaseline.historicalFocusCompletedCount + state.todayCounters.focusCompletedCount,
      })
    }

    if (pathname === '/api/stats/weekly' && req.method === 'GET') {
      const todayKey = localDateKey(new Date())
      const doneInTasksToday = state.tasks.filter(t => !t.deletedAt && t.status === 'DONE' && localDateKey(t.scheduledAt || t.updatedAt) === todayKey).length
      const createdInBlocks = state.knowledgeBlocks.filter(b => !b.deletedAt).length
      return sendJson(res, 200, {
        days: [
          {
            date: todayKey,
            reviewedCount: state.todayCounters.reviewedCount,
            studySeconds: state.todayCounters.studySeconds,
            completedTaskCount: state.statsBaseline.historicalCompletedTaskCount + doneInTasksToday,
            createdKnowledgeCount: Math.max(state.todayCounters.createdKnowledgeCount, createdInBlocks),
            focusSeconds: state.todayCounters.focusSeconds,
            focusCompletedCount: state.todayCounters.focusCompletedCount,
          },
        ],
      })
    }

    if (pathname === '/api/ai/usage' && req.method === 'GET') {
      return sendJson(res, 200, state.aiUsage)
    }

    if (pathname === '/api/ai/settings') {
      if (req.method === 'PUT') {
        const body = await readJsonBody(req)
        const next = {
          provider: body.provider || 'OPENAI_COMPATIBLE',
          baseUrl: body.baseUrl || '',
          chatModel: body.chatModel || '',
          hasApiKey: Boolean(body.apiKey || true),
        }
        const idx = state.aiSettings.findIndex(s => s.provider === next.provider)
        if (idx >= 0) state.aiSettings[idx] = next
        else state.aiSettings.push(next)
        return sendJson(res, 200, next)
      }
      return sendJson(res, 200, state.aiSettings)
    }

    if (pathname === '/api/ai/conversations' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const now = new Date().toISOString()
      const created = {
        id: randomUUID(),
        title: body.title || '新对话',
        createdAt: now,
        updatedAt: now,
        version: 1,
        chatScopeState: body.readingContext?.subjectId ? 'BOUND' : 'UNBOUND',
        chatScope: body.readingContext?.subjectId
          ? { subjectId: body.readingContext.subjectId, currentSourceId: body.readingContext.currentSourceId ?? null, retrievalMode: body.readingContext.retrievalMode || 'SUBJECT', sourceIds: body.readingContext.sourceIds || [] }
          : null,
        messages: [],
      }
      state.conversations.unshift(created)
      return sendJson(res, 201, created)
    }
    if (pathname === '/api/ai/conversations' && req.method === 'GET') {
      return sendJson(res, 200, state.conversations)
    }
    if (pathname.startsWith('/api/ai/conversations/')) {
      const id = pathname.split('/').pop()
      if (req.method === 'DELETE') {
        state.conversations = state.conversations.filter(c => c.id !== id)
        return sendJson(res, 204)
      }
      const found = state.conversations.find(c => c.id === id)
      if (!found) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Conversation not found')
      return sendJson(res, 200, found)
    }

    if (pathname === '/api/ai/messages/stream' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const conversationId = body.conversationId || state.conversations[0]?.id || randomUUID()
      const requestId = body.requestId || randomUUID()
      const runId = randomUUID()
      const attemptId = randomUUID()
      const userMessageId = randomUUID()
      const replyMessageId = randomUUID()
      const subjectName = body.readingContext?.subjectId ? subjectNameFor(body.readingContext.subjectId) : ''
      const replyText = subjectName
        ? `### ${subjectName} · 预览回答\n\n已定位当前学科「**${subjectName}**」，你的问题是：\n\n> ${body.content || '请帮我梳理重点'}\n\n当前本地预览模式下已加载 **${dueQueueItems(body.readingContext?.subjectId).length}** 张待复习知识卡片。`
        : `### Auralis 本地预览助手\n\n当前已加载 **${state.subjects.filter(s => !s.deletedAt).length}** 个学科、**${state.knowledgeBlocks.filter(b => !b.deletedAt).length}** 个知识块与 **${state.tasks.filter(t => !t.deletedAt).length}** 条任务数据。`

      const targetConv = state.conversations.find(c => c.id === conversationId)
      if (targetConv) {
        const now = new Date().toISOString()
        targetConv.messages.push(
          { role: 'USER', content: body.content || '' },
          { role: 'ASSISTANT', content: replyText },
        )
        targetConv.updatedAt = now
        if (body.readingContext?.subjectId) {
          targetConv.chatScopeState = 'BOUND'
          targetConv.chatScope = {
            subjectId: body.readingContext.subjectId,
            currentSourceId: body.readingContext.currentSourceId ?? null,
            retrievalMode: body.readingContext.retrievalMode || 'SUBJECT',
            sourceIds: body.readingContext.sourceIds || [],
          }
        }
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      })
      const chunks = [replyText.slice(0, Math.ceil(replyText.length / 2)), replyText.slice(Math.ceil(replyText.length / 2))]
      chunks.forEach((delta, idx) => {
        const envelope = {
          protocolVersion: 1,
          conversationId,
          requestId,
          runId,
          attemptId,
          userMessageId,
          replyMessageId,
          sequence: idx + 1,
          event: 'reply.delta',
          payload: { publicTextDelta: delta },
        }
        res.write(`event: reply.delta\ndata: ${JSON.stringify(envelope)}\n\n`)
      })
      res.write(`event: run.completed\ndata: ${JSON.stringify({
        protocolVersion: 1,
        conversationId,
        requestId,
        runId,
        attemptId,
        userMessageId,
        replyMessageId,
        sequence: chunks.length + 1,
        event: 'run.completed',
        payload: {},
      })}\n\n`)
      res.end()
      return
    }

    if (pathname === '/api/sources' && req.method === 'GET') {
      const subjectId = reqUrl.searchParams.get('subjectId')
      const items = state.sources.filter(s => !s.deletedAt && (!subjectId || s.subjectId === subjectId))
      return sendJson(res, 200, { items, hasMore: false })
    }
    if (pathname === '/api/sources' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const now = new Date().toISOString()
      const created = {
        id: randomUUID(),
        subjectId: body.subjectId,
        type: body.type || 'FILE',
        title: body.title || '新上传资料',
        assetId: body.assetId || null,
        assetSizeBytes: state.uploadedAssets.get(body.assetId)?.sizeBytes || 0,
        ingestionStatus: 'READY',
        ingestionRevision: `rev-${Date.now()}`,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      state.sources.unshift(created)
      recordChange('SOURCE', created.id, 'CREATE', created, 1)
      return sendJson(res, 201, created)
    }
    if (pathname.startsWith('/api/sources/')) {
      const id = pathname.split('/').pop()
      if (req.method === 'DELETE') {
        const idx = state.sources.findIndex(s => s.id === id)
        if (idx >= 0) state.sources[idx].deletedAt = new Date().toISOString()
        return sendJson(res, 204)
      }
      const found = state.sources.find(s => s.id === id && !s.deletedAt)
      if (!found) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Source not found')
      return sendJson(res, 200, found)
    }

    if (pathname === '/api/assets/upload-intents' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const assetId = randomUUID()
      state.uploadedAssets.set(assetId, {
        assetId,
        originalName: body.originalName || 'upload.bin',
        sizeBytes: Number(body.sizeBytes || 0),
        mimeType: body.mimeType || 'application/octet-stream',
      })
      const origin = `http://${req.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`
      return sendJson(res, 201, {
        assetId,
        uploadUrl: `${origin}/__preview-upload/${assetId}`,
        headers: { 'Content-Type': body.mimeType || 'application/octet-stream' },
        expiresAt: isoOffsetHours(1),
      })
    }
    if (pathname.startsWith('/__preview-upload/') && req.method === 'PUT') {
      const assetId = pathname.split('/')[2]
      const bytes = await readRawBody(req)
      const existing = state.uploadedAssets.get(assetId) || { assetId, originalName: 'upload.bin', mimeType: 'application/octet-stream' }
      existing.bytes = bytes
      existing.sizeBytes = bytes.length
      state.uploadedAssets.set(assetId, existing)
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      })
      res.end()
      return
    }
    if (pathname.startsWith('/api/assets/') && pathname.endsWith('/complete') && req.method === 'POST') {
      const assetId = pathname.split('/')[3]
      return sendJson(res, 200, { assetId, status: 'READY' })
    }
    if (pathname.startsWith('/api/assets/') && pathname.endsWith('/download-url') && req.method === 'POST') {
      const assetId = pathname.split('/')[3]
      const uploaded = state.uploadedAssets.get(assetId)
      const source = state.sources.find(s => s.assetId === assetId)
      const fileName = uploaded?.originalName || source?.title || 'sample.pdf'
      const mimeType = uploaded?.mimeType || inferMimeType(fileName, 'application/pdf')
      const origin = `http://${req.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`
      return sendJson(res, 200, {
        url: `${origin}/__preview-asset/${assetId}`,
        mimeType,
        originalName: fileName,
      })
    }
    if (pathname.startsWith('/__preview-asset/') && req.method === 'GET') {
      const assetId = pathname.split('/')[2]
      const uploaded = state.uploadedAssets.get(assetId)
      if (uploaded?.bytes) {
        res.writeHead(200, {
          'Content-Type': uploaded.mimeType || inferMimeType(uploaded.originalName),
          'Access-Control-Allow-Origin': '*',
        })
        res.end(uploaded.bytes)
        return
      }
      const source = state.sources.find(s => s.assetId === assetId)
      if (!source) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Preview asset not found')
      const overview = state.sourceOverviews[source.id] || state.subjectOverviews[source.subjectId]
      const text = `# ${source.title}\n\n${overview?.outlineMarkdown || ''}\n\n${overview?.summaryMarkdown || ''}\n`
      res.writeHead(200, {
        'Content-Type': inferMimeType(source.title, 'text/plain; charset=utf-8'),
        'Access-Control-Allow-Origin': '*',
      })
      res.end(text)
      return
    }

    if (pathname.startsWith('/api/overview-results/subjects/') && req.method === 'GET') {
      const sid = pathname.split('/').pop()
      const matched = state.subjectOverviews[sid]
      if (!matched) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Subject overview not found')
      return sendJson(res, 200, {
        ...matched,
        updatedAt: isoOffsetHours(-2),
      })
    }
    if (pathname.startsWith('/api/overview-results/sources/') && req.method === 'GET') {
      const sid = pathname.split('/').pop()
      const matched = state.sourceOverviews[sid] || state.sources.find(s => s.id === sid)
      if (!matched) return sendProblem(res, 404, 'RESOURCE_NOT_FOUND', 'Source overview not found')
      return sendJson(res, 200, {
        title: matched.title || '资料概览',
        updatedAt: isoOffsetHours(-2),
        outlineMarkdown: matched.outlineMarkdown || `## 资料结构\n\n- ${matched.title}`,
        summaryMarkdown: matched.summaryMarkdown || `基于外部数据生成的「${matched.title}」概览摘要。`,
      })
    }

    return sendProblem(res, 404, 'ROUTE_NOT_FOUND', `Unhandled preview route: ${req.method} ${pathname}`)
  }

  async function handleStatic(res, reqUrl) {
    if (!staticDir) {
      res.writeHead(404)
      res.end('API-only preview server')
      return
    }
    const reqPath = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '')
    let filePath = normalize(join(staticDir, reqPath))
    const normalizedRoot = normalize(staticDir)
    const rel = relative(normalizedRoot, filePath)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    try {
      const info = await stat(filePath)
      if (info.isDirectory()) filePath = join(filePath, 'index.html')
      const data = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' })
      res.end(data)
    } catch {
      try {
        const index = await readFile(join(staticDir, 'index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(index)
      } catch {
        res.writeHead(404)
        res.end('Static H5 build not found. Run npm run build:h5 in Auralis-Mobile or use --api-only.')
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      })
      res.end()
      return
    }

    let reqUrl
    try {
      reqUrl = parseRequestUrl(req)
    } catch {
      sendProblem(res, 400, 'INVALID_REQUEST', 'Malformed request URL or Host header')
      return
    }
    if (reqUrl.pathname.startsWith('/api/') || reqUrl.pathname.startsWith('/__preview-upload/') || reqUrl.pathname.startsWith('/__preview-asset/')) {
      try {
        await handleApi(req, res, reqUrl)
      } catch (error) {
        sendProblem(res, 500, 'PREVIEW_SERVER_ERROR', error instanceof Error ? error.message : String(error))
      }
      return
    }

    await handleStatic(res, reqUrl)
  })

  server.on('upgrade', (req, socket) => {
    let reqUrl
    try {
      reqUrl = parseRequestUrl(req)
    } catch {
      socket.destroy()
      return
    }
    const key = req.headers['sec-websocket-key']
    if (!reqUrl.pathname.startsWith('/ws/events') || typeof key !== 'string') {
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(`${key}${WS_GUID}`).digest('base64')
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'))
    wsClients.add(socket)
    socket.on('close', () => wsClients.delete(socket))
    socket.on('error', () => wsClients.delete(socket))
  })

  return {
    server,
    getState: () => state,
    reloadIfFixtureChanged,
  }
}

export async function startPreviewServer(options = {}) {
  const { server } = createPreviewApp(options)
  const port = options.port ?? DEFAULT_PORT
  const host = options.host ?? DEFAULT_HOST
  await new Promise((resolveStart, rejectStart) => {
    server.once('error', rejectStart)
    server.listen(port, host, resolveStart)
  })
  const address = server.address()
  return {
    server,
    port: typeof address === 'object' && address ? address.port : port,
    host,
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2))
  startPreviewServer(options)
    .then(({ host, port }) => {
      console.log(`Mobile preview server listening at http://${host}:${port}`)
      console.log(`Fixture JSON: ${options.dataPath}`)
      console.log(`Static H5: ${options.staticDir || '(API-only)'}`)
    })
    .catch((error) => {
      console.error('Failed to start mobile preview server:', error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
