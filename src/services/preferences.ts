import { onSnapshot, setDoc } from 'firebase/firestore'
import type { Preferences, SpacingSchedule } from '../types/data'
import { userData } from './userData'
import { DEFAULT_PREFERENCES } from '../config/defaults'
import { fromDateTimeInput } from '../utils/dateTime'
export function listenPreferences(uid: string, next: (value: Preferences | null, cached: boolean) => void, fail: (error: Error) => void) {
  return onSnapshot(userData(uid).preferences, { includeMetadataChanges: true }, snapshot => {
    if (!snapshot.exists()) { next(null, snapshot.metadata.fromCache); return }
    const data = snapshot.data()
    let timeZone = data.timeZone || DEFAULT_PREFERENCES.timeZone
    try { new Intl.DateTimeFormat('en-CA', { timeZone }).format() } catch { timeZone = DEFAULT_PREFERENCES.timeZone }
    next({ ...DEFAULT_PREFERENCES, ...data, timeZone, theme: data.theme === 'ocean' ? 'ocean' : 'forest' }, snapshot.metadata.fromCache)
  }, fail)
}
export function listenSchedule(uid: string, next: (value: SpacingSchedule | null) => void, fail: (error: Error) => void) {
  return onSnapshot(userData(uid).schedule, snapshot => {
    if (!snapshot.exists()) { next(null); return }
    const value = snapshot.data()
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: value.timeZone }).format()
      if (!Array.isArray(value.steps) || !value.steps.length || value.steps.some(step => !/^\d{4}-\d{2}-\d{2}$/.test(step.startsOn) || !Number.isFinite(step.minimumMinutes) || step.minimumMinutes <= 0 || !Number.isInteger(step.week) || step.week < 1)) throw new Error()
      value.steps.forEach(step => fromDateTimeInput(`${step.startsOn}T00:00:00`, value.timeZone))
      if (new Set(value.steps.map(step => step.startsOn)).size !== value.steps.length) throw new Error()
      next(value)
    } catch { fail(new Error('Your spacing schedule is invalid. Check its dates, timezone, weeks, and positive spacing targets.')) }
  }, fail)
}
export function savePreferences(uid: string, values: Partial<Pick<Preferences, 'theme' | 'lastCigarPriceCents'>>) {
  return setDoc(userData(uid).preferences, values, { merge: true })
}
