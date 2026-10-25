import { Check, Clock3, Leaf } from 'lucide-react'
import { useNicotineEntries } from '../hooks/useNicotineEntries'
import { usePouchTimer } from '../hooks/usePouchTimer'
import { useSpacingGoal } from '../hooks/useSpacingGoal'
import { formatDuration, spacingProgress } from '../utils/tracking'
import { formatCalendarDate } from '../utils/dateTime'
import { QuickLog } from './QuickLog'
export function PouchTimer() {
  const { latest, retry } = useNicotineEntries()
  const last = latest.snapshot.entries[0]?.occurredAt.toMillis() ?? null
  const { now, elapsed, parts } = usePouchTimer(latest.error ? null : last)
  const goal = useSpacingGoal(now)
  const progress = spacingProgress(elapsed, goal.current?.minimumMinutes)
  return <><div className="section-label"><h2>Your rhythm</h2><span className="badge">{progress?.reached ? <><Check size={13} /> Spacing target reached</> : <><span className="status-dot" /> At your own pace</>}</span></div>
    <section className="timer-card panel" aria-labelledby="timer-title"><div className="timer-top"><span className="eyebrow" id="timer-title"><Clock3 size={16} /> TIME SINCE LAST POUCH</span><span className="small-muted">Spacing timer</span></div>
      <div className={`timer-digits ${parts[0].length > 3 ? 'long-timer' : ''}`} role="timer" aria-label={elapsed === null ? 'Timer not started' : `${parts[0]} hours, ${parts[1]} minutes, ${parts[2]} seconds`}><span>{parts[0]}<small>HOURS</small></span><b>:</b><span>{parts[1]}<small>MINUTES</small></span><b>:</b><span>{parts[2]}<small>SECONDS</small></span></div>
      <QuickLog />
      {latest.error ? <div className="error-banner" role="alert">{latest.error}<button className="text-button" onClick={retry}>Retry timer</button></div> : <p className="timer-empty"><Leaf size={16} />{latest.loading ? 'Loading your latest pouch…' : last === null ? (latest.snapshot.fromCache ? 'No pouch available locally. Connecting to your records…' : 'A fresh start. No pouches logged yet.') : latest.snapshot.fromCache ? 'Showing locally available records · syncing' : 'A little space. A little more awareness.'}</p>}
      <div className="goal-area"><div><span>{goal.current ? `Week ${goal.current.week} spacing target` : 'Spacing schedule'}</span><strong>{goal.current ? `${goal.current.minimumMinutes} min` : goal.loading ? 'Loading…' : goal.next ? 'Not started' : 'Unavailable'}</strong></div>
        <div className={`progress-track ${progress?.reached ? 'complete' : ''}`} role="progressbar" aria-label="Progress toward minimum spacing target" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress?.percent ?? 0)}><span style={{ width: `${progress?.percent ?? 0}%` }} /></div>
        <p>{goal.error || (progress ? progress.reached ? `${formatDuration(progress.beyond)} beyond your minimum spacing target.` : `${formatDuration(progress.remaining)} remaining to your minimum spacing target.` : goal.current ? 'Your spacing progress starts with your first pouch entry.' : goal.next ? `Your schedule starts ${formatCalendarDate(goal.next.startsOn)}.` : 'Waiting for your saved schedule.')}</p>
        {goal.next && <p className="next-goal">Next: {goal.next.minimumMinutes} min on {formatCalendarDate(goal.next.startsOn)}</p>}{goal.current && !goal.next && <p className="next-goal">This target continues until your schedule changes.</p>}<p className="spacing-note">A minimum interval, never a reminder to use nicotine.</p>
      </div>
    </section></>
}
