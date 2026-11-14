<template>
  <section class="processing-center" aria-labelledby="processing-center-title">
    <div class="processing-center-heading">
      <h3 id="processing-center-title">文件解析进度</h3>
      <button type="button" class="processing-refresh" :disabled="store.loading || !store.isRuntimeAvailable" @click="refresh">刷新</button>
    </div>
    <div v-if="!store.isRuntimeAvailable" class="processing-empty">文件解析仅可在 Auralis 桌面端运行。请在桌面端打开本文件，解析完成后即可提问。</div>
    <div v-else-if="!jobs.length && !pausedDraftSourceIds.length && !serverProcessingSources.length" class="processing-empty">暂无文件解析任务</div>
    <div v-else class="processing-list">
      <article v-for="job in jobs" :key="job.jobId" class="processing-item">
        <div class="processing-item-main">
          <strong :title="sourceName(job.sourceId)">{{ sourceName(job.sourceId) }}</strong>
          <span class="processing-phase">{{ phaseLabel(job.phase) }}</span>
        </div>
        <div class="processing-item-meta">
          <span v-if="viewFor(job).errorDetail" class="processing-error">{{ viewFor(job).errorDetail }}</span>
          <span v-else>{{ viewFor(job).progressLabel || (job.phase === 'QUEUED' ? '准备中' : '正在处理') }}</span>
          <div class="processing-actions">
            <button v-if="isRetryable(job.phase)" type="button" @click="retry(job.jobId)">{{ job.phase === 'PAUSED_NETWORK' ? '继续' : '重试' }}</button>
            <button v-if="isActive(job.phase)" type="button" class="danger" @click="cancel(job.jobId)">取消</button>
          </div>
        </div>
        <div v-if="viewFor(job).warning" class="processing-warning">{{ viewFor(job).warning }}</div>
        <details v-if="viewFor(job).rows.length" class="processing-diagnostics">
          <summary>查看诊断</summary>
          <div v-for="group in groupedRows(viewFor(job).rows)" :key="`${job.jobId}-${group.name}`" class="diagnostic-group">
            <h4 v-if="group.name !== '其他'">{{ group.name }}</h4>
            <dl>
              <template v-for="row in group.rows" :key="`${job.jobId}-${row.label}`">
                <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
              </template>
            </dl>
          </div>
          <button type="button" @click="copyDiagnostics(job.jobId, viewFor(job).clipboardText)">{{ copyFeedback[job.jobId] || '复制诊断' }}</button>
        </details>
      </article>
      <article v-for="sourceId in pausedDraftSourceIds" :key="`paused-draft-${sourceId}`" class="processing-item">
        <div class="processing-item-main">
          <strong :title="sourceName(sourceId)">{{ sourceName(sourceId) }}</strong>
          <span class="processing-phase">{{ phaseLabel('PAUSED_NETWORK') }}</span>
        </div>
        <div class="processing-item-meta">
          <span>{{ pausedNetworkDetail }}</span>
          <div class="processing-actions">
            <button type="button" @click="resumeDraft(sourceId)">继续</button>
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
          <span v-else-if="source.safeErrorDetail || sourceActionErrors[source.id]" class="processing-error">{{ source.safeErrorDetail || sourceActionErrors[source.id] }}</span>
          <span v-else-if="store.localOcrProgressBySource[source.id]">{{ sourceDetail(source) }}</span>
          <span v-else-if="sourceActionResults[source.id]">{{ sourceActionResults[source.id] }}</span>
          <span v-else>{{ sourceDetail(source) }}</span>
          <div class="processing-actions">
            <button
              v-if="source.ingestionStatus === 'AWAITING_CLIENT'"
              type="button"
              :disabled="resumingSourceIds.has(source.id)"
              @click="resumeSource(source.id)"
            >{{ resumingSourceIds.has(source.id) ? resumeProgressLabel(source.id) : '开始本机处理' }}</button>
            <button
              v-else-if="source.ingestionStatus === 'FAILED'"
              type="button"
              :disabled="retryingSourceIds.has(source.id)"
              @click="retrySource(source.id)"
            >
              {{ retryingSourceIds.has(source.id) ? '正在重试...' : '重试' }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/store/useAuthStore'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'
import { useSourceStore } from '@/store/useSourceStore'
import type { SourceFileModel } from '@/services/domainMappers'
import { resumeActionErrorLabel } from '@/services/documentProcessing/manualSourceResume'
import { sourceDetailLabel, sourcePhaseLabel } from '@/utils/documentProcessingStatus'
import { copyOcrDiagnostics, formatOcrDiagnostics, updateCopyFeedback, type OcrDiagnosticsView } from '@/utils/ocrDiagnostics'

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
const pausedNetworkDetail = '网络恢复后，请点击继续处理。'
const sourceActionErrors = ref<Record<string, string>>({})
const sourceActionResults = ref<Record<string, string>>({})
const resumingSourceIds = ref<Set<string>>(new Set())
const resumeStages = ref<Record<string, 'sync' | 'schedule'>>({})
let resumeScopeGeneration = 0
const retryingSourceIds = ref<Set<string>>(new Set())
const copyFeedback = ref<Record<string, string>>({})
const jobViews = computed(() => new Map(store.jobs.map((job) => [job.jobId, formatOcrDiagnostics(job)])))
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

const sourceName = (sourceId: string) => sourceStore.sources.find((source) => source.id === sourceId)?.name || '未命名文件'
const sourceDetail = (source: SourceFileModel): string => {
  const progress = store.localOcrProgressBySource[source.id]
  return progress
    ? `正在识别第 ${progress.currentPage}/${progress.totalPages} 页`
    : sourceDetailLabel(source.ingestionStatus)
}
const phaseLabel = (phase: string) => ({
  QUEUED: '排队中', DOWNLOADING_SOURCE: '下载文件', EXTRACTING: '解析文本', OCR_RUNNING: 'OCR 识别',
  PACKAGING: '整理结果', UPLOADING: '上传结果', SERVER_VALIDATING: '服务端校验', SERVER_INDEXING: '建立索引',
  FAILED_LOCAL: '本地失败', FAILED_SERVER: '服务端失败', PAUSED_NETWORK: '等待网络',
}[phase] || phase)
const isActive = (phase: string) => !['READY', 'FAILED_LOCAL', 'FAILED_SERVER'].includes(phase)
const isRetryable = (phase: string) => ['FAILED_LOCAL', 'FAILED_SERVER', 'PAUSED_NETWORK'].includes(phase)
const viewFor = (job: typeof jobs.value[number]): OcrDiagnosticsView => jobViews.value.get(job.jobId) || formatOcrDiagnostics(job)
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
const copyDiagnostics = async (jobId: string, text: string) => {
  copyFeedback.value = updateCopyFeedback(copyFeedback.value, jobId, await copyOcrDiagnostics(text))
}
const refreshSources = async () => { await sourceStore.loadSources().catch(() => undefined) }
const resumeProgressLabel = (sourceId: string) => resumeStages.value[sourceId] === 'schedule'
  ? '正在启动本机处理…'
  : '正在同步资料…'
const resumeResultLabel = (result: { status?: string; reason?: string }): string => {
  if (result.status === 'READY' || result.status === 'LOCAL_READY' || result.reason === 'ALREADY_READY') return '处理完成'
  if (result.status === 'WAITING_SERVER_REVISION') return '本机处理完成，等待资料版本同步。'
  if (result.status === 'PAUSED_NETWORK') return pausedNetworkDetail
  if (result.status === 'FAILED_LOCAL') return '本机处理失败，请重试。'
  if (result.status === 'FAILED_SERVER') return '服务端处理失败，请重试。'
  if (result.reason === 'SOURCE_NOT_FOUND') return '服务端暂时无法读取这份资料，请刷新后重试。'
  if (result.reason === 'SOURCE_DELETED') return '这份资料已删除，无法启动处理。'
  if (result.reason === 'NON_FILE_SOURCE') return '这类资料不支持本机文件解析。'
  if (result.reason === 'FILE_SOURCE_NOT_READY_FOR_CLIENT') return '资料尚未准备好，请稍后刷新。'
  if (result.reason === 'SOURCE_NOT_AWAITING_CLIENT') return '资料当前不需要本机处理，请刷新状态。'
  if (result.reason === 'SOURCE_ASSET_SHA_MISMATCH') return '本机资料与服务端版本不一致，请重新同步后重试。'
  if (result.reason === 'SOURCE_ASSET_SHA_INVALID') return '本机资料校验失败，请重新同步后重试。'
  if (result.reason === 'DOCUMENT_CACHE_OWNERSHIP_MISMATCH') return '本机处理记录与资料不匹配，无法继续。'
  if (result.reason === 'DOCUMENT_CACHE_CLEANUP_FAILED') return '本机处理缓存清理失败，请重试。'
  if (result.reason === 'DOCUMENT_LEGACY_CACHE_REBUILD_FAILED') return '本机处理缓存无法重建，请重试。'
  if (result.reason === 'DOCUMENT_CACHE_RECEIPT_UNAVAILABLE') return '本机处理结果暂不可用，请重试。'
  return '本机处理未启动，请刷新后重试。'
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
      sourceActionResults.value = { ...sourceActionResults.value, [sourceId]: resumeResultLabel(result) }
    }
  } catch (error) {
    if (isCurrentAction()) {
      const stage = resumeStages.value[sourceId] ?? 'sync'
      sourceActionErrors.value = {
        ...sourceActionErrors.value,
        [sourceId]: resumeActionErrorLabel(error, stage),
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
