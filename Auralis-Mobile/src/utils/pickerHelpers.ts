export interface DateKeyParts {
  year: number
  month: number
  day: number
}

export interface CalendarCell {
  key: string
  day: number
  inMonth: boolean
}

export function formatDateKey(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKeyParts(dateKey: string): DateKeyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const check = new Date(year, month - 1, day)
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return null
  }
  return { year, month, day }
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const shifted = new Date(year, month - 1 + delta, 1)
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 }
}

/** Builds a 6-row Monday-first calendar grid (42 cells) for the given 1-based month. */
export function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month - 1, 1)
  const leadingOffset = (firstDay.getDay() + 6) % 7
  const cells: CalendarCell[] = []
  for (let idx = 0; idx < 42; idx++) {
    const cellDate = new Date(year, month - 1, 1 - leadingOffset + idx)
    const cellYear = cellDate.getFullYear()
    const cellMonth = cellDate.getMonth() + 1
    const cellDay = cellDate.getDate()
    cells.push({
      key: formatDateKey(cellYear, cellMonth, cellDay),
      day: cellDay,
      inMonth: cellYear === year && cellMonth === month,
    })
  }
  return cells
}

export function parseTimeHHmm(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
  if (!match) return { hour: 9, minute: 0 }
  const hour = Math.max(0, Math.min(23, Number(match[1])))
  const minute = Math.max(0, Math.min(59, Number(match[2])))
  return { hour, minute }
}

export function formatTimeHHmm(hour: number, minute: number): string {
  const safeHour = Math.max(0, Math.min(23, Math.trunc(Number.isFinite(hour) ? hour : 0)))
  const safeMinute = Math.max(0, Math.min(59, Math.trunc(Number.isFinite(minute) ? minute : 0)))
  return `${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`
}
