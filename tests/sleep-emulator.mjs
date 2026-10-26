import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { rolldown } from 'rolldown'
import * as fs from 'firebase/firestore'
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,Timestamp}=fs
export async function sleepEmulatorChecks(client,check,denied){
 const bundle=await rolldown({input:'virtual:sleep',external:id=>id.startsWith('firebase/'),plugins:[{name:'isolated-sleep',resolveId(id){if(id==='virtual:sleep')return id},load(id){if(id==='virtual:sleep')return `export * from './src/services/sleep.ts'; export * from './src/services/entries.ts'; export * from './src/services/rewards.ts';`;if(id.replaceAll('\\','/').endsWith('/src/lib/firebase.ts'))return 'export const db=globalThis.__sleepEmulator;'}}]})
 const output=await bundle.generate({format:'cjs'});await bundle.close()
 const code=output.output.find(value=>value.type==='chunk').code,nativeRequire=createRequire(import.meta.url)
 const require=id=>id==='firebase/firestore'?fs:nativeRequire(id)
 function services(db){globalThis.__sleepEmulator=db;const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports);delete globalThis.__sleepEmulator;return module.exports}
 const uid='sleep-owner',a=client('sleep-a',uid),b=client('sleep-b',uid),other=client('sleep-other','outsider'),api=services(a),peer=services(b)
 const ref=(db,path='settings/sleep')=>doc(db,`users/${uid}/${path}`)
 const state=async(db=a)=>(await getDoc(ref(db))).data()
 const data=async(db=a)=>api.decodeSleep(await state(db))
 const now=Date.now()
 await check('legacy fixed sleep migration creates no historical sleep or awake periods and preserves old settings in audit',async()=>{
  const response=await fetch(`http://127.0.0.1:8180/v1/projects/demo-pouchtracker/databases/(default)/documents/users/${uid}/settings/sleep`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:{start:{stringValue:'23:00'},end:{stringValue:'09:00'}}})})
  assert(response.ok)
  await Promise.all([api.migrateSleep(uid),peer.migrateSleep(uid)])
  assert.equal((await data()).periods.length,0)
  assert.deepEqual((await getDoc(ref(a,'settings/sleep/history/1'))).data().before,{start:'23:00',end:'09:00'})
  assert.equal((await getDoc(ref(a,'settings/rewardState'))).data().sourceRevision,1)
 })
 await check('sleep stores real timestamps; active sleep and pouch creation commit at the same timestamp',async()=>{
  await api.saveSleepAction(uid,await data(),{kind:'start',id:'daytime',atMs:now-3600000})
  assert((await state()).periods[0].start instanceof Timestamp)
  const operation=peer.createEntry(uid,'pouch',null,{pouch:{packCents:1000,quantity:20},cigarette:null,cigarPresetsCents:[190,230,250]})
  await operation.completion
  const entry=(await getDoc(ref(a,`entries/${operation.id}`))).data(),sleep=await state()
  assert.equal(sleep.periods[0].end.toMillis(),entry.occurredAt.toMillis())
  assert.equal(sleep.interruption.entryId,operation.id)
  assert.equal(sleep.periods.filter(period=>period.end===null).length,0)
  assert.equal((await getDoc(ref(a,'settings/rewardState'))).data().sourceRevision,3)
  await api.deleteEntry(uid,operation.id)
  assert.equal((await state()).periods.filter(period=>period.end===null).length,0)
 })
 await check('return to sleep is explicit; stale second-client changes rejected and historical deletion audited',async()=>{
  const stale=await data(b)
  await api.saveSleepAction(uid,await data(),{kind:'start',id:'return',atMs:Date.now()})
  await assert.rejects(()=>peer.saveSleepAction(uid,stale,{kind:'dismiss'}),/another device/)
  await peer.saveSleepAction(uid,await data(b),{kind:'wake',atMs:Date.now()})
  const before=await data(),revision=before.revision+1
  await api.saveSleepAction(uid,before,{kind:'delete',id:'return'})
  assert.equal((await data()).periods.length,1)
  const history=(await getDoc(ref(a,`settings/sleep/history/${revision}`))).data()
  assert.equal(history.before.periods.length,2);assert.equal(history.after.periods.length,1)
 })
 await check('sleep authorization, legacy overwrite and immutable audit rules enforced',async()=>{
  await denied(()=>getDoc(ref(other)))
  await denied(()=>setDoc(ref(other),{schemaVersion:2,revision:1,periods:[],interruption:null}))
  await denied(()=>setDoc(ref(a),{start:'23:00',end:'09:00'}))
  await denied(()=>deleteDoc(ref(a)))
  await denied(()=>updateDoc(ref(a,'settings/sleep/history/1'),{reason:'tampered'}))
  await denied(()=>deleteDoc(ref(a,'settings/sleep/history/1')))
 })
 async function feed(){const [awards,achievements,revisions]=await Promise.all([getDocs(collection(a,`users/${uid}/rewards`)),getDocs(collection(a,`users/${uid}/achievements`)),getDoc(ref(a,'settings/rewardState'))]);return {...api.EMPTY_REWARDS,awards:awards.docs.map(d=>d.data()),achievements:achievements.docs.map(d=>d.data()),revision:revisions.data().sourceRevision,processedRevision:revisions.data().processedRevision??-1,loading:false,fromCache:false}}
 await check('historical sleep corrections make XP provisional, invalidate it with sleep evidence, and restore original IDs with awake confirmation',async()=>{
  const start=Date.parse('2026-10-23T13:00Z'),end=start+3*3600000,reviewAt=Date.parse('2026-10-24T14:00Z')
  const batch=writeBatch(a),schedule={schemaVersion:3,revision:1,timeZone:'America/Toronto',progressionEnabled:true,incrementMinutes:30,steps:[{week:1,startsOn:'2026-10-18',minimumMinutes:60}]}
  batch.set(ref(a,'settings/schedule'),schedule)
  batch.set(ref(a,'settings/schedule/history/1'),{revision:1,before:null,after:schedule,reason:'Test plan',at:serverTimestamp()})
  for(const [id,at] of [['start',start],['end',end]])batch.set(ref(a,`entries/${id}`),{id,uid,kind:'pouch',occurredAt:Timestamp.fromMillis(at),createdAt:Timestamp.fromMillis(at),updatedAt:Timestamp.fromMillis(at),currency:'CAD',costCents:100,priceSnapshot:null})
  batch.set(ref(a,'coverage/2026-10-23'),{date:'2026-10-23',complete:true,updatedAt:serverTimestamp()})
  batch.set(ref(a,'settings/rewardState'),{sourceRevision:fs.increment(1)},{merge:true});await batch.commit()
  await api.saveSleepAction(uid,await data(),{kind:'put',period:{id:'historical',kind:'awake',startMs:start,endMs:end}})
  await api.reconcileRewards(uid,reviewAt,await feed())
  assert.equal((await getDoc(ref(a,'rewards/spacing_start_target'))).data().status,'valid')
  await api.saveSleepAction(uid,await data(),{kind:'delete',id:'historical'})
  await api.reconcileRewards(uid,reviewAt+1000,await feed())
  assert.equal((await getDoc(ref(a,'rewards/spacing_start_target'))).data().status,'provisional')
  await api.saveSleepAction(uid,await data(),{kind:'put',period:{id:'historical',kind:'sleep',startMs:start,endMs:end}})
  await api.reconcileRewards(uid,reviewAt+2000,await feed())
  assert.equal((await getDoc(ref(a,'rewards/spacing_start_target'))).data().status,'invalidated')
  await api.saveSleepAction(uid,await data(),{kind:'put',period:{id:'historical',kind:'awake',startMs:start,endMs:end}})
  await api.reconcileRewards(uid,reviewAt+3000,await feed())
  assert.equal((await getDoc(ref(a,'rewards/spacing_start_target'))).data().status,'valid')
  assert.equal((await getDocs(collection(a,`users/${uid}/rewards/spacing_start_target/history`))).size,4)
  assert.equal((await getDoc(ref(a,'entries/start'))).data().costCents,100)
 })
}
