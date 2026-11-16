export interface WeekDayDescriptor {
  dateKey: string
  weekdayLabel: string
  dayNumber: number
  isToday: boolean
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function toLocalDateKey(input: Date | string | number = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function formatLocalTimeHHmm(input?: string | Date | number): string {
  if (!input) return ''
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function combineLocalDateAndTime(dateKey: string, hhmm: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hour, minute] = hhmm.split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`Invalid local date/time: ${dateKey} ${hhmm}`)
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

export function endOfLocalDateIso(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) throw new Error(`Invalid date key: ${dateKey}`)
  return new Date(year, month - 1, day, 23, 59, 59, 0).toISOString()
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return toLocalDateKey(new Date())
  const date = new Date(year, month - 1, day + deltaDays)
  return toLocalDateKey(date)
}

export function formatShortDate(input?: string): string {
  const key = input ? toLocalDateKey(input) : ''
  if (!key) return ''
  const [, month, day] = key.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return dateKey
  const date = new Date(year, month - 1, day)
  return `${month}月${day}日 ${WEEKDAY_LABELS[date.getDay()]}`
}

export function getWeekDays(anchorDateKey: string, todayKey = toLocalDateKey(new Date())): WeekDayDescriptor[] {
  const [year, month, day] = anchorDateKey.split('-').map(Number)
  const anchor = !year || !month || !day ? new Date() : new Date(year, month - 1, day)
  const offsetFromMonday = (anchor.getDay() + 6) % 7
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - offsetFromMonday)

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)
    const key = toLocalDateKey(current)
    return {
      dateKey: key,
      weekdayLabel: WEEKDAY_LABELS[current.getDay()].replace('周', ''),
      dayNumber: current.getDate(),
      isToday: key === todayKey,
    }
  })
}

export function getCurrentWeekBounds(todayKey = toLocalDateKey(new Date())): { from: string; to: string } {
  const days = getWeekDays(todayKey, todayKey)
  return {
    from: days[0].dateKey,
    to: days[6].dateKey,
  }
}

export function detectLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
