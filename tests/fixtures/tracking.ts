import { applyGoalChanges, migrationFor, scheduleFingerprint } from '../../src/utils/spacingSchedule'
import type { GoalChange } from '../../src/utils/spacingSchedule'
// Browser-only test service. Imported by Playwright network interception, never by application code.
import { Timestamp } from 'firebase/firestore'
import { DEFAULT_PREFERENCES, DEFAULT_SCHEDULE } from '../../src/config/defaults'
import type { Entry, Preferences, ProductKind, SpacingSchedule } from '../../src/types/data'
import type { EntrySnapshot } from '../../src/services/entries'
import type { Baseline, PriceSnapshot, Pricing } from '../../src/types/finance'
import { EMPTY_PRICING } from '../../src/types/finance'
import type { FinanceData } from '../../src/services/finance'
import { dateKey } from '../../src/utils/dateTime'
import { DEFAULT_SLEEP } from '../../src/utils/performance'
import type { SleepWindow } from '../../src/utils/performance'
import type { RewardFeed, StoredAward } from '../../src/types/rewards'
import { awardEqual, buildRewardModel, evaluateRewards, reconcilePlan } from '../../src/utils/rewards'
interface StoredEntry { id: string; uid: string; kind: ProductKind; time: number; costCents: number | null; priceSnapshot?: PriceSnapshot | null }
const callbacks = new Set<() => void>()
const read = (): StoredEntry[] => JSON.parse(localStorage.getItem('fixture-entries') || '[]')
function emit() { callbacks.forEach(callback => callback()) }
window.addEventListener('storage', emit)
window.addEventListener('fixture-update', emit)
function store(entries: StoredEntry[]) { localStorage.setItem('fixture-entries', JSON.stringify(entries)); emit() }
function entry(value: StoredEntry): Entry { return { ...value, occurredAt: Timestamp.fromMillis(value.time), createdAt: Timestamp.fromMillis(value.time), updatedAt: Timestamp.fromMillis(value.time), currency: 'CAD', pending: false } }
function listen(next: () => void, fail: (error: Error) => void) {
  const callback = () => {
    if (localStorage.getItem('fixture-mode') === 'loading') return
    if (localStorage.getItem('fixture-mode') === 'error') { fail(new Error('Test connection unavailable.')); return }
    next()
  }
  callbacks.add(callback); queueMicrotask(callback)
  return () => { callbacks.delete(callback) }
}
function snapshot(values: StoredEntry[]): EntrySnapshot { return { entries: values.sort((a, b) => b.time - a.time).map(entry), pending: false, fromCache: false } }
export function createEntry(uid: string, kind: ProductKind, price: number | null, pricing?: Pricing) {
  const id = crypto.randomUUID()
  if (localStorage.getItem('fixture-write-error')) return { id, completion: Promise.reject(new Error('Could not save test entry.')) }
  store([...read(), { id, uid, kind, time: Date.now(), costCents: price, priceSnapshot: kind === 'cigar' ? { packCents: price!, quantity: 1 } : pricing?.[kind] ?? null }])
  const completion = localStorage.getItem('fixture-delay') ? new Promise<void>(resolve => setTimeout(resolve, 3000)) : Promise.resolve()
  return { id, completion }
}
function invalidate(times: number[]) {
  const dates = new Set(times.map(time => dateKey(time)))
  const coverage: { date: string; complete: boolean }[] = JSON.parse(localStorage.getItem('fixture-coverage') || '[]')
  localStorage.setItem('fixture-coverage', JSON.stringify(coverage.map(value => dates.has(value.date) ? { ...value, complete: false } : value)))
}
export function editEntryTime(_uid: string, id: string, time: number, price?: PriceSnapshot | null) { invalidate([time, ...read().filter(value => value.id === id).map(value => value.time)]); store(read().map(value => value.id === id ? { ...value, time, ...(price === undefined ? {} : { priceSnapshot: price, costCents: null }) } : value)); return Promise.resolve() }
export function deleteEntry(_uid: string, id: string) { invalidate(read().filter(value => value.id === id).map(value => value.time)); store(read().filter(value => value.id !== id)); return Promise.resolve() }
export function listenPreferences(_uid: string, next: (value: Preferences | null, cached: boolean) => void, fail: (error: Error) => void) { return listen(() => next({ ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem('fixture-preferences') || '{}') }, false), fail) }
export function listenSchedule(_uid: string, next: (value: SpacingSchedule | null) => void, fail: (error: Error) => void) { return listen(() => next(fixtureSchedule()), fail) }
export function savePreferences(_uid: string, values: Partial<Preferences>) {
  localStorage.setItem('fixture-preferences', JSON.stringify({ ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem('fixture-preferences') || '{}'), ...values })); emit(); return Promise.resolve()
}
export function restoreEntry(_uid: string, original: Entry) { invalidate([original.occurredAt.toMillis()]); store([...read(), { ...original, time: original.occurredAt.toMillis() }]); return Promise.resolve() }
export const EMPTY_FINANCE: FinanceData = { entries: [], pricing: EMPTY_PRICING, baselines: [], coverage: [], loading: true, fromCache: false, pending: false, pricingReady: false }
export function listenFinance(_uid: string, next: (value: FinanceData) => void, fail: (error: Error) => void, skipEntries = false) {
  return listen(() => next({ entries: skipEntries ? [] : snapshot(read()).entries, pricing: JSON.parse(localStorage.getItem('fixture-pricing') || JSON.stringify(EMPTY_PRICING)), baselines: JSON.parse(localStorage.getItem('fixture-baselines') || '[]').map((value: Baseline) => ({ ...value, createdAt: Timestamp.fromMillis(Date.now()) })), coverage: JSON.parse(localStorage.getItem('fixture-coverage') || '[]'), loading: false, fromCache: false, pending: false, pricingReady: true }), fail)
}
export function savePricing(_uid: string, pricing: Pricing) { localStorage.setItem('fixture-pricing', JSON.stringify(pricing)); emit(); return Promise.resolve() }
export function appendBaseline(_uid: string, value: Pick<Baseline, 'categories' | 'effectiveOn'>) {
  const values: Baseline[] = JSON.parse(localStorage.getItem('fixture-baselines') || '[]')
  if (values.some(previous => previous.effectiveOn >= value.effectiveOn)) return Promise.reject(new Error('Choose a later effective date.'))
  localStorage.setItem('fixture-baselines', JSON.stringify([...values, { ...value, id: value.effectiveOn, createdAt: null }])); emit(); return Promise.resolve()
}
export function saveCoverage(_uid: string, date: string, complete: boolean) {
  const values = JSON.parse(localStorage.getItem('fixture-coverage') || '[]') as { date: string }[]
  localStorage.setItem('fixture-coverage', JSON.stringify([...values.filter(value => value.date !== date), { date, complete, updatedAt: null }])); emit(); return Promise.resolve()
}
export function listenRange(_uid: string, start: string, end: string, next: (value: EntrySnapshot) => void, fail: (error: Error) => void) {
  return listen(() => { const values = read(); const selected = values.filter(value => dateKey(value.time) >= start && dateKey(value.time) <= end); const preceding = values.filter(value => value.kind === 'pouch' && dateKey(value.time) < start).sort((a, b) => b.time - a.time).slice(0, 1); next(snapshot([...selected, ...preceding])) }, fail)
}
export function listenSleep(_uid: string, next: (value: SleepWindow) => void, fail: (error: Error) => void) { return listen(() => next(JSON.parse(localStorage.getItem('fixture-sleep') || JSON.stringify(DEFAULT_SLEEP))), fail) }
export function saveSleep(_uid: string, value: SleepWindow) { localStorage.setItem('fixture-sleep', JSON.stringify(value)); emit(); return Promise.resolve() }
export const EMPTY_REWARDS: RewardFeed = { awards: [], achievements: [], revision: 0, processedRevision: -1, loading: true, fromCache: false, pending: false }
function rewardRevision() {
  const fingerprint = ['fixture-entries', 'fixture-coverage', 'fixture-baselines', 'fixture-sleep', 'fixture-schedule'].map(key => localStorage.getItem(key)).join('|')
  let revision = Number(localStorage.getItem('fixture-reward-revision') || '0')
  if (localStorage.getItem('fixture-reward-source') !== fingerprint) { revision++; localStorage.setItem('fixture-reward-revision', String(revision)); localStorage.setItem('fixture-reward-source', fingerprint) }
  return revision
}
export function listenRewards(_uid: string, next: (value: RewardFeed) => void, fail: (error: Error) => void) {
  return listen(() => next({ awards: JSON.parse(localStorage.getItem('fixture-rewards') || '[]'), achievements: JSON.parse(localStorage.getItem('fixture-achievements') || '[]'), revision: rewardRevision(), processedRevision: Number(localStorage.getItem('fixture-reward-processed') ?? '-1'), loading: false, fromCache: localStorage.getItem('fixture-offline') === 'true', pending: false }), fail)
}
export async function reconcileRewards(_uid: string, now: number, _feed: RewardFeed) {
  const revision = rewardRevision()
  const model = buildRewardModel({ entries: snapshot(read()).entries, coverage: JSON.parse(localStorage.getItem('fixture-coverage') || '[]'), baselines: JSON.parse(localStorage.getItem('fixture-baselines') || '[]'), schedule: fixtureSchedule(), sleep: JSON.parse(localStorage.getItem('fixture-sleep') || JSON.stringify(DEFAULT_SLEEP)) }, now)
  const result = evaluateRewards(model, now)
  for (const [key, desired] of [['fixture-rewards', result.awards], ['fixture-achievements', result.achievements]] as const) {
    const previous: StoredAward[] = JSON.parse(localStorage.getItem(key) || '[]')
    const changed = reconcilePlan(previous, desired).map(award => {
      const old = previous.find(value => value.id === award.id)
      return old && awardEqual(old, award) ? old : { ...award, revision: (old?.revision ?? 0) + 1, firstRecordedAt: old?.firstRecordedAt ?? now, updatedAt: now, reason: 'Fixture evidence reconciliation.' }
    })
    localStorage.setItem(key, JSON.stringify(changed))
  }
  localStorage.setItem('fixture-reward-processed', String(revision)); emit()
}
export function clearRewardCache(_uid: string) {}
export function writeSchedule() { throw new Error('Profile initialization must not run in isolated UI tests.') }

function fixtureSchedule(): SpacingSchedule {
 const saved = JSON.parse(localStorage.getItem('fixture-schedule') || 'null')
 const migrated = migrationFor(saved)
 if (migrated) localStorage.setItem('fixture-schedule', JSON.stringify(migrated))
 return migrated ?? saved ?? DEFAULT_SCHEDULE
}
export async function saveGoalChanges(_uid: string, expected: SpacingSchedule, changes: GoalChange[]) {
 if (!navigator.onLine) throw new Error('You are offline. Reconnect before saving goals; your draft has not been saved.')
 if (localStorage.getItem('fixture-write-error')) throw new Error('Could not save goals.')
 const before = fixtureSchedule()
 if (scheduleFingerprint(before) !== scheduleFingerprint(expected)) throw new Error('Goals changed on another device. Cancel this draft and review the latest saved goals before trying again.')
 const after = applyGoalChanges(before, changes)
 localStorage.setItem('fixture-schedule', JSON.stringify(after)); emit()
}
