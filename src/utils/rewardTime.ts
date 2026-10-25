import { dateKey, fromDateTimeInput, zonedParts } from './dateTime'
import { shiftDate } from './financeDates'
import type { SleepWindow } from './performance'
// Split each Toronto day at real-hour boundaries and both instances of every sleep boundary.
// This preserves the skipped/repeated hour without treating wall-clock subtraction as elapsed time.
export function awakeWindows(date: string, sleep: SleepWindow): [number, number][] {
  const start = fromDateTimeInput(`${date}T00:00`), end = fromDateTimeInput(`${shiftDate(date, 1)}T00:00`)
  const boundaries = new Set([start, end])
  for (let ms = Math.ceil(start / 3600000) * 3600000; ms < end; ms += 3600000) boundaries.add(ms)
  for (const time of [sleep.start, sleep.end]) for (const original of [start, end]) {
    try { boundaries.add(fromDateTimeInput(`${date}T${time}`, 'America/Toronto', original)) } catch { /* A nonexistent spring boundary contributes no elapsed minutes. */ }
  }
  const points = [...boundaries].sort((a, b) => a - b), result: [number, number][] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], time = zonedParts((a + b) / 2).time.slice(0, 5)
    const sleeping = sleep.start < sleep.end ? time >= sleep.start && time < sleep.end : time >= sleep.start || time < sleep.end
    if (!sleeping) { const last = result.at(-1); if (last && last[1] === a) last[1] = b; else result.push([a, b]) }
  }
  return result
}
export function awakeProgress(start: number, end: number, sleep: SleepWindow, thresholds: number[], cache = new Map<string, [number, number][]>()) {
  let elapsed = 0
  const reached: number[] = []
  if (end <= start) return { minutes: 0, reached }
  for (let date = dateKey(start); date <= dateKey(end); date = shiftDate(date, 1)) {
    let windows = cache.get(date)
    if (!windows) { windows = awakeWindows(date, sleep); cache.set(date, windows) }
    for (const [a, b] of windows) {
      const from = Math.max(start, a), to = Math.min(end, b)
      if (to <= from) continue
      const duration = to - from
      while (reached.length < thresholds.length && thresholds[reached.length] * 60000 <= elapsed + duration) reached.push(from + thresholds[reached.length] * 60000 - elapsed)
      elapsed += duration
    }
  }
  return { minutes: elapsed / 60000, reached }
}
export function levelProgress(xp: number) {
  const total = Number.isSafeInteger(xp) && xp > 0 ? xp : 0
  const level = Math.floor(Math.sqrt(total / 100)) + 1
  const floor = 100 * (level - 1) ** 2, next = 100 * level ** 2
  return { level, total, floor, next, within: total - floor, remaining: next - total, percent: (total - floor) / (next - floor) * 100 }
}
