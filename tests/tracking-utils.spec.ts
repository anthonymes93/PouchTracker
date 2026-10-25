import { test, expect } from '@playwright/test'
import { Timestamp } from 'firebase/firestore'
import { DEFAULT_SCHEDULE, TIME_ZONE } from '../src/config/defaults'
import { dailyCounts, durationParts, elapsedSeconds, spacingGoal, spacingProgress } from '../src/utils/tracking'
import { dateKey, dayBounds, fromDateTimeInput, toDateTimeInput } from '../src/utils/dateTime'
import type { Entry } from '../src/types/data'

for (const [date, week, minutes] of [['2026-10-18', 1, 60], ['2026-10-25', 2, 90], ['2026-11-01', 3, 120], ['2026-11-08', 4, 180]] as const) {
  test(`schedule changes at Toronto midnight on ${date}`, () => {
    const boundary = fromDateTimeInput(`${date}T00:00:00`)
    expect(spacingGoal(DEFAULT_SCHEDULE, boundary).current).toMatchObject({ week, minimumMinutes: minutes })
    expect(spacingGoal(DEFAULT_SCHEDULE, boundary - 1).current?.week ?? 0).toBe(week - 1)
  })
}
test('schedule before start, UTC disagreement, DST and indefinite final week', () => {
  expect(spacingGoal(DEFAULT_SCHEDULE, Date.parse('2026-10-18T02:00:00Z')).current).toBeNull()
  expect(spacingGoal(DEFAULT_SCHEDULE, Date.parse('2026-10-25T03:59:59Z')).current?.week).toBe(1)
  expect(spacingGoal(DEFAULT_SCHEDULE, Date.parse('2026-11-01T03:59:59Z')).current?.week).toBe(2)
  expect(spacingGoal(DEFAULT_SCHEDULE, Date.parse('2030-01-01T12:00:00Z'))).toMatchObject({ current: { minimumMinutes: 180 } })
})
test('timer is timestamp-derived across refresh, nonnegative, and counts beyond a target', () => {
  const last = Date.parse('2026-10-24T14:00:00Z')
  expect(elapsedSeconds(last, last + 5076000)).toBe(5076)
  expect(durationParts(5076)).toEqual(['01', '24', '36'])
  expect(elapsedSeconds(last, last - 1000)).toBe(0)
  expect(elapsedSeconds(null, last)).toBeNull()
  expect(durationParts(360_001)).toEqual(['100', '00', '01'])
  expect(spacingProgress(5076, 60)).toEqual({ percent: 100, remaining: 0, beyond: 1476, reached: true })
  expect(spacingProgress(1800, 60)).toEqual({ percent: 50, remaining: 1800, beyond: 0, reached: false })
  expect(spacingProgress(null, 60)).toBeNull()
})
test('Toronto daily boundaries are DST-aware, including 23 and 25 hour days', () => {
  for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25], ['2026-10-24', 24]] as const) {
    const { start, end } = dayBounds(Date.parse(`${date}T12:00:00Z`))
    expect((end - start) / 3_600_000).toBe(hours)
    expect(dateKey(start)).toBe(date)
    expect(dateKey(end - 1)).toBe(date)
    expect(dateKey(end)).not.toBe(date)
  }
})
test('editing resolves wall times independently of device timezone and rejects DST gaps', () => {
  expect(fromDateTimeInput('2026-10-24T12:34:56')).toBe(Date.parse('2026-10-24T16:34:56Z'))
  expect(() => fromDateTimeInput('2026-03-08T02:30:00')).toThrow(/does not exist/)
  expect(() => fromDateTimeInput('2026-02-30T12:00:00')).toThrow()
  expect(fromDateTimeInput('2026-11-01T01:30:00')).toBe(Date.parse('2026-11-01T05:30:00Z'))
  const secondOccurrence = Date.parse('2026-11-01T06:30:00Z')
  expect(fromDateTimeInput(toDateTimeInput(secondOccurrence), TIME_ZONE, secondOccurrence)).toBe(secondOccurrence)
  expect(toDateTimeInput(Date.parse('2026-11-13T05:00:00Z'))).toBe('2026-11-13T00:00:00')
})
test('daily counts include only local today at both midnight boundaries', () => {
  const now = Date.parse('2026-11-01T17:00:00Z')
  const { start, end } = dayBounds(now)
  const entry = (ms: number, kind: Entry['kind']): Entry => ({ id: String(ms), uid: 'unit', kind, occurredAt: Timestamp.fromMillis(ms), createdAt: null, updatedAt: null, costCents: null, currency: 'CAD', pending: false })
  expect(dailyCounts([entry(start - 1, 'pouch'), entry(start, 'pouch'), entry(end - 1, 'cigar'), entry(end, 'cigarette'), entry(now, 'cigarette')], now, TIME_ZONE)).toEqual({ pouch: 1, cigar: 1, cigarette: 1, total: 3 })
})
