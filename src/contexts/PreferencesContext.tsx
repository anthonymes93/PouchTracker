import { createContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import type { Preferences, SpacingSchedule, Theme } from '../types/data'
import { DEFAULT_PREFERENCES } from '../config/defaults'
import { listenPreferences, listenSchedule, savePreferences } from '../services/preferences'
import { dataErrorMessage } from '../utils/dataErrors'
import { applyTheme, readTheme } from '../utils/themeCache'

interface PreferencesState {
  preferences: Preferences; schedule: SpacingSchedule | null; scheduleCached: boolean; loading: boolean; saving: boolean
  error: string | null; scheduleError: string | null
  setTheme: (theme: Theme) => void; rememberCigarPrice: (price: number) => void; retry: () => void
}
export const PreferencesContext = createContext<PreferencesState | undefined>(undefined)
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const uid = user?.uid ?? null
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [schedule, setSchedule] = useState<SpacingSchedule | null>(null)
  const [scheduleCached, setScheduleCached] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const current = useRef(preferences)
  const savingRef = useRef(false)
  const owner = useRef(uid)
  owner.current = uid
  useEffect(() => {
    if (authLoading) return
    setError(null); setScheduleError(null); setSchedule(null); setScheduleCached(true); setSaving(false); savingRef.current = false
    if (!uid) {
      applyTheme('forest', null); setPreferences(DEFAULT_PREFERENCES); current.current = DEFAULT_PREFERENCES; setLoading(false)
      return
    }
    const initial = { ...DEFAULT_PREFERENCES, theme: readTheme(uid) }
    current.current = initial; setPreferences(initial); applyTheme(initial.theme, uid); setLoading(true)
    let active = true
    const stopPreferences = listenPreferences(uid, value => {
      if (!active) return
      if (!value) return // Profile initialization creates this document; do not write defaults over a remote preference.
      current.current = value; setPreferences(value); applyTheme(value.theme, uid); setLoading(false)
    }, err => { if (active) { setError(dataErrorMessage(err)); setLoading(false) } })
    const stopSchedule = listenSchedule(uid, (value, cached = false) => { if (active) { setScheduleCached(cached); setSchedule(value); setScheduleError(null) } }, err => { if (active) setScheduleError(dataErrorMessage(err)) })
    return () => { active = false; stopPreferences(); stopSchedule() }
  }, [uid, authLoading, attempt])
  function setTheme(theme: Theme) {
    if (!uid || loading || savingRef.current || current.current.theme === theme) return
    const previous = current.current
    savingRef.current = true; setSaving(true); setError(null)
    const optimistic = { ...previous, theme }
    current.current = optimistic; setPreferences(optimistic); applyTheme(theme, uid)
    void savePreferences(uid, { theme }).catch(err => {
      if (owner.current !== uid) return
      current.current = previous; setPreferences(previous); applyTheme(previous.theme, uid); setError(dataErrorMessage(err))
    }).finally(() => { if (owner.current === uid) { savingRef.current = false; setSaving(false) } })
  }
  function rememberCigarPrice(price: number) {
    if (!uid || current.current.lastCigarPriceCents === price) return
    void savePreferences(uid, { lastCigarPriceCents: price }).catch(err => { if (owner.current === uid) setError(`The preferred cigar price could not be saved. ${dataErrorMessage(err)}`) })
  }
  return <PreferencesContext.Provider value={{ preferences, schedule, scheduleCached, loading, saving, error, scheduleError, setTheme, rememberCigarPrice, retry: () => setAttempt(value => value + 1) }}>{children}</PreferencesContext.Provider>
}
