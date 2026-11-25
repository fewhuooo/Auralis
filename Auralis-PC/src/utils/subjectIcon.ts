import type { Component } from 'vue'
import {
  IconMathFunction,
  IconTerminal2,
  IconAtom,
  IconFlask,
  IconDna,
  IconCpu,
  IconChartDots,
  IconLanguage,
  IconBook2,
  IconTrendingUp,
  IconBriefcase,
  IconScale,
  IconStethoscope,
  IconBuilding,
  IconPalette,
  IconSchool
} from '@tabler/icons-vue'

export const subjectIconOptions = [
  { key: 'math', label: '高等数学', component: IconMathFunction },
  { key: 'code', label: '程序设计', component: IconTerminal2 },
  { key: 'physics', label: '大学物理', component: IconAtom },
  { key: 'chemistry', label: '基础化学', component: IconFlask },
  { key: 'biology', label: '生命科学', component: IconDna },
  { key: 'computer', label: '电子信息', component: IconCpu },
  { key: 'analysis', label: '数据与AI', component: IconChartDots },
  { key: 'language', label: '学术外语', component: IconLanguage },
  { key: 'book', label: '文学传播', component: IconBook2 },
  { key: 'economics', label: '经济金融', component: IconTrendingUp },
  { key: 'business', label: '工商管理', component: IconBriefcase },
  { key: 'law', label: '法律法学', component: IconScale },
  { key: 'medicine', label: '临床医学', component: IconStethoscope },
  { key: 'engineering', label: '建筑土木', component: IconBuilding },
  { key: 'art', label: '艺术设计', component: IconPalette },
  { key: 'school', label: '通识思政', component: IconSchool }
] as const

export type SubjectIconKey = (typeof subjectIconOptions)[number]['key']

const iconComponents: Record<SubjectIconKey, Component> = {
  // 16 大大学学科核心语义键
  math: IconMathFunction,
  code: IconTerminal2,
  physics: IconAtom,
  chemistry: IconFlask,
  biology: IconDna,
  computer: IconCpu,
  analysis: IconChartDots,
  language: IconLanguage,
  book: IconBook2,
  economics: IconTrendingUp,
  business: IconBriefcase,
  law: IconScale,
  medicine: IconStethoscope,
  engineering: IconBuilding,
  art: IconPalette,
  school: IconSchool
}

export const isSubjectIconKey = (icon?: string | null): icon is SubjectIconKey => {
  const value = icon?.trim()
  return !!value && Object.hasOwn(iconComponents, value)
}

export const getSubjectIconComponent = (icon?: string | null): Component => {
  const value = icon?.trim()
  return value && isSubjectIconKey(value) ? iconComponents[value] : iconComponents.book
}
