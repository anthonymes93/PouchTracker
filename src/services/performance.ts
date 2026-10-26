import { limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { userData } from './userData'
import { fromDateTimeInput } from '../utils/dateTime'
import { shiftDate } from '../utils/financeDates'
import type { EntrySnapshot } from './entries'
export function listenRange(uid: string, start: string, end: string, next: (value: EntrySnapshot) => void, fail: (error: Error) => void) {
  const boundary = Timestamp.fromMillis(fromDateTimeInput(`${start}T00:00:00`))
  const entries = userData(uid).entries
  const ranges = [query(entries, where('occurredAt', '>=', boundary), where('occurredAt', '<', Timestamp.fromMillis(fromDateTimeInput(`${shiftDate(end, 1)}T00:00:00`))), orderBy('occurredAt', 'desc')),
    query(entries, where('kind', '==', 'pouch'), where('occurredAt', '<', boundary), orderBy('occurredAt', 'desc'), limit(1))]
  const values = new Map<number, EntrySnapshot>()
  const stops = ranges.map((range, i) => onSnapshot(range, { includeMetadataChanges: true }, snap => {
    values.set(i, { entries: snap.docs.map(item => ({ ...item.data({ serverTimestamps: 'estimate' }), id: item.id, pending: item.metadata.hasPendingWrites })), fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites })
    if (values.size === 2) next({ entries: [...values.values()].flatMap(value => value.entries), fromCache: [...values.values()].some(value => value.fromCache), pending: [...values.values()].some(value => value.pending) })
  }, fail))
  return () => stops.forEach(stop => stop())
}
export { listenSleep, saveSleepAction } from './sleep'
