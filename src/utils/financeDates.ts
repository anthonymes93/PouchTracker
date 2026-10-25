import type { Period } from '../types/finance'
import { dateKey } from './dateTime'
// UTC arithmetic represents calendar labels only; events are assigned labels in Toronto.
export function shiftDate(date: string, days: number) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10) }
export function dateRange(start: string, end: string): string[] {
  const count = Math.max(0, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1)
  return Array.from({ length: count }, (_, index) => shiftDate(start, index))
}
export function monday(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  return shiftDate(date, -((weekday + 6) % 7))
}
export function periodStart(period: Period, today: string, earliest: string) {
  switch (period) {
    case '7days': return shiftDate(today, -6)
    case '30days': return shiftDate(today, -29)
    case 'month': return `${today.slice(0, 7)}-01`
    case 'year': return `${today.slice(0, 4)}-01-01`
    case 'all': return earliest
  }
}
export const torontoToday = (now = Date.now()) => dateKey(now, 'America/Toronto')
