import { createContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Entry, ProductKind } from '../types/data'
import { createEntry, deleteEntry, editEntryTime, restoreEntry } from '../services/entries'
import { useFinance } from './FinanceContext'
import type { PriceSnapshot } from '../types/finance'
import type { EntrySnapshot } from '../services/entries'
import { useTheme } from '../hooks/useTheme'
import { dailyCounts } from '../utils/tracking'
import { dateKey } from '../utils/dateTime'
import { dataErrorMessage } from '../utils/dataErrors'

interface Feed { snapshot: EntrySnapshot; loading: boolean; error: string | null }
interface Toast { id: number; message: string; undoId?: string; restore?: Entry }
interface EntriesState {
  recent: Feed; today: Feed; latest: Feed; counts: ReturnType<typeof dailyCounts>; cooldown: boolean
  pendingIds: Set<string>; toast: Toast | null; actionError: string | null
  log: (kind: ProductKind, price?: number) => boolean; edit: (entry: Entry, time: number, price?: PriceSnapshot | null) => boolean
  remove: (id: string, restore?: Entry) => void; undo: () => void; dismissToast: () => void; retry: () => void; clearError: () => void
}
export const EntriesContext = createContext<EntriesState | undefined>(undefined)
export function EntriesProvider({ children, uid }: { children: ReactNode; uid: string }) {
  const { preferences, rememberCigarPrice } = useTheme()
  const timeZone = preferences.timeZone
  const [day, setDay] = useState(() => dateKey(Date.now(), timeZone))
  const finance = useFinance()
  const feed = (entries: Entry[]): Feed => ({ snapshot: { entries, fromCache: finance.fromCache, pending: finance.pending }, loading: finance.loading, error: finance.error })
  const recent = feed(finance.entries.slice(0, 100))
  const latest = feed(finance.entries.filter(entry => entry.kind === 'pouch').slice(0, 1))
  const today = feed(finance.entries.filter(entry => dateKey(entry.occurredAt.toMillis(), timeZone) === day))
  const [cooldown, setCooldown] = useState(false)
  const [pendingIds, setPendingIds] = useState(new Set<string>())
  const [toast, setToast] = useState<Toast | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const lockedUntil = useRef(0)
  const pendingRef = useRef(new Set<string>())
  const removed = useRef(new Set<string>())
  const creates = useRef(new Map<string, Promise<void>>())
  const mounted = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; timers.current.forEach(clearTimeout) } }, [])
  useEffect(() => {
    const tick = () => setDay(dateKey(Date.now(), timeZone))
    tick()
    const timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [timeZone])
  function notify(message: string, undoId?: string, restore?: Entry) {
    const id = Date.now() + Math.random()
    setToast({ id, message, undoId, restore })
    timers.current.push(setTimeout(() => { if (mounted.current) setToast(value => value?.id === id ? null : value) }, 8000))
  }
  function observe(id: string, completion: Promise<void>, success: string, undoId?: string, restore?: Entry) {
    pendingRef.current.add(id); setPendingIds(new Set(pendingRef.current))
    completion.then(() => { if (mounted.current && !removed.current.has(id)) notify(success, undoId, restore) }).catch(err => {
      if (mounted.current) { setActionError(dataErrorMessage(err)); setToast(null) }
    }).finally(() => {
      pendingRef.current.delete(id)
      if (mounted.current) setPendingIds(new Set(pendingRef.current))
    })
  }
  function log(kind: ProductKind, price?: number) {
    if (kind !== 'cigar' && (!finance.pricingReady || finance.error)) { setActionError('Wait for your saved pricing to load before logging. Retry the connection if needed.'); return false }
    if (performance.now() < lockedUntil.current) return false
    lockedUntil.current = performance.now() + 1500; setCooldown(true); setActionError(null)
    timers.current.push(setTimeout(() => { if (mounted.current) setCooldown(false) }, 1500))
    try {
      const operation = createEntry(uid, kind, price ?? null, finance.pricing)
      creates.current.set(operation.id, operation.completion)
      void operation.completion.then(() => creates.current.delete(operation.id), () => creates.current.delete(operation.id))
      notify(`${kind[0].toUpperCase()}${kind.slice(1)} added · saving…`, operation.id)
      observe(operation.id, operation.completion, `${kind[0].toUpperCase()}${kind.slice(1)} logged`, operation.id)
      if (kind === 'cigar' && price !== undefined) rememberCigarPrice(price)
      return true
    } catch (err) { setActionError(dataErrorMessage(err)); return false }
  }
  function edit(entry: Entry, time: number, price?: PriceSnapshot | null) {
    if (pendingRef.current.has(entry.id)) return false
    try {
      setActionError(null)
      observe(entry.id, editEntryTime(uid, entry.id, time, price), 'Entry updated')
      notify('Entry updated · saving…')
      return true
    } catch (err) { setActionError(dataErrorMessage(err)); return false }
  }
  function remove(id: string, restore?: Entry) {
    if (pendingRef.current.has(`delete:${id}`)) return
    removed.current.add(id)
    // A transactional delete must wait for a queued create to reach the server.
    // Otherwise Undo could read an absent document and leave the eventual create behind.
    try {
      setActionError(null); setToast(null)
      const creating = creates.current.get(id)
      observe(`delete:${id}`, creating ? creating.then(() => deleteEntry(uid, id)) : deleteEntry(uid, id), 'Entry removed', undefined, restore)
      notify('Entry removed · saving…')
    } catch (err) { setActionError(dataErrorMessage(err)) }
  }
  function undo() {
    if (toast?.undoId) { remove(toast.undoId); return }
    if (!toast?.restore) return
    const entry = toast.restore
    if (pendingRef.current.has(`restore:${entry.id}`)) return
    setToast(null); setActionError(null)
    observe(`restore:${entry.id}`, restoreEntry(uid, entry), 'Entry restored with its original price')
  }
  return <EntriesContext.Provider value={{ recent, today, latest, counts: dailyCounts(today.snapshot.entries, Date.now(), timeZone), cooldown, pendingIds, toast, actionError, log, edit, remove, undo, dismissToast: () => setToast(null), retry: finance.retry, clearError: () => setActionError(null) }}>{children}</EntriesContext.Provider>
}
