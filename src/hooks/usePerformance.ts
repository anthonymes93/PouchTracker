import { useEffect, useState } from 'react'
import { useFinance } from '../contexts/FinanceContext'
import { listenRange, listenSleep } from '../services/performance'
import type { EntrySnapshot } from '../services/entries'
import type { SleepWindow } from '../utils/performance'
export function useSleep() {
  const { uid } = useFinance()
  const [sleep, setSleep] = useState<SleepWindow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, retry] = useState(0)
  useEffect(() => { setSleep(null); setError(null); return listenSleep(uid, value => { setSleep(value); setError(null) }, err => setError(err.message)) }, [uid, attempt])
  return { sleep, error, retry: () => retry(n => n + 1) }
}
export function useEntryRange(start: string, end: string) {
  const { uid } = useFinance()
  const key = `${uid}:${start}:${end}`
  const [snapshot, setSnapshot] = useState<{ key: string; data: EntrySnapshot } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, retry] = useState(0)
  useEffect(() => {
    setSnapshot(null); setError(null)
    return listenRange(uid, start, end, value => { setSnapshot({ key, data: value }); setError(null) }, err => setError(err.message))
  }, [uid, start, end, key, attempt])
  return { data: snapshot?.key === key ? snapshot.data : null, error, retry: () => retry(n => n + 1) }
}
