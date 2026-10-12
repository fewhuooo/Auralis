import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from '../Auralis-Mobile/node_modules/typescript/lib/typescript.js'

import {
  isAiQuotaError,
  formatAiQuotaMessage,
  parseRetryAfter,
  formatRetrySuffix,
  validateQuotaInfo,
  validateAiUsage,
} from '../Auralis-PC/src/services/aiUsageGuardHelper.ts'
import { classifyClientError } from '../Auralis-PC/src/services/clientErrorPolicy.ts'
import { parseProblemDetails, ApiProblemError } from '../Auralis-Mobile/src/api/protocol.ts'
import { createSseDecoder } from '../Auralis-Mobile/src/api/sse.ts'
import { createRequestExecutor } from '../Auralis-Mobile/src/api/requestCore.ts'
import { validateAiUsage as validateMobileAiUsage } from '../Auralis-Mobile/src/utils/aiUsageGuardHelper.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cases = [
  ['AI_REQUEST_BUDGET_EXCEEDED', 413, '请求超出单次计算预算'],
  ['AI_TASK_BUDGET_EXCEEDED', 422, '任务超出执行预算'],
  ['AI_CONCURRENCY_LIMIT', 429, '并行请求已达上限'],
  ['AI_HOURLY_QUOTA_EXCEEDED', 429, '每小时 AI 使用额度'],
  ['AI_DAILY_QUOTA_EXCEEDED', 429, '每日 AI 使用额度'],
  ['AI_GLOBAL_QUOTA_EXCEEDED', 503, '系统 AI 资源当前繁忙'],
]

async function loadProductionGetAiUsage(dependencies) {
  const source = await readFile(path.join(__dirname, '../Auralis-Mobile/src/api/aiClient.ts'), 'utf8')
  const sourceFile = ts.createSourceFile('aiClient.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declaration = sourceFile.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'getAiUsage')
  assert.ok(declaration, 'getAiUsage must remain an exported function in the production AI client')
  const transpiled = ts.transpile(declaration.getText(sourceFile).replace(/^export\s+/, ''), { target: ts.ScriptTarget.ES2022 })
  return runInNewContext(`${transpiled}; getAiUsage`, dependencies)
}

function usageFixture() {
  const quota = { limitTokens: 100, chargedTokens: 20, reservedTokens: 5, remainingTokens: 75, resetAt: '2026-10-11T06:30:00Z' }
  return { hourly: quota, daily: quota }
}

test('HTTP Problem Details map all six AI quota errors to safe messages and retain wait metadata', () => {
  for (const [code, status, message] of cases) {
    const error = { problem: { code, status, detail: 'raw provider response: secret-token', retryAfterSeconds: 27, resetAt: '2026-10-11T06:30:00Z' } }
    const mapped = classifyClientError(error, 'CHAT')
    assert.equal(mapped.code, code)
    assert.equal(mapped.retryAfterSeconds, 27)
    assert.equal(mapped.resetAt, '2026-10-11T06:30:00Z')
    assert.match(mapped.message, new RegExp(message))
    assert.match(mapped.message, /27 秒后重试/)
    assert.doesNotMatch(mapped.message, /secret-token|raw provider/)
    assert.doesNotMatch(mapped.detail, /secret-token|raw provider/)
  }
})

test('Mobile HTTP Problem Details do not expose provider detail for quota errors', () => {
  for (const [code, status, message] of cases) {
    const parsed = parseProblemDetails({ code, status, title: '限额错误', detail: 'raw provider response: secret-token', retryAfterSeconds: 27, resetAt: '2026-10-11T06:30:00Z' })
    const error = new ApiProblemError(parsed)
    assert.equal(parsed.code, code)
    assert.equal(parsed.retryAfterSeconds, 27)
    assert.equal(parsed.resetAt, '2026-10-11T06:30:00Z')
    assert.match(error.message, new RegExp(message))
    assert.match(error.message, /27 秒后重试/)
    assert.doesNotMatch(error.message, /secret-token|raw provider/)
  }
})

test('getAiUsage retries once through the authenticated executor after access-token refresh', async () => {
  const calls = []
  let accessToken = 'expired-access'
  let refreshCalls = 0
  let unauthenticatedCalls = 0
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      calls.push(options)
      options.success(calls.length === 1
        ? { statusCode: 401, data: { title: 'Unauthorized', status: 401 } }
        : { statusCode: 200, data: usageFixture() })
    },
    getAccessToken: () => accessToken,
    refreshAccessToken: async () => {
      refreshCalls += 1
      accessToken = 'fresh-access'
      return true
    },
    onUnauthenticated: () => { unauthenticatedCalls += 1 },
  })
  const getAiUsage = await loadProductionGetAiUsage({
    mobileRequest: { get: (url) => execute({ url, method: 'GET' }) },
    validateAiUsage: validateMobileAiUsage,
    getRuntimeConfig: () => ({ apiBaseUrl: 'https://api.auralis.test' }),
    useAuthStore: () => ({ token: accessToken }),
    uni: { request: (options) => options.success({ statusCode: 401, data: { title: 'Unauthorized', status: 401 } }) },
    ApiProblemError,
    parseProblemDetails,
  })

  assert.deepEqual(await getAiUsage(), usageFixture())
  assert.equal(calls.length, 2)
  assert.equal(calls[0].header.Authorization, 'Bearer expired-access')
  assert.equal(calls[1].header.Authorization, 'Bearer fresh-access')
  assert.equal(refreshCalls, 1)
  assert.equal(unauthenticatedCalls, 0)
})

test('getAiUsage reports session failure once when access-token refresh fails', async () => {
  const calls = []
  let refreshCalls = 0
  let unauthenticatedCalls = 0
  const execute = createRequestExecutor({
    apiBaseUrl: 'https://api.auralis.test',
    request(options) {
      calls.push(options)
      options.success({ statusCode: 401, data: { title: 'Unauthorized', status: 401 } })
    },
    getAccessToken: () => 'expired-access',
    refreshAccessToken: async () => {
      refreshCalls += 1
      return false
    },
    onUnauthenticated: () => { unauthenticatedCalls += 1 },
  })
  const getAiUsage = await loadProductionGetAiUsage({
    mobileRequest: { get: (url) => execute({ url, method: 'GET' }) },
    validateAiUsage: validateMobileAiUsage,
    getRuntimeConfig: () => ({ apiBaseUrl: 'https://api.auralis.test' }),
    useAuthStore: () => ({ token: 'expired-access' }),
    uni: { request: (options) => options.success({ statusCode: 401, data: { title: 'Unauthorized', status: 401 } }) },
    ApiProblemError,
    parseProblemDetails,
  })

  await assert.rejects(getAiUsage(), (error) => error instanceof ApiProblemError && error.status === 401)
  assert.equal(calls.length, 1)
  assert.equal(refreshCalls, 1)
  assert.equal(unauthenticatedCalls, 1)
})

test('SSE message.error preserves retry/reset fields while keeping quota details safe', () => {
  for (const [code, status, message] of cases) {
    let event
    const decoder = createSseDecoder((value) => { event = value })
    decoder.push(`event: message.error\ndata: ${JSON.stringify({ code, message: 'raw provider response: secret-token', detail: 'raw provider response: secret-token', retryAfterSeconds: 27, resetAt: '2026-10-11T06:30:00Z' })}\n\n`)
    decoder.finish()
    assert.equal(event.event, 'message.error')
    const data = event.data
    const problem = parseProblemDetails({ ...data, status, title: 'Quota exceeded', detail: data.detail || data.message })
    const error = new ApiProblemError(problem)
    assert.equal(problem.code, code)
    assert.equal(problem.retryAfterSeconds, 27)
    assert.equal(problem.resetAt, '2026-10-11T06:30:00Z')
    assert.match(error.message, new RegExp(message))
    assert.match(error.message, /27 秒后重试/)
    assert.doesNotMatch(error.message, /secret-token|raw provider/)
  }
})

test('A late Profile response cannot overwrite a newer account/request', async () => {
  let current = { generation: 2, account: 'user-b:token-b' }
  let usage = { remainingTokens: 800 }
  let resolveOld
  const oldRequest = new Promise((resolve) => { resolveOld = resolve })
  const oldTicket = { generation: 1, account: 'user-a:token-a' }
  const newerRequest = Promise.resolve({ remainingTokens: 800 })
  usage = await newerRequest
  resolveOld({ remainingTokens: 50 })
  const oldResult = await oldRequest
  const { isCurrentUsageRequest } = await import('../Auralis-PC/src/services/aiUsageGuardHelper.ts')
  if (isCurrentUsageRequest(oldTicket.generation, current.generation, oldTicket.account, current.account)) usage = oldResult
  assert.deepEqual(usage, { remainingTokens: 800 })
  const mobile = await import('../Auralis-Mobile/src/utils/aiUsageGuardHelper.ts')
  assert.equal(mobile.isCurrentUsageRequest(oldTicket.generation, current.generation, oldTicket.account, current.account), false)
})

test('Quota error helpers and retry/reset parsing stay bounded', () => {
  for (const [code] of cases) {
    assert.ok(isAiQuotaError(code))
    assert.notEqual(formatAiQuotaMessage(code), 'AI 请求失败')
  }
  assert.equal(isAiQuotaError('OTHER_ERROR'), false)
  assert.equal(parseRetryAfter(30), 30)
  assert.equal(parseRetryAfter('60'), 60)
  assert.equal(parseRetryAfter(-1), undefined)
  assert.equal(parseRetryAfter('1e9'), undefined)
  assert.equal(formatRetrySuffix(undefined, 'invalid date'), '')
  assert.throws(() => validateQuotaInfo({ limitTokens: undefined }))
  assert.throws(() => validateAiUsage({ hourly: {}, daily: {} }))
})

test('PC and Mobile/Tablet Profile consumers use fenced usage loading and show reserved usage as estimated', async () => {
  const read = (relative) => readFile(path.join(__dirname, relative), 'utf8')
  const [pc, mobile, tablet, composable] = await Promise.all([
    read('../Auralis-PC/src/views/Profile/index.vue'),
    read('../Auralis-Mobile/src/pages/mobile/profile/index.vue'),
    read('../Auralis-Mobile/src/pages/tablet/profile/index.vue'),
    read('../Auralis-Mobile/src/utils/useAiUsage.ts'),
  ])
  assert.match(pc, /isCurrentUsageRequest/)
  assert.match(mobile, /useAiUsage/)
  assert.match(tablet, /useAiUsage/)
  assert.match(composable, /isCurrentUsageRequest/)
  for (const content of [pc, mobile, tablet]) {
    assert.match(content, /在途预留为估算值/)
    assert.match(content, /重试|刷新/)
  }
})
