import { targetOn } from './spacingSchedule'
import type { Entry, SpacingSchedule } from '../types/data'
import type { Baseline, Coverage } from '../types/finance'
import { baselineForDay, dailyReport, spending } from './finance'
import { dateKey } from './dateTime'
import { dateRange, monday, shiftDate } from './financeDates'
import { sumMoney } from './money'
import { SCORE } from '../config/performance'

import type { SleepData } from '../types/sleep'
import { EMPTY_SLEEP, sleepEvidence } from './sleep'
export type SleepWindow = SleepData
export const DEFAULT_SLEEP = EMPTY_SLEEP
export { validSleep } from './sleep'
export { SCORE } from '../config/performance'
export const RATINGS = ['Excellent', 'On Target', 'Below Target', 'Significantly Below Target', 'Unrated'] as const
export type Rating = typeof RATINGS[number]
export function monthBounds(month: string) {
  const start = `${month}-01`
  const next = new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1)
  return { start, end: shiftDate(next.toISOString().slice(0, 10), -1) }
}
export function monthGrid(month: string) {
  const { start, end } = monthBounds(month)
  return dateRange(monday(start), shiftDate(monday(end), 6))
}
export function shiftMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + delta)
  return date.toISOString().slice(0, 7)
}
export function eligibleInterval(start: number, end: number, sleep: SleepWindow) {
  const evidence = sleepEvidence(start,end,sleep)
  return end > start && evidence.unknownMinutes < 0.000001 && evidence.awakeMinutes > 0
}
export function classification(score: number | null): Rating {
  return score === null ? 'Unrated' : score >= SCORE.excellent ? 'Excellent' : score >= SCORE.onTarget ? 'On Target' : score >= SCORE.below ? 'Below Target' : 'Significantly Below Target'
}
/** score = round(100 * (60*success + 25*clamp(mean/target) + 15*clamp(reduction)) / availableWeights).
 * success = met / eligible; reduction = 1 - dailyPouches / effectiveBaselinePouches.
 * Missing/nonpositive pouch baseline removes its 15 weight (denominator 85); no assumed baseline.
 * All components are capped at 1, so exceeding target never hurts and more uses earn no bonus.
 * Caller requires confirmed past-day coverage, a scheduled target and at least two intervals.
 */
export function scoreDay(success: number, ratio: number, reduction: number | null) {
  const weights = SCORE.adherence + SCORE.spacing + (reduction === null ? 0 : SCORE.reduction)
  return Math.round(100 * (SCORE.adherence * Math.min(1, Math.max(0, success)) + SCORE.spacing * Math.min(1, Math.max(0, ratio)) + (reduction === null ? 0 : SCORE.reduction * Math.min(1, Math.max(0, reduction)))) / weights)
}
export function performanceDays(entries: Entry[], baselines: Baseline[], coverage: Coverage[], schedule: SpacingSchedule | null, sleep: SleepWindow, start: string, end: string, today: string) {
  const grouped = new Map<string, Entry[]>()
  for (const entry of entries) { const key = dateKey(entry.occurredAt.toMillis()); const group = grouped.get(key) ?? []; group.push(entry); grouped.set(key, group) }
  const allPouches = entries.filter(entry=>entry.kind==='pouch').sort((a,b)=>a.occurredAt.toMillis()-b.occurredAt.toMillis())
  return dailyReport(entries, baselines, coverage, start, end, today).map(finance => {
    const date = finance.date
    const timeline = (grouped.get(date) ?? []).sort((a, b) => a.occurredAt.toMillis() - b.occurredAt.toMillis())
    const counts = { pouch: 0, cigarette: 0, cigar: 0, total: timeline.length }
    timeline.forEach(entry => counts[entry.kind]++)
    const target = targetOn(schedule, date)?.minimumMinutes ?? null
    const intervals: number[] = []
    let sleepUnknown = false
    for (let i = 1; i < allPouches.length; i++) {
      const a=allPouches[i-1].occurredAt.toMillis(), b=allPouches[i].occurredAt.toMillis()
      if (dateKey(b)!==date || dateKey(a)!==date) continue
      const evidence=sleepEvidence(a,b,sleep)
      if (evidence.unknownMinutes > 0.000001) sleepUnknown=true
      if (eligibleInterval(a,b,sleep)) intervals.push(evidence.awakeMinutes)
    }
    const average = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null
    const met = target ? intervals.filter(value => value >= target).length : 0
    const success = target && intervals.length ? met / intervals.length : null
    const ratio = target && average !== null ? average / target : null
    const baseline = baselineForDay(baselines, date)?.categories.pouch?.dailyCountMilli
    const reduction = baseline && baseline > 0 ? 1 - counts.pouch / (baseline / 1000) : null
    const nicotineFree = finance.complete && counts.total === 0
    const reason = date >= today ? 'Today and future days are not rated.' : !finance.complete ? 'Confirm that all use is logged before rating this day.' : nicotineFree ? 'Confirmed nicotine-free day. Recognized without inventing spacing intervals.' : sleepUnknown ? 'Sleep/awake coverage is unknown for one or more intervals. Scores are provisional until reviewed in Sleep Tracking.' : !target ? 'No spacing target was scheduled for this date.' : intervals.length < SCORE.minimumIntervals ? `At least ${SCORE.minimumIntervals} verified awake intervals are needed. Less use does not earn a penalty; no need to log more to earn a score.` : '60% target success, 25% average interval / target (capped at 100%), 15% reduction from the effective pouch baseline. Without a positive pouch baseline, the first two weights are normalized to 100%.'
    const score = date < today && finance.complete && !sleepUnknown && target && intervals.length >= SCORE.minimumIntervals ? scoreDay(success!, ratio!, reduction) : null
    return { ...finance, counts, timeline, target, intervals, sleepUnknown, average, met, success, ratio, reduction, nicotineFree, reason, score, rating: classification(score), longest: intervals.length ? Math.max(...intervals) : null, shortest: intervals.length ? Math.min(...intervals) : null, beyond: target ? intervals.reduce((sum, value) => sum + Math.max(0, value - target), 0) : null }
  })
}
export type PerformanceDay = ReturnType<typeof performanceDays>[number]
export function summarizePerformance(days: PerformanceDay[]) {
  const verified = days.filter(day => day.complete)
  const intervals = verified.flatMap(day => day.intervals)
  const eligible = verified.filter(day => day.target !== null)
  const targetIntervals = eligible.flatMap(day => day.intervals)
  const counts = { pouch: 0, cigarette: 0, cigar: 0 }
  verified.forEach(day => { counts.pouch += day.counts.pouch; counts.cigarette += day.counts.cigarette; counts.cigar += day.counts.cigar })
  const savings = verified.filter(day => day.savings !== null)
  return { days: verified.length, counts, averagePouches: verified.length ? counts.pouch / verified.length : null,
    average: intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null,
    success: targetIntervals.length ? eligible.reduce((sum, day) => sum + day.met, 0) / targetIntervals.length : null,
    ratio: targetIntervals.length ? eligible.reduce((sum, day) => sum + day.intervals.reduce((s, n) => s + n / day.target!, 0), 0) / targetIntervals.length : null,
    spending: spending(verified.flatMap(day => day.timeline)), savings: savings.length ? sumMoney(savings.map(day => day.savings!)) : null, savingsDays: savings.length,
    ratings: Object.fromEntries(RATINGS.map(rating => [rating, days.filter(day => day.rating === rating).length])) as Record<Rating, number> }
}
// Compare equal numbers of confirmed completed days, ordered chronologically. Never impute missing days.
export function comparePeriods(a: PerformanceDay[], b: PerformanceDay[]) {
  const av = a.filter(day => day.complete), bv = b.filter(day => day.complete), count = Math.min(av.length, bv.length)
  return { a: summarizePerformance(av.slice(0, count)), b: summarizePerformance(bv.slice(0, count)), aDates: av.slice(0, count).map(day => day.date), bDates: bv.slice(0, count).map(day => day.date), partial: count !== a.length || count !== b.length }
}
export function personalBests(days: PerformanceDay[]) {
  let streak = 0, longestStreak = 0, last = ''
  for (const day of days) {
    const meets = day.complete && (day.nicotineFree || (day.intervals.length >= SCORE.minimumIntervals && day.success === 1))
    streak = meets ? (last && shiftDate(last, 1) === day.date ? streak + 1 : 1) : 0
    longestStreak = Math.max(longestStreak, streak); last = day.date
  }
  const verified = days.filter(day => day.complete)
  const best = (values: number[]) => values.length ? Math.max(...values) : null
  return { interval: best(verified.flatMap(day => day.intervals)), score: best(verified.flatMap(day => day.score === null ? [] : [day.score])), streak: longestStreak,
    lowest: verified.length ? Math.min(...verified.map(day => day.counts.pouch)) : null, reduction: best(verified.flatMap(day => day.reduction === null ? [] : [Math.max(0, day.reduction)])) }
}
