import { doc, increment } from 'firebase/firestore'
import type { Transaction, WriteBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
export const rewardRevisionRef = (uid: string) => doc(db!, 'users', uid, 'settings', 'rewardState')
export function touchRewards(writer: Transaction | WriteBatch, uid: string) { (writer as WriteBatch).set(rewardRevisionRef(uid), { sourceRevision: increment(1) }, { merge: true }) }
