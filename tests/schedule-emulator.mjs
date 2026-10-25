import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { rolldown } from 'rolldown'
import * as firestore from 'firebase/firestore'
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, onSnapshot } = firestore

export async function scheduleEmulatorChecks(client, check, denied) {
  const bundle = await rolldown({ input:'virtual:schedule', external:id => id.startsWith('firebase/'), plugins:[{
    name:'isolated-schedule-services', resolveId(id) { if (id === 'virtual:schedule') return id },
    load(id) {
      if (id === 'virtual:schedule') return `export * from './src/services/schedule.ts'; export * from './src/utils/spacingSchedule.ts';`
      if (id.replaceAll('\\','/').endsWith('/src/lib/firebase.ts')) return 'export const db = globalThis.__scheduleEmulator;'
    },
  }] })
  const output = await bundle.generate({ format:'cjs' }); await bundle.close()
  const code = output.output.find(value => value.type === 'chunk').code, nativeRequire = createRequire(import.meta.url)
  const require = id => id === 'firebase/firestore' ? firestore : nativeRequire(id)
  function services(db) { globalThis.__scheduleEmulator = db; const module = {exports:{}}; new Function('require','module','exports',code)(require,module,module.exports); delete globalThis.__scheduleEmulator; return module.exports }
  const uid='schedule-owner', a=client('schedule-a',uid), b=client('schedule-b',uid), outsider=client('schedule-outsider','outsider'), api=services(a), peer=services(b)
  const ref=(db,path='settings/schedule') => doc(db,`users/${uid}/${path}`)
  // Emulator admin seeding models documents written by the old release before the new rules.
  function encode(value) {
    if (value === null) return {nullValue:null}
    if (typeof value === 'number') return {integerValue:String(value)}
    if (typeof value === 'string') return {stringValue:value}
    if (Array.isArray(value)) return {arrayValue:{values:value.map(encode)}}
    return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,value]) => [key,encode(value)]))}}
  }
  async function seed(user, value) {
    const response=await fetch(`http://127.0.0.1:8180/v1/projects/demo-pouchtracker/databases/(default)/documents/users/${user}/settings/schedule`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields:encode(value).mapValue.fields})})
    assert(response.ok, await response.text())
  }
  await check('actual legacy Firestore schedule migrates atomically once with audit and reward revision', async () => {
    await seed(uid,api.LEGACY_SCHEDULE)
    await setDoc(ref(a,'entries/preserved'),{kind:'cigar',costCents:275})
    await setDoc(ref(a,'settings/pricing'),{pouch:null,cigarette:null,cigarPresetsCents:[190,230,250]})
    await Promise.all([api.migrateSchedule(uid),peer.migrateSchedule(uid)])
    const value=(await getDoc(ref(a))).data()
    assert.equal(value.steps[1].minimumMinutes,90); assert.equal(value.steps[0].startsOn,'2026-10-18'); assert.equal(value.steps.length,52)
    assert.deepEqual((await getDoc(ref(a,'settings/schedule/history/1'))).data().before,api.LEGACY_SCHEDULE)
    assert.equal((await getDoc(ref(a,'settings/rewardState'))).data().sourceRevision,1)
    assert.equal((await getDoc(ref(a,'entries/preserved'))).data().costCents,275)
    assert.deepEqual((await getDoc(ref(a,'settings/pricing'))).data().cigarPresetsCents,[190,230,250])
  })
  await check('custom persisted targets survive migration unchanged', async () => {
    const customUid='schedule-custom', db=client('schedule-custom',customUid), custom=structuredClone(api.LEGACY_SCHEDULE)
    custom.steps[1].minimumMinutes=105; await seed(customUid,custom)
    await services(db).migrateSchedule(customUid)
    assert.deepEqual((await getDoc(doc(db,`users/${customUid}/settings/schedule`))).data().steps,custom.steps)
  })
  await check('actual two-client listeners synchronize, concurrent stale edits cannot overwrite newer plan', async () => {
    const base=(await getDoc(ref(a))).data(), today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    const upcoming=api.plannerWeeks(base,today).find(row => row.startsOn>today)
    let stop
    const observed=new Promise((resolve,reject) => { stop=onSnapshot(ref(b),snapshot => { if (snapshot.data()?.revision===2) resolve(snapshot.data()) },reject) })
    const results=await Promise.allSettled([api.saveGoalChanges(uid,base,[{startsOn:upcoming.startsOn,minimumMinutes:240}]),peer.saveGoalChanges(uid,base,[{startsOn:upcoming.startsOn,minimumMinutes:300}])])
    assert.equal(results.filter(result => result.status==='fulfilled').length,1)
    assert.match(results.find(result => result.status==='rejected').reason.message,/another device/)
    const changed=await observed; stop(); assert.equal(changed.revision,2)
    assert.equal((await getDocs(collection(ref(a),'history'))).size,2)
    assert.equal((await getDoc(ref(a,'settings/rewardState'))).data().sourceRevision,2)
  })
  await check('schedule rules reject outsiders, deletes, unaudited updates and audit tampering', async () => {
    await denied(() => getDoc(ref(outsider)))
    await denied(() => updateDoc(ref(outsider),{revision:3}))
    await denied(() => deleteDoc(ref(a)))
    await denied(() => updateDoc(ref(a),{revision:3}))
    await denied(() => updateDoc(ref(a,'settings/schedule/history/1'),{reason:'tampered'}))
    await denied(() => deleteDoc(ref(a,'settings/schedule/history/1')))
  })
  await check('missing schedule initializes safely; corrupt saved schedule is never overwritten', async () => {
    const user='schedule-missing', db=client('schedule-missing',user), service=services(db)
    await service.migrateSchedule(user)
    assert.equal((await getDoc(doc(db,`users/${user}/settings/schedule`))).data().steps.length,52)
    const corruptUid='schedule-corrupt', corruptDb=client('schedule-corrupt',corruptUid)
    await seed(corruptUid,{timeZone:'America/Toronto',steps:[]})
    await assert.rejects(() => services(corruptDb).migrateSchedule(corruptUid),/invalid/)
    assert.deepEqual((await getDoc(doc(corruptDb,`users/${corruptUid}/settings/schedule`))).data().steps,[])
  })
}
