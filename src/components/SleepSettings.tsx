import { useEffect, useState } from 'react'
import { useFinance } from '../contexts/FinanceContext'
import { useSleep } from '../hooks/usePerformance'
import { saveSleep } from '../services/performance'
import { DEFAULT_SLEEP } from '../utils/performance'
export function SleepSettings() {
  const { uid } = useFinance(), { sleep, error, retry } = useSleep()
  const [draft, setDraft] = useState(DEFAULT_SLEEP), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { if (sleep) setDraft(sleep) }, [sleep])
  return <section className="panel settings-panel"><h2>Sleep window</h2><p className="data-note">America/Toronto · Intervals touching sleep or crossing midnight are excluded from performance scores. Your timestamps and live timer stay accurate. Changes recalculate past analytics.</p><form onSubmit={event => { event.preventDefault(); setBusy(true); setMessage(''); void saveSleep(uid, draft).then(() => setMessage('Sleep window saved.')).catch(err => setMessage(err.message)).finally(() => setBusy(false)) }}><div className="performance-controls"><label className="field-label">Sleep starts<input type="time" required value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} /></label><label className="field-label">Sleep ends<input type="time" required value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} /></label></div><button className="primary-button" disabled={!sleep || busy}>Save sleep window</button></form>{error && <p role="alert">{error} <button onClick={retry}>Retry</button></p>}<p role="status">{message}</p></section>
}
