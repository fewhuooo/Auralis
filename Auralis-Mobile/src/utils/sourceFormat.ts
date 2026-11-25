import type { SourceView } from '@/api/sourceApi'

export type SourceStatusTone = 'ready' | 'parsing' | 'pending' | 'failed'

export interface SourceStatusMeta {
  label: string
  tone: SourceStatusTone
}

export function getSourceStatusMeta(status?: SourceView['ingestionStatus']): SourceStatusMeta {
  if (status === 'READY') return { label: '已就绪', tone: 'ready' }
  if (status === 'PARSING' || status === 'INDEXING') return { label: '解析中', tone: 'parsing' }
  if (status === 'FAILED') return { label: '解析失败', tone: 'failed' }
  return { label: '等待 PC 解析', tone: 'pending' }
}

export function formatBytes(bytes?: number): string {
  const size = Number(bytes || 0)
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function isImageMedia(mimeType?: string, fileName?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || ''
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
}

export function isPdfMedia(mimeType?: string, fileName?: string): boolean {
  if (mimeType === 'application/pdf') return true
  return (fileName || '').toLowerCase().endsWith('.pdf')
}

export function formatShortDateTime(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
