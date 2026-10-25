import { expect, test } from '@playwright/test'
import { Timestamp } from 'firebase/firestore'
import { DEFAULT_SCHEDULE } from '../src/config/defaults'
import { MILESTONES } from '../src/config/rewards'
import type { Entry } from '../src/types/data'
import type { RewardSource, StoredAward } from '../src/types/rewards'
import { DEFAULT_SLEEP } from '../src/utils/performance'
import { awakeProgress, levelProgress } from '../src/utils/rewardTime'
import { awardEqual, buildRewardModel, evaluateRewards, goalAt, reconcilePlan, rewardTotals } from '../src/utils/rewards'
import { fromDateTimeInput } from '../src/utils/dateTime'
import { dateRange } from '../src/utils/financeDates'
const time = (value: string) => fromDateTimeInput(value)
const entry = (id: string, value: string, kind: Entry['kind'] = 'pouch'): Entry => ({ id, uid: 'test', kind, occurredAt: Timestamp.fromMillis(time(value)), createdAt: null, updatedAt: null, costCents: null, currency: 'CAD', pending: false })
const source = (entries = [entry('start', '2026-10-23T09:00')], dates: string[] = []): RewardSource => ({ entries, schedule: DEFAULT_SCHEDULE, sleep: DEFAULT_SLEEP, baselines: [], coverage: dates.map(date => ({ date, complete: true, updatedAt: null })) })
const derive = (data: RewardSource, now = time('2026-10-24T12:00')) => evaluateRewards(buildRewardModel(data, now), now)
const stored = (data: ReturnType<typeof derive>['awards']): StoredAward[] => data.map(value => ({ ...value, revision: 1, firstRecordedAt: value.earnedAt, updatedAt: value.earnedAt, reason: 'test' }))
for (const [minutes, xp] of [[60, 10], [75, 25], [90, 50], [120, 100], [180, 200]]) test(`${minutes} minutes earns ${xp} cumulative provisional XP exactly at boundary`, () => {
  const data = source(), start = data.entries[0].occurredAt.toMillis(), model = buildRewardModel(data, start)
  expect(evaluateRewards(model, start + minutes * 60000).awards.reduce((sum, value) => sum + value.xp, 0)).toBe(xp)
  expect(evaluateRewards(model, start + minutes * 60000 - 1).awards.reduce((sum, value) => sum + value.xp, 0)).toBeLessThan(xp)
  expect(evaluateRewards(model, start + minutes * 60000).awards.every(value => value.status === 'provisional')).toBe(true)
})
test('existing week 1–4 targets and interval-start goal are preserved', () => {
  const data = source()
  expect(['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2027-01-01'].map(day => goalAt(data, time(`${day}T12:00`)))).toEqual([60, 90, 120, 180, 180])
  const result = derive(source([entry('start', '2026-10-24T22:00')]), time('2026-10-25T10:00'))
  expect(result.active?.target).toBe(60); expect(result.awards.at(-1)?.milestone).toBe('double')
})
test('sleep exclusion, overnight coverage and real DST awake durations', () => {
  const start = time('2026-10-23T22:30'), end = time('2026-10-24T09:30')
  expect(awakeProgress(start, end, DEFAULT_SLEEP, [60]).minutes).toBe(60)
  expect(awakeProgress(start, end, DEFAULT_SLEEP, [60]).reached).toEqual([end])
  expect(derive(source([entry('night', '2026-10-23T22:30')], ['2026-10-23']), end).awards[0].status).toBe('provisional')
  const fall = awakeProgress(Date.parse('2026-11-01T05:00:00Z'), Date.parse('2026-11-01T07:00:00Z'), { start: '01:30', end: '01:45' }, [60])
  expect(fall.minutes).toBe(90)
  expect(awakeProgress(Date.parse('2026-03-08T06:00:00Z'), Date.parse('2026-03-08T08:00:00Z'), { start: '02:00', end: '03:00' }, []).minutes).toBe(120)
})
test('closed app catch-up, stable IDs and ordinary single-interval cap', () => {
  const data = source(undefined, ['2026-10-23']), first = derive(data), refresh = derive(data)
  expect(first.awards).toEqual(refresh.awards); expect(first.awards).toHaveLength(5)
  expect(rewardTotals(first.awards).xp).toBe(200)
  expect(derive(data, time('2026-10-28T12:00')).awards.filter(value => value.type === 'spacing')).toHaveLength(5)
  expect(reconcilePlan(stored(first.awards), refresh.awards)).toHaveLength(5)
})
test('additional uses cannot exceed daily allowance; verified abstinence fills it without a pouch', () => {
  const frequent = Array.from({ length: 12 }, (_, i) => entry(`p${i}`, `2026-10-23T${String(9 + i).padStart(2, '0')}:00`))
  const many = derive(source(frequent, ['2026-10-23'])), none = derive(source([], ['2026-10-23']))
  expect(rewardTotals(many.awards).xp).toBeLessThanOrEqual(200); expect(rewardTotals(none.awards).xp).toBe(200)
  expect(derive(source([], [])).awards).toHaveLength(0)
  const gap = derive(source([entry('old', '2026-10-22T22:59')], ['2026-10-23']))
  expect(rewardTotals(gap.awards).xp).toBe(200) // unverified ordinary gap cannot consume verified abstinence allowance
})
test('historical inserted pouch invalidates old milestones; Undo restores original IDs', () => {
  const original = derive(source([entry('first', '2026-10-23T09:00'), entry('end', '2026-10-23T12:00')], ['2026-10-23']))
  const corrected = derive(source([entry('first', '2026-10-23T09:00'), entry('missing', '2026-10-23T09:30'), entry('end', '2026-10-23T12:00')], ['2026-10-23']))
  const plan = reconcilePlan(stored(original.awards), corrected.awards)
  expect(plan.filter(value => value.evidence.startEntryId === 'first').every(value => value.status === 'invalidated')).toBe(true)
  const restored = reconcilePlan(stored(plan), original.awards)
  expect(restored.find(value => value.id === 'spacing_first_triple')?.status).toBe('valid')
  expect(new Set(restored.map(value => value.id)).size).toBe(restored.length)
})
test('timestamp edit, deletion and unconfirmation remove unsupported XP without negative totals', () => {
  const original = derive(source(undefined, ['2026-10-23'])), moved = derive(source([entry('start', '2026-10-23T22:59')]), time('2026-10-24T09:10'))
  expect(rewardTotals(reconcilePlan(stored(original.awards), moved.awards)).xp).toBe(0)
  expect(reconcilePlan(stored(original.awards), []).every(value => value.status === 'invalidated')).toBe(true)
  expect(rewardTotals(derive(source()).awards).xp).toBe(0)
  const short = derive(source([entry('start', '2026-10-23T09:00'), entry('next', '2026-10-23T12:00'), entry('short', '2026-10-23T12:10')], ['2026-10-23']))
  expect(short.awards.find(value => value.id === 'spacing_start_triple')?.status).toBe('valid')
})
test('level thresholds use progress within each level and work beyond level 50', () => {
  for (const level of [1, 2, 3, 4, 5, 10, 51, 1000]) { const result = levelProgress(100 * (level - 1) ** 2); expect(result.level).toBe(level); expect(result.within).toBe(0); expect(result.percent).toBe(0) }
  expect(levelProgress(99).level).toBe(1); expect(levelProgress(100).level).toBe(2)
  expect(levelProgress(950)).toMatchObject({ level: 4, within: 50, next: 1600, remaining: 650 }); expect(levelProgress(950).percent).toBeCloseTo(50 / 700 * 100)
  expect(levelProgress(-10).total).toBe(0)
})
test('achievements require confirmed evidence, are unique, and unknown days break streaks', () => {
  const data = source([], dateRange('2026-10-23', '2026-10-29'))
  data.baselines = [{ id: 'base', effectiveOn: '2026-10-23', createdAt: null, categories: { pouch: { dailyCountMilli: 10000, price: { packCents: 100, quantity: 1 } } } }]
  const result = derive(data, time('2026-10-30T10:00'))
  expect(result.achievements.map(value => value.id)).toEqual(expect.arrayContaining(['solid-week', 'smoke-free-day', 'smoke-free-week', 'less-is-more', 'halfway-there']))
  expect(result.streak).toBe(7); expect(new Set(result.achievements.map(value => value.id)).size).toBe(result.achievements.length)
  data.coverage = data.coverage.filter(value => value.date !== '2026-10-26')
  const incomplete = derive(data, time('2026-10-30T10:00')); expect(incomplete.streak).toBe(3); expect(incomplete.achievements.some(value => value.id === 'solid-week')).toBe(false)
  expect(derive(source([], [])).achievements).toHaveLength(0)
})
test('spacing achievements unlock without a new pouch and calendar attribution uses crossing date', () => {
  const result = derive(source(undefined, ['2026-10-23']))
  expect(result.achievements.filter(value => ['first-step', 'extra-mile', 'overachiever', 'double-time', 'triple-time'].includes(value.id))).toHaveLength(5)
  expect(result.awards.map(value => value.date)).toEqual(Array(5).fill('2026-10-23'))
  const overnight = derive(source([entry('late', '2026-10-23T22:30')], ['2026-10-23', '2026-10-24']), time('2026-10-30T10:00'))
  expect(overnight.awards.find(value => value.id === 'spacing_late_target')?.date).toBe('2026-10-24')
  expect(rewardTotals(overnight.awards, '2026-10-23', '2026-10-24').xp).toBe(200)
  const award = result.awards[0]; expect(awardEqual(award, { ...award, evidence: Object.fromEntries(Object.entries(award.evidence).reverse()) as typeof award.evidence })).toBe(true)
  expect(MILESTONES.reduce((sum, value) => sum + value.xp, 0)).toBe(200)
})
test('five consecutive eligible intervals and a genuine personal record unlock once', () => {
  const entries = ['09:00', '10:00', '11:00', '12:00', '13:00', '15:00'].map((hour, i) => entry(`p${i}`, `2026-10-23T${hour}`))
  const result = derive(source(entries, ['2026-10-23']))
  expect(result.achievements.map(value => value.id)).toEqual(expect.arrayContaining(['getting-consistent', 'personal-best']))
  entries[2] = entry('p2', '2026-10-23T10:10')
  expect(derive(source(entries, ['2026-10-23'])).achievements.some(value => value.id === 'getting-consistent')).toBe(false)
  expect(derive(source(entries, [])).achievements).toHaveLength(0)
})
test('steady progress needs three complete comparable weeks with increasing real spacing', () => {
  const dates = dateRange('2026-10-26', '2026-11-15'), entries: Entry[] = []
  dates.forEach((date, index) => {
    const minutes = 60 + Math.floor(index / 7) * 30, start = time(`${date}T09:00`)
    for (let i = 0; i < 3; i++) entries.push({ ...entry(`${date}-${i}`, `${date}T09:00`), occurredAt: Timestamp.fromMillis(start + i * minutes * 60000) })
  })
  const data = source(entries, dates), result = derive(data, time('2026-11-16T12:00'))
  expect(result.achievements.some(value => value.id === 'steady-progress')).toBe(true)
  data.coverage = data.coverage.filter(value => value.date !== '2026-11-03')
  expect(derive(data, time('2026-11-16T12:00')).achievements.some(value => value.id === 'steady-progress')).toBe(false)
})
