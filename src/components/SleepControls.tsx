import { useState } from 'react'
import { Link } from 'react-router'
import { useSleep } from '../hooks/usePerformance'
import { useFinance } from '../contexts/FinanceContext'
import { saveSleepAction } from '../services/sleep'
import { formatTimestamp } from '../utils/dateTime'
export function SleepControls({ expanded=false }: {expanded?:boolean}) {
  const {uid}=useFinance(),{sleep,error,retry}=useSleep()
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const active=sleep?.periods.find(row=>row.endMs===null), interrupted=sleep?.interruption
  async function act(kind:'start'|'wake'|'dismiss') {
    if(!sleep || busy)return
    setBusy(true);setMessage('')
    try { await saveSleepAction(uid,sleep,kind==='start'?{kind,id:crypto.randomUUID(),atMs:Date.now()}:kind==='wake'?{kind,atMs:Date.now()}:{kind}) }
    catch(err){setMessage((err as Error).message)} finally{setBusy(false)}
  }
  return <details className="sleep-controls" open={expanded || !!active || !!interrupted}><summary>Sleep tracking{active?' · Sleeping':''}</summary>
    {active && <p className="data-note">Started {formatTimestamp(active.startMs)}. Your pouch timer keeps running.</p>}
    {interrupted && <p role="status" className="data-note">Sleep ended at your pouch on {formatTimestamp(interrupted.atMs)}. Did you return to sleep? Start a new period only when you choose to, or record an earlier return in Sleep Tracking.</p>}
    <div className="goal-actions"><button className="secondary-button" disabled={!sleep || busy || !!error} onClick={()=>void act(active?'wake':'start')}>{active?"I'm Awake":interrupted?"I'm Going Back to Sleep Now":"I'm Going to Sleep"}</button>{interrupted && <button className="secondary-button" disabled={busy} onClick={()=>void act('dismiss')}>Not now</button>}<Link className="text-link" to="/settings/sleep">Manage sleep &amp; awake periods</Link></div>
    <p className="data-note">Optional. Waking ends sleep; it does not automatically confirm the time afterward as awake.</p>
    {(error || message) && <p role="alert" className="error-banner">{error || message}{error && <button className="text-button" onClick={retry}>Retry</button>}</p>}
  </details>
}
