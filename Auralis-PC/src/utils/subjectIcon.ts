import type { Component } from 'vue'
import {
  BookOpenText,
  BookMarked,
  Archive,
  Terminal,
  Cpu,
  Activity,
  Infinity as InfinityIcon,
  Scroll,
  Feather,
  PenTool,
  Orbit,
  Blocks,
  Hourglass,
  Award,
  Telescope,
  Rocket
} from 'lucide-vue-next'

export const subjectIconOptions = [
  { key: 'book', label: '阅读', component: BookOpenText },
  { key: 'reading', label: '文献', component: BookMarked },
  { key: 'library', label: '资料', component: Archive },
  { key: 'code', label: '编程', component: Terminal },
  { key: 'computer', label: '硬件', component: Cpu },
  { key: 'analysis', label: '数据', component: Activity },
  { key: 'math', label: '理科', component: InfinityIcon },
  { key: 'school', label: '学术', component: Scroll },
  { key: 'art', label: '创意', component: Feather },
  { key: 'notes', label: '笔记', component: PenTool },
  { key: 'idea', label: '灵感', component: Orbit },
  { key: 'settings', label: '工程', component: Blocks },
  { key: 'focus', label: '专注', component: Hourglass },
  { key: 'achievement', label: '成就', component: Award },
  { key: 'research', label: '探索', component: Telescope },
  { key: 'laptop', label: '构建', component: Rocket }
] as const

export type SubjectIconKey = (typeof subjectIconOptions)[number]['key']

const iconComponents: Record<SubjectIconKey, Component> = {
  book: BookOpenText,
  reading: BookMarked,
  library: Archive,
  code: Terminal,
  computer: Cpu,
  analysis: Activity,
  math: InfinityIcon,
  school: Scroll,
  art: Feather,
  notes: PenTool,
  idea: Orbit,
  settings: Blocks,
  focus: Hourglass,
  achievement: Award,
  research: Telescope,
  laptop: Rocket
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
