import { t, type Message } from '../i18n.ts'

const ready = { 'zh-CN': '处理完成', en: 'Complete', ja: '処理完了' }

const SOURCE_PHASE_LABELS: Record<string, Message> = {
  AWAITING_CLIENT: { 'zh-CN': '等待桌面端处理', en: 'Waiting for desktop', ja: 'デスクトップの処理待ち' },
  VALIDATING: { 'zh-CN': '服务端校验', en: 'Server validation', ja: 'サーバーで検証中' },
  PENDING: { 'zh-CN': '服务端排队', en: 'Queued on server', ja: 'サーバーの処理待ち' },
  PARSING: { 'zh-CN': '服务端解析', en: 'Parsing on server', ja: 'サーバーで解析中' },
  INDEXING: { 'zh-CN': '服务端建立索引', en: 'Indexing on server', ja: 'サーバーで索引作成中' },
  FAILED: { 'zh-CN': '服务端失败', en: 'Server failed', ja: 'サーバーで失敗' },
  READY: ready,
}

const SOURCE_DETAIL_LABELS: Record<string, Message> = {
  AWAITING_CLIENT: { 'zh-CN': '等待桌面端开始处理', en: 'Waiting for desktop processing to start', ja: 'デスクトップでの処理開始を待機中' },
  VALIDATING: { 'zh-CN': '服务端正在校验解析结果', en: 'The server is validating the results', ja: 'サーバーが解析結果を検証中' },
  PENDING: { 'zh-CN': '等待服务端开始处理', en: 'Waiting for the server to start processing', ja: 'サーバーでの処理開始を待機中' },
  PARSING: { 'zh-CN': '服务端正在解析文件', en: 'The server is parsing the file', ja: 'サーバーがファイルを解析中' },
  INDEXING: { 'zh-CN': '服务端正在建立索引', en: 'The server is building the index', ja: 'サーバーがインデックスを作成中' },
  FAILED: { 'zh-CN': '服务端处理失败', en: 'Server processing failed', ja: 'サーバーでの処理に失敗しました' },
  READY: ready,
}

const pendingPhase = { 'zh-CN': '等待状态同步', en: 'Waiting for status', ja: '状態の同期を待機中' }
const pendingDetail = { 'zh-CN': '处理状态尚未同步，请稍后刷新', en: 'Status has not synced yet. Refresh in a moment.', ja: '処理状況はまだ同期されていません。しばらくしてから更新してください。' }

export function sourcePhaseLabel(phase: string | undefined): string {
  return t(SOURCE_PHASE_LABELS[phase || ''] ?? pendingPhase)
}

export function sourceDetailLabel(phase: string | undefined): string {
  return t(SOURCE_DETAIL_LABELS[phase || ''] ?? pendingDetail)
}
