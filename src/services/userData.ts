import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import type { CollectionReference, DocumentReference } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from '../lib/firebase'
import type { Preferences, ProductPrice, Progress, SpacingSchedule, UsageEntry, UserProfile, WeeklySpacingGoal } from '../types/data'
import type { StoredAward } from '../types/rewards'
import { DEFAULT_PREFERENCES } from '../config/defaults'
import { migrationFor } from '../utils/spacingSchedule'
import { writeSchedule } from './schedule'

// These typed references are the shared contract for future features. Security is enforced by firestore.rules.
export function userData(uid: string) {
  if (!db) throw new Error('Firebase is not configured.')
  if (!uid || uid.includes('/')) throw new Error('A valid user ID is required.')
  const root = doc(db, 'users', uid)
  const items = <T>(name: string) => collection(root, name) as CollectionReference<T>
  return {
    profile: root as DocumentReference<UserProfile>,
    entries: items<UsageEntry>('entries'),
    preferences: doc(root, 'settings', 'preferences') as DocumentReference<Preferences>,
    schedule: doc(root, 'settings', 'schedule') as DocumentReference<SpacingSchedule>,
    prices: items<ProductPrice>('prices'),
    weeklyGoals: items<WeeklySpacingGoal>('weeklyGoals'),
    achievements: items<StoredAward>('achievements'),
    rewards: items<StoredAward>('rewards'),
    progress: doc(root, 'progress', 'current') as DocumentReference<Progress>,
  }
}

export async function ensureUserProfile(user: User) {
  if (!db) throw new Error('Firebase is not configured.')
  const { profile: ref, preferences, schedule } = userData(user.uid)
  await runTransaction(db, async transaction => {
    const existing = await transaction.get(ref)
    const existingPreferences = await transaction.get(preferences)
    const existingSchedule = await transaction.get(schedule)
    if (!existing.exists()) {
      transaction.set(ref, {
        displayName: user.displayName, photoURL: user.photoURL, createdAt: serverTimestamp(),
        settings: { theme: 'dark', currency: 'CAD', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      })
    }
    if (!existingPreferences.exists()) transaction.set(preferences, DEFAULT_PREFERENCES)
    const before = existingSchedule.exists() ? existingSchedule.data() : null
    const after = migrationFor(before)
    if (after) writeSchedule(transaction, user.uid, before, after, 'Initialize or safely migrate the weekly schedule to v2.')
  })
}
