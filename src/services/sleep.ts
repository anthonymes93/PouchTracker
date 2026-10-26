import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import type { Transaction, DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { SleepData } from '../types/sleep'
import { EMPTY_SLEEP, changeSleep, sleepFingerprint, validSleep } from '../utils/sleep'
import type { SleepAction } from '../utils/sleep'
import { touchRewards } from './rewardRevision'
export const sleepRef=(uid:string)=>doc(db!,'users',uid,'settings','sleep')
export function decodeSleep(raw:DocumentData | undefined):SleepData {
  // A legacy clock window is retained in migration audit, never expanded into periods.
  if (!raw || (raw.schemaVersion === undefined && typeof raw.start === 'string' && typeof raw.end === 'string')) return {...EMPTY_SLEEP}
  if (!Array.isArray(raw.periods)) throw new Error('Saved sleep periods are invalid.')
  const value:SleepData={schemaVersion:raw.schemaVersion,revision:raw.revision,periods:Array.isArray(raw.periods)?raw.periods.map(row=>({id:row.id,kind:row.kind,startMs:row.start?.toMillis?.(),endMs:row.end===null?null:row.end?.toMillis?.()})):[],interruption:raw.interruption===null?null:{entryId:raw.interruption?.entryId,atMs:raw.interruption?.at?.toMillis?.()}}
  if (!validSleep(value)) throw new Error('Saved sleep records are invalid. No records have been overwritten.')
  return value
}
export function encodeSleep(value:SleepData) {
  return {schemaVersion:2,revision:value.revision,periods:value.periods.map(row=>({id:row.id,kind:row.kind,start:Timestamp.fromMillis(row.startMs),end:row.endMs===null?null:Timestamp.fromMillis(row.endMs)})),interruption:value.interruption?{entryId:value.interruption.entryId,at:Timestamp.fromMillis(value.interruption.atMs)}:null}
}
export function writeSleep(transaction:Transaction,uid:string,before:DocumentData|null,after:SleepData,reason:string) {
  const encoded=encodeSleep(after)
  transaction.set(sleepRef(uid),encoded)
  transaction.set(doc(sleepRef(uid),'history',String(after.revision)),{revision:after.revision,before,after:encoded,reason,at:serverTimestamp()})
}
export async function migrateSleep(uid:string) {
  if (!db) throw new Error('Firebase is not configured.')
  try { await runTransaction(db,async tx=>{
    const snap=await tx.get(sleepRef(uid)),raw=snap.data(),value=decodeSleep(raw)
    if (raw?.schemaVersion===2) return
    writeSleep(tx,uid,raw??null,{...value,revision:1},'Replace fixed sleep settings with unknown coverage. No historical sleep or awake periods inferred.')
    touchRewards(tx,uid)
  }) } catch(error) {
    if ((error as {code?:string}).code !== 'permission-denied') throw error
    const current=await getDocFromServer(sleepRef(uid))
    if(current.data()?.schemaVersion!==2) throw error
    decodeSleep(current.data())
  }
}
export function listenSleep(uid:string,next:(value:SleepData)=>void,fail:(error:Error)=>void) {
  let active=true,migrating=false
  const stop=onSnapshot(sleepRef(uid),{includeMetadataChanges:true},snap=>{
    try {
      const raw=snap.data(),value=decodeSleep(raw)
      next(value)
      if (raw?.schemaVersion!==2 && !snap.metadata.fromCache && !migrating) {
        migrating=true
        void migrateSleep(uid).catch(error=>{if(active)fail(error)}).finally(()=>{migrating=false})
      }
    } catch(error){fail(error as Error)}
  },fail)
  return ()=>{active=false;stop()}
}
export async function saveSleepAction(uid:string,expected:SleepData,action:SleepAction) {
  if (!db) throw new Error('Firebase is not configured.')
  if (typeof navigator!=='undefined' && navigator.onLine===false) throw new Error('Reconnect before saving sleep records. Your changes have not been saved.')
  try { await runTransaction(db,async tx=>{
    const snap=await tx.get(sleepRef(uid)),before=decodeSleep(snap.data())
    if(sleepFingerprint(before)!==sleepFingerprint(expected))throw new Error('Sleep records changed on another device. Close this draft and review the latest records.')
    const after=changeSleep(before,action)
    writeSleep(tx,uid,snap.data()??null,after,`User sleep action: ${action.kind}. Historical evidence will be reconciled.`)
    touchRewards(tx,uid)
  }) } catch(error) {
    if((error as {code?:string}).code==='permission-denied'){
      const saved=await getDocFromServer(sleepRef(uid))
      if(sleepFingerprint(decodeSleep(saved.data()))!==sleepFingerprint(expected))throw new Error('Sleep records changed on another device. Close this draft and review the latest records.')
    }
    throw error
  }
}
