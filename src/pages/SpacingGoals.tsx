import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useClock } from '../hooks/useClock'
import { PageHeader } from '../components/ui/PageHeader'
import { Modal } from '../components/ui/Modal'
import { RewardStatus } from '../components/rewards/RewardCards'
import { formatMinutes } from '../utils/duration'
import { applyGoalChanges, bulkGoalChanges, plannerWeeks } from '../utils/spacingSchedule'
import type { GoalChange } from '../utils/spacingSchedule'
import type { SpacingSchedule, SpacingStep } from '../types/data'
import { shiftDate, torontoToday } from '../utils/financeDates'
import { saveGoalChanges } from '../services/schedule'

function TargetPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <><div className="goal-picker"><label className="field-label">Hours<select value={Math.floor(value / 60)} onChange={e => onChange(Number(e.target.value) * 60 + (Number(e.target.value) === 24 ? 0 : value % 60))}>{Array.from({ length: 25 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label><label className="field-label">Minutes<select value={value % 60} disabled={value >= 1440} onChange={e => onChange(Math.floor(value / 60) * 60 + Number(e.target.value))}>{[0, 15, 30, 45].map(i => <option key={i} value={i}>{i}</option>)}</select></label></div><p className="goal-preview">Target: <strong>{formatMinutes(value)}</strong></p></>
}
function GoalEditor({ schedule, rows, initial, uid, today, close }: { schedule: SpacingSchedule; rows: SpacingStep[]; initial: SpacingStep | null; uid: string; today: string; close: () => void }) {
  // Snapshot retained for conflict detection. Live updates never silently replace an open draft.
  const [base] = useState(schedule), [sourceRows] = useState(rows)
  const upcoming = sourceRows.filter(row => row.startsOn > today)
  const [target, setTarget] = useState(initial?.minimumMinutes ?? upcoming[0]?.minimumMinutes ?? 180)
  const [start, setStart] = useState(upcoming[0]?.startsOn ?? ''), [end, setEnd] = useState(upcoming.at(-1)?.startsOn ?? '')
  const [mode, setMode] = useState<'set' | 'increase' | 'reset'>('set'), [increase, setIncrease] = useState(15)
  const [review, setReview] = useState<GoalChange[] | null>(null), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const isCurrent = initial && initial.startsOn <= today
  function preview() {
    try {
      const changes = initial ? [{ startsOn: initial.startsOn, minimumMinutes: target }] : bulkGoalChanges(sourceRows, start, end, mode, mode === 'increase' ? increase : target, today)
      applyGoalChanges(base, changes, today); setReview(changes); setError('')
    } catch (err) { setError((err as Error).message) }
  }
  async function save() {
    if (!review || saving) return
    setSaving(true); setError('')
    try { await saveGoalChanges(uid, base, review); close() } catch (err) { setError((err as Error).message); setSaving(false) }
  }
  return <Modal title={initial ? `Edit Week ${initial.week}` : 'Plan future weeks'} onClose={() => { if (!saving) close() }}>
    {isCurrent && <p className="data-note">Changing the current target applies immediately and may change today’s progress, scores earlier this week, and provisional XP. Saved rewards will be reconciled with an audit record. Your entries stay intact.</p>}
    {review ? <><h3>Review changes</h3><p className="data-note">{mode === 'reset' && !initial ? 'Confirm reset: all selected future weeks will use the target immediately before the selected range.' : 'Only the weeks listed below will change.'}</p><ul className="goal-review">{review.map(change => <li key={change.startsOn}>Week {sourceRows.find(row => row.startsOn === change.startsOn)?.week} · {change.startsOn}<br />{formatMinutes(sourceRows.find(row => row.startsOn === change.startsOn)?.minimumMinutes)} → <strong>{formatMinutes(change.minimumMinutes)}</strong></li>)}</ul><div className="goal-actions"><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button><button className="secondary-button" disabled={saving} onClick={() => setReview(null)}>Back</button></div></> : <>
      {!initial && <><div className="goal-picker"><label className="field-label">From week<select value={start} onChange={e => setStart(e.target.value)}>{upcoming.map(row => <option key={row.startsOn} value={row.startsOn}>Week {row.week} · {row.startsOn}</option>)}</select></label><label className="field-label">Through week<select value={end} onChange={e => setEnd(e.target.value)}>{upcoming.map(row => <option key={row.startsOn} value={row.startsOn}>Week {row.week} · {row.startsOn}</option>)}</select></label></div><label className="field-label">Change<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="set">Apply one target</option><option value="increase">Increase each selected target</option><option value="reset">Reset to previous target</option></select></label></>}
      {initial || mode === 'set' ? <TargetPicker value={target} onChange={setTarget} /> : mode === 'increase' ? <label className="field-label">Increase by (minutes)<input type="number" min="15" max="1425" step="15" value={increase} onChange={e => setIncrease(Number(e.target.value))} /></label> : <p className="data-note">Selected weeks will keep the last target before this range. Review and confirm the reset before saving.</p>}
      {initial && sourceRows.findIndex(row => row.startsOn === initial.startsOn) > 0 && <button className="secondary-button" onClick={() => setTarget(sourceRows[sourceRows.findIndex(row => row.startsOn === initial.startsOn) - 1].minimumMinutes)}>Copy previous week</button>}
      <div className="goal-actions"><button className="primary-button" onClick={preview}>Review changes</button></div>
    </>}
    {error && <p role="alert" className="error-banner">{error}</p>}<button className="secondary-button" disabled={saving} onClick={close}>Cancel</button>
  </Modal>
}
export default function SpacingGoals() {
  const { user } = useAuth()
  return <GoalPlanner key={user?.uid} uid={user?.uid ?? ''} />
}
function GoalPlanner({ uid }: { uid: string }) {
  const { schedule, scheduleError, retry } = useTheme(), today = torontoToday(useClock())
  const [editing, setEditing] = useState<{ row: SpacingStep | null; schedule: SpacingSchedule; rows: SpacingStep[] } | null>(null)
  const rows = schedule ? plannerWeeks(schedule, today) : []
  const groups = [...new Set(rows.map(row => row.startsOn.slice(0, 7)))]
  return <div className="goal-planner"><PageHeader eyebrow="YOUR PACE" title="Pouch Spacing Goals" description="Plan up to 52 weeks from your current week. Keep, increase, or decrease your targets as you choose." /><Link className="text-link" to="/settings">Back to Settings</Link>
    <p className="data-note">Weeks run Sunday–Saturday in America/Toronto. Past weeks stay available for review. Beyond your plan, the last target continues until you change it.</p>
    {scheduleError && <div role="alert" className="error-banner">{scheduleError}<button className="text-button" onClick={retry}>Retry goals</button></div>}
    {!schedule ? <p role="status">Waiting for your saved schedule…</p> : <><button className="secondary-button" disabled={!!scheduleError} onClick={() => setEditing({ row: null, schedule, rows })}>Plan future weeks</button><div className="goal-months">{groups.map(month => <details key={month} open={rows.some(row => row.startsOn.slice(0, 7) === month && row.startsOn <= today && shiftDate(row.startsOn, 6) >= today)}><summary>{new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`))}</summary>{rows.filter(row => row.startsOn.startsWith(month)).map(row => {
      const status = shiftDate(row.startsOn, 6) < today ? 'Completed' : row.startsOn > today ? 'Upcoming' : 'Current'
      return <div className={`goal-row ${status === 'Current' ? 'current' : ''}`} key={row.startsOn}><div><strong>Week {row.week}</strong><span>{row.startsOn} – {shiftDate(row.startsOn, 6)}</span><small>{status}</small></div><strong>{formatMinutes(row.minimumMinutes)}</strong><button className="secondary-button" aria-label={`Edit Week ${row.week}`} disabled={status === 'Completed' || !!scheduleError} onClick={() => setEditing({ row, schedule, rows })}>{status === 'Completed' ? 'Locked' : 'Edit'}</button></div>
    })}</details>)}</div></>}
    <RewardStatus />{editing && <GoalEditor schedule={editing.schedule} rows={editing.rows} initial={editing.row} uid={uid} today={today} close={() => setEditing(null)} />}
  </div>
}
