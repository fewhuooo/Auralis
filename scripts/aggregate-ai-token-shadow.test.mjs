import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  parseShadowEvents,
  parseReservationsCsv,
  aggregateShadowData,
  renderGroupsCsv,
} from './aggregate-ai-token-shadow.mjs'

const scriptPath = fileURLToPath(new URL('./aggregate-ai-token-shadow.mjs', import.meta.url))
const tempRoot = 'D:/Temp/auralis-ai-observability-step2-20261015/offline/test-tmp'

const eventFields = {
  requestId: '00000000-0000-4000-8000-000000000001',
  feature: 'CHAT',
  stage: 'CHAT_COMPLETION',
  provider: 'DEEPSEEK',
  model: 'deepseek-chat',
  requestedModel: 'deepseek-chat',
  observedModel: 'deepseek-chat',
  observedModelStatus: 'OBSERVED',
  textType: 'LATIN',
  estimatorVersion: 'char-category-v1-uncalibrated',
  mode: 'shadow',
  usage: 'complete',
  oldEstimate: '100',
  shadowEstimate: '110',
  actualInput: '100',
  reservedOutput: '40',
  actualOutput: '20',
  oldError: '0',
  shadowError: '10',
  oldRelativeErrorPct: '0.0',
  shadowRelativeErrorPct: '10.0',
  codePoints: '40',
  utf8Bytes: '42',
  latinChars: '40',
  cjkChars: '0',
  digitChars: '0',
  whitespaceChars: '0',
  punctuationChars: '0',
  otherChars: '0',
  messageCount: '1',
  messageFramingTokens: '0',
  calibration: 'OBSERVED_ACTUAL',
}

function shadowLine(overrides = {}, prefix = '') {
  const fields = { ...eventFields, ...overrides }
  for (const [key, value] of Object.entries(fields)) if (value === undefined) delete fields[key]
  return `${prefix}AI_TOKEN_ESTIMATE_SHADOW ${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join(' ')}`
}

function reservation(overrides = {}) {
  return {
    id: eventFields.requestId,
    feature: 'CHAT',
    stage: 'CHAT_COMPLETION',
    provider: 'DEEPSEEK',
    model: 'deepseek-chat',
    state: 'COMPLETED',
    estimated_input_tokens: 100,
    reserved_output_tokens: 40,
    actual_input_tokens: 100,
    actual_output_tokens: 20,
    charged_tokens: 120,
    request_dispatched: true,
    ...overrides,
  }
}

function manifestEntry(overrides = {}) {
  return {
    reservationId: eventFields.requestId,
    language: 'en',
    script: 'LATIN',
    family: 'synthetic-family-1',
    session: 'synthetic-session-1',
    ...overrides,
  }
}

test('parses the exact shadow marker and strict key-value payload without retaining raw lines', () => {
  const parsed = parseShadowEvents(shadowLine() + '\nordinary log line')
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.events[0].requestId, eventFields.requestId)
  assert.equal(parsed.events[0].observedModel, 'deepseek-chat')
  assert.equal(parsed.events[0].raw, undefined)
  assert.deepEqual(parsed.issues, [])
})

test('accepts the producer logger prefix while rejecting marker lookalikes and forged multiline fields', () => {
  const parsed = parseShadowEvents([
    shadowLine({}, '08:58:08.512 [main] INFO com.auralis.app.ai.usage.AiUsageGatewayService -- '),
    `message mentions ${shadowLine()}`,
    'AI_TOKEN_ESTIMATE_SHADOW requestId=00000000-0000-4000-8000-000000000001 feature=CHAT\nactualInput=999',
  ].join('\n'))
  assert.equal(parsed.events.length, 1)
  assert.deepEqual(parsed.issues.map((issue) => issue.reason), ['MARKER_NOT_AT_LINE_START', 'INVALID_EVENT'])
  assert.equal(JSON.stringify(parsed.issues).includes('00000000'), false)
  assert.equal(JSON.stringify(parsed.issues).includes('actualInput=999'), false)
})

test('parses the real producer test logger line and joins its requested/observed identity', async () => {
  // Captured from AiUsageGatewayShadowEstimateTests.logsRequestedAndObservedModelAsSeparateSafeFields.
  const fixtures = path.join(path.dirname(scriptPath), 'fixtures', 'ai-token-shadow')
  const [logs, ledgerText] = await Promise.all([
    readFile(path.join(fixtures, 'producer-shadow.log'), 'utf8'),
    readFile(path.join(fixtures, 'producer-reservations.json'), 'utf8'),
  ])
  const parsed = parseShadowEvents(logs)
  const ledger = JSON.parse(ledgerText)
  const result = aggregateShadowData(parsed, ledger)
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.events[0].requestedModel, 'requested-model')
  assert.equal(parsed.events[0].observedModel, 'vendor/actual-model')
  assert.equal(parsed.events[0].observedModelStatus, 'OBSERVED')
  assert.equal(result.summary.status, 'COMPLETE')
  assert.equal(result.summary.accuracySampleCount, 1)
  assert.equal(result.summary.chargedExposureTokens, 7)
  assert.equal(result.groups[0].oldSignedErrorTokensP50, 8)
  assert.equal(result.groups[0].shadowSignedErrorTokensP50, 2)
  assert.equal(JSON.stringify(result).includes('ad0d90c1-9522-4008-9415-ca38466a39b1'), false)
})

test('parses the actual round-four Spring Boot gateway prefix and legacy observed-model absence', async () => {
  const fixturePath = path.join(path.dirname(scriptPath), 'fixtures', 'ai-token-shadow', 'round4-spring-legacy.log')
  const sourceLine = await readFile(fixturePath, 'utf8')
  const parsed = parseShadowEvents(sourceLine)
  assert.equal(parsed.events.length, 1)
  assert.deepEqual(parsed.issues, [])
  assert.equal(parsed.events[0].requestedModel, 'embedding-model')
  assert.equal(parsed.events[0].observedModel, 'unknown')
  assert.equal(parsed.events[0].observedModelStatus, 'MISSING')
  assert.equal(parsed.events[0].textType, 'EMBEDDING_TEXT')
  const forgedLogger = parseShadowEvents(sourceLine.replace('c.a.app.ai.usage.AiUsageGatewayService', 'c.a.app.ai.usage.OtherService'))
  assert.equal(forgedLogger.events.length, 0)
  assert.equal(forgedLogger.issues[0].reason, 'MARKER_NOT_AT_LINE_START')
})

test('normalizes historical rows without observed-model fields to UNKNOWN/MISSING without backfilling model', () => {
  const parsed = parseShadowEvents(shadowLine({ requestedModel: undefined, observedModel: undefined, observedModelStatus: undefined }))
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.events[0].requestedModel, 'deepseek-chat')
  assert.equal(parsed.events[0].observedModel, 'unknown')
  assert.equal(parsed.events[0].observedModelStatus, 'MISSING')
})

test('rejects inconsistent model observation states and unsafe model identifiers without echoing values', () => {
  const parsed = parseShadowEvents([
    shadowLine({ observedModelStatus: 'OBSERVED', observedModel: 'https://secret.example/key' }),
    shadowLine({ observedModelStatus: 'MISSING', observedModel: 'deepseek-chat' }),
    shadowLine({ model: 'deepseek-chat', requestedModel: 'other-model' }),
  ].join('\n'))
  assert.equal(parsed.events.length, 0)
  assert.equal(parsed.issues.length, 3)
  assert.equal(JSON.stringify(parsed.issues).includes('secret.example'), false)
})

test('keeps final missing, invalid and conflicting observations distinct while grouping unknown model safely', () => {
  const parsed = parseShadowEvents([
    shadowLine({ requestId: '00000000-0000-4000-8000-000000000031', observedModel: 'unknown', observedModelStatus: 'MISSING' }),
    shadowLine({ requestId: '00000000-0000-4000-8000-000000000032', observedModel: 'unknown', observedModelStatus: 'INVALID' }),
    shadowLine({ requestId: '00000000-0000-4000-8000-000000000033', observedModel: 'unknown', observedModelStatus: 'CONFLICT' }),
  ].join('\n'))
  const ledger = [
    reservation({ id: '00000000-0000-4000-8000-000000000031' }),
    reservation({ id: '00000000-0000-4000-8000-000000000032' }),
    reservation({ id: '00000000-0000-4000-8000-000000000033' }),
  ]
  const result = aggregateShadowData(parsed, ledger)
  assert.deepEqual(result.groups.map((group) => group.observedModelStatus).sort(), ['CONFLICT', 'INVALID', 'MISSING'])
  assert.ok(result.groups.every((group) => group.observedModel === 'UNKNOWN'))
})

test('deduplicates identical calls and quarantines conflicting duplicate reservation IDs', () => {
  const parsed = parseShadowEvents([
    shadowLine(),
    shadowLine(),
    shadowLine({ shadowEstimate: '111', shadowError: '11', shadowRelativeErrorPct: '11.0' }),
  ].join('\n'))
  assert.equal(parsed.events.length, 1)
  assert.equal(parsed.ambiguousIds.size, 1)
  assert.equal(parsed.issues.filter((issue) => issue.reason === 'CONFLICTING_DUPLICATE_EVENT').length, 1)
})

test('keeps ambiguous event charges under ledger identity regardless of event order', () => {
  const id = eventFields.requestId
  const first = shadowLine({
    requestedModel: 'model-alpha', model: 'model-alpha', observedModel: 'vendor/alpha',
    textType: 'LATIN', estimatorVersion: 'estimator-alpha', codePoints: '40',
  })
  const second = shadowLine({
    requestedModel: 'model-beta', model: 'model-beta', observedModel: 'vendor/beta',
    textType: 'CJK', estimatorVersion: 'estimator-beta', codePoints: '900',
  })
  const ledger = [reservation({ id, model: 'ledger-model', charged_tokens: 120 })]
  const aggregate = (lines) => aggregateShadowData(parseShadowEvents(lines), ledger)
  const forward = aggregate([first, second].join('\n'))
  const reversed = aggregate([second, first].join('\n'))
  const summarize = (result) => result.groups.map((group) => ({
    requestedModel: group.requestedModel,
    observedModel: group.observedModel,
    observedModelStatus: group.observedModelStatus,
    textType: group.textType,
    estimatorVersion: group.estimatorVersion,
    codePointLengthBucket: group.codePointLengthBucket,
    chargedExposureTokens: group.chargedExposureTokens,
    ambiguousCount: group.ambiguousCount,
  }))

  assert.deepEqual(summarize(forward), summarize(reversed))
  assert.deepEqual(summarize(forward), [{
    requestedModel: 'ledger-model',
    observedModel: 'UNKNOWN',
    observedModelStatus: 'MISSING',
    textType: 'UNKNOWN',
    estimatorVersion: 'UNKNOWN',
    codePointLengthBucket: 'UNKNOWN',
    chargedExposureTokens: 120,
    ambiguousCount: 1,
  }])
  assert.equal(forward.summary.chargedExposureTokens, 120)
  assert.equal(forward.summary.unknownUsageCount, 1)
  assert.equal(forward.summary.status, 'INCOMPLETE')
})

test('quarantines event identity mismatch before assigning the ledger charge group', () => {
  const id = eventFields.requestId
  const parsed = parseShadowEvents(shadowLine({
    requestedModel: 'event-model', model: 'event-model', observedModel: 'vendor/event',
    textType: 'CJK', estimatorVersion: 'event-estimator', codePoints: '900',
  }))
  const result = aggregateShadowData(parsed, [reservation({ id, model: 'ledger-model', charged_tokens: 120 })])

  assert.equal(result.summary.chargedExposureTokens, 120)
  assert.equal(result.summary.accuracySampleCount, 0)
  assert.ok(result.issues.some((issue) => issue.reason === 'LEDGER_IDENTITY_MISMATCH'))
  assert.deepEqual(result.groups.map((group) => ({
    requestedModel: group.requestedModel,
    observedModel: group.observedModel,
    observedModelStatus: group.observedModelStatus,
    textType: group.textType,
    estimatorVersion: group.estimatorVersion,
    codePointLengthBucket: group.codePointLengthBucket,
    chargedExposureTokens: group.chargedExposureTokens,
    ambiguousCount: group.ambiguousCount,
  })), [{
    requestedModel: 'ledger-model',
    observedModel: 'UNKNOWN',
    observedModelStatus: 'MISSING',
    textType: 'UNKNOWN',
    estimatorVersion: 'UNKNOWN',
    codePointLengthBucket: 'UNKNOWN',
    chargedExposureTokens: 120,
    ambiguousCount: 1,
  }])
})

test('keeps unknown actual usage distinct from valid zero and does not score partial usage', () => {
  const zeroId = '00000000-0000-4000-8000-000000000002'
  const unknownId = '00000000-0000-4000-8000-000000000003'
  const lines = [
    shadowLine({ requestId: zeroId, actualInput: '0', oldError: '100', shadowError: '110', oldRelativeErrorPct: 'null', shadowRelativeErrorPct: 'null', calibration: 'ACTUAL_ZERO' }),
    shadowLine({ requestId: unknownId, usage: 'unknown', actualInput: 'null', actualOutput: 'null', oldError: 'null', shadowError: 'null', oldRelativeErrorPct: 'null', shadowRelativeErrorPct: 'null', calibration: 'UNKNOWN' }),
  ].join('\n')
  const ledger = [
    reservation({ id: zeroId, actual_input_tokens: 0, actual_output_tokens: 20, charged_tokens: 40 }),
    reservation({ id: unknownId, actual_input_tokens: null, actual_output_tokens: 20, charged_tokens: 140 }),
  ]
  const result = aggregateShadowData(parseShadowEvents(lines), ledger)
  assert.equal(result.summary.accuracySampleCount, 1)
  assert.equal(result.summary.actualZeroInputCount, 1)
  assert.equal(result.summary.unknownUsageCount, 1)
  assert.equal(result.summary.chargedExposureTokens, 180)
})

test('separates ledger actual completeness from shadow coverage and matched unknown usage', () => {
  const missingCompleteId = '00000000-0000-4000-8000-000000000031'
  const unknownMatchedId = '00000000-0000-4000-8000-000000000032'
  const missingUnknownId = '00000000-0000-4000-8000-000000000033'
  const zeroId = '00000000-0000-4000-8000-000000000034'
  const nonDispatchedId = '00000000-0000-4000-8000-000000000035'
  const unknownMatchedCompleteActualId = '00000000-0000-4000-8000-000000000037'
  const lines = [
    shadowLine({ requestId: unknownMatchedId, usage: 'unknown', actualInput: 'null', actualOutput: 'null', oldError: 'null', shadowError: 'null', oldRelativeErrorPct: 'null', shadowRelativeErrorPct: 'null', calibration: 'UNKNOWN' }),
    shadowLine({ requestId: unknownMatchedCompleteActualId, usage: 'unknown', actualInput: 'null', actualOutput: 'null', oldError: 'null', shadowError: 'null', oldRelativeErrorPct: 'null', shadowRelativeErrorPct: 'null', calibration: 'UNKNOWN' }),
    shadowLine({ requestId: zeroId, actualInput: '0', oldError: '100', shadowError: '110', oldRelativeErrorPct: 'null', shadowRelativeErrorPct: 'null', calibration: 'ACTUAL_ZERO' }),
  ].join('\n')
  const result = aggregateShadowData(parseShadowEvents(lines), [
    reservation({ id: missingCompleteId, actual_input_tokens: 100, actual_output_tokens: 20 }),
    reservation({ id: unknownMatchedId, actual_input_tokens: null, actual_output_tokens: null }),
    reservation({ id: missingUnknownId, actual_input_tokens: null, actual_output_tokens: null }),
    reservation({ id: zeroId, actual_input_tokens: 0, actual_output_tokens: 20 }),
    reservation({ id: unknownMatchedCompleteActualId, actual_input_tokens: 50, actual_output_tokens: 10 }),
    reservation({ id: nonDispatchedId, request_dispatched: false, state: 'RELEASED', actual_input_tokens: null, actual_output_tokens: null }),
  ])

  assert.equal(result.summary.actualUsageDispatchedCount, 5)
  assert.equal(result.summary.actualUsageCompleteCount, 3)
  assert.equal(result.summary.actualUsageUnknownCount, 2)
  assert.equal(result.summary.missingShadowEventCount, 2)
  assert.equal(result.summary.matchedShadowUsageUnknownCount, 2)
  assert.equal(result.summary.ambiguousShadowJoinCount, 0)
  assert.equal(result.summary.unknownUsageCount, 4)
  assert.equal(result.summary.accuracySampleCount, 1)
  assert.equal(result.summary.actualZeroInputCount, 1)
  assert.equal(result.groups.reduce((total, group) => total + group.actualUsageDispatchedCount, 0), 5)
  assert.equal(result.groups.reduce((total, group) => total + group.actualUsageCompleteCount, 0), 3)
  assert.equal(result.groups.reduce((total, group) => total + group.actualUsageUnknownCount, 0), 2)
  assert.equal(result.groups.reduce((total, group) => total + group.missingShadowEventCount, 0), 2)
  assert.equal(result.groups.reduce((total, group) => total + group.matchedShadowUsageUnknownCount, 0), 2)
})

test('excludes conflicting duplicate ledgers from actual completeness and shadow coverage counters', () => {
  const id = '00000000-0000-4000-8000-000000000036'
  const result = aggregateShadowData({ events: [], ambiguousIds: new Set(), issues: [] }, [
    reservation({ id, actual_input_tokens: 100, actual_output_tokens: 20 }),
    reservation({ id, state: 'FAILED', charged_tokens: 999, actual_input_tokens: null, actual_output_tokens: null }),
  ])

  assert.equal(result.summary.actualUsageDispatchedCount, 0)
  assert.equal(result.summary.actualUsageCompleteCount, 0)
  assert.equal(result.summary.actualUsageUnknownCount, 0)
  assert.equal(result.summary.missingShadowEventCount, 0)
  assert.equal(result.summary.ambiguousShadowJoinCount, 1)
  assert.equal(result.summary.unknownUsageCount, 1)
})

test('scores complete dispatched samples only when event usage exactly matches ledger actuals', () => {
  const result = aggregateShadowData(parseShadowEvents(shadowLine()), [reservation()])
  assert.equal(result.summary.accuracySampleCount, 1)
  assert.equal(result.summary.chargedExposureTokens, 120)
  const group = result.groups[0]
  assert.equal(group.shadowSignedErrorTokensP50, 10)
  assert.equal(group.shadowAbsoluteRelativeErrorPctP50, 10)
  assert.equal(group.shadowUnderestimateRate, 0)
  assert.equal(group.shadowRiskAbove5Pct, 1)
  assert.equal(group.shadowRiskAbove10Pct, 0)
})

test('retains charged exposure once while quarantining unmatched, mismatched and non-dispatched data', () => {
  const missingEvent = '00000000-0000-4000-8000-000000000004'
  const mismatch = '00000000-0000-4000-8000-000000000005'
  const parsed = parseShadowEvents(shadowLine({ requestId: mismatch, actualInput: '100', oldError: '0', shadowError: '10' }))
  const result = aggregateShadowData(parsed, [
    reservation({ id: missingEvent, charged_tokens: 5 }),
    reservation({ id: mismatch, charged_tokens: 7, actual_input_tokens: 101 }),
    reservation({ request_dispatched: false, state: 'RELEASED', charged_tokens: 0 }),
  ])
  assert.equal(result.summary.status, 'INCOMPLETE')
  assert.equal(result.summary.chargedExposureTokens, 12)
  assert.equal(result.summary.unknownUsageCount, 1)
  assert.equal(result.summary.excludedNonDispatchedCount, 1)
  assert.ok(result.issues.some((issue) => issue.reason === 'MISSING_EVENT'))
  assert.ok(result.issues.some((issue) => issue.reason === 'LEDGER_USAGE_MISMATCH'))
})

test('counts completed, failed, expired and released exposure separately and counts every dispatched reservation', () => {
  const ledger = [
    reservation({ id: '00000000-0000-4000-8000-000000000011', state: 'COMPLETED', charged_tokens: 1 }),
    reservation({ id: '00000000-0000-4000-8000-000000000012', state: 'FAILED', charged_tokens: 2 }),
    reservation({ id: '00000000-0000-4000-8000-000000000013', state: 'EXPIRED', charged_tokens: 3 }),
    reservation({ id: '00000000-0000-4000-8000-000000000014', state: 'RELEASED', charged_tokens: 0, request_dispatched: false }),
  ]
  const result = aggregateShadowData({ events: [], ambiguousIds: new Set(), issues: [] }, ledger)
  assert.equal(result.summary.dispatchedCount, 3)
  assert.equal(result.summary.completedCount, 1)
  assert.equal(result.summary.failedCount, 1)
  assert.equal(result.summary.expiredCount, 1)
  assert.equal(result.summary.releasedCount, 1)
  assert.equal(result.summary.chargedExposureTokens, 6)
})

test('rejects duplicate ledger IDs with conflicting values without multiplying charged exposure', () => {
  const id = eventFields.requestId
  const result = aggregateShadowData({ events: [], ambiguousIds: new Set(), issues: [] }, [
    reservation(), reservation({ state: 'FAILED', charged_tokens: 999 }),
  ])
  assert.equal(result.summary.status, 'INCOMPLETE')
  assert.equal(result.summary.chargedExposureTokens, 0)
  assert.equal(result.summary.ambiguousChargedExposureUpperBoundTokens, 999)
  assert.equal(result.groups[0].ambiguousLedgerStateCount, 1)
  assert.equal(result.summary.completedCount, 0)
  assert.equal(result.summary.failedCount, 0)
  assert.equal(result.summary.unknownUsageCount, 1)
  assert.equal(result.issues.filter((issue) => issue.reason === 'CONFLICTING_DUPLICATE_LEDGER').length, 1)
  assert.equal(JSON.stringify(result.issues).includes(id), false)
})

test('does not let an event choose a group for conflicting ledger identities', () => {
  const id = eventFields.requestId
  const result = aggregateShadowData(parseShadowEvents(shadowLine({
    requestedModel: 'event-model', model: 'event-model', observedModel: 'vendor/event',
    textType: 'CJK', estimatorVersion: 'event-estimator', codePoints: '900',
  })), [
    reservation({ id, model: 'ledger-alpha', charged_tokens: 120 }),
    reservation({ id, model: 'ledger-beta', state: 'FAILED', charged_tokens: 130 }),
  ])

  assert.equal(result.summary.chargedExposureTokens, 0)
  assert.equal(result.summary.ambiguousChargedExposureUpperBoundTokens, 130)
  assert.deepEqual(result.groups.map((group) => ({
    feature: group.feature,
    provider: group.provider,
    stage: group.stage,
    requestedModel: group.requestedModel,
    observedModel: group.observedModel,
    textType: group.textType,
    estimatorVersion: group.estimatorVersion,
    codePointLengthBucket: group.codePointLengthBucket,
    ambiguousChargedExposureUpperBoundTokens: group.ambiguousChargedExposureUpperBoundTokens,
  })), [{
    feature: 'CHAT',
    provider: 'DEEPSEEK',
    stage: 'CHAT_COMPLETION',
    requestedModel: 'UNKNOWN',
    observedModel: 'UNKNOWN',
    textType: 'UNKNOWN',
    estimatorVersion: 'UNKNOWN',
    codePointLengthBucket: 'UNKNOWN',
    ambiguousChargedExposureUpperBoundTokens: 130,
  }])
})

test('marks aggregate token-sum overflow unknown instead of wrapping or reporting zero', () => {
  const result = aggregateShadowData({ events: [], ambiguousIds: new Set(), issues: [] }, [
    reservation({ id: '00000000-0000-4000-8000-000000000021', charged_tokens: Number.MAX_SAFE_INTEGER }),
    reservation({ id: '00000000-0000-4000-8000-000000000022', charged_tokens: 1 }),
  ])
  assert.equal(result.summary.status, 'INCOMPLETE')
  assert.equal(result.summary.chargedExposureTokens, null)
  assert.equal(result.summary.chargedExposureOverflowCount, 1)
  assert.ok(result.issues.some((issue) => issue.reason === 'AGGREGATE_OVERFLOW'))
})

test('reports non-dispatched charged values as incomplete without replacing them with zero', () => {
  const result = aggregateShadowData({ events: [], ambiguousIds: new Set(), issues: [] }, [
    reservation({ state: 'RELEASED', request_dispatched: false, charged_tokens: 5 }),
  ])
  assert.equal(result.summary.chargedExposureTokens, 5)
  assert.equal(result.summary.status, 'INCOMPLETE')
  assert.ok(result.issues.some((issue) => issue.reason === 'NONDISPATCHED_CHARGED'))
})

test('reads the exact ledger CSV projection and rejects additional columns', () => {
  const header = ['id', 'feature', 'stage', 'provider', 'model', 'state', 'estimated_input_tokens', 'reserved_output_tokens', 'actual_input_tokens', 'actual_output_tokens', 'charged_tokens', 'request_dispatched'].join(',')
  const valid = `${header}\n${eventFields.requestId},CHAT,CHAT_COMPLETION,DEEPSEEK,deepseek-chat,COMPLETED,100,40,100,20,120,true`
  const parsed = parseReservationsCsv(valid)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].charged_tokens, 120)
  const rejected = parseReservationsCsv(`${header},prompt\n${valid.split('\n')[1]},body`)
  assert.equal(rejected.rows.length, 0)
  assert.equal(rejected.issues[0].reason, 'INVALID_LEDGER_CSV')
})

test('uses manifest language/script enums and only publishes family/session distinct counts', () => {
  const result = aggregateShadowData(parseShadowEvents(shadowLine()), [reservation()], [manifestEntry()])
  assert.equal(result.groups[0].language, 'en')
  assert.equal(result.groups[0].script, 'LATIN')
  assert.equal(result.groups[0].distinctFamilyCount, 1)
  assert.equal(result.groups[0].distinctSessionCount, 1)
  assert.equal(JSON.stringify(result).includes('synthetic-family-1'), false)
  assert.equal(JSON.stringify(result).includes('synthetic-session-1'), false)
})

test('rejects unsafe manifest categories and never emits family/session identifiers', () => {
  const result = aggregateShadowData(parseShadowEvents(shadowLine()), [reservation()], [manifestEntry({ language: 'http://secret', family: 'token-secret' })])
  assert.equal(result.summary.status, 'INCOMPLETE')
  assert.ok(result.issues.some((issue) => issue.reason === 'INVALID_MANIFEST'))
  assert.equal(JSON.stringify(result).includes('http://secret'), false)
  assert.equal(JSON.stringify(result).includes('token-secret'), false)
})

test('does not use or count manifest rows that cannot join to ledger reservations', () => {
  const result = aggregateShadowData({ events: [], ambiguousIds: new Set(), issues: [] }, [reservation()], [
    manifestEntry({ reservationId: '00000000-0000-4000-8000-000000000041' }),
  ])
  assert.equal(result.summary.distinctFamilyCount, 0)
  assert.equal(result.summary.distinctSessionCount, 0)
  assert.ok(result.issues.some((issue) => issue.reason === 'UNMATCHED_MANIFEST'))
  assert.equal(JSON.stringify(result.issues).includes('synthetic-family-1'), false)
})

test('rejects malformed numbers, negatives, unsafe large integers, NaN and Infinity as fixed issues', () => {
  const parsed = parseShadowEvents([
    shadowLine({ oldEstimate: '-1' }),
    shadowLine({ shadowEstimate: '9007199254740992' }),
    shadowLine({ actualInput: 'NaN' }),
    shadowLine({ actualOutput: 'Infinity' }),
  ].join('\n'))
  assert.equal(parsed.events.length, 0)
  assert.equal(parsed.issues.length, 4)
  assert.ok(parsed.issues.every((issue) => issue.reason === 'INVALID_EVENT'))
  assert.doesNotMatch(JSON.stringify(parsed.issues), /NaN|Infinity|9007199254740992/)
})

test('rejects unknown event and reservation fields without echoing field names or content', () => {
  const parsed = parseShadowEvents(shadowLine() + ' prompt=Bearer secret-value')
  const result = aggregateShadowData(parsed, [{ ...reservation(), prompt: 'private body' }])
  assert.equal(result.summary.status, 'INCOMPLETE')
  assert.equal(JSON.stringify(result.issues).includes('secret-value'), false)
  assert.equal(JSON.stringify(result.issues).includes('private body'), false)
  assert.equal(JSON.stringify(result.issues).includes('prompt'), false)
})

test('CSV serialization prevents formula injection in every emitted string cell', () => {
  const csv = renderGroupsCsv([{
    feature: '=SUM(1,1)', provider: '+provider', requestedModel: '@model', observedModel: '-model',
    observedModelStatus: 'OBSERVED', stage: 'CHAT_COMPLETION', textType: 'LATIN', estimatorVersion: 'v1',
    codePointLengthBucket: '1-256', language: 'en', script: 'LATIN',
  }])
  assert.match(csv, /'=/)
  assert.match(csv, /'\+/)
  assert.match(csv, /'@/)
  assert.match(csv, /'-/)
})

test('CLI writes only to a new output directory and refuses overwrite', async () => {
  await mkdir(tempRoot, { recursive: true })
  const dir = await mkdtemp(path.join(tempRoot, 'auralis-shadow-test-'))
  try {
    const logs = path.join(dir, 'logs.txt')
    const ledger = path.join(dir, 'reservations.json')
    const output = path.join(dir, 'out')
    await Promise.all([
      writeFile(logs, shadowLine(), 'utf8'),
      writeFile(ledger, JSON.stringify([reservation()]), 'utf8'),
    ])
    const env = { ...process.env, TEMP: tempRoot, TMP: tempRoot, TMPDIR: tempRoot }
    const first = spawnSync(process.execPath, [scriptPath, '--logs', logs, '--reservations', ledger, '--out-dir', output], { encoding: 'utf8', env })
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`)
    assert.match(first.stdout, /actual_usage_complete=1\/1 actual_usage_unknown=0 shadow_event_missing=0 shadow_usage_unknown=0/)
    const summary = JSON.parse(await readFile(path.join(output, 'summary.json'), 'utf8'))
    assert.equal(summary.calibration, 'uncalibrated')
    const second = spawnSync(process.execPath, [scriptPath, '--logs', logs, '--reservations', ledger, '--out-dir', output], { encoding: 'utf8', env })
    assert.equal(second.status, 2)
    assert.doesNotMatch(second.stderr, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('CLI persists partial aggregates as INCOMPLETE and exits 2 on unmatched records', async () => {
  await mkdir(tempRoot, { recursive: true })
  const dir = await mkdtemp(path.join(tempRoot, 'auralis-shadow-incomplete-'))
  try {
    const logs = path.join(dir, 'logs.txt')
    const ledger = path.join(dir, 'reservations.json')
    const output = path.join(dir, 'out')
    await Promise.all([
      writeFile(logs, shadowLine(), 'utf8'),
      writeFile(ledger, JSON.stringify([reservation({ id: '00000000-0000-4000-8000-000000000051', charged_tokens: 33 })]), 'utf8'),
    ])
    const env = { ...process.env, TEMP: tempRoot, TMP: tempRoot, TMPDIR: tempRoot }
    const run = spawnSync(process.execPath, [scriptPath, '--logs', logs, '--reservations', ledger, '--out-dir', output], { encoding: 'utf8', env })
    assert.equal(run.status, 2)
    const summary = JSON.parse(await readFile(path.join(output, 'summary.json'), 'utf8'))
    assert.equal(summary.status, 'INCOMPLETE')
    assert.equal(summary.chargedExposureTokens, 33)
    assert.equal(summary.unknownUsageCount, 1)
    assert.match(run.stdout, /actual_usage_complete=1\/1 actual_usage_unknown=0 shadow_event_missing=1 shadow_usage_unknown=0/)
    assert.equal(JSON.stringify(summary).includes('00000000-0000-4000-8000-000000000051'), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
