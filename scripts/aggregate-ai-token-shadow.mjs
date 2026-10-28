#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MARKER = 'AI_TOKEN_ESTIMATE_SHADOW'
const MAX_INPUT_BYTES = 32 * 1024 * 1024
const MAX_LINE_CHARS = 64 * 1024
const MAX_SAFE = Number.MAX_SAFE_INTEGER
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MODEL = /^(?:unknown|[A-Za-z0-9._/-]{1,80})$/
const STRING_TOKEN = /^[A-Za-z0-9._/-]{1,80}$/
const INTEGER = /^-?(?:0|[1-9][0-9]*)$/
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/
const EVENT_FIELDS = [
  'requestId', 'feature', 'stage', 'provider', 'model', 'requestedModel', 'observedModel',
  'observedModelStatus', 'textType', 'estimatorVersion', 'mode', 'usage', 'oldEstimate',
  'shadowEstimate', 'actualInput', 'reservedOutput', 'actualOutput', 'oldError', 'shadowError',
  'oldRelativeErrorPct', 'shadowRelativeErrorPct', 'codePoints', 'utf8Bytes', 'latinChars',
  'cjkChars', 'digitChars', 'whitespaceChars', 'punctuationChars', 'otherChars', 'messageCount',
  'messageFramingTokens', 'calibration',
]
const EVENT_FIELD_SET = new Set(EVENT_FIELDS)
const LEGACY_MODEL_FIELDS = new Set(['requestedModel', 'observedModel', 'observedModelStatus'])
const LEDGER_FIELDS = [
  'id', 'feature', 'stage', 'provider', 'model', 'state', 'estimated_input_tokens',
  'reserved_output_tokens', 'actual_input_tokens', 'actual_output_tokens', 'charged_tokens',
  'request_dispatched',
]
const LEDGER_FIELD_SET = new Set(LEDGER_FIELDS)
const MANIFEST_FIELDS = new Set(['reservationId', 'language', 'script', 'family', 'session'])
const LANGUAGES = new Set(['en', 'zh', 'ja', 'ko', 'other', 'unknown'])
const SCRIPTS = new Set(['LATIN', 'CJK', 'KANA', 'HANGUL', 'ARABIC', 'CYRILLIC', 'DEVANAGARI', 'OTHER', 'UNKNOWN'])
const STATES = new Set(['RESERVED', 'COMPLETED', 'FAILED', 'RELEASED', 'EXPIRED'])
const TYPES = new Set(['EMPTY', 'STRUCTURED', 'CJK', 'LATIN', 'UNICODE', 'MIXED', 'EMBEDDING_TEXT'])
const OBSERVATION_STATUSES = new Set(['OBSERVED', 'MISSING', 'INVALID', 'CONFLICT'])
const OBSERVATION_STATUSES_WITH_MODEL = new Set(['MISSING', 'INVALID', 'CONFLICT'])

function issue(source, lineNumber, reason) {
  return { source, lineNumber, reason }
}

function safeToken(value, max = 80) {
  return typeof value === 'string' && value.length <= max && STRING_TOKEN.test(value)
}

function safeModel(value) {
  if (typeof value !== 'string' || value.length > 80 || !MODEL.test(value)) return false
  if (value.includes('://') || value.includes('?') || value.includes('#')) return false
  return value === 'unknown' || /[A-Za-z0-9]/.test(value)
}

function parseIntToken(value, { nullable = false, nonNegative = false } = {}) {
  if (nullable && value === 'null') return null
  if (typeof value !== 'string' || !INTEGER.test(value)) throw new Error('INVALID_EVENT')
  const number = Number(value)
  if (!Number.isSafeInteger(number) || (nonNegative && number < 0)) throw new Error('INVALID_EVENT')
  return number
}

function parseDecimalToken(value, { nullable = false } = {}) {
  if (nullable && value === 'null') return null
  if (typeof value !== 'string' || !DECIMAL.test(value)) throw new Error('INVALID_EVENT')
  const number = Number(value)
  if (!Number.isFinite(number) || Math.abs(number) > MAX_SAFE) throw new Error('INVALID_EVENT')
  return number
}

function parsePayload(payload) {
  const parts = payload.trim().split(/\s+/)
  const record = Object.create(null)
  for (const part of parts) {
    const separator = part.indexOf('=')
    if (separator < 1 || separator === part.length - 1) throw new Error('INVALID_EVENT')
    const key = part.slice(0, separator)
    if (!EVENT_FIELD_SET.has(key) || Object.hasOwn(record, key)) throw new Error('INVALID_EVENT')
    record[key] = part.slice(separator + 1)
  }
  return record
}

function validateEvent(record) {
  const keys = Object.keys(record)
  const legacy = !keys.some((key) => LEGACY_MODEL_FIELDS.has(key))
  if (keys.length !== EVENT_FIELDS.length - (legacy ? 3 : 0)
      || EVENT_FIELDS.some((field) => !legacy || !LEGACY_MODEL_FIELDS.has(field) ? !Object.hasOwn(record, field) : false)) {
    throw new Error('INVALID_EVENT')
  }
  const event = Object.create(null)
  for (const field of EVENT_FIELDS) event[field] = record[field]
  if (!UUID.test(event.requestId)) throw new Error('INVALID_EVENT')
  for (const field of ['feature', 'stage', 'provider', 'textType', 'estimatorVersion']) {
    if (!safeToken(event[field])) throw new Error('INVALID_EVENT')
  }
  if (!TYPES.has(event.textType) || event.mode !== 'shadow' || !['complete', 'unknown'].includes(event.usage)) {
    throw new Error('INVALID_EVENT')
  }
  if (!safeModel(event.model)) throw new Error('INVALID_EVENT')
  event.requestedModel = legacy ? event.model : event.requestedModel
  if (!safeModel(event.requestedModel) || event.model !== event.requestedModel) throw new Error('INVALID_EVENT')
  if (legacy) {
    event.observedModel = 'unknown'
    event.observedModelStatus = 'MISSING'
  }
  if (!OBSERVATION_STATUSES.has(event.observedModelStatus) || !safeModel(event.observedModel)) throw new Error('INVALID_EVENT')
  if (event.observedModelStatus === 'OBSERVED') {
    if (event.observedModel === 'unknown') throw new Error('INVALID_EVENT')
  } else if (!OBSERVATION_STATUSES_WITH_MODEL.has(event.observedModelStatus) || event.observedModel !== 'unknown') {
    throw new Error('INVALID_EVENT')
  }
  const nullableCounts = new Set(['actualInput', 'actualOutput', 'oldError', 'shadowError'])
  const nullableDecimals = new Set(['oldRelativeErrorPct', 'shadowRelativeErrorPct'])
  const nonNegativeCounts = new Set([
    'oldEstimate', 'shadowEstimate', 'reservedOutput', 'codePoints', 'utf8Bytes', 'latinChars',
    'cjkChars', 'digitChars', 'whitespaceChars', 'punctuationChars', 'otherChars', 'messageCount',
    'messageFramingTokens',
  ])
  for (const field of EVENT_FIELDS) {
    if (['requestId', 'feature', 'stage', 'provider', 'model', 'requestedModel', 'observedModel',
      'observedModelStatus', 'textType', 'estimatorVersion', 'mode', 'usage', 'calibration'].includes(field)) continue
    event[field] = nullableDecimals.has(field)
      ? parseDecimalToken(record[field], { nullable: true })
      : parseIntToken(record[field], { nullable: nullableCounts.has(field), nonNegative: nonNegativeCounts.has(field) })
  }
  if (!['OBSERVED_ACTUAL', 'ACTUAL_ZERO', 'UNKNOWN'].includes(event.calibration)) throw new Error('INVALID_EVENT')
  if (event.usage === 'complete') {
    if (event.actualInput === null || event.actualOutput === null || event.oldError === null || event.shadowError === null) throw new Error('INVALID_EVENT')
    if (event.oldError !== event.oldEstimate - event.actualInput || event.shadowError !== event.shadowEstimate - event.actualInput) throw new Error('INVALID_EVENT')
    const expectedCalibration = event.actualInput === 0 ? 'ACTUAL_ZERO' : 'OBSERVED_ACTUAL'
    if (event.calibration !== expectedCalibration) throw new Error('INVALID_EVENT')
    for (const [actual, relative] of [[event.oldError, event.oldRelativeErrorPct], [event.shadowError, event.shadowRelativeErrorPct]]) {
      const expected = event.actualInput === 0 ? null : actual * 100 / event.actualInput
      if (expected === null ? relative !== null : relative === null || Math.abs(relative - expected) > Math.max(1e-8, Math.abs(expected) * 1e-8)) throw new Error('INVALID_EVENT')
    }
  } else if (event.actualInput !== null || event.actualOutput !== null || event.oldError !== null || event.shadowError !== null
      || event.oldRelativeErrorPct !== null || event.shadowRelativeErrorPct !== null || event.calibration !== 'UNKNOWN') {
    throw new Error('INVALID_EVENT')
  }
  return event
}

function parseLoggerLine(line) {
  if (line.length > MAX_LINE_CHARS) throw new Error('LINE_TOO_LARGE')
  const barePrefix = `${MARKER} `
  const loggerPrefixes = [
    /^\d{2}:\d{2}:\d{2}\.\d{3}\s+\[[^\]\r\n]{1,80}\]\s+(?:TRACE|DEBUG|INFO|WARN|ERROR)\s+[A-Za-z0-9_.$]+\s+--\s+/u,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})\s+INFO\s+\d+\s+---\s+\[[^\]\r\n]{1,80}\]\s+\[[^\]\r\n]{1,80}\]\s+(?:c\.a\.app\.ai\.usage\.AiUsageGatewayService|com\.auralis\.app\.ai\.usage\.AiUsageGatewayService)\s*:\s+/u,
  ]
  let payload
  if (line.startsWith(barePrefix)) payload = line.slice(barePrefix.length)
  else {
    const prefix = loggerPrefixes.map((pattern) => pattern.exec(line)).find(Boolean)
    if (!prefix || !line.startsWith(MARKER, prefix[0].length) || line[prefix[0].length + MARKER.length] !== ' ') throw new Error('MARKER_NOT_AT_LINE_START')
    payload = line.slice(prefix[0].length + MARKER.length + 1)
  }
  return validateEvent(parsePayload(payload))
}

export function parseShadowEvents(text) {
  if (typeof text !== 'string') throw new TypeError('log input must be text')
  if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) return { events: [], ambiguousIds: new Set(), issues: [issue('logs', 1, 'INPUT_TOO_LARGE')] }
  const eventsById = new Map()
  const ambiguousIds = new Set()
  const eventLineNumbers = new Map()
  const issues = []
  const lines = text.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.includes(MARKER)) continue
    try {
      const event = parseLoggerLine(line)
      const previous = eventsById.get(event.requestId)
      if (!previous) {
        eventsById.set(event.requestId, event)
        eventLineNumbers.set(event.requestId, index + 1)
      }
      else if (stableJson(previous) !== stableJson(event)) {
        ambiguousIds.add(event.requestId)
        issues.push(issue('logs', index + 1, 'CONFLICTING_DUPLICATE_EVENT'))
      }
    } catch (error) {
      const reason = ['LINE_TOO_LARGE', 'MARKER_NOT_AT_LINE_START'].includes(error.message) ? error.message : 'INVALID_EVENT'
      issues.push(issue('logs', index + 1, reason))
    }
  }
  return { events: [...eventsById.values()], ambiguousIds, eventLineNumbers, issues }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function parseLedgerRow(input, lineNumber) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_LEDGER_ROW')
  const keys = Object.keys(input).filter((key) => key !== 'lineNumber')
  if (keys.length !== LEDGER_FIELDS.length || keys.some((key) => !LEDGER_FIELD_SET.has(key)) || LEDGER_FIELDS.some((key) => !Object.hasOwn(input, key))) {
    throw new Error('INVALID_LEDGER_ROW')
  }
  const row = Object.fromEntries(keys.map((key) => [key, input[key]]))
  row.lineNumber = lineNumber
  if (typeof row.id !== 'string' || !UUID.test(row.id)) throw new Error('INVALID_LEDGER_ROW')
  for (const field of ['feature', 'stage', 'provider']) if (!safeToken(row[field])) throw new Error('INVALID_LEDGER_ROW')
  if (!safeModel(row.model) || !STATES.has(row.state)) throw new Error('INVALID_LEDGER_ROW')
  for (const field of ['estimated_input_tokens', 'reserved_output_tokens', 'actual_input_tokens', 'actual_output_tokens', 'charged_tokens']) {
    const value = row[field]
    if (value === null && ['actual_input_tokens', 'actual_output_tokens'].includes(field)) continue
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_LEDGER_ROW')
  }
  if (typeof row.request_dispatched !== 'boolean') throw new Error('INVALID_LEDGER_ROW')
  return row
}

function mergeConflictingLedgerRows(previous, next) {
  const merged = { ...previous, charged_tokens: Math.max(previous.charged_tokens, next.charged_tokens) }
  merged.request_dispatched = previous.request_dispatched || next.request_dispatched
  merged.state = previous.state === next.state ? previous.state : 'AMBIGUOUS'
  for (const field of ['feature', 'stage', 'provider', 'model']) {
    if (previous[field] !== next[field]) merged[field] = 'UNKNOWN'
  }
  for (const field of ['actual_input_tokens', 'actual_output_tokens']) {
    if (previous[field] !== next[field]) merged[field] = null
  }
  return merged
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') {
      if (cell.length !== 0) throw new Error('INVALID_LEDGER_CSV')
      quoted = true
    } else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (quoted) throw new Error('INVALID_LEDGER_CSV')
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export function parseReservationsJson(text) {
  let data
  try { data = JSON.parse(text) } catch { return { rows: [], issues: [issue('reservations', 1, 'INVALID_LEDGER_JSON')] } }
  if (!Array.isArray(data)) return { rows: [], issues: [issue('reservations', 1, 'INVALID_LEDGER_JSON')] }
  const rows = []
  const issues = []
  data.forEach((item, index) => {
    try { rows.push(parseLedgerRow(item, index + 1)) } catch { issues.push(issue('reservations', index + 1, 'INVALID_LEDGER_ROW')) }
  })
  return { rows, issues }
}

export function parseReservationsCsv(text) {
  let parsed
  try { parsed = parseCsv(text) } catch { return { rows: [], issues: [issue('reservations', 1, 'INVALID_LEDGER_CSV')] } }
  if (!parsed.length || parsed[0].length !== LEDGER_FIELDS.length || parsed[0].some((field, index) => field !== LEDGER_FIELDS[index])) {
    return { rows: [], issues: [issue('reservations', 1, 'INVALID_LEDGER_CSV')] }
  }
  const rows = []
  const issues = []
  parsed.slice(1).forEach((cells, index) => {
    const lineNumber = index + 2
    try {
      if (cells.length !== LEDGER_FIELDS.length) throw new Error('INVALID_LEDGER_ROW')
      const record = Object.create(null)
      for (let column = 0; column < LEDGER_FIELDS.length; column += 1) {
        const field = LEDGER_FIELDS[column]
        const value = cells[column]
        if (['estimated_input_tokens', 'reserved_output_tokens', 'charged_tokens'].includes(field)) {
          if (!INTEGER.test(value)) throw new Error('INVALID_LEDGER_ROW')
          record[field] = Number(value)
        } else if (['actual_input_tokens', 'actual_output_tokens'].includes(field)) {
          if (value === '') record[field] = null
          else {
            if (!INTEGER.test(value)) throw new Error('INVALID_LEDGER_ROW')
            record[field] = Number(value)
          }
        } else if (field === 'request_dispatched') {
          if (!['true', 'false'].includes(value)) throw new Error('INVALID_LEDGER_ROW')
          record[field] = value === 'true'
        } else record[field] = value
      }
      rows.push(parseLedgerRow(record, lineNumber))
    } catch { issues.push(issue('reservations', lineNumber, 'INVALID_LEDGER_ROW')) }
  })
  return { rows, issues }
}

function validateManifestRows(rows) {
  const byId = new Map()
  const invalidIds = new Set()
  const issues = []
  rows.forEach((row, index) => {
    const lineNumber = index + 1
    try {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error()
      const keys = Object.keys(row)
      if (keys.length !== MANIFEST_FIELDS.size || keys.some((key) => !MANIFEST_FIELDS.has(key))) throw new Error()
      if (typeof row.reservationId !== 'string' || !UUID.test(row.reservationId)) throw new Error()
      if (!LANGUAGES.has(row.language) || !SCRIPTS.has(row.script)) throw new Error()
      for (const field of ['family', 'session']) if (typeof row[field] !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(row[field])) throw new Error()
      if (invalidIds.has(row.reservationId)) throw new Error()
      const normalized = { ...row, lineNumber }
      const previous = byId.get(row.reservationId)
      if (previous && stableJson({ ...previous, lineNumber: undefined }) !== stableJson({ ...normalized, lineNumber: undefined })) {
        byId.delete(row.reservationId)
        invalidIds.add(row.reservationId)
        throw new Error()
      }
      byId.set(row.reservationId, normalized)
    } catch {
      if (row && typeof row === 'object' && typeof row.reservationId === 'string' && UUID.test(row.reservationId)) {
        byId.delete(row.reservationId)
        invalidIds.add(row.reservationId)
      }
      issues.push(issue('manifest', lineNumber, 'INVALID_MANIFEST'))
    }
  })
  return { byId, invalidIds, issues }
}

function percentile(values, percent) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(percent * sorted.length) - 1)]
}

function lengthBucket(value) {
  if (!Number.isSafeInteger(value) || value < 0) return 'UNKNOWN'
  if (value === 0) return '0'
  if (value <= 256) return '1-256'
  if (value <= 1024) return '257-1024'
  if (value <= 4096) return '1025-4096'
  return '4097+'
}

const GROUP_DIMS = [
  'feature', 'provider', 'requestedModel', 'observedModel', 'observedModelStatus', 'stage',
  'textType', 'estimatorVersion', 'codePointLengthBucket', 'language', 'script',
]

function groupKey(row) {
  return GROUP_DIMS.map((field) => `${field}=${row[field]}`).join('\u001f')
}

function createGroup(base) {
  return {
    ...base,
    reservationCount: 0,
    dispatchedCount: 0,
    completedCount: 0,
    failedCount: 0,
    expiredCount: 0,
    releasedCount: 0,
    reservedCount: 0,
    ambiguousLedgerStateCount: 0,
    chargedExposureTokens: 0,
    ambiguousChargedExposureUpperBoundTokens: 0,
    accuracySampleCount: 0,
    actualUsageDispatchedCount: 0,
    actualUsageCompleteCount: 0,
    actualUsageUnknownCount: 0,
    missingShadowEventCount: 0,
    matchedShadowUsageUnknownCount: 0,
    ambiguousShadowJoinCount: 0,
    unknownUsageCount: 0,
    actualZeroInputCount: 0,
    excludedNonDispatchedCount: 0,
    excludedStateCount: 0,
    ambiguousCount: 0,
    distinctFamilyCount: 0,
    distinctSessionCount: 0,
    _oldSigned: [], _oldAbs: [], _oldSignedRelative: [], _oldAbsRelative: [],
    _shadowSigned: [], _shadowAbs: [], _shadowSignedRelative: [], _shadowAbsRelative: [],
    _oldUnder: 0, _shadowUnder: 0, _oldRisk5: 0, _shadowRisk5: 0, _oldRisk10: 0, _shadowRisk10: 0,
    _relativeCount: 0, _family: new Set(), _session: new Set(),
  }
}

function addAccuracy(group, event) {
  const actual = event.actualInput
  const oldError = event.oldError
  const shadowError = event.shadowError
  group.accuracySampleCount += 1
  group._oldSigned.push(oldError)
  group._oldAbs.push(Math.abs(oldError))
  group._shadowSigned.push(shadowError)
  group._shadowAbs.push(Math.abs(shadowError))
  if (oldError < 0) group._oldUnder += 1
  if (shadowError < 0) group._shadowUnder += 1
  if (actual === 0) {
    group.actualZeroInputCount += 1
    return
  }
  const oldRelative = oldError * 100 / actual
  const shadowRelative = shadowError * 100 / actual
  group._oldSignedRelative.push(oldRelative)
  group._oldAbsRelative.push(Math.abs(oldRelative))
  group._shadowSignedRelative.push(shadowRelative)
  group._shadowAbsRelative.push(Math.abs(shadowRelative))
  group._relativeCount += 1
  if (Math.abs(oldRelative) > 5) group._oldRisk5 += 1
  if (Math.abs(shadowRelative) > 5) group._shadowRisk5 += 1
  if (Math.abs(oldRelative) > 10) group._oldRisk10 += 1
  if (Math.abs(shadowRelative) > 10) group._shadowRisk10 += 1
}

function finalizeGroup(group) {
  const result = { ...group }
  for (const field of ['_oldSigned', '_oldAbs', '_oldSignedRelative', '_oldAbsRelative', '_shadowSigned', '_shadowAbs', '_shadowSignedRelative', '_shadowAbsRelative']) delete result[field]
  for (const field of ['_oldUnder', '_shadowUnder', '_oldRisk5', '_shadowRisk5', '_oldRisk10', '_shadowRisk10', '_relativeCount', '_family', '_session']) delete result[field]
  for (const [prefix, signed, absolute, signedRelative, absoluteRelative, under, risk5, risk10] of [
    ['old', group._oldSigned, group._oldAbs, group._oldSignedRelative, group._oldAbsRelative, group._oldUnder, group._oldRisk5, group._oldRisk10],
    ['shadow', group._shadowSigned, group._shadowAbs, group._shadowSignedRelative, group._shadowAbsRelative, group._shadowUnder, group._shadowRisk5, group._shadowRisk10],
  ]) {
    result[`${prefix}SignedErrorTokensP50`] = percentile(signed, 0.5)
    result[`${prefix}SignedErrorTokensP95`] = percentile(signed, 0.95)
    result[`${prefix}AbsoluteErrorTokensP50`] = percentile(absolute, 0.5)
    result[`${prefix}AbsoluteErrorTokensP95`] = percentile(absolute, 0.95)
    result[`${prefix}SignedRelativeErrorPctP50`] = percentile(signedRelative, 0.5)
    result[`${prefix}SignedRelativeErrorPctP95`] = percentile(signedRelative, 0.95)
    result[`${prefix}AbsoluteRelativeErrorPctP50`] = percentile(absoluteRelative, 0.5)
    result[`${prefix}AbsoluteRelativeErrorPctP95`] = percentile(absoluteRelative, 0.95)
    result[`${prefix}UnderestimateRate`] = group.accuracySampleCount ? under / group.accuracySampleCount : null
    result[`${prefix}RiskAbove5Pct`] = group._relativeCount ? risk5 / group._relativeCount : null
    result[`${prefix}RiskAbove10Pct`] = group._relativeCount ? risk10 / group._relativeCount : null
  }
  result.distinctFamilyCount = group._family.size
  result.distinctSessionCount = group._session.size
  return result
}

function addCount(group, field, amount = 1) { group[field] += amount }

function safeSum(left, right) {
  const result = left + right
  return Number.isSafeInteger(result) ? result : null
}

export function aggregateShadowData(parsedEvents, rawLedgerRows, rawManifestRows = []) {
  const issues = [...(parsedEvents.issues ?? [])]
  const ledgerById = new Map()
  const ambiguousLedgerIds = new Set()
  rawLedgerRows.forEach((raw, index) => {
    let row
    try { row = parseLedgerRow(raw, raw.lineNumber ?? index + 1) } catch { issues.push(issue('reservations', raw?.lineNumber ?? index + 1, 'INVALID_LEDGER_ROW')); return }
    const previous = ledgerById.get(row.id)
    if (!previous) ledgerById.set(row.id, row)
    else if (stableJson({ ...previous, lineNumber: undefined }) !== stableJson({ ...row, lineNumber: undefined })) {
      ambiguousLedgerIds.add(row.id)
      issues.push(issue('reservations', row.lineNumber, 'CONFLICTING_DUPLICATE_LEDGER'))
      ledgerById.set(row.id, mergeConflictingLedgerRows(previous, row))
    }
  })
  const manifest = validateManifestRows(rawManifestRows)
  issues.push(...manifest.issues)
  const events = new Map((parsedEvents.events ?? []).map((event) => [event.requestId, event]))
  const eventLineNumbers = parsedEvents.eventLineNumbers ?? new Map()
  const ambiguousEventIds = parsedEvents.ambiguousIds ?? new Set()
  const groups = new Map()
  const getGroup = (ledger, event) => {
    const metadata = manifest.byId.get(ledger.id)
    const requestedModel = event?.requestedModel ?? ledger.model
    const base = {
      feature: ledger.feature,
      provider: ledger.provider,
      requestedModel: requestedModel === 'unknown' ? 'UNKNOWN' : requestedModel,
      observedModel: event?.observedModel === 'unknown' ? 'UNKNOWN' : (event?.observedModel ?? 'UNKNOWN'),
      observedModelStatus: event?.observedModelStatus ?? 'MISSING',
      stage: ledger.stage,
      textType: event?.textType ?? 'UNKNOWN',
      estimatorVersion: event?.estimatorVersion ?? 'UNKNOWN',
      codePointLengthBucket: event ? lengthBucket(event.codePoints) : 'UNKNOWN',
      language: metadata?.language ?? 'unknown',
      script: metadata?.script ?? 'UNKNOWN',
    }
    const key = groupKey(base)
    if (!groups.has(key)) groups.set(key, createGroup(base))
    return groups.get(key)
  }
  let chargedExposureTokens = 0
  let ambiguousChargedExposureUpperBoundTokens = 0
  let chargedExposureOverflowCount = 0
  const usedManifestIds = new Set()
  let totalAccuracySamples = 0
  let actualUsageDispatchedCount = 0
  let actualUsageCompleteCount = 0
  let actualUsageUnknownCount = 0
  let missingShadowEventCount = 0
  let matchedShadowUsageUnknownCount = 0
  let ambiguousShadowJoinCount = 0
  let totalUnknownUsage = 0
  let totalActualZero = 0
  let excludedNonDispatched = 0
  let dispatchedCount = 0
  let completedCount = 0
  let failedCount = 0
  let expiredCount = 0
  let releasedCount = 0
  let reservedCount = 0
  const seenEvents = new Set()

  for (const ledger of ledgerById.values()) {
    const event = events.get(ledger.id)
    const eventIdentityMismatch = event
      && !ambiguousEventIds.has(ledger.id)
      && !ambiguousLedgerIds.has(ledger.id)
      && (event.feature !== ledger.feature
        || event.stage !== ledger.stage
        || event.provider !== ledger.provider
        || event.requestedModel !== ledger.model)
    const eventIdentityQuarantined = ambiguousEventIds.has(ledger.id)
      || ambiguousLedgerIds.has(ledger.id)
      || eventIdentityMismatch
    const group = getGroup(ledger, eventIdentityQuarantined ? null : event)
    group.reservationCount += 1
    if (ambiguousLedgerIds.has(ledger.id)) {
      group.ambiguousCount += 1
      const upperBound = safeSum(ambiguousChargedExposureUpperBoundTokens, ledger.charged_tokens)
      const groupUpperBound = safeSum(group.ambiguousChargedExposureUpperBoundTokens, ledger.charged_tokens)
      if (upperBound === null) {
        ambiguousChargedExposureUpperBoundTokens = null
        chargedExposureOverflowCount += 1
        issues.push(issue('reservations', ledger.lineNumber, 'AGGREGATE_OVERFLOW'))
      } else if (ambiguousChargedExposureUpperBoundTokens !== null) ambiguousChargedExposureUpperBoundTokens = upperBound
      if (groupUpperBound === null) {
        group.ambiguousChargedExposureUpperBoundTokens = null
        chargedExposureOverflowCount += 1
        issues.push(issue('reservations', ledger.lineNumber, 'AGGREGATE_OVERFLOW'))
      } else if (group.ambiguousChargedExposureUpperBoundTokens !== null) group.ambiguousChargedExposureUpperBoundTokens = groupUpperBound
    } else {
      const total = safeSum(chargedExposureTokens, ledger.charged_tokens)
      const groupTotal = safeSum(group.chargedExposureTokens, ledger.charged_tokens)
      if (total === null || groupTotal === null) {
        chargedExposureTokens = null
        group.chargedExposureTokens = null
        chargedExposureOverflowCount += 1
        issues.push(issue('reservations', ledger.lineNumber, 'AGGREGATE_OVERFLOW'))
      } else {
        if (chargedExposureTokens !== null) chargedExposureTokens = total
        if (group.chargedExposureTokens !== null) group.chargedExposureTokens = groupTotal
      }
    }
    if (ledger.request_dispatched) {
      addCount(group, 'dispatchedCount')
      dispatchedCount += 1
      if (!ambiguousLedgerIds.has(ledger.id)) {
        addCount(group, 'actualUsageDispatchedCount')
        actualUsageDispatchedCount += 1
        if (ledger.actual_input_tokens !== null && ledger.actual_output_tokens !== null) {
          addCount(group, 'actualUsageCompleteCount')
          actualUsageCompleteCount += 1
        } else {
          addCount(group, 'actualUsageUnknownCount')
          actualUsageUnknownCount += 1
        }
      }
    }
    else {
      addCount(group, 'excludedNonDispatchedCount')
      excludedNonDispatched += 1
      if (ledger.charged_tokens > 0) issues.push(issue('join', ledger.lineNumber, 'NONDISPATCHED_CHARGED'))
    }
    if (ledger.state === 'COMPLETED') { addCount(group, 'completedCount'); completedCount += 1 }
    else if (ledger.state === 'FAILED') { addCount(group, 'failedCount'); failedCount += 1 }
    else if (ledger.state === 'EXPIRED') { addCount(group, 'expiredCount'); expiredCount += 1 }
    else if (ledger.state === 'RELEASED') { addCount(group, 'releasedCount'); releasedCount += 1 }
    else if (ledger.state === 'RESERVED') { addCount(group, 'reservedCount'); reservedCount += 1 }
    else if (ledger.state === 'AMBIGUOUS') addCount(group, 'ambiguousLedgerStateCount')
    const metadata = manifest.byId.get(ledger.id)
    if (metadata) { group._family.add(metadata.family); group._session.add(metadata.session) }
    if (metadata) usedManifestIds.add(ledger.id)
    else if (manifest.invalidIds.has(ledger.id)) issues.push(issue('manifest', ledger.lineNumber, 'INVALID_MANIFEST'))

    if (!event) {
      if (ledger.request_dispatched) {
        group.unknownUsageCount += 1
        totalUnknownUsage += 1
        if (ambiguousLedgerIds.has(ledger.id)) {
          group.ambiguousShadowJoinCount += 1
          ambiguousShadowJoinCount += 1
        } else {
          group.missingShadowEventCount += 1
          missingShadowEventCount += 1
        }
      }
      issues.push(issue('join', ledger.lineNumber, 'MISSING_EVENT'))
      continue
    }
    seenEvents.add(ledger.id)
    if (ambiguousEventIds.has(ledger.id) || ambiguousLedgerIds.has(ledger.id)) {
      if (!ambiguousLedgerIds.has(ledger.id)) group.ambiguousCount += 1
      if (ledger.request_dispatched) {
        group.unknownUsageCount += 1
        totalUnknownUsage += 1
        group.ambiguousShadowJoinCount += 1
        ambiguousShadowJoinCount += 1
      }
      continue
    }
    if (eventIdentityMismatch) {
      issues.push(issue('join', ledger.lineNumber, 'LEDGER_IDENTITY_MISMATCH'))
      group.ambiguousCount += 1
      if (ledger.request_dispatched) {
        group.ambiguousShadowJoinCount += 1
        ambiguousShadowJoinCount += 1
      }
      continue
    }
    if (!ledger.request_dispatched) {
      if (ledger.charged_tokens > 0) issues.push(issue('join', ledger.lineNumber, 'NONDISPATCHED_CHARGED'))
      issues.push(issue('join', ledger.lineNumber, 'EVENT_FOR_NON_DISPATCHED'))
      continue
    }
    if (event.usage !== 'complete') {
      group.unknownUsageCount += 1
      totalUnknownUsage += 1
      group.matchedShadowUsageUnknownCount += 1
      matchedShadowUsageUnknownCount += 1
      if ((event.actualInput !== null && ledger.actual_input_tokens !== event.actualInput)
          || (event.actualOutput !== null && ledger.actual_output_tokens !== event.actualOutput)) {
        issues.push(issue('join', ledger.lineNumber, 'LEDGER_USAGE_MISMATCH'))
      }
      continue
    }
    if (ledger.state !== 'COMPLETED') {
      group.excludedStateCount += 1
      issues.push(issue('join', ledger.lineNumber, 'COMPLETED_USAGE_WITH_NONCOMPLETED_STATE'))
      continue
    }
    if (ledger.actual_input_tokens !== event.actualInput || ledger.actual_output_tokens !== event.actualOutput) {
      group.ambiguousCount += 1
      issues.push(issue('join', ledger.lineNumber, 'LEDGER_USAGE_MISMATCH'))
      continue
    }
    addAccuracy(group, event)
    totalAccuracySamples += 1
    if (event.actualInput === 0) totalActualZero += 1
  }
  for (const event of events.values()) {
    if (!ledgerById.has(event.requestId)) issues.push(issue('logs', eventLineNumbers.get(event.requestId) ?? 1, 'UNMATCHED_EVENT'))
  }
  for (const [id, metadata] of manifest.byId) {
    if (!ledgerById.has(id)) issues.push(issue('manifest', metadata.lineNumber, 'UNMATCHED_MANIFEST'))
  }
  const finalGroups = [...groups.values()].map(finalizeGroup).sort((a, b) => groupKey(a).localeCompare(groupKey(b)))
  const summary = {
    schemaVersion: 1,
    status: issues.length ? 'INCOMPLETE' : 'COMPLETE',
    shadowOnly: true,
    calibration: 'uncalibrated',
    reservationCount: ledgerById.size,
    dispatchedCount,
    completedCount,
    failedCount,
    expiredCount,
    releasedCount,
    reservedCount,
    chargedExposureTokens,
    ambiguousChargedExposureUpperBoundTokens,
    chargedExposureOverflowCount,
    unknownLedgerExposureCount: issues.filter((entry) => entry.source === 'reservations'
      && ['INVALID_LEDGER_ROW', 'INVALID_LEDGER_JSON', 'INVALID_LEDGER_CSV', 'CONFLICTING_DUPLICATE_LEDGER'].includes(entry.reason)).length,
    accuracySampleCount: totalAccuracySamples,
    actualUsageDispatchedCount,
    actualUsageCompleteCount,
    actualUsageUnknownCount,
    missingShadowEventCount,
    matchedShadowUsageUnknownCount,
    ambiguousShadowJoinCount,
    // Legacy counter: missing event, ambiguous event/ledger ID, or matched incomplete shadow usage.
    unknownUsageCount: totalUnknownUsage,
    actualZeroInputCount: totalActualZero,
    excludedNonDispatchedCount: excludedNonDispatched,
    groupCount: finalGroups.length,
    issueCount: issues.length,
    distinctFamilyCount: new Set([...manifest.byId].filter(([id]) => usedManifestIds.has(id)).map(([, row]) => row.family)).size,
    distinctSessionCount: new Set([...manifest.byId].filter(([id]) => usedManifestIds.has(id)).map(([, row]) => row.session)).size,
  }
  return { summary, groups: finalGroups, issues }
}

const CSV_FIELDS = [
  ...GROUP_DIMS, 'reservationCount', 'dispatchedCount', 'completedCount', 'failedCount', 'expiredCount',
  'releasedCount', 'reservedCount', 'ambiguousLedgerStateCount', 'chargedExposureTokens', 'ambiguousChargedExposureUpperBoundTokens', 'accuracySampleCount',
  'actualUsageDispatchedCount', 'actualUsageCompleteCount', 'actualUsageUnknownCount', 'missingShadowEventCount', 'matchedShadowUsageUnknownCount', 'ambiguousShadowJoinCount', 'unknownUsageCount',
  'actualZeroInputCount', 'excludedNonDispatchedCount', 'excludedStateCount', 'ambiguousCount',
  'distinctFamilyCount', 'distinctSessionCount',
  ...['old', 'shadow'].flatMap((prefix) => [
    `${prefix}SignedErrorTokensP50`, `${prefix}SignedErrorTokensP95`, `${prefix}AbsoluteErrorTokensP50`,
    `${prefix}AbsoluteErrorTokensP95`, `${prefix}SignedRelativeErrorPctP50`, `${prefix}SignedRelativeErrorPctP95`,
    `${prefix}AbsoluteRelativeErrorPctP50`, `${prefix}AbsoluteRelativeErrorPctP95`, `${prefix}UnderestimateRate`,
    `${prefix}RiskAbove5Pct`, `${prefix}RiskAbove10Pct`,
  ]),
]

function csvCell(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`
  if (/[",\r\n]/u.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export function renderGroupsCsv(groups) {
  return [CSV_FIELDS.join(','), ...groups.map((group) => CSV_FIELDS.map((field) => csvCell(group[field])).join(','))].join('\n') + '\n'
}

function parseArgs(argv) {
  const values = Object.create(null)
  const allowed = new Set(['--logs', '--reservations', '--reservations-format', '--manifest', '--out-dir'])
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!allowed.has(key) || Object.hasOwn(values, key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('INVALID_ARGUMENTS')
    values[key] = argv[++i]
  }
  if (!values['--logs'] || !values['--reservations'] || !values['--out-dir']) throw new Error('INVALID_ARGUMENTS')
  values['--reservations-format'] ??= path.extname(values['--reservations']).toLowerCase() === '.csv' ? 'csv' : 'json'
  if (!['csv', 'json'].includes(values['--reservations-format'])) throw new Error('INVALID_ARGUMENTS')
  return values
}

async function readInput(filePath) {
  const data = await readFile(filePath)
  if (data.byteLength > MAX_INPUT_BYTES) throw new Error('INPUT_TOO_LARGE')
  return data.toString('utf8')
}

export async function runCli(argv = process.argv.slice(2)) {
  let args
  try { args = parseArgs(argv) } catch { process.stderr.write('ERROR INVALID_ARGUMENTS\n'); return 2 }
  try {
    const [logText, ledgerText, manifestText] = await Promise.all([
      readInput(args['--logs']), readInput(args['--reservations']),
      args['--manifest'] ? readInput(args['--manifest']) : Promise.resolve(null),
    ])
    const logResult = parseShadowEvents(logText)
    const ledgerResult = args['--reservations-format'] === 'csv' ? parseReservationsCsv(ledgerText) : parseReservationsJson(ledgerText)
    let manifestRows = []
    let manifestIssues = []
    if (manifestText !== null) {
      try {
        const manifest = JSON.parse(manifestText)
        if (manifest?.schemaVersion !== 1 || manifest?.synthetic !== true || !Array.isArray(manifest.samples)
            || Object.keys(manifest).some((key) => !['schemaVersion', 'synthetic', 'samples'].includes(key))) throw new Error()
        manifestRows = manifest.samples
      } catch { manifestIssues = [issue('manifest', 1, 'INVALID_MANIFEST')] }
    }
    const result = aggregateShadowData({ ...logResult, issues: [...logResult.issues, ...ledgerResult.issues, ...manifestIssues] }, ledgerResult.rows, manifestRows)
    const outDir = args['--out-dir']
    await mkdir(outDir)
    await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(result.summary, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' })
    await writeFile(path.join(outDir, 'groups.csv'), renderGroupsCsv(result.groups), { flag: 'wx', encoding: 'utf8' })
    await writeFile(path.join(outDir, 'issues.json'), `${JSON.stringify(result.issues, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' })
    process.stdout.write(`status=${result.summary.status} reservations=${result.summary.reservationCount} groups=${result.summary.groupCount} actual_usage_complete=${result.summary.actualUsageCompleteCount}/${result.summary.actualUsageDispatchedCount} actual_usage_unknown=${result.summary.actualUsageUnknownCount} shadow_event_missing=${result.summary.missingShadowEventCount} shadow_usage_unknown=${result.summary.matchedShadowUsageUnknownCount} shadow_join_ambiguous=${result.summary.ambiguousShadowJoinCount} issues=${result.summary.issueCount}\n`)
    return result.summary.status === 'COMPLETE' ? 0 : 2
  } catch (error) {
    process.stderr.write(`ERROR ${error?.code === 'EEXIST' ? 'OUTPUT_EXISTS' : error?.message === 'INPUT_TOO_LARGE' ? 'INPUT_TOO_LARGE' : 'INPUT_UNAVAILABLE'}\n`)
    return 2
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli().then((code) => { process.exitCode = code }, () => {
    process.stderr.write('ERROR INPUT_UNAVAILABLE\n')
    process.exitCode = 2
  })
}
