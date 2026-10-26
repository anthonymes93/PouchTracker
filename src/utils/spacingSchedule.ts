import type { SpacingSchedule, SpacingStep } from '../types/data'
import { shiftDate, torontoToday } from './financeDates'

export const SCHEDULE_START = '2026-10-18'
export const LEGACY_SCHEDULE: SpacingSchedule = { timeZone: 'America/Toronto', steps: [60, 90, 120, 180].map((minimumMinutes, i) => ({ week: i + 1, startsOn: shiftDate('2026-10-23', i * 7), minimumMinutes })) }
export function correctedSchedule(): SpacingSchedule {
  return { timeZone: 'America/Toronto', schemaVersion: 3, revision: 1, progressionEnabled: true, incrementMinutes: 30, steps: [60, 90, 120, 180].map((minimumMinutes, i) => ({ week: i + 1, startsOn: shiftDate(SCHEDULE_START, i * 7), minimumMinutes })) }
}
export function validateSchedule(value: SpacingSchedule): SpacingSchedule {
  if (!value || value.timeZone !== 'America/Toronto' || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 5200) throw new Error('Your saved schedule is unavailable or invalid. No settings were overwritten.')
  const dates = new Set<string>(), weeks = new Set<number>()
  for (const step of value.steps) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(step.startsOn) || !Number.isFinite(Date.parse(`${step.startsOn}T12:00:00Z`)) || shiftDate(step.startsOn, 0) !== step.startsOn || !Number.isInteger(step.week) || step.week < 1 || !Number.isFinite(step.minimumMinutes) || step.minimumMinutes <= 0 || dates.has(step.startsOn) || weeks.has(step.week)) throw new Error('Your saved schedule has invalid or duplicate weeks. No settings were overwritten.')
    dates.add(step.startsOn); weeks.add(step.week)
  }
  if (value.schemaVersion !== undefined && (![2, 3].includes(value.schemaVersion) || !Number.isInteger(value.revision) || value.revision! < 1)) throw new Error('Unsupported schedule version. Refresh before editing.')
  if (value.schemaVersion === 3 && (typeof value.progressionEnabled !== 'boolean' || ![15,30,60].includes(value.incrementMinutes!))) throw new Error('Invalid progression settings. No settings were overwritten.')
  return value
}
export function orderedSteps(schedule: SpacingSchedule) { return [...schedule.steps].sort((a, b) => a.startsOn.localeCompare(b.startsOn)) }
export function targetOn(schedule: SpacingSchedule | null, date: string) { return schedule ? orderedSteps(schedule).filter(step => step.startsOn <= date).at(-1) ?? null : null }
function stepValues(schedule: SpacingSchedule) { return orderedSteps(schedule).map(step => [step.week, step.startsOn, step.minimumMinutes]) }
export function scheduleFingerprint(schedule: SpacingSchedule) { return JSON.stringify([schedule.timeZone, schedule.revision ?? 0, schedule.schemaVersion, schedule.progressionEnabled, schedule.incrementMinutes, stepValues(schedule)]) }
export function needsPlanReview(schedule: SpacingSchedule) { return schedule.schemaVersion !== 3 && schedule.steps.length > 4 }
export function migrationFor(schedule: SpacingSchedule | null): SpacingSchedule | null {
  if (!schedule) return correctedSchedule()
  validateSchedule(schedule)
  if (schedule.schemaVersion === 3 || needsPlanReview(schedule)) return null
  const old = JSON.stringify(stepValues(schedule)) === JSON.stringify(stepValues(LEGACY_SCHEDULE))
  if (old) return { ...correctedSchedule(), revision: (schedule.revision ?? 0) + 1 }
  const steps = orderedSteps(schedule)
  // Custom dates and values stay untouched. Maintenance/step-down plans start paused.
  const progressionEnabled = steps.every((step, i) => !i || step.minimumMinutes >= steps[i - 1].minimumMinutes + 30)
  return { timeZone: schedule.timeZone, steps, schemaVersion: 3, revision: (schedule.revision ?? 0) + 1, progressionEnabled, incrementMinutes: 30 }
}
export function sunday(date: string) { return shiftDate(date, -new Date(`${date}T12:00:00Z`).getUTCDay()) }
// The planner never fabricates rows. Selection beyond the last row holds its saved target.
export function plannerWeeks(schedule: SpacingSchedule, _today?: string): SpacingStep[] { return orderedSteps(schedule) }
export interface GoalChange { startsOn: string; minimumMinutes: number }
export function validGoal(minutes: number) { return Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440 && minutes % 15 === 0 }
export type PlanAction =
  | { kind: 'edit'; changes: GoalChange[] }
  | { kind: 'add' }
  | { kind: 'remove' }
  | { kind: 'progression'; enabled: boolean; increment: 15 | 30 | 60 }
  | { kind: 'review'; keep: number; enabled: boolean; increment: 15 | 30 | 60 }

export function planUpdate(schedule: SpacingSchedule, action: PlanAction, today = torontoToday()): SpacingSchedule {
  validateSchedule(schedule)
  if (needsPlanReview(schedule) && action.kind !== 'review') throw new Error('Review your existing plan before making changes.')
  let steps = orderedSteps(schedule).map(step => ({ ...step }))
  let enabled = schedule.progressionEnabled ?? true, increment = schedule.incrementMinutes ?? 30
  const current = targetOn(schedule, today)
  // Once its calendar week ends, the last saved goal still applies but is historical and locked.
  const editable = (step: SpacingStep) => shiftDate(step.startsOn, 6) >= today
  if (action.kind === 'progression' || action.kind === 'review') {
    if (![15,30,60].includes(action.increment) || typeof action.enabled !== 'boolean') throw new Error('Choose a 15, 30 or 60 minute increase.')
    enabled = action.enabled; increment = action.increment
  }
  if (action.kind === 'review') {
    if (!needsPlanReview(schedule) || !Number.isInteger(action.keep) || action.keep < 1 || action.keep > steps.length) throw new Error('Choose how many existing weeks to keep.')
    if (steps.slice(action.keep).some(step => step.startsOn <= today)) throw new Error('Current and historical weeks cannot be removed.')
    if (action.keep > 52 && action.keep !== steps.length) throw new Error('Keep at most 52 weeks, or retain the entire legacy plan for historical review.')
    steps = steps.slice(0, action.keep)
  }
  if (action.kind === 'edit') {
    if (!action.changes.length || new Set(action.changes.map(change => change.startsOn)).size !== action.changes.length) throw new Error('Choose distinct configured weeks.')
    for (const change of action.changes) {
      const step = steps.find(step => step.startsOn === change.startsOn)
      if (!step || !editable(step)) throw new Error('Completed weeks are locked. Only configured current or upcoming weeks can be edited.')
      if (!validGoal(change.minimumMinutes)) throw new Error('Choose a target from 15 minutes to 24 hours in 15-minute increments.')
      step.minimumMinutes = change.minimumMinutes
    }
  }
  if (action.kind === 'add') {
    if (steps.length >= 52) throw new Error('Your plan already has 52 configured weeks.')
    const last = steps.at(-1)!
    const sequentialDate = shiftDate(last.startsOn, 7)
    const startsOn = shiftDate(sequentialDate, 6) < today ? shiftDate(sunday(today), 7) : sequentialDate
    steps.push({ week: last.week + 1, startsOn, minimumMinutes: last.minimumMinutes + (enabled ? increment : 0) })
  }
  if (action.kind === 'remove') {
    if (steps.length <= 1 || steps.at(-1)!.startsOn <= today) throw new Error('Only the final upcoming week can be removed.')
    steps.pop()
  }
  // Never change completed weeks or the current target merely by changing preferences.
  // An explicit current-week edit is validated against its predecessor, then future rows cascade.
  if (enabled) for (let i = 1; i < steps.length; i++) {
    const step = steps[i], explicitlyEdited = action.kind === 'edit' && action.changes.some(change => change.startsOn === step.startsOn)
    if (step.startsOn > today || (explicitlyEdited && step.startsOn === current?.startsOn && editable(step))) step.minimumMinutes = Math.max(step.minimumMinutes, steps[i - 1].minimumMinutes + increment)
  }
  if (steps.some(step => (step.startsOn > today || step.minimumMinutes !== schedule.steps.find(old => old.startsOn === step.startsOn)?.minimumMinutes) && !validGoal(step.minimumMinutes))) throw new Error('This progression would exceed 24 hours or use an invalid increment. Reduce the increase, shorten the plan, or pause automatic increases.')
  return { timeZone: schedule.timeZone, schemaVersion: 3, revision: (schedule.revision ?? 0) + 1, progressionEnabled: enabled, incrementMinutes: increment, steps }
}
export function applyGoalChanges(schedule: SpacingSchedule, changes: GoalChange[], today = torontoToday()) { return planUpdate(schedule, { kind: 'edit', changes }, today) }
