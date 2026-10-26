import { sleepRef, decodeSleep, writeSleep } from './sleep'
import { interruptSleep } from '../utils/sleep'
import { doc, runTransaction, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore'
import type { Entry, ProductKind } from '../types/data'
import { userData } from './userData'
import { cigarSnapshot } from '../utils/cigarPricing'
import type { PriceSnapshot, Pricing } from '../types/finance'
import { validPrice } from '../utils/money'
import { db } from '../lib/firebase'
import { dateKey } from '../utils/dateTime'
import { touchRewards } from './rewardRevision'

const coverageRef = (uid: string, date: string) => doc(db!, 'users', uid, 'coverage', date)
const unconfirmed = (date: string) => ({ date, complete: false, updatedAt: serverTimestamp() })

export interface EntrySnapshot { entries: Entry[]; fromCache: boolean; pending: boolean }
export function createEntry(uid: string, kind: ProductKind, costCents: number | null = null, pricing?: Pricing) {
  const selectedCigar = kind === 'cigar' ? cigarSnapshot(costCents!) : null
  const ref = doc(userData(uid).entries)
  // Allocate once. The Firestore SDK retries this write with this ID, never adds another document.
  if (!db) throw new Error('Firebase is not configured.')
  const occurredAt = Timestamp.now()
  const record = {
    id: ref.id, uid, kind, occurredAt, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    costCents: kind === 'cigar' ? costCents : null, currency: 'CAD' as const,
    priceSnapshot: kind === 'cigar' ? selectedCigar : pricing?.[kind] ?? null,
  }
  const date = dateKey(occurredAt.toMillis())
  let completion: Promise<void>
  if (kind === 'pouch') {
    completion = runTransaction(db, async tx => {
      const snapshot=await tx.get(sleepRef(uid)), sleep=decodeSleep(snapshot.data())
      const interrupted=interruptSleep(sleep,occurredAt.toMillis(),ref.id)
      tx.set(ref,record)
      tx.set(coverageRef(uid,date),unconfirmed(date))
      if(interrupted) writeSleep(tx,uid,snapshot.data()??null,interrupted,`Sleep ended at pouch ${ref.id}. Return to sleep requires explicit confirmation.`)
      touchRewards(tx,uid)
    })
  } else {
    const batch=writeBatch(db)
    batch.set(ref,record); batch.set(coverageRef(uid,date),unconfirmed(date)); touchRewards(batch,uid)
    completion=batch.commit()
  }
  return { id: ref.id, completion }
}
export function editEntryTime(uid: string, id: string, occurredAt: number, price?: PriceSnapshot | null) {
  if (!Number.isFinite(occurredAt) || occurredAt > Date.now()) throw new Error('Choose a date and time that is not in the future.')
  if (price != null && !validPrice(price)) throw new Error('Enter a valid price and quantity.')
  if (!db) throw new Error('Firebase is not configured.')
  const ref = doc(userData(uid).entries, id)
  return runTransaction(db, async transaction => {
    const existing = await transaction.get(ref)
    if (!existing.exists()) throw new Error('This entry no longer exists.')
    const dates = new Set([dateKey(existing.data().occurredAt.toMillis()), dateKey(occurredAt)])
    transaction.update(ref, { occurredAt: Timestamp.fromMillis(occurredAt), updatedAt: serverTimestamp(), ...(price === undefined ? {} : { priceSnapshot: price, costCents: null }) })
    dates.forEach(date => transaction.set(coverageRef(uid, date), unconfirmed(date)))
    touchRewards(transaction, uid)
  })
}
export function deleteEntry(uid: string, id: string) {
  if (!db) throw new Error('Firebase is not configured.')
  const ref = doc(userData(uid).entries, id)
  return runTransaction(db, async transaction => {
    const existing = await transaction.get(ref)
    if (!existing.exists()) return
    const date = dateKey(existing.data().occurredAt.toMillis())
    transaction.delete(ref)
    transaction.set(coverageRef(uid, date), unconfirmed(date))
    touchRewards(transaction, uid)
  })
}
export async function restoreEntry(uid: string, entry: Entry) {
  if (!db) throw new Error('Firebase is not configured.')
  const ref = doc(userData(uid).entries, entry.id)
  const { pending: _pending, ...original } = entry
  await runTransaction(db, async transaction => {
    if ((await transaction.get(ref)).exists()) throw new Error('This entry already exists. Reload history before trying again.')
    transaction.set(ref, { ...original, uid, updatedAt: serverTimestamp() })
    const date = dateKey(original.occurredAt.toMillis())
    transaction.set(coverageRef(uid, date), unconfirmed(date))
    touchRewards(transaction, uid)
  })
}
