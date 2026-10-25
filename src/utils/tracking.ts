import { plannerWeeks, targetOn } from './spacingSchedule'
import type { Entry, SpacingSchedule } from '../types/data'
import { dateKey } from './dateTime'

export function elapsedSeconds(lastPouchMs: number | null, now: number) {
  return lastPouchMs === null ? null : Math.max(0, Math.floor((now - lastPouchMs) / 1000))
}
export function durationParts(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return [Math.floor(safe / 3600), Math.floor(safe / 60) % 60, safe % 60].map(value => String(value).padStart(2, '0'))
}
export const formatDuration = (seconds: number) => durationParts(seconds).join(':')
export function spacingGoal(schedule: SpacingSchedule, now: number) {
  const today = dateKey(now, schedule.timeZone)
  const ordered = plannerWeeks(schedule, today)
  return { current: targetOn({ ...schedule, steps: ordered }, today), next: ordered.find(step => step.startsOn > today) ?? null }
}
export function spacingProgress(elapsed: number | null, minutes: number | undefined) {
  if (elapsed === null || !minutes) return null
  const target = minutes * 60
  return { percent: Math.min(100, Math.max(0, elapsed / target * 100)), remaining: Math.max(0, target - elapsed), beyond: Math.max(0, elapsed - target), reached: elapsed >= target }
}
export function dailyCounts(entries: Entry[], now: number, timeZone: string) {
  const counts = { pouch: 0, cigarette: 0, cigar: 0, total: 0 }
  const today = dateKey(now, timeZone)
  for (const entry of entries) if (dateKey(entry.occurredAt.toMillis(), timeZone) === today) { counts[entry.kind]++; counts.total++ }
  return counts
}
