import { TIME_ZONE } from '../config/timeZone'

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(timeZone: string) {
  let value = formatters.get(timeZone)
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    formatters.set(timeZone, value)
  }
  return value
}
export function zonedParts(ms: number, timeZone = TIME_ZONE) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(ms).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` }
}
export const dateKey = (ms: number, timeZone = TIME_ZONE) => zonedParts(ms, timeZone).date
export function toDateTimeInput(ms: number, timeZone = TIME_ZONE) {
  const { date, time } = zonedParts(ms, timeZone)
  return `${date}T${time}`
}
// Resolve a wall-clock time via IANA offsets, never the device's timezone. Reject the spring DST gap.
// At the repeated fall hour, preserve an existing occurrence when editing; otherwise choose the earlier one.
export function fromDateTimeInput(value: string, timeZone = TIME_ZONE, originalMs?: number): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error('Enter a valid date and time.')
  const normalized = value.length === 16 ? `${value}:00` : value
  const wall = Date.parse(`${normalized}Z`)
  if (!Number.isFinite(wall)) throw new Error('Enter a valid date and time.')
  const offsets = new Set<number>()
  for (const hours of [-36, 0, 36]) {
    const probe = wall + hours * 3_600_000
    offsets.add(Date.parse(`${toDateTimeInput(probe, timeZone)}Z`) - probe)
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(ms => toDateTimeInput(ms, timeZone) === normalized).sort((a, b) => a - b)
  if (!candidates.length) throw new Error('This local time does not exist. Choose a valid date and time outside the daylight-saving gap.')
  if (originalMs !== undefined) {
    const originalOffset = Date.parse(`${toDateTimeInput(originalMs, timeZone)}Z`) - Math.floor(originalMs / 1000) * 1000
    const matching = candidates.find(ms => wall - ms === originalOffset)
    if (matching !== undefined) return matching
  }
  return candidates[0]
}
export function dayBounds(ms: number, timeZone = TIME_ZONE) {
  const today = dateKey(ms, timeZone)
  // UTC is used only for calendar arithmetic; both boundaries are then resolved in the chosen timezone.
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return { start: fromDateTimeInput(`${today}T00:00:00`, timeZone), end: fromDateTimeInput(`${next}T00:00:00`, timeZone) }
}
export function formatTimestamp(ms: number, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(ms)
}
export function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
}
export const formatMoney = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
