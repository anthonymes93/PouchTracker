import { test, expect } from '@playwright/test'
import { Timestamp } from 'firebase/firestore'
import type { Entry } from '../src/types/data'
import type { Baseline, Coverage, PriceSnapshot } from '../src/types/finance'
import { entryCost, formatCost, money, parseDecimal, priceCost } from '../src/utils/money'
import { baselineForDay, comparison, dailyReport, entriesInRange, reportSummary, spending, suggestBaseline } from '../src/utils/finance'
import { monday, periodStart } from '../src/utils/financeDates'
import { fromDateTimeInput } from '../src/utils/dateTime'
const entry = (time: string, price: PriceSnapshot | null = { packCents: 1299, quantity: 20 }, kind: Entry['kind'] = 'pouch'): Entry => ({ id: time, uid: 'unit', kind, occurredAt: Timestamp.fromMillis(fromDateTimeInput(time)), createdAt: null, updatedAt: null, costCents: null, priceSnapshot: price, currency: 'CAD', pending: false })
const covered = (...days: string[]): Coverage[] => days.map(date => ({ date, complete: true, updatedAt: null }))
const baseline = (date: string, count: number, packCents = 1300): Baseline => ({ id: date, effectiveOn: date, createdAt: null, categories: { pouch: { dailyCountMilli: count * 1000, price: { packCents, quantity: 20 } } } })

test('unit prices and all cigar presets use exact rational cents', () => {
  expect(formatCost(priceCost({ packCents: 1299, quantity: 20 }), 4)).toBe('$0.6495')
  expect(formatCost(priceCost({ packCents: 1769, quantity: 25 }), 4)).toBe('$0.7076')
  for (const cents of [190, 230, 250]) expect(entryCost({ costCents: cents })).toEqual(money(cents))
  expect(parseDecimal('12.99', 2)).toBe(1299)
  expect(() => parseDecimal('12.999', 2)).toThrow()
  expect(() => priceCost({ packCents: 100, quantity: 0 })).toThrow()
})
test('fractional cents are aggregated before rounding, including repeating thirds', () => {
  const entries = Array.from({ length: 200 }, () => entry('2026-10-24T12:00'))
  expect(formatCost(spending(entries).total)).toBe('$129.90')
  expect(formatCost(spending(Array.from({ length: 3 }, () => entry('2026-10-24T12:00', { packCents: 100, quantity: 3 }))).total)).toBe('$1.00')
})
test('old unknown prices are explicit, legacy cigars work, and known zero is distinct', () => {
  const unknown = entry('2026-10-24T12:00', null)
  const legacy = { ...unknown, kind: 'cigar' as const, costCents: 230, priceSnapshot: undefined }
  const free = entry('2026-10-24T12:00', { packCents: 0, quantity: 20 })
  const total = spending([unknown, legacy, free])
  expect(total.unknown).toBe(1); expect(total.count).toBe(3)
  expect(formatCost(total.total)).toBe('$2.30')
  expect(entryCost(unknown)).toBeNull(); expect(entryCost(free)).toEqual(money(0))
})
test('Toronto daily, Monday weekly, monthly and year boundaries include the right entries', () => {
  const entries = [entry('2026-10-18T23:59:59'), entry('2026-10-19T00:00'), entry('2026-10-24T23:59:59'), entry('2026-11-01T00:00')]
  expect(monday('2026-10-25')).toBe('2026-10-19')
  expect(monday('2026-10-26')).toBe('2026-10-26')
  expect(spending(entriesInRange(entries, '2026-10-24', '2026-10-24')).count).toBe(1)
  expect(spending(entriesInRange(entries, monday('2026-10-24'), '2026-10-24')).count).toBe(2)
  expect(spending(entriesInRange(entries, '2026-10-01', '2026-10-31')).count).toBe(3)
  expect(periodStart('year', '2027-01-02', '2026-01-01')).toBe('2027-01-01')
  const utc = { ...entry('2026-10-24T23:59:59'), occurredAt: Timestamp.fromMillis(Date.parse('2026-10-25T03:59:59Z')) }
  expect(entriesInRange([utc], '2026-10-24', '2026-10-24')).toHaveLength(1)
})
test('baseline savings, negative savings, missing days and partial today are distinguished', () => {
  const entries = [entry('2026-10-22T12:00', { packCents: 1300, quantity: 20 }), ...Array.from({ length: 3 }, () => entry('2026-10-23T12:00', { packCents: 1300, quantity: 20 }))]
  const days = dailyReport(entries, [baseline('2026-10-20', 2)], covered('2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'), '2026-10-20', '2026-10-24', '2026-10-24')
  expect(days[0].savings).toBeNull()
  expect(formatCost(days[1].savings)).toBe('$1.30') // confirmed zero
  expect(formatCost(days[2].savings)).toBe('$0.65')
  expect(formatCost(days[3].savings)).toBe('-$0.65')
  expect(days[4].savings).toBeNull() // today, even if a malformed coverage record says complete
  expect(reportSummary(days).eligibleDays).toBe(3)
  expect(formatCost(reportSummary(days).savings)).toBe('$1.30')
})
test('baseline versions change only from their effective day and do not include earlier days', () => {
  const versions = [baseline('2026-10-22', 2), baseline('2026-10-24', 4)]
  expect(baselineForDay(versions, '2026-10-21')).toBeNull()
  expect(baselineForDay(versions, '2026-10-23')?.id).toBe('2026-10-22')
  const days = dailyReport([], versions, covered('2026-10-23', '2026-10-24'), '2026-10-23', '2026-10-24', '2026-10-25')
  expect(formatCost(days[0].savings)).toBe('$1.30'); expect(formatCost(days[1].savings)).toBe('$2.60')
})
test('unpriced selected categories block savings and incomplete coverage blocks comparisons', () => {
  const entries = [entry('2026-10-23T12:00', null)]
  const days = dailyReport(entries, [baseline('2026-10-20', 2)], covered('2026-10-23'), '2026-10-23', '2026-10-23', '2026-10-24')
  expect(days[0].savings).toBeNull(); expect(reportSummary(days).average).toBeNull()
  expect(comparison([], [], '2026-10-23', '2026-10-24')).toBeNull()
  expect(comparison([], covered('2026-10-22', '2026-10-23'), '2026-10-23', '2026-10-24')?.difference).toEqual(money(0))
})
test('deletion, restoration, price corrections and time-only edits preserve financial semantics', () => {
  const original = entry('2026-10-23T12:00')
  const edited = { ...original, occurredAt: Timestamp.fromMillis(fromDateTimeInput('2026-10-22T12:00')) }
  expect(entryCost(edited)).toEqual(entryCost(original))
  expect(spending([]).total).toEqual(money(0))
  expect(spending([{ ...original }]).total).toEqual(spending([original]).total)
  const corrected = { ...original, priceSnapshot: { packCents: 1499, quantity: 20 } }
  expect(formatCost(entryCost(corrected), 4)).toBe('$0.7495')
  expect(formatCost(entryCost(original), 4)).toBe('$0.6495')
})
test('baseline suggestion includes confirmed zeros, requires complete range, and handles empty reports', () => {
  const entries = [entry('2026-10-22T12:00')]
  expect(suggestBaseline(entries, covered('2026-10-22', '2026-10-23'), '2026-10-22', '2026-10-23', '2026-10-24').pouch).toBe(500)
  expect(() => suggestBaseline(entries, [], '2026-10-22', '2026-10-23', '2026-10-24')).toThrow()
  expect(reportSummary([]).savings).toBeNull(); expect(reportSummary([]).average).toBeNull()
})
