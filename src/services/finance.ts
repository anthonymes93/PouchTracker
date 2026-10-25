import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { touchRewards } from './rewardRevision'
import { db } from '../lib/firebase'
import { userData } from './userData'
import type { Entry } from '../types/data'
import type { Baseline, Coverage, Pricing } from '../types/finance'
import { EMPTY_PRICING, KINDS } from '../types/finance'
import { validPrice } from '../utils/money'
import { fromDateTimeInput } from '../utils/dateTime'
import { torontoToday } from '../utils/financeDates'
import { validCigarPresets } from '../utils/cigarPricing'

export interface FinanceData {
  entries: Entry[]; pricing: Pricing; baselines: Baseline[]; coverage: Coverage[]
  loading: boolean; fromCache: boolean; pending: boolean; pricingReady: boolean
}
export const EMPTY_FINANCE: FinanceData = { entries: [], pricing: EMPTY_PRICING, baselines: [], coverage: [], loading: true, fromCache: true, pending: false, pricingReady: false }
export function listenFinance(uid: string, next: (data: FinanceData) => void, fail: (error: Error) => void, skipEntries = false) {
  if (!db) throw new Error('Firebase is not configured.')
  let data: FinanceData = { ...EMPTY_FINANCE }
  const status = new Map<string, { cached: boolean; pending: boolean }>()
  if (skipEntries) status.set('entries', { cached: false, pending: false })
  function emit(key: string, cached: boolean, pending: boolean) {
    status.set(key, { cached, pending })
    data = { ...data, loading: status.size < 4, fromCache: [...status.values()].some(value => value.cached), pending: [...status.values()].some(value => value.pending) }
    next(data)
  }
  const root = doc(db, 'users', uid)
  const stops = [
    // A shared ledger supports all-time reports and the existing timer/counts, avoiding duplicate entry listeners.
    skipEntries ? () => {} : onSnapshot(query(userData(uid).entries, orderBy('occurredAt', 'desc')), { includeMetadataChanges: true }, snapshot => {
      data = { ...data, entries: snapshot.docs.map(item => ({ ...item.data({ serverTimestamps: 'estimate' }), id: item.id, pending: item.metadata.hasPendingWrites })) }
      emit('entries', snapshot.metadata.fromCache, snapshot.metadata.hasPendingWrites)
    }, fail),
    onSnapshot(doc(root, 'settings', 'pricing'), { includeMetadataChanges: true }, snapshot => {
      const saved = snapshot.data() as Pricing | undefined
      if (saved?.cigarPresetsCents !== undefined && !validCigarPresets(saved.cigarPresetsCents)) { fail(new Error('Saved cigar pricing must contain three valid individual prices.')); return }
      if (saved && (!('pouch' in saved) || !('cigarette' in saved) || (saved.pouch !== null && !validPrice(saved.pouch)) || (saved.cigarette !== null && !validPrice(saved.cigarette)))) { fail(new Error('Saved pricing is invalid. Correct the pricing document before logging priced entries.')); return }
      data = { ...data, pricing: saved ?? EMPTY_PRICING, pricingReady: !snapshot.metadata.fromCache || snapshot.exists() }
      emit('pricing', snapshot.metadata.fromCache, snapshot.metadata.hasPendingWrites)
    }, fail),
    onSnapshot(query(collection(root, 'baselines'), orderBy('effectiveOn')), { includeMetadataChanges: true }, snapshot => {
      const baselines = snapshot.docs.map(item => ({ ...item.data({ serverTimestamps: 'estimate' }), id: item.id } as Baseline))
      try { baselines.forEach(validateBaseline) } catch { fail(new Error('A saved baseline is invalid. Financial estimates are unavailable until it is corrected.')); return }
      data = { ...data, baselines }; emit('baselines', snapshot.metadata.fromCache, snapshot.metadata.hasPendingWrites)
    }, fail),
    onSnapshot(collection(root, 'coverage'), { includeMetadataChanges: true }, snapshot => {
      data = { ...data, coverage: snapshot.docs.map(item => ({ ...item.data({ serverTimestamps: 'estimate' }), date: item.id } as Coverage)) }
      emit('coverage', snapshot.metadata.fromCache, snapshot.metadata.hasPendingWrites)
    }, fail),
  ]
  return () => stops.forEach(stop => stop())
}
export function validateBaseline(value: Pick<Baseline, 'effectiveOn' | 'categories'>) {
  fromDateTimeInput(`${value.effectiveOn}T00:00:00`)
  if (!value.categories || !Object.keys(value.categories).length || Object.keys(value.categories).some(kind => !KINDS.includes(kind as typeof KINDS[number]))) throw new Error('Select at least one baseline category.')
  for (const category of Object.values(value.categories)) {
    if (!category || !Number.isSafeInteger(category.dailyCountMilli) || category.dailyCountMilli < 0 || category.dailyCountMilli > 1_000_000 || !validPrice(category.price)) throw new Error('Each selected category needs a daily quantity (0–1,000) and a valid reference price.')
  }
}
export function savePricing(uid: string, pricing: Pricing) {
  if (!db) throw new Error('Firebase is not configured.')
  if ([pricing.pouch, pricing.cigarette].some(price => price !== null && !validPrice(price))) throw new Error('Enter valid prices and whole pack quantities.')
  if (pricing.cigarPresetsCents !== undefined && !validCigarPresets(pricing.cigarPresetsCents)) throw new Error('Enter three valid individual cigar prices.')
  return setDoc(doc(db, 'users', uid, 'settings', 'pricing'), pricing)
}
export async function appendBaseline(uid: string, value: Pick<Baseline, 'effectiveOn' | 'categories'>) {
  if (!db) throw new Error('Firebase is not configured.')
  validateBaseline(value)
  const root = doc(db, 'users', uid)
  const ref = doc(root, 'baselines', value.effectiveOn)
  const control = doc(root, 'settings', 'baselineState')
  await runTransaction(db, async transaction => {
    const previous = await transaction.get(control)
    const existing = await transaction.get(ref)
    if (existing.exists()) throw new Error('A baseline already starts on this date. Choose a later effective date.')
    if (previous.exists() && (value.effectiveOn <= previous.data().lastEffectiveOn || value.effectiveOn < torontoToday())) throw new Error('A new baseline must start today or later, after your latest saved version. Past versions are preserved.')
    transaction.set(ref, { ...value, id: value.effectiveOn, createdAt: serverTimestamp() })
    transaction.set(control, { lastEffectiveOn: value.effectiveOn })
    touchRewards(transaction, uid)
  })
}
export function saveCoverage(uid: string, date: string, complete: boolean) {
  if (!db) throw new Error('Firebase is not configured.')
  fromDateTimeInput(`${date}T00:00:00`)
  if (date >= torontoToday()) throw new Error('Only a completed calendar day can be confirmed.')
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', uid, 'coverage', date), { date, complete, updatedAt: serverTimestamp() })
  touchRewards(batch, uid)
  return batch.commit()
}
