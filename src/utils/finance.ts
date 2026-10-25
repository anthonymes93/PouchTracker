import type { Entry, ProductKind } from '../types/data'
import type { Baseline, Coverage } from '../types/finance'
import { KINDS } from '../types/finance'
import { addMoney, compareMoney, dollars, entryCost, multiplyMoney, priceCost, subtractMoney, sumMoney, ZERO } from './money'
import type { Money } from './money'
import { dateKey } from './dateTime'
import { dateRange, shiftDate } from './financeDates'

export interface Spending { total: Money; byKind: Record<ProductKind, Money>; unknown: number; unknownByKind: Record<ProductKind, number>; count: number }
export function spending(entries: Entry[]): Spending {
  const result: Spending = { total: ZERO, byKind: { pouch: ZERO, cigarette: ZERO, cigar: ZERO }, unknown: 0, unknownByKind: { pouch: 0, cigarette: 0, cigar: 0 }, count: entries.length }
  for (const entry of entries) {
    const cost = entryCost(entry)
    if (cost === null) { result.unknown++; result.unknownByKind[entry.kind]++; continue }
    result.byKind[entry.kind] = addMoney(result.byKind[entry.kind], cost)
    result.total = addMoney(result.total, cost)
  }
  return result
}
export function entriesInRange(entries: Entry[], start: string, end: string) {
  return entries.filter(entry => { const day = dateKey(entry.occurredAt.toMillis()); return day >= start && day <= end })
}
export function baselineForDay(baselines: Baseline[], day: string) {
  return [...baselines].sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn)).filter(baseline => baseline.effectiveOn <= day).at(-1) ?? null
}
export function baselineDaily(baseline: Baseline, kind: ProductKind) {
  const category = baseline.categories[kind]
  return category ? multiplyMoney(priceCost(category.price), category.dailyCountMilli, 1000) : null
}
export interface DayReport {
  date: string; spending: Spending; complete: boolean; baseline: Money | null
  savings: Money | null; savingsByKind: Partial<Record<ProductKind, Money>>; actualForBaseline: Money
}
export function dailyReport(entries: Entry[], baselines: Baseline[], coverage: Coverage[], start: string, end: string, today: string): DayReport[] {
  const grouped = new Map<string, Entry[]>()
  for (const entry of entries) { const key = dateKey(entry.occurredAt.toMillis()); grouped.set(key, [...(grouped.get(key) ?? []), entry]) }
  const confirmed = new Set(coverage.filter(day => day.complete).map(day => day.date))
  return dateRange(start, end).map(date => {
    const actual = spending(grouped.get(date) ?? [])
    const complete = date < today && confirmed.has(date)
    const baseline = baselineForDay(baselines, date)
    const savingsByKind: Partial<Record<ProductKind, Money>> = {}
    let expected = ZERO, actualForBaseline = ZERO, allKnown = true
    if (baseline) for (const kind of KINDS) {
      const planned = baselineDaily(baseline, kind)
      if (planned === null) continue
      expected = addMoney(expected, planned)
      actualForBaseline = addMoney(actualForBaseline, actual.byKind[kind])
      if (actual.unknownByKind[kind]) allKnown = false
      else if (complete) savingsByKind[kind] = subtractMoney(planned, actual.byKind[kind])
    }
    return { date, spending: actual, complete, baseline: baseline ? expected : null, actualForBaseline,
      savings: baseline && complete && allKnown ? subtractMoney(expected, actualForBaseline) : null, savingsByKind }
  })
}
export function reportSummary(days: DayReport[]) {
  const full = days.filter(day => day.complete && day.spending.unknown === 0)
  const sorted = [...full].sort((a, b) => compareMoney(a.spending.total, b.spending.total))
  const eligible = days.filter(day => day.savings !== null)
  const savings = eligible.length ? sumMoney(eligible.map(day => day.savings!)) : null
  const baseline = sumMoney(eligible.map(day => day.baseline!))
  return {
    average: full.length ? multiplyMoney(sumMoney(full.map(day => day.spending.total)), 1, full.length) : null,
    lowest: sorted[0] ?? null, highest: sorted.at(-1) ?? null,
    savings, eligibleDays: eligible.length, baseline,
    reduction: baseline.n > 0n && savings ? dollars(savings) / dollars(baseline) * 100 : null,
    byKind: Object.fromEntries(KINDS.map(kind => [kind, eligible.some(day => day.savingsByKind[kind]) ? sumMoney(eligible.map(day => day.savingsByKind[kind] ?? ZERO)) : null])) as Record<ProductKind, Money | null>,
  }
}
export function comparison(entries: Entry[], coverage: Coverage[], start: string, today: string) {
  const currentDates = dateRange(start, shiftDate(today, -1))
  if (!currentDates.length) return null
  const previousEnd = shiftDate(start, -1), previousStart = shiftDate(start, -currentDates.length)
  const confirmed = new Set(coverage.filter(day => day.complete).map(day => day.date))
  if (![...currentDates, ...dateRange(previousStart, previousEnd)].every(day => confirmed.has(day))) return null
  const current = spending(entriesInRange(entries, start, shiftDate(today, -1)))
  const previous = spending(entriesInRange(entries, previousStart, previousEnd))
  if (current.unknown || previous.unknown) return null
  return { difference: subtractMoney(current.total, previous.total), percent: previous.total.n > 0n ? (dollars(current.total) / dollars(previous.total) - 1) * 100 : null, previousStart, previousEnd, days: currentDates.length }
}
export function suggestBaseline(entries: Entry[], coverage: Coverage[], start: string, end: string, today: string) {
  if (start > end || end >= today) throw new Error('Choose a past date range ending before today.')
  const days = dateRange(start, end)
  const confirmed = new Set(coverage.filter(day => day.complete).map(day => day.date))
  if (!days.length || !days.every(day => confirmed.has(day))) throw new Error('Confirm complete tracking for every day in the selected range first.')
  const selected = entriesInRange(entries, start, end)
  return Object.fromEntries(KINDS.map(kind => [kind, Math.round(selected.filter(entry => entry.kind === kind).length * 1000 / days.length)])) as Record<ProductKind, number>
}
