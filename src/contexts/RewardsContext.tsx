import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useFinance } from './FinanceContext'
import { useTheme } from '../hooks/useTheme'
import { useSleep } from '../hooks/usePerformance'
import { clearRewardCache, EMPTY_REWARDS, listenRewards, reconcileRewards } from '../services/rewards'
import { awardEqual, buildRewardModel, evaluateRewards, reconcilePlan, rewardTotals } from '../utils/rewards'
import { dateKey } from '../utils/dateTime'
import { levelProgress } from '../utils/rewardTime'
import type { RewardFeed } from '../types/rewards'
type Evaluation = ReturnType<typeof evaluateRewards>
interface RewardsState { feed: RewardFeed; result: Evaluation | null; model: ReturnType<typeof buildRewardModel> | null; error: string | null; syncing: boolean; stale: boolean; retry: () => void; notice: string; dismissNotice: () => void }
const RewardsContext = createContext<RewardsState | undefined>(undefined)
export function RewardsProvider({ children }: { children: ReactNode }) {
  const finance = useFinance(), { schedule, scheduleError } = useTheme(), sleepState = useSleep(), path = useLocation().pathname
  const [feed, setFeed] = useState(EMPTY_REWARDS), [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState(0), [syncing, setSyncing] = useState(false)
  const [day, setDay] = useState(() => dateKey(Date.now())), [result, setResult] = useState<Evaluation | null>(null), [notice, setNotice] = useState('')
  const inFlight = useRef(false), feedRef = useRef(feed), lastLevel = useRef<number | null>(null), initialized = useRef(false)
  feedRef.current = feed
  const fullSource = path !== '/calendar'
  useEffect(() => { clearRewardCache(finance.uid) }, [finance.uid, finance.entries, finance.coverage, finance.baselines, schedule, sleepState.sleep])
  useEffect(() => {
    setFeed(EMPTY_REWARDS); setError(null)
    const stop = listenRewards(finance.uid, setFeed, err => setError(err.message))
    return () => { stop(); clearRewardCache(finance.uid) }
  }, [finance.uid, attempt])
  useEffect(() => { const update = () => setDay(dateKey(Date.now())), timer = setInterval(update, 1000); const online = () => setAttempt(n => n + 1); window.addEventListener('online', online); return () => { clearInterval(timer); window.removeEventListener('online', online) } }, [])
  const model = useMemo(() => fullSource && !finance.loading && !finance.error && sleepState.sleep && schedule && !scheduleError ? buildRewardModel({ entries: finance.entries, coverage: finance.coverage, baselines: finance.baselines, sleep: sleepState.sleep, schedule }, Date.now()) : null,
    [fullSource, finance.loading, finance.error, finance.entries, finance.coverage, finance.baselines, sleepState.sleep, schedule, scheduleError, day])
  useEffect(() => {
    if (!model) { setResult(null); return }
    let signature: string | null = null
    const tick = () => {
      const active = model.active(Date.now()), key = active?.awards.map(value => `${value.id}:${value.status}`).join('|') ?? 'none'
      if (key !== signature) { signature = key; setResult(evaluateRewards(model, Date.now())) }
    }
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer)
  }, [model])
  const needsReview = useMemo(() => {
    if (!result) return false
    const previous = new Map([...feed.awards, ...feed.achievements].map(value => [value.id, value]))
    return [...reconcilePlan(feed.awards, result.awards, model?.source.sleep), ...reconcilePlan(feed.achievements, result.achievements, model?.source.sleep)].some(value => !previous.has(value.id) || !awardEqual(previous.get(value.id)!, value))
  }, [feed.awards, feed.achievements, result, model])
  const stale = feed.processedRevision !== feed.revision || needsReview || finance.pending
  useEffect(() => {
    if (error || !['/', '/rewards', '/settings/goals', '/settings/sleep'].includes(path) || !result || feed.loading || feed.fromCache || finance.fromCache || finance.pending || (!stale && !needsReview)) return
    const timer = setTimeout(() => {
      if (inFlight.current || !navigator.onLine) return
      inFlight.current = true; setSyncing(true); setError(null)
      void reconcileRewards(finance.uid, Date.now(), feedRef.current).catch(err => setError(err.message)).finally(() => { inFlight.current = false; setSyncing(false) })
    }, 350)
    return () => clearTimeout(timer)
  }, [path, result, stale, needsReview, feed.loading, feed.fromCache, feed.revision, finance.fromCache, finance.pending, finance.uid, attempt, syncing, error])
  useEffect(() => {
    if (feed.loading || feed.fromCache || stale || syncing) return
    const level = levelProgress(rewardTotals(feed.awards).xp).level
    const key = `pouchtracker:${finance.uid}:reward-notices`
    let seen: string[] = []
    try { seen = JSON.parse(localStorage.getItem(key) ?? '[]') } catch { /* Storage is optional. */ }
    const valid = [...feed.awards, ...feed.achievements].filter(value => value.status === 'valid')
    const fresh = valid.filter(value => !seen.includes(value.id))
    if (initialized.current && fresh.length) setNotice(lastLevel.current !== null && level > lastLevel.current ? `You've reached Level ${level}. Your progress is adding up.` : `${fresh.at(-1)!.name}. Your progress is adding up.`)
    initialized.current = true; lastLevel.current = level
    try { localStorage.setItem(key, JSON.stringify([...new Set([...seen, ...valid.map(value => value.id)])])) } catch { /* No repeated mount celebration even if storage is unavailable. */ }
  }, [feed, stale, syncing, finance.uid])
  const value = useMemo(() => ({ feed, result, model, error: error ?? sleepState.error ?? scheduleError, syncing, stale, retry: () => { setAttempt(n => n + 1); sleepState.retry(); finance.retry() }, notice, dismissNotice: () => setNotice('') }), [feed, result, model, error, sleepState.error, scheduleError, syncing, stale, notice])
  return <RewardsContext.Provider value={value}>{children}</RewardsContext.Provider>
}
export function useRewards() { const value = useContext(RewardsContext); if (!value) throw new Error('useRewards requires RewardsProvider'); return value }
