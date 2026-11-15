import { t } from '@/i18n'
import { defaultConnectionStatusMessages } from '@/services/connectionStatusProjection'

export const navigationMessages = {
  home: { 'zh-CN': '首页', en: 'Home', ja: 'ホーム' },
  subjects: { 'zh-CN': '学科空间', en: 'Subjects', ja: '科目スペース' },
  timeline: { 'zh-CN': '任务排期', en: 'Schedule', ja: 'タスク予定' },
  assets: { 'zh-CN': '资料管理', en: 'Materials', ja: '資料管理' },
  focus: { 'zh-CN': '专注时钟', en: 'Focus timer', ja: '集中タイマー' },
  settings: { 'zh-CN': '个人设置', en: 'Personal settings', ja: '個人設定' },
}

export function getConnectionStatusMessages() {
  return {
    error: t({ 'zh-CN': defaultConnectionStatusMessages.error, en: 'Service temporarily unavailable', ja: 'サービスは一時的に利用できません' }),
    offline: t({ 'zh-CN': defaultConnectionStatusMessages.offline, en: 'Offline. Changes are saved on this device.', ja: 'オフラインです。変更はこの端末に保存されています' }),
    reconnecting: t({ 'zh-CN': defaultConnectionStatusMessages.reconnecting, en: 'Restoring the live connection', ja: 'リアルタイム接続を復旧中' }),
    syncing: t({ 'zh-CN': defaultConnectionStatusMessages.syncing, en: 'Syncing', ja: '同期中' }),
    paused: t({ 'zh-CN': defaultConnectionStatusMessages.paused, en: 'Automatic sync paused', ja: '自動同期を一時停止中' }),
    ready: t({ 'zh-CN': defaultConnectionStatusMessages.ready, en: 'Synced', ja: '同期済み' }),
  }
}
