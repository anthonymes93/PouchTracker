import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useFinance } from '../contexts/FinanceContext'
import { useSleep } from '../hooks/usePerformance'
import { SleepControls } from '../components/SleepControls'
import { PageHeader } from '../components/ui/PageHeader'
import { Modal } from '../components/ui/Modal'
import { RewardStatus } from '../components/rewards/RewardCards'
import { saveSleepAction } from '../services/sleep'
import { formatTimestamp,toDateTimeInput } from '../utils/dateTime'
import { repeatedSleepHour,sleepTimestamp } from '../utils/sleep'
import type { HourOccurrence } from '../utils/sleep'
import type { SleepData,SleepPeriod } from '../types/sleep'
function PeriodEditor({base,period,remove,close}:{base:SleepData;period:SleepPeriod;remove:boolean;close:()=>void}) {
  const {uid}=useFinance()
  const [kind,setKind]=useState(period.kind),[start,setStart]=useState(toDateTimeInput(period.startMs)),[end,setEnd]=useState(period.endMs===null?'':toDateTimeInput(period.endMs))
  const original=base.periods.some(row=>row.id===period.id)
  const [startOccurrence,setStartOccurrence]=useState<HourOccurrence>(original?'original':'earlier'),[endOccurrence,setEndOccurrence]=useState<HourOccurrence>(original?'original':'earlier')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save() {
    if(busy)return
    setBusy(true);setError('')
    try {
      const value:SleepPeriod={id:period.id,kind,startMs:sleepTimestamp(start,startOccurrence,period.startMs),endMs:end?sleepTimestamp(end,endOccurrence,period.endMs??undefined):null}
      await saveSleepAction(uid,base,remove?{kind:'delete',id:period.id}:{kind:'put',period:value});close()
    }catch(err){setError((err as Error).message);setBusy(false)}
  }
  return <Modal title={remove?'Delete sleep/awake period':kind==='awake'?'Confirm awake period':'Record sleep period'} onClose={()=>{if(!busy)close()}}>
    <p className="data-note">America/Toronto. Historical changes recalculate scores and reconcile XP with an audit record. Usage entries are preserved. Overlapping sleep takes priority over awake confirmation.</p>
    {remove?<p>Delete this {period.kind} record, beginning {formatTimestamp(period.startMs)}? The uncovered time becomes unknown unless another record covers it.</p>:<><label className="field-label">Period type<select aria-label="Period type" value={kind} onChange={e=>setKind(e.target.value as SleepPeriod['kind'])}><option value="sleep">Recorded sleep</option><option value="awake">Confirmed awake</option></select></label><label className="field-label">Start date and time<input type="datetime-local" step="1" value={start} onChange={e=>setStart(e.target.value)} /></label><label className="field-label">End date and time<input type="datetime-local" step="1" value={end} onChange={e=>setEnd(e.target.value)} /></label>{repeatedSleepHour(start) && <label className="field-label">Start repeated hour<select aria-label="Start repeated hour" value={startOccurrence} onChange={e=>setStartOccurrence(e.target.value as HourOccurrence)}>{original && <option value="original">Keep original occurrence</option>}<option value="earlier">First occurrence (daylight time)</option><option value="later">Second occurrence (standard time)</option></select></label>}{repeatedSleepHour(end) && <label className="field-label">End repeated hour<select aria-label="End repeated hour" value={endOccurrence} onChange={e=>setEndOccurrence(e.target.value as HourOccurrence)}>{original && <option value="original">Keep original occurrence</option>}<option value="earlier">First occurrence (daylight time)</option><option value="later">Second occurrence (standard time)</option></select></label>}<p className="data-note">Leave the end empty only for currently active sleep. Awake periods need both timestamps: confirm only time you know you were awake. Repeated daylight-saving hours offer a choice of first or second occurrence. Existing records keep their original occurrence by default.</p></>}
    {error && <p role="alert" className="error-banner">{error}</p>}<div className="goal-actions"><button className="primary-button" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':remove?'Delete period':'Save period'}</button><button className="secondary-button" disabled={busy} onClick={close}>Cancel</button></div>
  </Modal>
}
export default function SleepTracking(){const{user}=useAuth();return <SleepPage key={user?.uid}/>}
function SleepPage(){
  const{sleep,error,retry}=useSleep(),[editor,setEditor]=useState<{base:SleepData;period:SleepPeriod;remove:boolean}|null>(null)
  const[limit,setLimit]=useState(30)
  function add(kind:SleepPeriod['kind']){if(sleep)setEditor({base:sleep,period:{id:crypto.randomUUID(),kind,startMs:Date.now()-3600000,endMs:Date.now()},remove:false})}
  return <div className="sleep-page"><PageHeader eyebrow="YOUR REST, YOUR SCHEDULE" title="Sleep Tracking" description="Record sleep whenever it happens. Confirm awake time when you know it, and leave uncertain gaps unknown."/><Link className="text-link" to="/settings">Back to Settings</Link><SleepControls expanded/>
    <p className="data-note">There is no assumed nighttime schedule. No recorded coverage means unknown, not awake. Only confirmed awake time counts for ordinary spacing XP; recorded sleep never inflates it. Your live pouch timer always includes real elapsed sleep time.</p>
    {error && <p role="alert" className="error-banner">{error}<button onClick={retry}>Retry sleep records</button></p>}
    <div className="goal-actions"><button className="secondary-button" disabled={!sleep || !!error} onClick={()=>add('sleep')}>Add sleep period</button><button className="secondary-button" disabled={!sleep || !!error} onClick={()=>add('awake')}>Confirm awake period</button></div>
    {!sleep?<p role="status">Loading sleep records…</p>:<section className="panel"><h2>Recorded periods</h2>{!sleep.periods.length && <p className="data-note">No periods recorded. Existing fixed-hour settings were not converted into historical sleep or awake time.</p>}{[...sleep.periods].sort((a,b)=>b.startMs-a.startMs).slice(0,limit).map(period=><article className="sleep-row" key={period.id}><div><strong>{period.kind==='sleep'?'Sleep':'Confirmed awake'}{period.endMs===null?' · Active':''}</strong><p>{formatTimestamp(period.startMs)}<br/>{period.endMs===null?'Until you end sleep':`to ${formatTimestamp(period.endMs)}`}</p></div><div className="goal-actions"><button className="secondary-button" aria-label={`Edit ${period.kind} ${period.id}`} onClick={()=>setEditor({base:sleep,period,remove:false})}>Edit</button><button className="secondary-button" aria-label={`Delete ${period.kind} ${period.id}`} onClick={()=>setEditor({base:sleep,period,remove:true})}>Delete</button></div></article>)}{sleep.periods.length>limit && <button className="secondary-button" onClick={()=>setLimit(n=>n+30)}>Show more periods</button>}</section>}
    <RewardStatus/>{editor && <PeriodEditor {...editor} close={()=>setEditor(null)}/>}</div>
}
