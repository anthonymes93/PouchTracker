import { expect, test } from '@playwright/test'
import { Timestamp } from 'firebase/firestore'
import { correctedSchedule, LEGACY_SCHEDULE, migrationFor, plannerWeeks, applyGoalChanges, bulkGoalChanges, validateSchedule, validGoal, targetOn } from '../src/utils/spacingSchedule'
import { formatMinutes } from '../src/utils/duration'
import { fromDateTimeInput } from '../src/utils/dateTime'
import { spacingGoal } from '../src/utils/tracking'
import { shiftDate } from '../src/utils/financeDates'
import { buildRewardModel, evaluateRewards, reconcilePlan, rewardTotals } from '../src/utils/rewards'
import type { StoredAward, RewardSource } from '../src/types/rewards'
import { DEFAULT_SLEEP, performanceDays } from '../src/utils/performance'

test('all 52 Sunday dates, Toronto midnights, week 2 today and DST boundaries', () => {
  const schedule = correctedSchedule()
  expect(schedule.steps).toHaveLength(52)
  schedule.steps.forEach((step, i) => {
    expect(step.startsOn).toBe(shiftDate('2026-10-18', i * 7))
    expect(new Date(`${step.startsOn}T12:00Z`).getUTCDay()).toBe(0)
    const ms = fromDateTimeInput(`${step.startsOn}T00:00`)
    expect(spacingGoal(schedule, ms).current?.week).toBe(i + 1)
    expect(spacingGoal(schedule, ms - 1).current?.week ?? 0).toBe(i)
  })
  expect(targetOn(schedule, '2026-10-25')?.minimumMinutes).toBe(90)
  expect(targetOn(schedule, '2026-11-01')?.minimumMinutes).toBe(120)
  expect(targetOn(schedule, '2026-11-08')?.minimumMinutes).toBe(180)
  const length = (a: string, b: string) => (fromDateTimeInput(`${b}T00:00`) - fromDateTimeInput(`${a}T00:00`)) / 3600000
  expect(length('2026-11-01', '2026-11-08')).toBe(169)
  expect(length('2027-03-14', '2027-03-21')).toBe(167)
  const future = plannerWeeks(schedule, '2030-01-01').filter(row => row.startsOn >= '2029-12-30')
  expect(future).toHaveLength(52); expect(future.every(row => row.minimumMinutes === 180)).toBe(true)
})
test('duration formatter covers decimal halves and mixed hours without changing values', () => {
  const expected = ['30 min', '45 min', '1 hr', '1 hr 10 min', '1 hr 15 min', '1.5 hrs', '2 hrs', '2 hrs 15 min', '2.5 hrs', '3 hrs', '3.5 hrs', '4 hrs', '4 hrs 45 min', '5 hrs', '24 hrs']
  expect([30,45,60,70,75,90,120,135,150,180,210,240,285,300,1440].map(formatMinutes)).toEqual(expected)
  expect(formatMinutes(null)).toBe('Unavailable')
})
test('migration corrects exact legacy values once, preserves custom targets and rejects corruption', () => {
  expect(migrationFor(LEGACY_SCHEDULE)).toEqual(correctedSchedule())
  expect(migrationFor({ timeZone: LEGACY_SCHEDULE.timeZone, steps: LEGACY_SCHEDULE.steps.map(step => ({ minimumMinutes: step.minimumMinutes, startsOn: step.startsOn, week: step.week })) })).toEqual(correctedSchedule())
  expect(migrationFor(null)).toEqual(correctedSchedule())
  expect(migrationFor(correctedSchedule())).toBeNull()
  const custom = structuredClone(LEGACY_SCHEDULE); custom.steps[1].minimumMinutes = 105
  expect(migrationFor(custom)?.steps).toEqual(custom.steps)
  expect(() => validateSchedule({ ...custom, steps: [{ ...custom.steps[0], startsOn: '2026-02-30' }] })).toThrow()
  expect(() => validateSchedule({ ...custom, steps: [custom.steps[0], custom.steps[0]] })).toThrow()
})
test('individual and current edits preserve historical and following targets, with 15 minute limits', () => {
  const schedule = correctedSchedule()
  const next = applyGoalChanges(schedule, [{ startsOn: '2026-10-25', minimumMinutes: 75 }], '2026-10-25')
  expect(next.revision).toBe(2)
  expect(next.steps.slice(0, 4).map(step => step.minimumMinutes)).toEqual([60,75,120,180])
  expect(schedule.steps[1].minimumMinutes).toBe(90)
  expect(() => applyGoalChanges(schedule, [{ startsOn: '2026-10-18', minimumMinutes: 90 }], '2026-10-25')).toThrow(/Completed/)
  for (const value of [0, 14, 16, 1441, 60.5]) expect(validGoal(value)).toBe(false)
  for (const value of [15,45,75,1440]) expect(validGoal(value)).toBe(true)
  expect(() => applyGoalChanges(schedule, [{ startsOn: '2026-11-01', minimumMinutes: 61 }], '2026-10-25')).toThrow(/15-minute/)
})
test('bulk set, increase and reset review only selected future weeks; reject invalid ranges', () => {
  const schedule = correctedSchedule(), rows = plannerWeeks(schedule, '2026-10-25')
  const change = (mode: 'set'|'increase'|'reset', minutes: number) => bulkGoalChanges(rows, '2026-11-01', '2026-11-15', mode, minutes, '2026-10-25')
  expect(change('set', 240).map(row => row.minimumMinutes)).toEqual([240,240,240])
  expect(change('increase', 15).map(row => row.minimumMinutes)).toEqual([135,195,195])
  expect(change('reset', 0).map(row => row.minimumMinutes)).toEqual([90,90,90])
  expect(applyGoalChanges(schedule, change('set', 45), '2026-10-25').steps.slice(0,6).map(row => row.minimumMinutes)).toEqual([60,90,45,45,45,180])
  expect(() => bulkGoalChanges(rows, '2026-10-25','2026-11-01','set',90,'2026-10-25')).toThrow(/upcoming/)
  expect(() => applyGoalChanges(schedule, change('increase', 1440), '2026-10-25')).toThrow()
})
test('corrected history recalculates scores and invalidates/restores XP without duplicate IDs or altered logs', () => {
  const times = ['09:00','10:00','11:00']
  const source: RewardSource = { schedule: LEGACY_SCHEDULE, sleep: DEFAULT_SLEEP, baselines: [], coverage: [{ date: '2026-10-25', complete: true, updatedAt: null }], entries: times.map((time, i) => ({ id: String(i), uid:'test', kind:'pouch', occurredAt:Timestamp.fromMillis(fromDateTimeInput(`2026-10-25T${time}`)), createdAt:null, updatedAt:null, costCents:100, currency:'CAD', pending:false })) }
  const now = fromDateTimeInput('2026-10-26T10:00')
  const evaluate = () => evaluateRewards(buildRewardModel(source, now), now)
  const old = evaluate(), beforeEntries = source.entries
  const oldScore = performanceDays(source.entries, [], source.coverage, source.schedule, DEFAULT_SLEEP,'2026-10-25','2026-10-25','2026-10-26')[0].score
  source.schedule = correctedSchedule()
  const corrected = evaluate()
  const score = performanceDays(source.entries, [], source.coverage, source.schedule, DEFAULT_SLEEP,'2026-10-25','2026-10-25','2026-10-26')[0].score
  expect(score!).toBeLessThan(oldScore!)
  const stored = old.awards.map(award => ({ ...award, revision:1, firstRecordedAt:now, updatedAt:now, reason:'test' })) as StoredAward[]
  const reconciled = reconcilePlan(stored, corrected.awards)
  expect(reconciled.some(award => award.status === 'invalidated')).toBe(true)
  expect(new Set(reconciled.map(award => award.id)).size).toBe(reconciled.length)
  source.schedule = LEGACY_SCHEDULE
  const restored = reconcilePlan(reconciled as StoredAward[], evaluate().awards)
  expect(rewardTotals(restored).xp).toBe(rewardTotals(old.awards).xp)
  expect(source.entries).toBe(beforeEntries)
})
