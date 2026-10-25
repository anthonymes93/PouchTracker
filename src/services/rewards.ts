import { validateSchedule } from '../utils/spacingSchedule'
import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { rewardRevisionRef } from './rewardRevision'
import type { Award, RewardFeed, RewardSource, StoredAward } from '../types/rewards'
import type { Entry, SpacingSchedule } from '../types/data'
import type { Baseline, Coverage } from '../types/finance'
import { DEFAULT_SLEEP, validSleep } from '../utils/performance'
import { awardEqual, buildRewardModel, evaluateRewards, reconcilePlan } from '../utils/rewards'
import type { RewardModel } from '../utils/rewards'
import { dateKey } from '../utils/dateTime'
export const EMPTY_REWARDS: RewardFeed = { awards: [], achievements: [], revision: 0, processedRevision: -1, loading: true, fromCache: true, pending: false }
export function listenRewards(uid: string, next: (value: RewardFeed) => void, fail: (error: Error) => void) {
  if (!db) throw new Error('Firebase is not configured.')
  let data = { ...EMPTY_REWARDS }
  const status = new Map<string, { cached: boolean; pending: boolean }>()
  function emit(key: string, cached: boolean, pending: boolean) { status.set(key, { cached, pending }); data = { ...data, loading: status.size < 3, fromCache: [...status.values()].some(item => item.cached), pending: [...status.values()].some(item => item.pending) }; next(data) }
  const stops = (['rewards', 'achievements'] as const).map(name => onSnapshot(collection(db!, 'users', uid, name), { includeMetadataChanges: true }, snap => {
    data = { ...data, [name === 'rewards' ? 'awards' : 'achievements']: snap.docs.map(value => ({ ...value.data(), id: value.id } as StoredAward)) }; emit(name, snap.metadata.fromCache, snap.metadata.hasPendingWrites)
  }, fail))
  stops.push(onSnapshot(rewardRevisionRef(uid), { includeMetadataChanges: true }, snap => { data = { ...data, revision: snap.data()?.sourceRevision ?? 0, processedRevision: snap.data()?.processedRevision ?? -1 }; emit('state', snap.metadata.fromCache, snap.metadata.hasPendingWrites) }, fail))
  return () => stops.forEach(stop => stop())
}
const models = new Map<string, { revision: number; day: string; model: RewardModel }>()
async function loadModel(uid: string, now: number) {
  const before = await getDocFromServer(rewardRevisionRef(uid)), revision: number = before.data()?.sourceRevision ?? 0
  const cached = models.get(uid)
  if (cached?.revision === revision && cached.day === dateKey(now)) return cached
  const root = doc(db!, 'users', uid)
  // Read source between revision reads: source mutations and revision increments commit atomically.
  const [entries, coverage, baselines, schedule, sleep] = await Promise.all([
    getDocsFromServer(collection(root, 'entries')), getDocsFromServer(collection(root, 'coverage')), getDocsFromServer(collection(root, 'baselines')),
    getDocFromServer(doc(root, 'settings', 'schedule')), getDocFromServer(doc(root, 'settings', 'sleep')),
  ])
  const after = await getDocFromServer(rewardRevisionRef(uid))
  if ((after.data()?.sourceRevision ?? 0) !== revision) throw new Error('Records changed during reward review. Retrying with current records.')
  const source: RewardSource = { entries: entries.docs.map(value => ({ ...value.data(), id: value.id, pending: false } as Entry)), coverage: coverage.docs.map(value => value.data() as Coverage), baselines: baselines.docs.map(value => ({ ...value.data(), id: value.id } as Baseline)), schedule: schedule.exists() ? schedule.data() as SpacingSchedule : null, sleep: sleep.exists() ? sleep.data() as RewardSource['sleep'] : DEFAULT_SLEEP }
  if (source.schedule) validateSchedule(source.schedule)
  if (!validSleep(source.sleep) || !source.schedule?.steps?.length || source.schedule.steps.some(step => !Number.isFinite(step.minimumMinutes) || step.minimumMinutes <= 0)) throw new Error('Valid sleep and spacing settings are required to reconcile rewards.')
  const result = { revision, day: dateKey(now), model: buildRewardModel(source, now) }
  models.set(uid, result); return result
}
export async function reconcileRewards(uid: string, now: number, feed: RewardFeed) {
  for (let attempt = 0; ; attempt++) {
    try { await reconcileOnce(uid, now, feed); return } catch (error) {
      if (attempt >= 2 || !(error instanceof Error) || !error.message.startsWith('Records changed')) throw error
      models.delete(uid)
    }
  }
}
async function reconcileOnce(uid: string, now: number, feed: RewardFeed) {
  if (!db) throw new Error('Firebase is not configured.')
  const { revision, model } = await loadModel(uid, now), desired = evaluateRewards(model, now)
  const candidates = [...reconcilePlan(feed.awards, desired.awards), ...reconcilePlan(feed.achievements, desired.achievements)]
  const existing = new Map([...feed.awards, ...feed.achievements].map(value => [value.id, value]))
  const changes = candidates.filter(value => !existing.has(value.id) || !awardEqual(existing.get(value.id)!, value))
  // Three records + audit events stay within the security rules' 20-document access budget.
  // Every chunk checks source revision and evaluation watermark before writing.
  const chunks = Array.from({ length: Math.max(1, Math.ceil(changes.length / 3)) }, (_, i) => changes.slice(i * 3, (i + 1) * 3))
  for (let index = 0; index < chunks.length; index++) {
    const values = chunks[index]
    await withContentionRetry(uid, revision, now, () => runTransaction(db!, async transaction => {
      const stateRef = rewardRevisionRef(uid), state = await transaction.get(stateRef), saved = state.data()
      if ((saved?.sourceRevision ?? 0) !== revision) throw new Error('Records changed during reward review. Retrying with current records.')
      if (saved?.evaluatedRevision === revision && saved.evaluatedAt > now) return // An evaluation from a newer clock position already won.
      const refs = values.map(value => doc(db!, 'users', uid, value.type === 'achievement' ? 'achievements' : 'rewards', value.id))
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
      values.forEach((award, i) => {
        const previous = snapshots[i].exists() ? snapshots[i].data() as StoredAward : null
        if (previous && awardEqual(previous, award)) return
        const version = (previous?.revision ?? 0) + 1, updatedAt = Timestamp.now().toMillis()
        const reason = award.status === 'invalidated' ? 'Source records or coverage no longer support this award.' : previous?.status === 'invalidated' ? 'Supporting evidence restored.' : award.status === 'provisional' ? 'Awaiting complete day coverage.' : 'Verified against current source records.'
        const record: StoredAward = { ...cleanAward(award), revision: version, firstRecordedAt: previous?.firstRecordedAt ?? updatedAt, updatedAt, reason }
        transaction.set(refs[i], record)
        transaction.set(doc(refs[i], 'history', String(version)), { version, sourceRevision: revision, previousStatus: previous?.status ?? 'none', status: award.status, previousXp: previous?.xp ?? 0, xp: award.xp, at: updatedAt, reason, evidence: award.evidence })
      })
      if (values.length || saved?.processedRevision !== revision) transaction.set(stateRef, { sourceRevision: revision, evaluatedRevision: revision, evaluatedAt: now, ...(index === chunks.length - 1 ? { processedRevision: revision } : {}) }, { merge: true })
    }))
  }
}
function cleanAward(value: Award): Award { return { id: value.id, type: value.type, name: value.name, milestone: value.milestone, earnedAt: value.earnedAt, date: value.date, xp: value.xp, status: value.status, evidence: value.evidence } }
export function clearRewardCache(uid: string) { models.delete(uid) }

async function withContentionRetry(uid: string, revision: number, now: number, commit: () => Promise<void>) {
  for (let attempt = 0; ; attempt++) {
    try { await commit(); return } catch (error) {
      // Some emulator/server rule checks observe the competing commit before reporting a
      // transaction precondition conflict. Only retry permission-denied if a peer's watermark
      // proves it has committed an equally recent evaluation of this same source revision.
      if (attempt >= 3 || (error as { code?: string }).code !== 'permission-denied') throw error
      const current = (await getDocFromServer(rewardRevisionRef(uid))).data()
      if (current?.evaluatedRevision !== revision || current.evaluatedAt < now) throw error
    }
  }
}
