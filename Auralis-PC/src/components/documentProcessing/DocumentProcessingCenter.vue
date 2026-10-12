<template>
  <section class="processing-center" aria-labelledby="processing-center-title">
    <div class="processing-center-heading">
      <div>
        <h3 id="processing-center-title">文件解析进度</h3>
        <p>处理完成后，文件即可用于智能问答与阅读。</p>
      </div>
      <button type="button" class="processing-refresh" :disabled="store.loading || !store.isRuntimeAvailable" @click="refresh">刷新</button>
    </div>
    <div v-if="!store.isRuntimeAvailable" class="processing-empty">文件解析仅可在 Auralis 桌面端运行。请在桌面端打开本文件，解析完成后即可提问。</div>
    <div v-else-if="!jobs.length && !serverProcessingSources.length" class="processing-empty">暂无文件解析任务</div>
    <div v-else class="processing-list">
      <article v-for="job in jobs" :key="job.jobId" class="processing-item">
        <div class="processing-item-main">
          <strong>{{ sourceName(job.sourceId) }}</strong>
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
      <article v-for="source in serverProcessingSources" :key="source.id" class="processing-item">
        <div class="processing-item-main">
          <strong>{{ source.name }}</strong>
          <span class="processing-phase">{{ sourcePhaseLabel(source.ingestionStatus) }}</span>
        </div>
        <div class="processing-item-meta">
          <span v-if="source.safeErrorDetail || sourceActionErrors[source.id]" class="processing-error">{{ source.safeErrorDetail || sourceActionErrors[source.id] }}</span>
          <span v-else>{{ sourceDetail(source) }}</span>
          <div class="processing-actions">
            <button v-if="source.ingestionStatus === 'AWAITING_CLIENT'" type="button" @click="resumeSource(source.id)">开始本机处理</button>
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'
import { useSourceStore } from '@/store/useSourceStore'
import type { SourceFileModel } from '@/services/domainMappers'
import { sourceDetailLabel, sourcePhaseLabel } from '@/utils/documentProcessingStatus'
import { copyOcrDiagnostics, formatOcrDiagnostics, updateCopyFeedback, type OcrDiagnosticsView } from '@/utils/ocrDiagnostics'

const store = useDocumentProcessingStore()
const sourceStore = useSourceStore()
const jobs = computed(() => store.jobs.filter((job) => job.phase !== 'READY'))
const serverProcessingSources = computed(() => sourceStore.sources
  .filter((source) => source.type === 'FILE' && source.ingestionStatus && source.ingestionStatus !== 'READY')
  .filter((source) => !jobs.value.some((job) => job.sourceId === source.id)))
const sourceActionErrors = ref<Record<string, string>>({})
const retryingSourceIds = ref<Set<string>>(new Set())
const copyFeedback = ref<Record<string, string>>({})
const jobViews = computed(() => new Map(store.jobs.map((job) => [job.jobId, formatOcrDiagnostics(job)])))
let timer: ReturnType<typeof setInterval> | null = null
let sourcePollTicks = 0

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
const refresh = async () => {
  await Promise.all([store.refresh().catch(() => undefined), refreshSources()])
}
const retry = async (jobId: string) => { await store.retry(jobId).catch(() => undefined); await refresh() }
const cancel = async (jobId: string) => { await store.cancel(jobId).catch(() => undefined); await refresh() }
const resumeSource = async (sourceId: string) => {
  const { [sourceId]: _ignored, ...remaining } = sourceActionErrors.value
  sourceActionErrors.value = remaining
  try {
    await sourceStore.resumeDocumentProcessing(sourceId)
  } catch (error) {
    sourceActionErrors.value = {
      ...sourceActionErrors.value,
      [sourceId]: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await refresh()
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
.processing-center { padding: 20px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-card, rgba(255,255,255,.45)); }
.processing-center-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.processing-center h3 { margin: 0; font-size: 16px; color: var(--text-primary); }
.processing-center p { margin: 5px 0 0; color: var(--text-muted); font-size: 12px; }
.processing-refresh, .processing-actions button { border: 1px solid var(--border-subtle); border-radius: 8px; padding: 5px 10px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 12px; }
.processing-empty { padding: 20px 0 4px; color: var(--text-muted); font-size: 13px; }
.processing-list { display: grid; gap: 10px; margin-top: 16px; }
.processing-item { padding: 12px; border-radius: 10px; background: rgba(127, 147, 114, .08); }
.processing-item-main, .processing-item-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.processing-item-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); font-size: 13px; }
.processing-phase { color: #9b742e; font-size: 12px; white-space: nowrap; }
.processing-item-meta { margin-top: 7px; color: var(--text-muted); font-size: 11px; }
.processing-error { color: #b4534d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.processing-actions { display: flex; gap: 6px; flex-shrink: 0; }
.processing-actions button.danger { color: #b4534d; }
.processing-warning { margin-top: 8px; color: #9b742e; font-size: 11px; }
.processing-diagnostics { margin-top: 10px; color: var(--text-secondary); font-size: 11px; }
.processing-diagnostics summary { cursor: pointer; color: var(--text-secondary); margin-bottom: 4px; }
.diagnostic-group h4 { margin: 8px 0 4px 0; color: #9b742e; font-size: 11px; font-weight: 500; }
.diagnostic-group dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 4px 0 8px 0; }
.diagnostic-group dt { color: var(--text-muted); }
.diagnostic-group dd { margin: 0; color: var(--text-primary); overflow-wrap: anywhere; }
.processing-diagnostics > button { margin-top: 4px; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 4px 8px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 11px; }
</style>
