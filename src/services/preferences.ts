import { onSnapshot, setDoc } from 'firebase/firestore'
import type { Preferences } from '../types/data'
import { userData } from './userData'
import { DEFAULT_PREFERENCES } from '../config/defaults'
export function listenPreferences(uid: string, next: (value: Preferences | null, cached: boolean) => void, fail: (error: Error) => void) {
  return onSnapshot(userData(uid).preferences, { includeMetadataChanges: true }, snapshot => {
    if (!snapshot.exists()) { next(null, snapshot.metadata.fromCache); return }
    const data = snapshot.data()
    let timeZone = data.timeZone || DEFAULT_PREFERENCES.timeZone
    try { new Intl.DateTimeFormat('en-CA', { timeZone }).format() } catch { timeZone = DEFAULT_PREFERENCES.timeZone }
    next({ ...DEFAULT_PREFERENCES, ...data, timeZone, theme: data.theme === 'ocean' ? 'ocean' : 'forest' }, snapshot.metadata.fromCache)
  }, fail)
}
export { listenSchedule } from './schedule'
export function savePreferences(uid: string, values: Partial<Pick<Preferences, 'theme' | 'lastCigarPriceCents'>>) {
  return setDoc(userData(uid).preferences, values, { merge: true })
}
