import type { Component } from 'vue'
import {
  Collection,
  CollectionTag,
  Cpu,
  DataAnalysis,
  EditPen,
  Histogram,
  MagicStick,
  Monitor,
  Opportunity,
  Reading,
  School,
  Setting,
  Timer,
  Trophy
} from '@element-plus/icons-vue'

export const subjectIconOptions = [
  { key: 'book', label: '阅读', component: Collection },
  { key: 'reading', label: '文献', component: Reading },
  { key: 'library', label: '资料', component: CollectionTag },
  { key: 'code', label: '编程', component: Cpu },
  { key: 'computer', label: '计算机', component: Monitor },
  { key: 'analysis', label: '分析', component: DataAnalysis },
  { key: 'math', label: '数学', component: Histogram },
  { key: 'school', label: '学术', component: School },
  { key: 'art', label: '创作', component: MagicStick },
  { key: 'notes', label: '笔记', component: EditPen },
  { key: 'idea', label: '灵感', component: Opportunity },
  { key: 'settings', label: '工程', component: Setting },
  { key: 'focus', label: '专注', component: Timer },
  { key: 'achievement', label: '成果', component: Trophy },
  { key: 'research', label: '研究', component: DataAnalysis },
  { key: 'laptop', label: '设备', component: Monitor }
] as const

export type SubjectIconKey = (typeof subjectIconOptions)[number]['key']

const iconComponents: Record<SubjectIconKey, Component> = {
  book: Collection,
  reading: Reading,
  library: CollectionTag,
  code: Cpu,
  computer: Monitor,
  analysis: DataAnalysis,
  math: Histogram,
  school: School,
  art: MagicStick,
  notes: EditPen,
  idea: Opportunity,
  settings: Setting,
  focus: Timer,
  achievement: Trophy,
  research: DataAnalysis,
  laptop: Monitor
}

const semanticIconPattern = /^[a-z0-9_-]+$/i

export const isSubjectIconKey = (icon?: string | null): icon is SubjectIconKey => {
  const value = icon?.trim()
  return !!value && Object.hasOwn(iconComponents, value)
}

export const getSubjectIconComponent = (icon?: string | null): Component => {
  const value = icon?.trim()
  return value && isSubjectIconKey(value) ? iconComponents[value] : iconComponents.book
}

export const getLegacySubjectIcon = (icon?: string | null): string | null => {
  const value = icon?.trim()
  return value && !semanticIconPattern.test(value) ? value : null
}
