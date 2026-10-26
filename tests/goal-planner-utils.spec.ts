import { expect, test } from '@playwright/test'
import { Timestamp } from 'firebase/firestore'
import { correctedSchedule, LEGACY_SCHEDULE, migrationFor, plannerWeeks, applyGoalChanges, planUpdate, needsPlanReview, validateSchedule, validGoal, targetOn } from '../src/utils/spacingSchedule'
import { formatMinutes } from '../src/utils/duration'
import { fromDateTimeInput } from '../src/utils/dateTime'
import { spacingGoal } from '../src/utils/tracking'
import { shiftDate } from '../src/utils/financeDates'
import { buildRewardModel, evaluateRewards, reconcilePlan, rewardTotals } from '../src/utils/rewards'
import type { StoredAward, RewardSource } from '../src/types/rewards'
import { DEFAULT_SLEEP, performanceDays } from '../src/utils/performance'

test('only four initial weeks; corrected Toronto transitions and no fabricated future weeks', () => {
  const schedule = correctedSchedule()
  expect(schedule.steps).toHaveLength(4)
  schedule.steps.forEach((step, i) => {
    expect(step.startsOn).toBe(shiftDate('2026-10-18', i * 7))
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
  expect(plannerWeeks(schedule, '2030-01-01')).toEqual(schedule.steps)
  expect(spacingGoal(schedule, Date.parse('2030-01-01T12:00Z'))).toMatchObject({current:{week:4,minimumMinutes:180},next:null})
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
test('progression preserves higher manual goals, cascades sequentially and can be paused', () => {
  const schedule = correctedSchedule(), today = '2026-10-26'
  expect(planUpdate(schedule,{kind:'progression',enabled:true,increment:30},today).steps.map(row => row.minimumMinutes)).toEqual([60,90,120,180])
  const changed = applyGoalChanges(schedule,[{startsOn:'2026-11-01',minimumMinutes:180}],today)
  expect(changed.steps.map(row => row.minimumMinutes)).toEqual([60,90,180,210])
  const manual = structuredClone(schedule); manual.steps[3].minimumMinutes=240
  expect(applyGoalChanges(manual,[{startsOn:'2026-11-01',minimumMinutes:180}],today).steps[3].minimumMinutes).toBe(240)
  const added = planUpdate(planUpdate(schedule,{kind:'add'},today),{kind:'add'},today)
  expect(applyGoalChanges(added,[{startsOn:'2026-11-01',minimumMinutes:240}],today).steps.map(row => row.minimumMinutes)).toEqual([60,90,240,270,300,330])
  const paused = planUpdate(schedule,{kind:'progression',enabled:false,increment:30},today)
  expect(applyGoalChanges(paused,[{startsOn:'2026-11-08',minimumMinutes:60}],today).steps[3].minimumMinutes).toBe(60)
  const current = applyGoalChanges(schedule,[{startsOn:'2026-10-25',minimumMinutes:120}],today)
  expect(current.steps.map(row => row.minimumMinutes)).toEqual([60,120,150,180])
  expect(() => applyGoalChanges(schedule,[{startsOn:'2026-10-18',minimumMinutes:90}],today)).toThrow(/Completed/)
  for (const minutes of [0,16,60.5,1441]) expect(validGoal(minutes)).toBe(false)
})
test('add exactly one, increments 15/30/60, maximum 52 and final-upcoming deletion', () => {
  const today='2026-10-26'
  for (const increment of [15,30,60] as const) {
    const configured=planUpdate(correctedSchedule(),{kind:'progression',enabled:true,increment},today)
    const added=planUpdate(configured,{kind:'add'},today)
    expect(added.steps).toHaveLength(5)
    expect(added.steps[4].minimumMinutes).toBe(added.steps[3].minimumMinutes+increment)
    expect(added.steps[4].startsOn).toBe('2026-11-15')
    expect(planUpdate(added,{kind:'remove'},today).steps).toEqual(configured.steps)
  }
  let plan=planUpdate(correctedSchedule(),{kind:'progression',enabled:false,increment:30},today)
  while (plan.steps.length<52) plan=planUpdate(plan,{kind:'add'},today)
  plan.steps.forEach((row,i) => expect(row.startsOn).toBe(shiftDate('2026-10-18',i*7)))
  expect(() => planUpdate(plan,{kind:'add'},today)).toThrow(/52/)
  expect(() => planUpdate(correctedSchedule(),{kind:'remove'},'2026-11-09')).toThrow(/upcoming/)
  expect(planUpdate(correctedSchedule(),{kind:'add'},'2027-01-11').steps.at(-1)?.startsOn).toBe('2027-01-17')
})
test('ambiguous generated plans need explicit review, preserve manual values and audit inputs', () => {
  const generated = { timeZone:'America/Toronto',schemaVersion:2 as const,revision:4,steps:Array.from({length:52},(_,i)=>({week:i+1,startsOn:shiftDate('2026-10-18',i*7),minimumMinutes:[60,90,120][i]??180})) }
  generated.steps[7].minimumMinutes=300
  expect(needsPlanReview(generated)).toBe(true)
  expect(migrationFor(generated)).toBeNull()
  expect(() => planUpdate(generated,{kind:'add'},'2026-10-26')).toThrow(/Review/)
  const retained=planUpdate(generated,{kind:'review',keep:52,enabled:false,increment:30},'2026-10-26')
  expect(retained.steps).toEqual(generated.steps)
  const trimmed=planUpdate(generated,{kind:'review',keep:8,enabled:false,increment:30},'2026-10-26')
  expect(trimmed.steps[7].minimumMinutes).toBe(300); expect(generated.steps).toHaveLength(52)
  expect(() => planUpdate(generated,{kind:'review',keep:1,enabled:false,increment:30},'2026-10-26')).toThrow(/historical/)
  const limited=structuredClone(correctedSchedule()); limited.steps[3].minimumMinutes=1440
  expect(() => planUpdate(limited,{kind:'add'},'2026-10-26')).toThrow(/24 hours/)
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
