import { ACHIEVEMENTS, DAILY_SCORE_THRESHOLD, DAILY_XP_CAP, MILESTONES, REDUCTION_DAYS } from '../config/rewards'
import type { Award, RewardEvidence, RewardSource, StoredAward } from '../types/rewards'
import { dateKey, fromDateTimeInput } from './dateTime'
import { dateRange, monday, shiftDate } from './financeDates'
import { baselineForDay } from './finance'
import { eligibleInterval, performanceDays } from './performance'
import { awakeProgress, awakeWindows } from './rewardTime'

const emptyEvidence = (date: string, detail: string): RewardEvidence => ({ startDate: date, endDate: date, startEntryId: '', startMs: 0, targetMinutes: 0, awakeMinutes: 0, intervalMinutes: 0, detail })
const dayEnd = (date: string) => fromDateTimeInput(`${shiftDate(date, 1)}T00:00`) - 1
export function goalAt(source: RewardSource, ms: number) { return [...(source.schedule?.steps ?? [])].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).filter(step => step.startsOn <= dateKey(ms)).at(-1)?.minimumMinutes ?? null }
export function buildRewardModel(source: RewardSource, now: number) {
  const today = dateKey(now), confirmed = new Set(source.coverage.filter(day => day.complete && day.date < today).map(day => day.date))
  const pouches = source.entries.filter(entry => entry.kind === 'pouch' && entry.occurredAt.toMillis() <= now).sort((a, b) => a.occurredAt.toMillis() - b.occurredAt.toMillis() || a.id.localeCompare(b.id))
  const earliest = [...source.entries.map(entry => dateKey(entry.occurredAt.toMillis())), ...confirmed].sort()[0] ?? today
  const days = performanceDays(source.entries, source.baselines, source.coverage, source.schedule, source.sleep, earliest, shiftDate(today, -1), today)
  const cache = new Map<string, [number, number][]>()
  const prefixes = new Map<string, ReturnType<typeof awakeProgress>>()
  const base: Award[] = [], achievements: Award[] = [], progress: Record<string, string> = {}
  function unlock(id: string, at: number, evidence: RewardEvidence) {
    if (achievements.some(item => item.id === id)) return
    const definition = ACHIEVEMENTS.find(item => item.id === id)!
    achievements.push({ id, name: definition.name, type: 'achievement', milestone: id, earnedAt: at, date: dateKey(at), xp: 0, status: 'valid', evidence })
  }
  function intervalAwards(index: number, end: number) {
    const entry = pouches[index], start = entry.occurredAt.toMillis(), target = goalAt(source, start)
    if (!target) return { awards: [] as Award[], minutes: 0, target, start, id: entry.id }
    const thresholds = MILESTONES.map(item => item.ratio * target)
    const boundary = Math.max(start, fromDateTimeInput(`${dateKey(end)}T00:00`)), key = `${entry.id}:${boundary}`
    let prefix = prefixes.get(key)
    if (!prefix) { prefix = awakeProgress(start, boundary, source.sleep, thresholds, cache); prefixes.set(key, prefix) }
    const tail = awakeProgress(boundary, end, source.sleep, thresholds.slice(prefix.reached.length).map(value => value - prefix!.minutes), cache)
    const awake = { minutes: prefix.minutes + tail.minutes, reached: [...prefix.reached, ...tail.reached] }
    const awards = awake.reached.map((at, i): Award => {
      const milestone = MILESTONES[i], date = dateKey(at), startDate = dateKey(start)
      const verified = dateRange(startDate, date).every(day => confirmed.has(day))
      const intervalMinutes = verified ? awakeProgress(start, Math.min(end, dayEnd(date) + 1), source.sleep, [], cache).minutes : milestone.ratio * target
      return { id: `spacing_${encodeURIComponent(entry.id)}_${milestone.id}`, name: milestone.name, type: 'spacing', milestone: milestone.id, earnedAt: at, date, xp: milestone.xp, status: verified ? 'valid' : 'provisional', evidence: { startDate, endDate: date, startEntryId: entry.id, startMs: start, targetMinutes: target, awakeMinutes: milestone.ratio * target, intervalMinutes, detail: 'Awake time excludes the configured sleep window. Target is fixed at interval start. Interval duration is measured through closure or the end of this award date, whichever comes first.' } }
    })
    return { awards, minutes: awake.minutes, target, start, id: entry.id }
  }
  let consistent = 0, bestConsistency = 0, priorRecord: number | null = null
  for (let i = 0; i < pouches.length - 1; i++) {
    const start = pouches[i].occurredAt.toMillis(), end = pouches[i + 1].occurredAt.toMillis(), target = goalAt(source, start)
    base.push(...intervalAwards(i, end).awards)
    const verified = dateRange(dateKey(start), dateKey(end)).every(date => confirmed.has(date))
    if (!verified) { consistent = 0; continue }
    if (!eligibleInterval(start, end, source.sleep)) continue
    const minutes = (end - start) / 60000
    consistent = target && minutes >= target ? consistent + 1 : 0
    bestConsistency = Math.max(bestConsistency, consistent)
    if (consistent >= 5) unlock('getting-consistent', end, { ...emptyEvidence(dateKey(end), 'Five consecutive verified eligible daytime intervals met their start targets.'), startEntryId: pouches[i].id, startMs: start, awakeMinutes: minutes, targetMinutes: target ?? 0 })
    if (priorRecord !== null && minutes > priorRecord) unlock('personal-best', end, { ...emptyEvidence(dateKey(end), `Beat the previous verified ${priorRecord.toFixed(1)} minute record.`), startEntryId: pouches[i].id, startMs: start, awakeMinutes: minutes })
    priorRecord = Math.max(priorRecord ?? 0, minutes)
  }
  progress['getting-consistent'] = `${Math.min(5, bestConsistency)} / 5 verified intervals`
  // A confirmed past day's remaining awake segment is evidence even without another pouch.
  // This prevents the personal-record achievement from requiring an interval-ending use.
  const latest = pouches.at(-1)
  if (latest && priorRecord !== null) {
    const start = latest.occurredAt.toMillis(), date = dateKey(start)
    const window = awakeWindows(date, source.sleep).find(([a, b]) => start >= a && start < b)
    if (confirmed.has(date) && window && window[1] <= now) {
      const minutes = (window[1] - start) / 60000
      if (minutes > priorRecord) unlock('personal-best', window[1] - 1, { ...emptyEvidence(date, `A confirmed remaining awake segment exceeded the earlier ${priorRecord.toFixed(1)} minute record, without requiring another pouch.`), startEntryId: latest.id, startMs: start, awakeMinutes: minutes, intervalMinutes: minutes })
    }
  }
  let good = 0, smoke = 0, pouchFree = 0, bestGood = 0, bestSmoke = 0
  for (let i = 0; i < days.length; i++) {
    const day = days[i], at = dayEnd(day.date)
    good = day.complete && (day.nicotineFree || (day.score !== null && day.score >= DAILY_SCORE_THRESHOLD)) ? good + 1 : 0
    smoke = day.complete && day.counts.cigarette === 0 && day.counts.cigar === 0 ? smoke + 1 : 0
    pouchFree = day.complete && day.counts.pouch === 0 ? pouchFree + 1 : 0
    bestGood = Math.max(bestGood, good); bestSmoke = Math.max(bestSmoke, smoke)
    if (good >= 7) unlock('solid-week', at, { ...emptyEvidence(day.date, 'Seven consecutive complete days reached the daily threshold or were nicotine-free.'), startDate: shiftDate(day.date, -6) })
    if (smoke >= 1) unlock('smoke-free-day', at, emptyEvidence(day.date, 'All use confirmed; no cigarette or cigar entries.'))
    if (smoke >= 7) unlock('smoke-free-week', at, { ...emptyEvidence(day.date, 'Seven consecutive confirmed smoking-free days.'), startDate: shiftDate(day.date, -6) })
    if (pouchFree) base.push({ id: `abstinence_${day.date}`, name: `Pouch-free day ${pouchFree}`, type: 'abstinence', milestone: 'pouch-free-day', earnedAt: at, date: day.date, xp: DAILY_XP_CAP, status: 'valid', evidence: { ...emptyEvidence(day.date, `Confirmed pouch-free day; fills this day's shared ${DAILY_XP_CAP} XP allowance. No new pouch is needed.`), startDate: shiftDate(day.date, 1 - pouchFree) } })
    const period = days.slice(Math.max(0, i - REDUCTION_DAYS + 1), i + 1)
    if (period.length === REDUCTION_DAYS && period.every(value => value.complete)) {
      const baseline = baselineForDay(source.baselines, period[0].date), count = baseline?.categories.pouch?.dailyCountMilli
      if (count && count > 0 && period.every(value => baselineForDay(source.baselines, value.date)?.id === baseline!.id)) {
        const mean = period.reduce((sum, value) => sum + value.counts.pouch, 0) / REDUCTION_DAYS, reduction = 1 - mean / (count / 1000)
        const evidence = { ...emptyEvidence(day.date, `${REDUCTION_DAYS} confirmed days: ${mean.toFixed(2)} pouches/day versus ${count / 1000} baseline; ${(reduction * 100).toFixed(1)}% reduction.`), startDate: period[0].date }
        if (reduction > 0) unlock('less-is-more', at, evidence)
        if (reduction >= .5) unlock('halfway-there', at, evidence)
      }
    }
  }
  const weeks = [...new Set(days.map(day => monday(day.date)))].map(start => {
    const week = days.filter(day => day.date >= start && day.date <= shiftDate(start, 6)), intervals = week.flatMap(day => day.intervals)
    return { start, mean: week.length === 7 && week.every(day => day.complete) && intervals.length >= 2 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null }
  })
  for (let i = 2; i < weeks.length; i++) {
    const a = weeks[i - 2], b = weeks[i - 1], c = weeks[i]
    if (a.mean !== null && b.mean !== null && c.mean !== null && a.mean < b.mean && b.mean < c.mean) unlock('steady-progress', dayEnd(shiftDate(c.start, 6)), { ...emptyEvidence(c.start, `Three complete Monday–Sunday weeks improved actual spacing: ${a.mean.toFixed(1)}, ${b.mean.toFixed(1)}, ${c.mean.toFixed(1)} minutes.`), startDate: a.start, endDate: shiftDate(c.start, 6) })
  }
  progress['solid-week'] = `${Math.min(7, bestGood)} / 7 confirmed days`
  progress['smoke-free-week'] = `${Math.min(7, bestSmoke)} / 7 confirmed days`
  return { source, today, base, achievements, progress, days, streak: days.at(-1)?.date === shiftDate(today, -1) ? good : 0, active: (end: number) => pouches.length ? intervalAwards(pouches.length - 1, end) : null }
}
export type RewardModel = ReturnType<typeof buildRewardModel>
export function evaluateRewards(model: RewardModel, now: number) {
  const active = model.active(now), used = new Map<string, number>()
  // A shared daily allowance prevents additional short intervals from outscoring one long one.
  // A confirmed pouch-free day fills the allowance, so abstinence never needs a reset/log to earn XP.
  const awards = [...model.base, ...(active?.awards ?? [])].sort((a, b) => (a.status === 'valid' ? 0 : 1) - (b.status === 'valid' ? 0 : 1) || a.earnedAt - b.earnedAt || a.id.localeCompare(b.id)).map(award => {
    const previous = used.get(award.date) ?? 0, xp = Math.min(award.xp, Math.max(0, DAILY_XP_CAP - previous))
    used.set(award.date, previous + xp)
    return { ...award, xp }
  })
  const achievements = [...model.achievements]
  MILESTONES.forEach((milestone, index) => {
    const award = awards.find(item => item.type === 'spacing' && item.milestone === milestone.id && item.status === 'valid')
    if (award) { const definition = ACHIEVEMENTS[index]; achievements.push({ ...award, id: definition.id, name: definition.name, milestone: definition.id, type: 'achievement', xp: 0 }) }
  })
  const next = active?.target ? MILESTONES.find(item => item.ratio * active.target! > active.minutes) ?? null : null
  return { awards, achievements, active, next, streak: model.streak, progress: model.progress }
}
export function reconcilePlan(existing: StoredAward[], desired: Award[]) {
  const wanted = new Map(desired.map(award => [award.id, award]))
  const result = [...desired]
  for (const award of existing) if (!wanted.has(award.id)) result.push({ ...award, status: 'invalidated' })
  return result
}
export function awardEqual(a: Award, b: Award) {
  return a.status === b.status && a.xp === b.xp && a.earnedAt === b.earnedAt && a.name === b.name && (Object.keys(a.evidence) as (keyof RewardEvidence)[]).every(key => a.evidence[key] === b.evidence[key])
}
export function rewardTotals(awards: Award[], start = '', end = '9999-12-31') {
  const valid = awards.filter(award => award.status === 'valid' && award.date >= start && award.date <= end)
  const spacing = valid.filter(award => award.type === 'spacing')
  const intervals = (ids: string[]) => new Set(spacing.filter(award => ids.includes(award.milestone)).map(award => award.evidence.startEntryId)).size
  return { xp: valid.reduce((sum, award) => sum + award.xp, 0), milestones: spacing.length, achievements: valid.filter(award => award.type === 'achievement').length,
    beyond: new Set(spacing.filter(award => award.evidence.intervalMinutes > award.evidence.targetMinutes).map(award => award.evidence.startEntryId)).size,
    double: intervals(['double', 'triple']), triple: intervals(['triple']), longest: spacing.length ? Math.max(...spacing.map(award => award.evidence.intervalMinutes)) : null }
}
