import { test, expect } from '@playwright/test'
import { Timestamp } from 'firebase/firestore'
import type { Entry, SpacingSchedule } from '../src/types/data'
import type { Baseline, Coverage } from '../src/types/finance'
import { classification, comparePeriods, DEFAULT_SLEEP, eligibleInterval, monthBounds, monthGrid, performanceDays, personalBests, scoreDay, shiftMonth, summarizePerformance, validSleep } from '../src/utils/performance'
import { dateKey, fromDateTimeInput } from '../src/utils/dateTime'
import { formatCost } from '../src/utils/money'
const schedule: SpacingSchedule = { timeZone: 'America/Toronto', steps: [{ week: 1, startsOn: '2026-01-01', minimumMinutes: 60 }, { week: 2, startsOn: '2026-10-24', minimumMinutes: 120 }] }
const entry = (time: string, kind: Entry['kind'] = 'pouch', costCents: number | null = 100): Entry => ({ id: time, uid: 'unit', kind, occurredAt: Timestamp.fromMillis(fromDateTimeInput(time)), createdAt: null, updatedAt: null, costCents, currency: 'CAD', pending: false })
const covered = (...dates: string[]): Coverage[] => dates.map(date => ({ date, complete: true, updatedAt: null }))
const baseline: Baseline = { id: 'base', effectiveOn: '2026-01-01', createdAt: null, categories: { pouch: { dailyCountMilli: 6000, price: { packCents: 100, quantity: 1 } } } }
const entries = ['09:00', '10:00', '12:00'].map(time => entry(`2026-10-23T${time}`))
const report = (values = entries, coverage = covered('2026-10-23'), baselines: Baseline[] = []) => performanceDays(values, baselines, coverage, schedule, DEFAULT_SLEEP, '2026-10-23', '2026-10-25', '2026-10-25')

test('Monday grids, leap years and year navigation use calendar dates', () => {
  expect(monthBounds('2024-02').end).toBe('2024-02-29'); expect(monthBounds('2025-02').end).toBe('2025-02-28')
  const grid = monthGrid('2026-11'); expect(grid[0]).toBe('2026-10-26'); expect(grid.at(-1)).toBe('2026-12-06'); expect(grid.length % 7).toBe(0)
  expect(shiftMonth('2026-01', -1)).toBe('2025-12'); expect(shiftMonth('2024-02', 12)).toBe('2025-02')
  expect(dateKey(Date.parse('2026-11-01T03:59:59Z'))).toBe('2026-10-31')
})
test('weighted scoring, no baseline reweighting and exact thresholds', () => {
  expect(scoreDay(1, 1, null)).toBe(100); expect(scoreDay(.5, .75, null)).toBe(57)
  expect(scoreDay(1, 1, .5)).toBe(93); expect(scoreDay(1, 2, .5)).toBe(93)
  expect(scoreDay(0, 0, -1)).toBe(0)
  expect([null, 0, 49, 50, 74, 75, 89, 90, 100].map(classification)).toEqual(['Unrated', 'Significantly Below Target', 'Significantly Below Target', 'Below Target', 'Below Target', 'On Target', 'On Target', 'Excellent', 'Excellent'])
})
test('sleep boundaries, daytime, midnight and cross-month pairs are excluded fairly', () => {
  const eligible = (a: string, b: string) => eligibleInterval(fromDateTimeInput(a), fromDateTimeInput(b), DEFAULT_SLEEP)
  expect(eligible('2026-10-23T09:00', '2026-10-23T22:59')).toBe(true)
  expect(eligible('2026-10-23T08:59', '2026-10-23T10:00')).toBe(false)
  expect(eligible('2026-10-23T22:00', '2026-10-23T23:00')).toBe(false)
  expect(eligible('2026-10-23T01:00', '2026-10-23T02:00')).toBe(false)
  expect(eligible('2026-10-31T22:00', '2026-11-01T10:00')).toBe(false)
  expect(validSleep({ start: '23:00', end: '23:00' })).toBe(false)
  expect(validSleep({ start: '24:00', end: '09:00' })).toBe(false)
})
test('DST spring and repeated fall hour use real elapsed time and both sleep occurrences', () => {
  const a = Date.parse('2026-11-01T05:50:00Z'), b = Date.parse('2026-11-01T06:50:00Z')
  expect(eligibleInterval(a, b, { start: '01:30', end: '01:45' })).toBe(false)
  expect(eligibleInterval(a, b, { start: '03:00', end: '04:00' })).toBe(true)
  const springA = Date.parse('2026-03-08T06:30:00Z'), springB = Date.parse('2026-03-08T07:30:00Z')
  expect(eligibleInterval(springA, springB, DEFAULT_SLEEP)).toBe(false)
  expect(eligibleInterval(springA, springB, { start: '23:00', end: '01:00' })).toBe(true)
  const dst = performanceDays([{ ...entry('2026-03-08T01:30'), occurredAt: Timestamp.fromMillis(springA) }, { ...entry('2026-03-08T03:30'), occurredAt: Timestamp.fromMillis(springB) }], [], covered('2026-03-08'), schedule, { start: '23:00', end: '01:00' }, '2026-03-08', '2026-03-08', '2026-03-09')
  expect(dst[0].average).toBe(60)
})
test('confirmed, missing, insufficient and nicotine-free days never invent a score', () => {
  expect(report()[0].score).toBe(100); expect(report(entries, [])[0].score).toBeNull()
  expect(report(entries.slice(0, 2))[0].score).toBeNull(); expect(report([])[0].nicotineFree).toBe(true)
  expect(report([])[0].score).toBeNull(); expect(report([], [])[0].nicotineFree).toBe(false)
  expect(report(entries, covered('2026-10-25'))[2].complete).toBe(false)
  expect(report(entries, covered('2026-10-23'), [baseline])[0].score).toBe(93)
  expect(report(entries, covered('2026-10-23'), [{ ...baseline, categories: {} }])[0].score).toBe(100)
})
test('date-effective targets preserve actual duration while relative success changes', () => {
  const values = [...entries, ...entries.map(value => ({ ...value, occurredAt: Timestamp.fromMillis(value.occurredAt.toMillis() + 86400000) }))]
  const days = report(values, covered('2026-10-23', '2026-10-24'))
  expect(days[0].average).toBe(90); expect(days[1].average).toBe(90)
  expect(days[0].success).toBe(1); expect(days[1].success).toBe(.5)
  expect(days[0].beyond).toBe(60); expect(days[1].beyond).toBe(0)
})
test('weekly/monthly aggregation excludes incomplete data and reuses exact financial prices', () => {
  const days = report([...entries, entry('2026-10-23T13:00', 'cigar', 347), entry('2026-10-24T12:00', 'cigarette', null)], covered('2026-10-23'), [baseline])
  const summary = summarizePerformance(days)
  expect(summary.days).toBe(1); expect(summary.counts).toEqual({ pouch: 3, cigar: 1, cigarette: 0 }); expect(summary.average).toBe(90)
  expect(formatCost(summary.spending.total)).toBe('$6.47'); expect(formatCost(summary.savings)).toBe('$3.00')
  expect(summary.ratings.Excellent).toBe(1); expect(summary.ratings.Unrated).toBe(2)
  const unknown = report([entry('2026-10-23T10:00', 'pouch', null)], covered('2026-10-23'), [baseline])[0]
  expect(unknown.savings).toBeNull(); expect(unknown.spending.unknown).toBe(1)
})
test('comparison matches confirmed days and avoids invented zero coverage', () => {
  const a = report(entries, covered('2026-10-23', '2026-10-24')), b = report(entries, covered('2026-10-23'))
  const result = comparePeriods(a, b)
  expect(result.a.days).toBe(1); expect(result.b.days).toBe(1); expect(result.partial).toBe(true)
  expect(result.aDates).toEqual(['2026-10-23']); expect(result.a.averagePouches).toBe(3)
  expect(comparePeriods(a, report(entries, [])).a.averagePouches).toBeNull()
})
test('personal bests require evidence and unknown dates break streaks', () => {
  const days = performanceDays(entries, [baseline], covered('2026-10-23', '2026-10-24', '2026-10-26'), schedule, DEFAULT_SLEEP, '2026-10-23', '2026-10-26', '2026-10-27')
  const best = personalBests(days)
  expect(best.interval).toBe(120); expect(best.score).toBe(93); expect(best.streak).toBe(2); expect(best.lowest).toBe(0); expect(best.reduction).toBe(1)
  expect(personalBests(report(entries, [])).interval).toBeNull()
})
