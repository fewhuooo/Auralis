import type { components } from '../api/generated/schema.ts'

export type AiProviderType = NonNullable<components['schemas']['AiSettingsCommand']['provider']>
export type AiSettingsView = components['schemas']['AiSettingsView']

export const DEFAULT_AI_BASE_URLS: Record<AiProviderType, string> = {
  DEEPSEEK: 'https://api.deepseek.com',
  SILICONFLOW: 'https://api.siliconflow.cn/v1',
  OPENAI_COMPATIBLE: '',
}

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

export function normalizeAiProvider(provider: string): AiProviderType {
  const normalized = (provider || '').trim().toLowerCase()
  if (normalized.includes('deepseek')) return 'DEEPSEEK'
  if (normalized.includes('silicon') || normalized.includes('硅基')) return 'SILICONFLOW'
  return 'OPENAI_COMPATIBLE'
}

const SUBJECT_DIST_COLORS = ['#8B9A6E', '#C89B6D', '#6B8E9B', '#9D85A8', '#8FA87D'] as const

export interface SubjectDistSource {
  id: string
  name: string
  blockCount?: number
}

export interface SubjectDistItem {
  id: string
  name: string
  count: number
  pct: number
  color: string
}

export function buildSubjectDistribution(subjects: SubjectDistSource[], limit = 5): SubjectDistItem[] {
  if (subjects.length === 0) return []
  const sorted = [...subjects]
    .map(item => ({
      id: item.id,
      name: item.name,
      count: Math.max(0, Number(item.blockCount || 0)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)

  const maxCount = Math.max(...sorted.map(item => item.count), 1)
  return sorted.map((item, idx) => ({
    ...item,
    color: SUBJECT_DIST_COLORS[idx % SUBJECT_DIST_COLORS.length],
    pct: item.count > 0 ? Math.max(10, Math.round((item.count * 100) / maxCount)) : 0,
  }))
}

export function resolveEffectiveAiBaseUrl(provider: AiProviderType, baseUrl: string): string {
  return baseUrl.trim() || DEFAULT_AI_BASE_URLS[provider]
}

export function validateAiSettingsDraft(params: {
  rawProvider?: string
  provider: AiProviderType
  baseUrl: string
  model: string
}): string {
  if (params.rawProvider !== undefined && !params.rawProvider.trim()) {
    return '请填写 AI 服务商（如 DEEPSEEK、SILICONFLOW 或 OPENAI_COMPATIBLE）。'
  }
  if (params.provider !== 'DEEPSEEK' && !params.model.trim()) {
    return '当前服务商需要填写明确的聊天模型名称后才能保存。'
  }
  if (params.provider === 'OPENAI_COMPATIBLE' && !params.baseUrl.trim()) {
    return '请填写 OpenAI 兼容服务商提供的 Base URL。'
  }
  return ''
}

export function canProbeSavedAiSettings(params: {
  saved?: AiSettingsView
  provider: AiProviderType
  baseUrl: string
  apiKey: string
  chatModel?: string
}): boolean {
  const saved = params.saved
  if (!saved?.hasApiKey || params.apiKey.trim()) return false
  const effectiveBaseUrl = resolveEffectiveAiBaseUrl(params.provider, params.baseUrl)
  if ((saved.baseUrl || '') !== effectiveBaseUrl) return false
  if (params.chatModel !== undefined && (saved.chatModel || '') !== params.chatModel) return false
  return true
}

export interface ProfileSyncStatusView {
  label: string
  tone: 'ok' | 'warning'
}

export function resolveProfileSyncStatus(input: {
  isSyncing: boolean
  resettingOffline?: boolean
  lastError: string | null
  conflictCount: number
  autoSyncEnabled: boolean
  pendingFocusCount: number
  pendingMutationCount: number
}): ProfileSyncStatusView {
  if (input.resettingOffline) {
    return { label: '正在重置本地数据...', tone: 'warning' }
  }
  if (input.isSyncing) {
    return { label: '正在与云端同步...', tone: 'ok' }
  }
  if (input.lastError) {
    return { label: '同步异常', tone: 'warning' }
  }
  if (input.conflictCount > 0) {
    return { label: `存在 ${input.conflictCount} 条同步冲突`, tone: 'warning' }
  }
  if (!input.autoSyncEnabled) {
    return { label: '自动同步已暂停', tone: 'warning' }
  }
  if (input.pendingFocusCount > 0 || input.pendingMutationCount > 0) {
    return { label: '有本地记录待上传', tone: 'warning' }
  }
  return { label: '已同步 · 状态正常', tone: 'ok' }
}
