export const subjectIconOptions = [
  { key: 'book', label: '阅读' },
  { key: 'reading', label: '文献' },
  { key: 'library', label: '资料' },
  { key: 'code', label: '编程' },
  { key: 'computer', label: '硬件' },
  { key: 'analysis', label: '数据' },
  { key: 'math', label: '理科' },
  { key: 'school', label: '学术' },
  { key: 'art', label: '创意' },
  { key: 'notes', label: '笔记' },
  { key: 'idea', label: '灵感' },
  { key: 'settings', label: '工程' },
  { key: 'focus', label: '专注' },
  { key: 'achievement', label: '成就' },
  { key: 'research', label: '探索' },
  { key: 'laptop', label: '构建' }
] as const

export type SubjectIconKey = (typeof subjectIconOptions)[number]['key']

export const isSubjectIconKey = (icon?: string | null): boolean => {
  const value = icon?.trim()
  return !!value && subjectIconOptions.some(opt => opt.key === value)
}
