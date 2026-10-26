import type { SpacingSchedule, SpacingStep } from '../types/data'
import { shiftDate, torontoToday } from './financeDates'

export const SCHEDULE_START = '2026-10-18'
export const LEGACY_SCHEDULE: SpacingSchedule = { timeZone: 'America/Toronto', steps: [60, 90, 120, 180].map((minimumMinutes, i) => ({ week: i + 1, startsOn: shiftDate('2026-10-23', i * 7), minimumMinutes })) }
export function correctedSchedule(): SpacingSchedule {
  return { timeZone: 'America/Toronto', schemaVersion: 2, revision: 1, steps: Array.from({ length: 52 }, (_, i) => ({ week: i + 1, startsOn: shiftDate(SCHEDULE_START, i * 7), minimumMinutes: [60, 90, 120][i] ?? 180 })) }
}
export function validateSchedule(value: SpacingSchedule): SpacingSchedule {
  if (!value || value.timeZone !== 'America/Toronto' || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 5200) throw new Error('Your saved schedule is unavailable or invalid. No settings were overwritten.')
  const dates = new Set<string>(), weeks = new Set<number>()
  for (const step of value.steps) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(step.startsOn) || !Number.isFinite(Date.parse(`${step.startsOn}T12:00:00Z`)) || shiftDate(step.startsOn, 0) !== step.startsOn || !Number.isInteger(step.week) || step.week < 1 || !Number.isFinite(step.minimumMinutes) || step.minimumMinutes <= 0 || dates.has(step.startsOn) || weeks.has(step.week)) throw new Error('Your saved schedule has invalid or duplicate weeks. No settings were overwritten.')
    dates.add(step.startsOn); weeks.add(step.week)
  }
  if (value.schemaVersion !== undefined && (value.schemaVersion !== 2 || !Number.isInteger(value.revision) || value.revision! < 1)) throw new Error('Unsupported schedule version. Refresh before editing.')
  return value
}
export function orderedSteps(schedule: SpacingSchedule) { return [...schedule.steps].sort((a, b) => a.startsOn.localeCompare(b.startsOn)) }
export function targetOn(schedule: SpacingSchedule | null, date: string) { return schedule ? orderedSteps(schedule).filter(step => step.startsOn <= date).at(-1) ?? null : null }
function stepValues(schedule: SpacingSchedule) { return orderedSteps(schedule).map(step => [step.week, step.startsOn, step.minimumMinutes]) }
export function scheduleFingerprint(schedule: SpacingSchedule) { return JSON.stringify([schedule.timeZone, schedule.revision ?? 0, stepValues(schedule)]) }
export function migrationFor(schedule: SpacingSchedule | null): SpacingSchedule | null {
  if (!schedule) return correctedSchedule()
  validateSchedule(schedule)
  if (schedule.schemaVersion === 2) return null
  const old = JSON.stringify(stepValues(schedule)) === JSON.stringify(stepValues(LEGACY_SCHEDULE))
  return old ? correctedSchedule() : { ...schedule, schemaVersion: 2, revision: 1 }
}
export function sunday(date: string) { return shiftDate(date, -new Date(`${date}T12:00:00Z`).getUTCDay()) }
// Keep all historical effective dates. Only the displayed planning horizon rolls forward.
export function plannerWeeks(schedule: SpacingSchedule, today = torontoToday()): SpacingStep[] {
  const ordered = orderedSteps(schedule), first = ordered[0], start = today < first.startsOn ? first.startsOn : sunday(today)
  const end = shiftDate(start, 51 * 7)
  const rows = new Map(ordered.filter(step => step.startsOn <= end).map(step => [step.startsOn, step]))
  const tail = ordered.at(-1)!
  for (let date = shiftDate(sunday(tail.startsOn), 7); date <= end; date = shiftDate(date, 7)) {
    if (!rows.has(date)) {
      const previous = [...rows.values()].filter(step => step.startsOn <= date).sort((a, b) => a.startsOn.localeCompare(b.startsOn)).at(-1)
      rows.set(date, { startsOn: date, week: previous ? previous.week + 1 : 1, minimumMinutes: previous?.minimumMinutes ?? first.minimumMinutes })
    }
  }
  return [...rows.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn))
}
export interface GoalChange { startsOn: string; minimumMinutes: number }
export function validGoal(minutes: number) { return Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440 && minutes % 15 === 0 }
export function applyGoalChanges(schedule: SpacingSchedule, changes: GoalChange[], today = torontoToday()): SpacingSchedule {
  validateSchedule(schedule)
  if (!changes.length || changes.length > 52 || new Set(changes.map(change => change.startsOn)).size !== changes.length) throw new Error('Choose between 1 and 52 distinct weeks.')
  const rows = plannerWeeks(schedule, today), currentStart = targetOn(schedule, today)?.startsOn
  // A legacy non-Sunday plan is preserved, including its current effective date.
  const earliest = currentStart && shiftDate(currentStart, 6) >= today ? currentStart : sunday(today)
  const last = shiftDate(sunday(today), 51 * 7)
  for (const change of changes) {
    if (!validGoal(change.minimumMinutes)) throw new Error('Choose a target from 15 minutes to 24 hours in 15-minute increments.')
    if (!rows.some(row => row.startsOn === change.startsOn) || change.startsOn < earliest || change.startsOn > last) throw new Error('Only current and upcoming weeks within the 52-week horizon can be edited. Completed weeks are locked.')
  }
  // Materialize every week in the horizon so an individual edit cannot leak into later weeks.
  const all = new Map(schedule.steps.map(step => [step.startsOn, step]))
  rows.forEach(step => all.set(step.startsOn, { ...step, minimumMinutes: changes.find(change => change.startsOn === step.startsOn)?.minimumMinutes ?? step.minimumMinutes }))
  return { timeZone: schedule.timeZone, schemaVersion: 2, revision: (schedule.revision ?? 0) + 1, steps: [...all.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn)) }
}
export function bulkGoalChanges(rows: SpacingStep[], start: string, end: string, mode: 'set' | 'increase' | 'reset', minutes: number, today: string): GoalChange[] {
  const selected = rows.filter(row => row.startsOn >= start && row.startsOn <= end)
  if (start > end || !selected.length || selected.some(row => row.startsOn <= today)) throw new Error('Select a range of upcoming weeks.')
  const previous = rows.filter(row => row.startsOn < start).at(-1)
  return selected.map(row => ({ startsOn: row.startsOn, minimumMinutes: mode === 'increase' ? row.minimumMinutes + minutes : mode === 'reset' ? previous?.minimumMinutes ?? row.minimumMinutes : minutes }))
}
