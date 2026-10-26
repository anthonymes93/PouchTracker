import assert from 'node:assert/strict'
import { rewardEmulatorChecks } from './rewards-emulator.mjs'
import { scheduleEmulatorChecks } from './schedule-emulator.mjs'
import { sleepEmulatorChecks } from './sleep-emulator.mjs'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getDoc, getDocs, collection, getFirestore, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, terminate, query, where, orderBy, limit, Timestamp, runTransaction } from 'firebase/firestore'

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180') throw new Error('Run only through the configured local emulator.')
const apps = [], databases = []
function client(name, uid) {
  const app = initializeApp({ projectId: 'demo-pouchtracker' }, name)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8180, uid ? { mockUserToken: { sub: uid, user_id: uid } } : {})
  apps.push(app); databases.push(db); return db
}
const alice = client('alice', 'alice'), bob = client('bob', 'bob'), guest = client('guest')
let passed = 0
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`) }
async function denied(action) { await assert.rejects(action, error => error.code === 'permission-denied') }
const price = { pouch: { packCents: 1299, quantity: 20 }, cigarette: null }
const ref = (db, path) => doc(db, `users/alice/${path}`)
async function baseline(date, categories = { pouch: { dailyCountMilli: 12000, price: price.pouch } }) {
  const batch = writeBatch(alice)
  batch.set(ref(alice, `baselines/${date}`), { id: date, effectiveOn: date, createdAt: serverTimestamp(), categories })
  batch.set(ref(alice, 'settings/baselineState'), { lastEffectiveOn: date })
  await batch.commit()
}
try {
  await scheduleEmulatorChecks(client, check, denied)
  await sleepEmulatorChecks(client, check, denied)
  await check('owner can save valid pricing', () => setDoc(ref(alice, 'settings/pricing'), price))
  await check('individual cigar presets are accepted', () => setDoc(ref(alice, 'settings/pricing'), { ...price, cigarPresetsCents: [190, 275, 350] }))
  await check('cigar presets require three prices', () => denied(() => setDoc(ref(alice, 'settings/pricing'), { ...price, cigarPresetsCents: [190, 230] })))
  await check('negative cigar preset is denied', () => denied(() => setDoc(ref(alice, 'settings/pricing'), { ...price, cigarPresetsCents: [190, -230, 250] })))
  await check('fractional-cent cigar preset is denied', () => denied(() => setDoc(ref(alice, 'settings/pricing'), { ...price, cigarPresetsCents: [190, 230.5, 250] })))
  await check('another account cannot read pricing', () => denied(() => getDoc(ref(bob, 'settings/pricing'))))
  await check('another account cannot write pricing', () => denied(() => setDoc(ref(bob, 'settings/pricing'), price)))
  await check('unauthenticated access is denied', () => denied(() => getDoc(ref(guest, 'settings/pricing'))))
  await check('negative price is rejected', () => denied(() => setDoc(ref(alice, 'settings/pricing'), { ...price, pouch: { packCents: -1, quantity: 20 } })))
  await check('zero quantity is rejected', () => denied(() => setDoc(ref(alice, 'settings/pricing'), { ...price, pouch: { packCents: 1299, quantity: 0 } })))
  await check('valid first baseline and state commit together', () => baseline('2026-10-23'))
  await check('baseline is immutable', () => denied(() => updateDoc(ref(alice, 'baselines/2026-10-23'), { categories: {} })))
  await check('baseline cannot be deleted', () => denied(() => deleteDoc(ref(alice, 'baselines/2026-10-23'))))
  await check('baseline state cannot be deleted', () => denied(() => deleteDoc(ref(alice, 'settings/baselineState'))))
  await check('later baseline is accepted', () => baseline('2026-10-25'))
  await check('out-of-order baseline is denied', () => denied(() => baseline('2026-10-24')))
  await check('invalid baseline quantity is denied', () => denied(() => baseline('2026-10-26', { pouch: { dailyCountMilli: -1, price: price.pouch } })))
  await check('owner may list baseline history', async () => assert.equal((await getDocs(collection(alice, 'users/alice/baselines'))).size, 2))
  await check('another account cannot list baseline history', () => denied(() => getDocs(collection(bob, 'users/alice/baselines'))))
  await check('valid day coverage is accepted', () => setDoc(ref(alice, 'coverage/2026-10-23'), { date: '2026-10-23', complete: true, updatedAt: serverTimestamp() }))
  await check('malformed coverage is denied', () => denied(() => setDoc(ref(alice, 'coverage/2026-10-23'), { date: '2026-10-23', complete: 'yes', updatedAt: serverTimestamp() })))
  await check('existing entries remain writable by owner', () => setDoc(ref(alice, 'entries/legacy'), { kind: 'pouch', costCents: null }))
  await check('existing preferences remain writable by owner', () => setDoc(ref(alice, 'settings/preferences'), { theme: 'ocean' }))
  await check('another account cannot overwrite entries', () => denied(() => setDoc(ref(bob, 'entries/legacy'), { kind: 'cigar' })))
  await check('legacy fixed sleep writes require migration, not new clock windows', () => denied(() => setDoc(ref(alice, 'settings/sleep'), { start: '23:00', end: '09:00' })))
  await check('invalid sleep time is denied', () => denied(() => setDoc(ref(alice, 'settings/sleep'), { start: '24:00', end: '09:00' })))
  await check('identical sleep times are denied', () => denied(() => setDoc(ref(alice, 'settings/sleep'), { start: '09:00', end: '09:00' })))
  await check('additional sleep fields are denied', () => denied(() => setDoc(ref(alice, 'settings/sleep'), { start: '23:00', end: '09:00', extra: true })))
  await check('another user cannot read or change sleep', async () => { await denied(() => getDoc(ref(bob, 'settings/sleep'))); await denied(() => setDoc(ref(bob, 'settings/sleep'), { start: '23:00', end: '09:00' })) })
  const times = ['2026-10-31T22:00:00Z', '2026-11-01T03:59:59Z', '2026-11-01T04:00:00Z', '2026-12-01T04:59:59Z', '2026-12-01T05:00:00Z']
  await check('create entries and revoke coverage atomically', async () => {
    const batch = writeBatch(alice)
    times.forEach((time, i) => batch.set(ref(alice, `entries/range${i}`), { kind: 'pouch', occurredAt: Timestamp.fromDate(new Date(time)), costCents: 190 }))
    batch.set(ref(alice, 'coverage/2026-10-23'), { date: '2026-10-23', complete: false, updatedAt: serverTimestamp() })
    await batch.commit()
    assert.equal((await getDoc(ref(alice, 'coverage/2026-10-23'))).data().complete, false)
  })
  const rangeQuery = db => query(collection(db, 'users/alice/entries'), where('occurredAt', '>=', Timestamp.fromDate(new Date('2026-11-01T04:00:00Z'))), where('occurredAt', '<', Timestamp.fromDate(new Date('2026-12-01T05:00:00Z'))), orderBy('occurredAt', 'desc'))
  await check('Toronto month query includes exact start and excludes exact end across DST', async () => assert.deepEqual((await getDocs(rangeQuery(alice))).docs.map(value => value.id), ['range3', 'range2']))
  await check('adjacent pouch query returns only nearest predecessor', async () => {
    const result = await getDocs(query(collection(alice, 'users/alice/entries'), where('kind', '==', 'pouch'), where('occurredAt', '<', Timestamp.fromDate(new Date('2026-11-01T04:00:00Z'))), orderBy('occurredAt', 'desc'), limit(1)))
    assert.deepEqual(result.docs.map(value => value.id), ['range1'])
  })
  await check('calendar range query cannot read another user', () => denied(() => getDocs(rangeQuery(bob))))
  await check('transactional historical move revokes both coverage dates', async () => {
    await runTransaction(alice, async transaction => {
      const existing = await transaction.get(ref(alice, 'entries/range2'))
      assert.equal(existing.exists(), true)
      transaction.update(ref(alice, 'entries/range2'), { occurredAt: Timestamp.fromDate(new Date('2026-10-31T16:00:00Z')) })
      for (const date of ['2026-10-31', '2026-11-01']) transaction.set(ref(alice, `coverage/${date}`), { date, complete: false, updatedAt: serverTimestamp() })
    })
    assert.equal((await getDoc(ref(alice, 'coverage/2026-10-31'))).data().complete, false)
    assert.equal((await getDoc(ref(alice, 'coverage/2026-11-01'))).data().complete, false)
    assert.deepEqual((await getDocs(rangeQuery(alice))).docs.map(value => value.id), ['range3'])
  })
  await rewardEmulatorChecks(client, check, denied)
  console.log(`${passed} Firestore emulator rule checks passed. No live project was used.`)
} finally { await Promise.all(databases.map(db => terminate(db))); await Promise.all(apps.map(app => deleteApp(app))) }
