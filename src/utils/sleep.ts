import { EMPTY_SLEEP } from '../types/sleep'
import type { SleepData, SleepPeriod } from '../types/sleep'
import { fromDateTimeInput, toDateTimeInput } from './dateTime'
export { EMPTY_SLEEP }
export type HourOccurrence = 'original' | 'earlier' | 'later'
export function sleepTimestamp(value:string,occurrence:HourOccurrence,original?:number) {
  const first=fromDateTimeInput(value)
  if(occurrence==='original')return fromDateTimeInput(value,'America/Toronto',original)
  const second=first+3600000, normalized=value.length===16?`${value}:00`:value
  return occurrence==='later' && toDateTimeInput(second)===normalized?second:first
}
export function repeatedSleepHour(value:string){try{return sleepTimestamp(value,'earlier')!==sleepTimestamp(value,'later')}catch{return false}}
export function validSleep(value: SleepData) {
  return !!value && value.schemaVersion === 2 && Number.isInteger(value.revision) && value.revision >= 0 && Array.isArray(value.periods) && value.periods.length <= 3000
    && new Set(value.periods.map(row => row.id)).size === value.periods.length
    && value.periods.filter(row => row.endMs === null).length <= 1
    && value.periods.every(row => typeof row.id === 'string' && !!row.id && ['sleep','awake'].includes(row.kind) && Number.isFinite(row.startMs) && row.startMs >= 0 && (row.endMs === null ? row.kind === 'sleep' : Number.isFinite(row.endMs) && row.endMs >= row.startMs))
    && (value.interruption === null || (typeof value.interruption.entryId === 'string' && Number.isFinite(value.interruption.atMs)))
}
type Window = [number, number]
function union(windows: Window[]): Window[] {
  const result: Window[] = []
  for (const [start,end] of windows.sort((a,b) => a[0]-b[0])) {
    if (end <= start) continue
    const last = result.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1],end)
    else result.push([start,end])
  }
  return result
}
export function sleepEvidence(start: number, end: number, data: SleepData) {
  if (!validSleep(data) || end <= start) return { awake: [] as Window[], asleep: [] as Window[], awakeMinutes: 0, sleepMinutes: 0, unknownMinutes: Math.max(0,(end-start)/60000) }
  const windows = (kind: SleepPeriod['kind']) => union(data.periods.filter(row => row.kind === kind).map(row => [Math.max(start,row.startMs),Math.min(end,row.endMs ?? end)]))
  const asleep = windows('sleep'), awake: Window[] = []
  // Explicit sleep wins conflicting awake confirmations; overlap never counts twice.
  for (const [a,b] of windows('awake')) {
    let cursor = a
    for (const [c,d] of asleep) {
      if (d <= cursor || c >= b) continue
      if (c > cursor) awake.push([cursor,Math.min(c,b)])
      cursor = Math.max(cursor,d)
      if (cursor >= b) break
    }
    if (cursor < b) awake.push([cursor,b])
  }
  const duration = (values: Window[]) => values.reduce((sum,[a,b])=>sum+b-a,0)/60000
  const awakeMinutes=duration(awake), sleepMinutes=duration(asleep)
  return {awake,asleep,awakeMinutes,sleepMinutes,unknownMinutes:Math.max(0,(end-start)/60000-awakeMinutes-sleepMinutes)}
}
export type SleepAction = { kind:'start'; id:string; atMs:number } | {kind:'wake';atMs:number} | {kind:'put';period:SleepPeriod} | {kind:'delete';id:string} | {kind:'dismiss'}
export function changeSleep(data: SleepData, action: SleepAction, now = Date.now()): SleepData {
  if (!validSleep(data)) throw new Error('Sleep records are invalid. Reload before editing.')
  let periods = data.periods.map(row=>({...row})), interruption = data.interruption
  const active=periods.find(row=>row.endMs === null)
  if (action.kind === 'start') {
    if (active) throw new Error('Sleep is already active. End or edit it before starting another period.')
    periods.push({id:action.id,kind:'sleep',startMs:action.atMs,endMs:null}); interruption=null
  } else if (action.kind === 'wake') {
    if (!active) throw new Error('There is no active sleep period.')
    active.endMs=action.atMs
  } else if (action.kind === 'put') {
    if (!periods.some(row=>row.id === action.period.id) && periods.length >= 3000) throw new Error('Sleep history has reached its storage limit. Export/archive it before adding more records.')
    periods=[...periods.filter(row=>row.id !== action.period.id),action.period]
  } else if (action.kind === 'delete') periods=periods.filter(row=>row.id !== action.id)
  else interruption=null
  const next: SleepData = {schemaVersion:2,revision:data.revision+1,periods,interruption}
  if (!validSleep(next) || periods.some(row=>row.startMs>now || (row.endMs !== null && row.endMs>now))) throw new Error('Use valid timestamps, with the end at or after the start and neither in the future. Only one sleep period can be active; awake confirmations need an end.')
  return next
}
export function interruptSleep(data: SleepData, atMs:number, entryId:string): SleepData | null {
  const active=data.periods.find(row=>row.kind==='sleep' && row.endMs===null && row.startMs<=atMs)
  if (!active) return null
  return {...data,revision:data.revision+1,periods:data.periods.map(row=>row.id===active.id?{...row,endMs:atMs}:row),interruption:{entryId,atMs}}
}
export const sleepFingerprint = (value:SleepData) => JSON.stringify([value.revision,value.interruption,value.periods.map(row=>[row.id,row.kind,row.startMs,row.endMs]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))])
