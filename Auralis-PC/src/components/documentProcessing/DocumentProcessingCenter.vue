<template>
  <section class="processing-center" aria-labelledby="processing-center-title">
    <div class="processing-center-heading">
      <h3 id="processing-center-title">{{ t(messages.title) }}</h3>
      <button type="button" class="processing-refresh" :disabled="store.loading || !store.isRuntimeAvailable" @click="refresh">{{ t(messages.refresh) }}</button>
    </div>
    <div v-if="!store.isRuntimeAvailable" class="processing-empty">{{ t(messages.desktopOnly) }}</div>
    <div v-else-if="!jobs.length && !pausedDraftSourceIds.length && !serverProcessingSources.length" class="processing-empty">{{ t(messages.empty) }}</div>
    <div v-else class="processing-list">
      <article v-for="job in jobs" :key="job.jobId" class="processing-item">
        <div class="processing-item-main">
          <strong :title="sourceName(job.sourceId)">{{ sourceName(job.sourceId) }}</strong>
          <span class="processing-phase">{{ phaseLabel(job.phase) }}</span>
        </div>
        <div class="processing-item-meta">
          <span v-if="viewFor(job).errorDetail" class="processing-error">{{ viewFor(job).errorDetail }}</span>
          <span v-else>{{ viewFor(job).progressLabel || t(job.phase === 'QUEUED' ? messages.preparing : messages.processing) }}</span>
          <div class="processing-actions">
            <button v-if="isRetryable(job.phase)" type="button" @click="retry(job.jobId)">{{ t(job.phase === 'PAUSED_NETWORK' ? messages.continue : messages.retry) }}</button>
            <button v-if="isActive(job.phase)" type="button" class="danger" @click="cancel(job.jobId)">{{ t(messages.cancel) }}</button>
          </div>
        </div>
        <div v-if="viewFor(job).warning" class="processing-warning">{{ viewFor(job).warning }}</div>
        <details v-if="viewFor(job).rows.length" class="processing-diagnostics">
          <summary>{{ t(messages.diagnostics) }}</summary>
          <div v-for="group in groupedRows(viewFor(job).rows)" :key="`${job.jobId}-${group.name}`" class="diagnostic-group">
            <h4 v-if="group.name !== '其他'">{{ group.name }}</h4>
            <dl>
              <template v-for="row in group.rows" :key="`${job.jobId}-${row.label}`">
                <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
              </template>
            </dl>
          </div>
          <button type="button" @click="copyDiagnostics(job)">{{ t(messages[copyFeedback[job.jobId] ?? 'copy']) }}</button>
        </details>
      </article>
      <article v-for="sourceId in pausedDraftSourceIds" :key="`paused-draft-${sourceId}`" class="processing-item">
        <div class="processing-item-main">
          <strong :title="sourceName(sourceId)">{{ sourceName(sourceId) }}</strong>
          <span class="processing-phase">{{ phaseLabel('PAUSED_NETWORK') }}</span>
        </div>
        <div class="processing-item-meta">
          <span>{{ t(messages.pausedNetwork) }}</span>
          <div class="processing-actions">
            <button type="button" @click="resumeDraft(sourceId)">{{ t(messages.continue) }}</button>
          </div>
        </div>
      </article>
      <article v-for="source in serverProcessingSources" :key="source.id" class="processing-item">
        <div class="processing-item-main">
          <strong :title="source.name">{{ source.name }}</strong>
          <span class="processing-phase">{{ sourcePhaseLabel(source.ingestionStatus) }}</span>
        </div>
        <div class="processing-item-meta">
          <span v-if="resumingSourceIds.has(source.id)">{{ resumeProgressLabel(source.id) }}</span>
          <span v-else-if="source.safeErrorDetail || sourceActionErrors[source.id]" class="processing-error">{{ source.safeErrorDetail || sourceActionError(source.id) }}</span>
          <span v-else-if="store.localOcrProgressBySource[source.id]">{{ sourceDetail(source) }}</span>
          <span v-else-if="sourceActionResults[source.id]">{{ t(sourceActionResults[source.id]) }}</span>
          <span v-else>{{ sourceDetail(source) }}</span>
          <div class="processing-actions">
            <button
              v-if="source.ingestionStatus === 'AWAITING_CLIENT'"
              type="button"
              :disabled="resumingSourceIds.has(source.id)"
              @click="resumeSource(source.id)"
            >{{ resumingSourceIds.has(source.id) ? resumeProgressLabel(source.id) : t(messages.start) }}</button>
            <button
              v-else-if="source.ingestionStatus === 'FAILED'"
              type="button"
              :disabled="retryingSourceIds.has(source.id)"
              @click="retrySource(source.id)"
            >
              {{ t(retryingSourceIds.has(source.id) ? messages.retrying : messages.retry) }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { t, type Message } from '@/i18n'
import { useAuthStore } from '@/store/useAuthStore'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'
import { useSourceStore } from '@/store/useSourceStore'
import type { SourceFileModel } from '@/services/domainMappers'
import { resumeActionErrorMessage } from '@/services/documentProcessing/manualSourceResume'
import { sourceDetailLabel, sourcePhaseLabel } from '@/utils/documentProcessingStatus'
import { copyOcrDiagnostics, formatOcrDiagnostics, updateCopyFeedback, type OcrDiagnosticsView } from '@/utils/ocrDiagnostics'

const messages = {
  title: { 'zh-CN': '文件解析进度', en: 'File processing', ja: 'ファイル処理の進捗' },
  refresh: { 'zh-CN': '刷新', en: 'Refresh', ja: '更新' },
  desktopOnly: { 'zh-CN': '文件解析仅可在 Auralis 桌面端运行。请在桌面端打开本文件，解析完成后即可提问。', en: 'Open this file in Auralis Desktop. You can ask questions once parsing finishes.', ja: 'Auralis デスクトップ版でファイルを開くと、解析完了後に質問できます。' },
  empty: { 'zh-CN': '暂无文件解析任务', en: 'No file processing jobs', ja: 'ファイル処理タスクはありません' },
  cancel: { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル' },
  diagnostics: { 'zh-CN': '查看诊断', en: 'View diagnostics', ja: '診断情報を表示' },
  copy: { 'zh-CN': '复制诊断', en: 'Copy diagnostics', ja: '診断情報をコピー' },
  copied: { 'zh-CN': '已复制', en: 'Copied', ja: 'コピーしました' },
  failed: { 'zh-CN': '复制失败', en: 'Copy failed', ja: 'コピーに失敗しました' },
  continue: { 'zh-CN': '继续', en: 'Continue', ja: '続行' },
  start: { 'zh-CN': '开始本机处理', en: 'Start local processing', ja: 'ローカル処理を開始' },
  retrying: { 'zh-CN': '正在重试...', en: 'Retrying…', ja: '再試行中…' },
  retry: { 'zh-CN': '重试', en: 'Retry', ja: '再試行' },
  preparing: { 'zh-CN': '准备中', en: 'Preparing', ja: '準備中' },
  processing: { 'zh-CN': '正在处理', en: 'Processing', ja: '処理中' },
  unnamed: { 'zh-CN': '未命名文件', en: 'Unnamed file', ja: '名前のないファイル' },
  pausedNetwork: { 'zh-CN': '网络恢复后，请点击继续处理。', en: 'Select Continue when your network connection returns.', ja: 'ネットワークの復旧後、「続行」を選択してください。' },
  ocrProgress: { 'zh-CN': '正在识别第 {current}/{total} 页', en: 'Recognizing page {current} of {total}', ja: '{total} ページ中 {current} ページを認識中' },
  starting: { 'zh-CN': '正在启动本机处理…', en: 'Starting local processing…', ja: 'ローカル処理を開始中…' },
  syncing: { 'zh-CN': '正在同步资料…', en: 'Syncing material…', ja: '資料を同期中…' },
  complete: { 'zh-CN': '处理完成', en: 'Processing complete', ja: '処理が完了しました' },
  waitingRevision: { 'zh-CN': '本机处理完成，等待资料版本同步。', en: 'Local processing is complete. Waiting for the material version to sync.', ja: 'ローカル処理が完了しました。資料のバージョン同期を待機中です。' },
  localFailed: { 'zh-CN': '本机处理失败，请重试。', en: 'Local processing failed. Try again.', ja: 'ローカル処理に失敗しました。再試行してください。' },
  serverFailed: { 'zh-CN': '服务端处理失败，请重试。', en: 'Server processing failed. Try again.', ja: 'サーバーでの処理に失敗しました。再試行してください。' },
  sourceMissing: { 'zh-CN': '服务端暂时无法读取这份资料，请刷新后重试。', en: 'The server cannot read this material right now. Refresh and try again.', ja: 'サーバーがこの資料を読み込めません。更新して再試行してください。' },
  sourceDeleted: { 'zh-CN': '这份资料已删除，无法启动处理。', en: 'This material was deleted. Processing cannot start.', ja: '資料が削除されたため、処理を開始できません。' },
  unsupported: { 'zh-CN': '这类资料不支持本机文件解析。', en: 'This material type does not support local parsing.', ja: 'この種類の資料はローカル解析に対応していません。' },
  notReady: { 'zh-CN': '资料尚未准备好，请稍后刷新。', en: 'The material is not ready yet. Refresh in a moment.', ja: '資料の準備ができていません。しばらくしてから更新してください。' },
  notAwaiting: { 'zh-CN': '资料当前不需要本机处理，请刷新状态。', en: 'This material does not currently need local processing. Refresh its status.', ja: '現在、この資料にローカル処理は必要ありません。状態を更新してください。' },
  shaMismatch: { 'zh-CN': '本机资料与服务端版本不一致，请重新同步后重试。', en: 'The local copy and server version differ. Sync again and retry.', ja: 'ローカルとサーバーで資料のバージョンが異なります。再同期してから再試行してください。' },
  shaInvalid: { 'zh-CN': '本机资料校验失败，请重新同步后重试。', en: 'Local material validation failed. Sync again and retry.', ja: 'ローカルの資料を検証できませんでした。再同期してから再試行してください。' },
  cacheOwnerMismatch: { 'zh-CN': '本机处理记录与资料不匹配，无法继续。', en: 'The local processing record does not match this material. Processing cannot continue.', ja: '処理記録が資料と一致しないため、続行できません。' },
  cleanupFailed: { 'zh-CN': '本机处理缓存清理失败，请重试。', en: 'Failed to clear the local processing cache. Try again.', ja: 'ローカルの処理キャッシュを削除できませんでした。再試行してください。' },
  rebuildFailed: { 'zh-CN': '本机处理缓存无法重建，请重试。', en: 'Failed to rebuild the local processing cache. Try again.', ja: 'ローカルの処理キャッシュを再構築できませんでした。再試行してください。' },
  receiptMissing: { 'zh-CN': '本机处理结果暂不可用，请重试。', en: 'Local processing results are temporarily unavailable. Try again.', ja: 'ローカルの処理結果は現在利用できません。再試行してください。' },
  notStarted: { 'zh-CN': '本机处理未启动，请刷新后重试。', en: 'Local processing did not start. Refresh and try again.', ja: 'ローカル処理は開始されませんでした。更新して再試行してください。' },
}

const phaseMessages: Record<string, Message> = {
  QUEUED: { 'zh-CN': '排队中', en: 'Queued', ja: '待機中' },
  DOWNLOADING_SOURCE: { 'zh-CN': '下载文件', en: 'Downloading file', ja: 'ファイルをダウンロード中' },
  EXTRACTING: { 'zh-CN': '解析文本', en: 'Extracting text', ja: 'テキスト抽出中' },
  OCR_RUNNING: { 'zh-CN': 'OCR 识别', en: 'Running OCR', ja: 'OCR 認識中' },
  PACKAGING: { 'zh-CN': '整理结果', en: 'Preparing results', ja: '結果を整理中' },
  UPLOADING: { 'zh-CN': '上传结果', en: 'Uploading results', ja: '結果をアップロード中' },
  SERVER_VALIDATING: { 'zh-CN': '服务端校验', en: 'Server validation', ja: 'サーバーで検証中' },
  SERVER_INDEXING: { 'zh-CN': '建立索引', en: 'Building index', ja: '索引作成中' },
  FAILED_LOCAL: { 'zh-CN': '本地失败', en: 'Local failure', ja: 'ローカルで失敗' },
  FAILED_SERVER: { 'zh-CN': '服务端失败', en: 'Server failure', ja: 'サーバーで失敗' },
  PAUSED_NETWORK: { 'zh-CN': '等待网络', en: 'Waiting for network', ja: 'ネットワーク接続待ち' },
}

const store = useDocumentProcessingStore()
const sourceStore = useSourceStore()
const authStore = useAuthStore()
const pausedDraftSourceIds = computed(() => store.pausedDraftSourceIds)
const sourceRevisions = computed(() => new Map(sourceStore.sources.map((source) => [source.id, source.ingestionRevision])))
const jobs = computed(() => store.jobs.filter((job) => {
  if (job.phase === 'READY' || pausedDraftSourceIds.value.includes(job.sourceId)) return false
  const revision = sourceRevisions.value.get(job.sourceId)
  return !revision || job.ingestionRevision === revision
}))
const serverProcessingSources = computed(() => sourceStore.sources
  .filter((source) => source.type === 'FILE' && source.ingestionStatus && source.ingestionStatus !== 'READY')
  .filter((source) => !jobs.value.some((job) => job.sourceId === source.id) && !pausedDraftSourceIds.value.includes(source.id)))
const sourceActionErrors = ref<Partial<Record<string, string | Message>>>({})
const sourceActionResults = ref<Record<string, Message>>({})
const resumingSourceIds = ref<Set<string>>(new Set())
const resumeStages = ref<Record<string, 'sync' | 'schedule'>>({})
let resumeScopeGeneration = 0
const retryingSourceIds = ref<Set<string>>(new Set())
const copyFeedback = ref<Partial<Record<string, 'copied' | 'failed'>>>({})
const jobViews = computed(() => new Map(store.jobs.map((job) => [job.jobId, formatOcrDiagnostics(job, t)])))
let timer: ReturnType<typeof setInterval> | null = null
let sourcePollTicks = 0

watch(
  () => [authStore.isAuthenticated, authStore.user?.id ?? '', authStore.serverDeviceId ?? '', authStore.sessionId ?? ''],
  () => {
    resumeScopeGeneration += 1
    sourceActionErrors.value = {}
    sourceActionResults.value = {}
    resumingSourceIds.value = new Set()
    resumeStages.value = {}
  },
  { flush: 'sync' },
)

const sourceName = (sourceId: string) => sourceStore.sources.find((source) => source.id === sourceId)?.name || t(messages.unnamed)
const sourceDetail = (source: SourceFileModel): string => {
  const progress = store.localOcrProgressBySource[source.id]
  return progress
    ? t(messages.ocrProgress, { current: progress.currentPage, total: progress.totalPages })
    : sourceDetailLabel(source.ingestionStatus)
}
const sourceActionError = (sourceId: string) => {
  const error = sourceActionErrors.value[sourceId]
  return typeof error === 'string' || error === undefined ? error : t(error)
}
const phaseLabel = (phase: string) => phaseMessages[phase] ? t(phaseMessages[phase]) : phase
const isActive = (phase: string) => !['READY', 'FAILED_LOCAL', 'FAILED_SERVER'].includes(phase)
const isRetryable = (phase: string) => ['FAILED_LOCAL', 'FAILED_SERVER', 'PAUSED_NETWORK'].includes(phase)
const viewFor = (job: typeof jobs.value[number]): OcrDiagnosticsView => jobViews.value.get(job.jobId) || formatOcrDiagnostics(job, t)
const groupedRows = (rows: OcrDiagnosticsView['rows']) => {
  const groups: { name: string; rows: OcrDiagnosticsView['rows'] }[] = []
  const groupMap = new Map<string, OcrDiagnosticsView['rows']>()
  for (const row of rows) {
    const groupName = row.group || '其他'
    if (!groupMap.has(groupName)) {
      const arr: OcrDiagnosticsView['rows'] = []
      groupMap.set(groupName, arr)
      groups.push({ name: groupName, rows: arr })
    }
    groupMap.get(groupName)!.push(row)
  }
  return groups
}
const copyDiagnostics = async (job: typeof jobs.value[number]) => {
  const status = await copyOcrDiagnostics(formatOcrDiagnostics(job).clipboardText)
  copyFeedback.value = updateCopyFeedback(copyFeedback.value, job.jobId, status)
}
const refreshSources = async () => { await sourceStore.loadSources().catch(() => undefined) }
const resumeProgressLabel = (sourceId: string) => resumeStages.value[sourceId] === 'schedule'
  ? t(messages.starting)
  : t(messages.syncing)
const resumeResultMessage = (result: { status?: string; reason?: string }): Message => {
  if (result.status === 'READY' || result.status === 'LOCAL_READY' || result.reason === 'ALREADY_READY') return messages.complete
  if (result.status === 'WAITING_SERVER_REVISION') return messages.waitingRevision
  if (result.status === 'PAUSED_NETWORK') return messages.pausedNetwork
  if (result.status === 'FAILED_LOCAL') return messages.localFailed
  if (result.status === 'FAILED_SERVER') return messages.serverFailed
  if (result.reason === 'SOURCE_NOT_FOUND') return messages.sourceMissing
  if (result.reason === 'SOURCE_DELETED') return messages.sourceDeleted
  if (result.reason === 'NON_FILE_SOURCE') return messages.unsupported
  if (result.reason === 'FILE_SOURCE_NOT_READY_FOR_CLIENT') return messages.notReady
  if (result.reason === 'SOURCE_NOT_AWAITING_CLIENT') return messages.notAwaiting
  if (result.reason === 'SOURCE_ASSET_SHA_MISMATCH') return messages.shaMismatch
  if (result.reason === 'SOURCE_ASSET_SHA_INVALID') return messages.shaInvalid
  if (result.reason === 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH') return messages.cacheOwnerMismatch
  if (result.reason === 'DOCUMENT_CACHE_CLEANUP_FAILED') return messages.cleanupFailed
  if (result.reason === 'DOCUMENT_LEGACY_CACHE_REBUILD_FAILED') return messages.rebuildFailed
  if (result.reason === 'DOCUMENT_CACHE_RECEIPT_UNAVAILABLE') return messages.receiptMissing
  return messages.notStarted
}
const refresh = async () => {
  await Promise.all([store.refresh().catch(() => undefined), refreshSources()])
}
const retry = async (jobId: string) => { await store.retry(jobId).catch(() => undefined); await refresh() }
const resumeDraft = async (sourceId: string) => { await store.resumePausedDraft(sourceId).catch(() => undefined); await refresh() }
const cancel = async (jobId: string) => { await store.cancel(jobId).catch(() => undefined); await refresh() }
const resumeSource = async (sourceId: string) => {
  if (resumingSourceIds.value.has(sourceId)) return
  const scopeGeneration = resumeScopeGeneration
  const userId = authStore.user?.id
  const serverDeviceId = authStore.serverDeviceId
  const sessionId = authStore.sessionId
  const authenticated = authStore.isAuthenticated
  const isCurrentAction = () => scopeGeneration === resumeScopeGeneration
    && authStore.isAuthenticated === authenticated
    && authStore.user?.id === userId
    && authStore.serverDeviceId === serverDeviceId
    && authStore.sessionId === sessionId
  const { [sourceId]: _ignored, ...remaining } = sourceActionErrors.value
  sourceActionErrors.value = remaining
  const { [sourceId]: _oldResult, ...remainingResults } = sourceActionResults.value
  sourceActionResults.value = remainingResults
  resumingSourceIds.value = new Set(resumingSourceIds.value).add(sourceId)
  resumeStages.value = { ...resumeStages.value, [sourceId]: 'sync' }
  try {
    const result = await sourceStore.resumeDocumentProcessing(sourceId, (stage) => {
      if (!isCurrentAction()) return
      resumeStages.value = { ...resumeStages.value, [sourceId]: stage }
    })
    if (isCurrentAction()) {
      sourceActionResults.value = { ...sourceActionResults.value, [sourceId]: resumeResultMessage(result) }
    }
  } catch (error) {
    if (isCurrentAction()) {
      const stage = resumeStages.value[sourceId] ?? 'sync'
      sourceActionErrors.value = {
        ...sourceActionErrors.value,
        [sourceId]: resumeActionErrorMessage(error, stage),
      }
    }
  } finally {
    if (isCurrentAction()) {
      const pending = new Set(resumingSourceIds.value)
      pending.delete(sourceId)
      resumingSourceIds.value = pending
      const { [sourceId]: _stage, ...remainingStages } = resumeStages.value
      resumeStages.value = remainingStages
      await refresh()
    }
  }
}
const retrySource = async (sourceId: string) => {
  const { [sourceId]: _ignored, ...remaining } = sourceActionErrors.value
  sourceActionErrors.value = remaining
  retryingSourceIds.value = new Set(retryingSourceIds.value).add(sourceId)
  try {
    await sourceStore.retrySourceProcessing(sourceId)
  } catch (error) {
    sourceActionErrors.value = {
      ...sourceActionErrors.value,
      [sourceId]: error instanceof Error ? error.message : String(error),
    }
  } finally {
    const next = new Set(retryingSourceIds.value)
    next.delete(sourceId)
    retryingSourceIds.value = next
    await refresh()
  }
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => {
    void store.refresh().catch(() => undefined)
    if (serverProcessingSources.value.length && ++sourcePollTicks % 4 === 0) void refreshSources()
  }, 1500)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.processing-center { box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; padding: 20px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-card, rgba(255,255,255,.45)); }
.processing-center-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-width: 0; }
.processing-center h3 { margin: 0; font-size: 16px; color: var(--text-primary); }
.processing-refresh, .processing-actions button { border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.1)); border-radius: 9999px; padding: 4px 10px; background: var(--color-bg-card, #ffffff); color: var(--text-secondary); cursor: pointer; font-size: 11.5px; font-weight: 500; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); white-space: nowrap; flex-shrink: 0; }
.processing-refresh:hover:not(:disabled), .processing-actions button:hover:not(:disabled) { border-color: var(--color-zen-sage, #8b9a6e); color: var(--text-primary); transform: translateY(-0.5px); }
.processing-empty { padding: 20px 0 4px; color: var(--text-muted); font-size: 13px; }
.processing-list { display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; min-width: 0; gap: 10px; margin-top: 16px; }
.processing-item { box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; padding: 12px 14px; border-radius: 12px; background: var(--color-bg-primary, #FAF7F2); border: 0.5px solid var(--border-subtle, rgba(0, 0, 0, 0.06)); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); transition: background 0.3s ease, border-color 0.3s ease; }
.processing-item-main, .processing-item-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; width: 100%; }
.processing-item-main strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-size: 13px; }
.processing-phase { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; white-space: nowrap; flex-shrink: 0; background: rgba(217, 119, 6, 0.08); color: #B45309; border: 0.5px solid rgba(217, 119, 6, 0.22); }
.processing-item-meta { margin-top: 7px; color: var(--text-muted); font-size: 11px; }
.processing-item-meta > span, .processing-error { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.processing-error { color: #dc2626; }
.processing-actions { display: flex; gap: 6px; flex-shrink: 0; }
.processing-actions button.danger { color: #b4534d; }
.processing-warning { margin-top: 8px; color: #9b742e; font-size: 11px; }
.processing-diagnostics { margin-top: 10px; padding-top: 8px; border-top: 0.5px dashed var(--border-subtle, rgba(0, 0, 0, 0.08)); color: var(--text-secondary); font-size: 11px; max-height: 220px; overflow-y: auto; overflow-x: hidden; min-width: 0; max-width: 100%; scrollbar-width: thin; }
.processing-diagnostics summary { cursor: pointer; color: var(--text-secondary); margin-bottom: 4px; }
.diagnostic-group h4 { margin: 8px 0 4px 0; color: #9b742e; font-size: 11px; font-weight: 500; }
.diagnostic-group dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 4px 0 8px 0; }
.diagnostic-group dt { color: var(--text-muted); }
.diagnostic-group dd { margin: 0; color: var(--text-primary); overflow-wrap: anywhere; }
.processing-diagnostics > button { margin-top: 4px; border: 1px solid var(--border-subtle); border-radius: 9999px; padding: 3px 8px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 11px; }

html.dark .processing-item {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(163, 177, 155, 0.14);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
html.dark .processing-phase {
  background: rgba(245, 158, 11, 0.14);
  color: #FBBF24;
  border-color: rgba(245, 158, 11, 0.28);
}
html.dark .processing-refresh,
html.dark .processing-actions button {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--text-secondary, #A3B899);
}
html.dark .processing-refresh:hover:not(:disabled),
html.dark .processing-actions button:hover:not(:disabled) {
  border-color: var(--color-zen-sage, #8b9a6e);
  color: #ffffff;
}
html.dark .processing-error,
html.dark .processing-actions button.danger {
  color: #F87171;
  border-color: rgba(248, 113, 113, 0.28);
}
html.dark .processing-warning,
html.dark .diagnostic-group h4 {
  color: #FBBF24;
}
html.dark .processing-diagnostics {
  border-top-color: rgba(255, 255, 255, 0.08);
}
html.dark .diagnostic-group dd {
  color: rgba(255, 255, 255, 0.88);
}
</style>
