import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import type { Transaction } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { SpacingSchedule } from '../types/data'
import { applyGoalChanges, migrationFor, scheduleFingerprint, validateSchedule } from '../utils/spacingSchedule'
import type { GoalChange } from '../utils/spacingSchedule'
import { touchRewards } from './rewardRevision'
import { torontoToday } from '../utils/financeDates'

const reference = (uid: string) => doc(db!, 'users', uid, 'settings', 'schedule')
export function writeSchedule(transaction: Transaction, uid: string, before: SpacingSchedule | null, after: SpacingSchedule, reason: string) {
  transaction.set(reference(uid), after)
  transaction.set(doc(reference(uid), 'history', String(after.revision)), { revision: after.revision, before, after, reason, at: serverTimestamp() })
  touchRewards(transaction, uid)
}
export async function migrateSchedule(uid: string) {
  if (!db) throw new Error('Firebase is not configured.')
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference(uid)), before = snapshot.exists() ? snapshot.data() as SpacingSchedule : null
    const after = migrationFor(before)
    if (after) writeSchedule(transaction, uid, before, after, before ? 'Schedule v2 migration: correct only the exact legacy default; preserve customized targets.' : 'Initialize corrected weekly schedule.')
  })
}
export function listenSchedule(uid: string, next: (value: SpacingSchedule | null) => void, fail: (error: Error) => void) {
  let active = true, migrating = false
  const stop = onSnapshot(reference(uid), { includeMetadataChanges: true }, snapshot => {
    try {
      const value = snapshot.exists() ? validateSchedule(snapshot.data() as SpacingSchedule) : null
      if ((!value || value.schemaVersion !== 2) && !snapshot.metadata.fromCache) {
        if (!migrating) {
          migrating = true
          void migrateSchedule(uid).catch(error => { if (active) fail(error) }).finally(() => { migrating = false })
        }
        return
      }
      if (!value) { fail(new Error('Schedule unavailable offline. Connect and retry to load or initialize your saved goals.')); return }
      next(value)
    } catch (error) { fail(error as Error) }
  }, fail)
  return () => { active = false; stop() }
}
export async function saveGoalChanges(uid: string, expected: SpacingSchedule, changes: GoalChange[]) {
  if (!db) throw new Error('Firebase is not configured.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Reconnect before saving goals; your draft has not been saved.')
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference(uid))
    if (!snapshot.exists()) throw new Error('The schedule is missing. Reload and retry.')
    const before = validateSchedule(snapshot.data() as SpacingSchedule)
    if (scheduleFingerprint(before) !== scheduleFingerprint(expected)) throw new Error('Goals changed on another device. Cancel this draft and review the latest saved goals before trying again.')
    const after = applyGoalChanges(before, changes, torontoToday())
    writeSchedule(transaction, uid, before, after, 'User reviewed and saved weekly target changes.')
  })
}
