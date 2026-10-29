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

export function resumeActionErrorLabel(error: unknown, stage: ManualSourceResumeStage): string {
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
    || status === 401 || status === 403) return '登录状态已失效，请重新登录后重试。'
  if (stableCode === 'DOCUMENT_JOB_RUNNER_UNAVAILABLE') return '桌面处理服务暂不可用，请稍后重试。'
  if (stableCode === 'DOCUMENT_PROCESSING_SCOPE_CHANGED') return '登录或设备状态已变化，请重新尝试本机处理。'
  if (stableCode === 'SOURCE_SYNC_CONFLICT' || status === 409) return '资料同步发生版本冲突，请刷新后重试。'
  if (stableCode === 'SOURCE_SYNC_FAILED') return '资料登记同步失败，请检查网络后重试。'
  if (stableCode === 'SOURCE_NOT_SYNCED') return '资料尚未同步到服务端，请稍后再试。'
  if (stableCode === 'NETWORK_OFFLINE' || stableCode === 'ERR_NETWORK'
    || /network error|failed to fetch|fetch failed|offline/i.test(message)) return '网络暂不可用，恢复后可再次处理。'
  if (['ECONNABORTED', 'ETIMEDOUT', 'TIMEOUT'].includes(stableCode) || /timeout|timed out/i.test(message)) {
    return '请求超时，请稍后重试。'
  }
  if (status === 404) return '服务端暂时无法读取这份资料，请刷新后重试。'
  if (status === 429) return '服务请求过于频繁，请稍后重试。'
  if (status !== undefined && status >= 500) return '服务暂时不可用，请稍后重试。'
  return stage === 'sync' ? '资料同步暂未完成，请稍后重试。' : '本机处理暂未启动，请刷新后重试。'
}
