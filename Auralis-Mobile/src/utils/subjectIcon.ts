export const subjectIconOptions = [
  { key: 'math', label: '高等数学' },
  { key: 'code', label: '程序设计' },
  { key: 'physics', label: '大学物理' },
  { key: 'chemistry', label: '基础化学' },
  { key: 'biology', label: '生命科学' },
  { key: 'computer', label: '电子信息' },
  { key: 'analysis', label: '数据与AI' },
  { key: 'language', label: '学术外语' },
  { key: 'book', label: '文学传播' },
  { key: 'economics', label: '经济金融' },
  { key: 'business', label: '工商管理' },
  { key: 'law', label: '法律法学' },
  { key: 'medicine', label: '临床医学' },
  { key: 'engineering', label: '建筑土木' },
  { key: 'art', label: '艺术设计' },
  { key: 'school', label: '通识思政' },
] as const

export type SubjectIconKey = (typeof subjectIconOptions)[number]['key']

export function isSubjectIconKey(icon?: string | null): icon is SubjectIconKey {
  const value = icon?.trim()
  return Boolean(value && subjectIconOptions.some(opt => opt.key === value))
}
