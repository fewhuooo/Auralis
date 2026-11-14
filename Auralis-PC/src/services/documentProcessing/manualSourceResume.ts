import type { Message } from '../../i18n.ts'

export type ManualSourceResumeStage = 'sync' | 'schedule'

interface ManualSourceResumeOptions<Source, Result> {
  isScopeCurrent: () => boolean
  flushSync: () => Promise<void>
  readLocalSource: () => Promise<Source | null>
  assertSourceSynced: (source: Source | null) => void
  schedule: () => Promise<Result>
  onProgress?: (stage: ManualSourceResumeStage) => void
}

export async function runManualSourceResume<Source, Result>(
  options: ManualSourceResumeOptions<Source, Result>,
): Promise<Result> {
  const assertCurrentScope = () => {
    if (!options.isScopeCurrent()) throw new Error('DOCUMENT_PROCESSING_SCOPE_CHANGED')
  }

  options.onProgress?.('sync')
  await options.flushSync()
  assertCurrentScope()

  const source = await options.readLocalSource()
  assertCurrentScope()
  options.assertSourceSynced(source)

  options.onProgress?.('schedule')
  assertCurrentScope()
  return options.schedule()
}

const resumeErrors = {
  auth: { 'zh-CN': '登录状态已失效，请重新登录后重试。', en: 'Your session has expired. Sign in and try again.', ja: 'ログインの有効期限が切れました。再ログインしてから再試行してください。' },
  unavailable: { 'zh-CN': '桌面处理服务暂不可用，请稍后重试。', en: 'Desktop processing is temporarily unavailable. Try again later.', ja: 'デスクトップ処理サービスは現在利用できません。しばらくしてから再試行してください。' },
  scopeChanged: { 'zh-CN': '登录或设备状态已变化，请重新尝试本机处理。', en: 'The session or device changed. Try local processing again.', ja: 'ログインまたは端末の状態が変わりました。ローカル処理をもう一度実行してください。' },
  conflict: { 'zh-CN': '资料同步发生版本冲突，请刷新后重试。', en: 'There is a material version conflict. Refresh and try again.', ja: '資料のバージョンが競合しました。更新して再試行してください。' },
  syncFailed: { 'zh-CN': '资料登记同步失败，请检查网络后重试。', en: 'Failed to sync the material. Check your connection and try again.', ja: '資料の同期に失敗しました。接続を確認して再試行してください。' },
  notSynced: { 'zh-CN': '资料尚未同步到服务端，请稍后再试。', en: 'The material has not synced to the server. Try again later.', ja: '資料がサーバーに同期されていません。しばらくしてから再試行してください。' },
  offline: { 'zh-CN': '网络暂不可用，恢复后可再次处理。', en: 'The network is unavailable. Try again once you reconnect.', ja: 'ネットワークに接続できません。接続が復旧してから再試行してください。' },
  timeout: { 'zh-CN': '请求超时，请稍后重试。', en: 'The request timed out. Try again later.', ja: 'リクエストがタイムアウトしました。しばらくしてから再試行してください。' },
  missing: { 'zh-CN': '服务端暂时无法读取这份资料，请刷新后重试。', en: 'The server cannot read this material right now. Refresh and try again.', ja: 'サーバーがこの資料を読み込めません。更新して再試行してください。' },
  rateLimit: { 'zh-CN': '服务请求过于频繁，请稍后重试。', en: 'Too many requests. Try again later.', ja: 'リクエストが多すぎます。しばらくしてから再試行してください。' },
  serviceUnavailable: { 'zh-CN': '服务暂时不可用，请稍后重试。', en: 'The service is temporarily unavailable. Try again later.', ja: 'サービスは現在利用できません。しばらくしてから再試行してください。' },
  syncIncomplete: { 'zh-CN': '资料同步暂未完成，请稍后重试。', en: 'The material has not finished syncing. Try again later.', ja: '資料の同期が完了していません。しばらくしてから再試行してください。' },
  scheduleIncomplete: { 'zh-CN': '本机处理暂未启动，请刷新后重试。', en: 'Local processing has not started. Refresh and try again.', ja: 'ローカル処理がまだ開始されていません。更新して再試行してください。' },
}

export function resumeActionErrorMessage(error: unknown, stage: ManualSourceResumeStage): Message {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const problem = candidate.problem && typeof candidate.problem === 'object'
    ? candidate.problem as Record<string, unknown>
    : undefined
  const response = candidate.response && typeof candidate.response === 'object'
    ? candidate.response as Record<string, unknown>
    : undefined
  const statusValue = problem?.status ?? candidate.status ?? response?.status
  const status = typeof statusValue === 'number' ? statusValue : undefined
  const code = typeof candidate.code === 'string'
    ? candidate.code
    : typeof problem?.code === 'string' ? problem.code : ''
  const message = error instanceof Error ? error.message : ''
  const stableCode = code || message

  if (['AUTHENTICATION_REQUIRED', 'AUTH_REQUIRED', 'SYNC_SCOPE_CHANGED'].includes(stableCode)
    || status === 401 || status === 403) return resumeErrors.auth
  if (stableCode === 'DOCUMENT_JOB_RUNNER_UNAVAILABLE') return resumeErrors.unavailable
  if (stableCode === 'DOCUMENT_PROCESSING_SCOPE_CHANGED') return resumeErrors.scopeChanged
  if (stableCode === 'SOURCE_SYNC_CONFLICT' || status === 409) return resumeErrors.conflict
  if (stableCode === 'SOURCE_SYNC_FAILED') return resumeErrors.syncFailed
  if (stableCode === 'SOURCE_NOT_SYNCED') return resumeErrors.notSynced
  if (stableCode === 'NETWORK_OFFLINE' || stableCode === 'ERR_NETWORK'
    || /network error|failed to fetch|fetch failed|offline/i.test(message)) return resumeErrors.offline
  if (['ECONNABORTED', 'ETIMEDOUT', 'TIMEOUT'].includes(stableCode) || /timeout|timed out/i.test(message)) {
    return resumeErrors.timeout
  }
  if (status === 404) return resumeErrors.missing
  if (status === 429) return resumeErrors.rateLimit
  if (status !== undefined && status >= 500) return resumeErrors.serviceUnavailable
  return stage === 'sync' ? resumeErrors.syncIncomplete : resumeErrors.scheduleIncomplete
}
