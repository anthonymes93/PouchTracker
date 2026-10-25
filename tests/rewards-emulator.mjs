import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { rolldown } from 'rolldown'
import { collection, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import * as firestore from 'firebase/firestore'

// Bundle the actual production services, replacing ONLY their Firebase configuration module.
// No .env files are read, and the caller supplies emulator-only clients.
export async function rewardEmulatorChecks(client, check, denied) {
  const uid = 'reward-alice', a = client('reward-client-a', uid), b = client('reward-client-b', uid), outsider = client('reward-outsider', 'outsider')
  const bundle = await rolldown({ input: 'virtual:reward-test', external: id => id.startsWith('firebase/'), plugins: [{
    name: 'emulator-only-firebase',
    resolveId(id) { if (id === 'virtual:reward-test') return id },
    load(id) {
      if (id === 'virtual:reward-test') return `export * from './src/services/rewards.ts'; export * from './src/services/entries.ts'; export * from './src/services/finance.ts';`
      if (id.replaceAll('\\', '/').endsWith('/src/lib/firebase.ts')) return 'export const db = globalThis.__pouchRewardEmulator;'
    },
  }] })
  const output = await bundle.generate({ format: 'cjs' }); await bundle.close()
  const code = output.output.find(value => value.type === 'chunk').code, nativeRequire = createRequire(import.meta.url)
  const require = id => id === 'firebase/firestore' ? firestore : nativeRequire(id)
  function services(db) { globalThis.__pouchRewardEmulator = db; const module = { exports: {} }; new Function('require', 'module', 'exports', code)(require, module, module.exports); delete globalThis.__pouchRewardEmulator; return module.exports }
  const first = services(a), second = services(b), root = db => doc(db, 'users', uid), ref = (db, path) => doc(root(db), ...path.split('/'))
  const now = Date.parse('2026-10-24T13:10:00Z'), originalTime = Date.parse('2026-10-23T13:00:00Z')
  const { Timestamp } = require('firebase/firestore')
  const entry = { id: 'anchor', uid, kind: 'pouch', occurredAt: Timestamp.fromMillis(originalTime), createdAt: Timestamp.fromMillis(originalTime), updatedAt: Timestamp.fromMillis(originalTime), currency: 'CAD', costCents: 190, priceSnapshot: null }
  async function feed(db) {
    const [rewards, achievements, state] = await Promise.all([getDocs(collection(root(db), 'rewards')), getDocs(collection(root(db), 'achievements')), getDoc(ref(db, 'settings/rewardState'))])
    return { ...first.EMPTY_REWARDS, awards: rewards.docs.map(value => value.data()), achievements: achievements.docs.map(value => value.data()), revision: state.data()?.sourceRevision ?? 0, processedRevision: state.data()?.processedRevision ?? -1, loading: false, fromCache: false }
  }
  await check('reward source fixture uses emulator-only documents', async () => {
    const batch = writeBatch(a)
    batch.set(ref(a, 'settings/schedule'), { timeZone: 'America/Toronto', steps: [{ week: 1, startsOn: '2026-10-23', minimumMinutes: 60 }] })
    batch.set(ref(a, 'settings/sleep'), { start: '23:00', end: '09:00' })
    batch.set(ref(a, 'entries/anchor'), entry)
    batch.set(ref(a, 'coverage/2026-10-23'), { date: '2026-10-23', complete: true, updatedAt: serverTimestamp() })
    batch.set(ref(a, 'settings/rewardState'), { sourceRevision: 1 }); await batch.commit()
  })
  await check('two emulator clients reconcile the same milestones exactly once', async () => {
    const empty = await feed(a)
    await Promise.all([first.reconcileRewards(uid, now, empty), second.reconcileRewards(uid, now, empty)])
    const value = await feed(a)
    assert.equal(value.awards.length, 5); assert.equal(value.awards.reduce((sum, award) => sum + award.xp, 0), 200)
    assert.equal(value.achievements.length, 6)
    assert(value.awards.every(award => award.revision === 1 && award.status === 'valid'))
    assert.equal((await getDocs(collection(ref(a, 'rewards/spacing_anchor_target'), 'history'))).size, 1)
  })
  await check('refresh reconciliation writes no duplicate audit events', async () => {
    first.clearRewardCache(uid); await first.reconcileRewards(uid, now + 1000, await feed(a))
    assert.equal((await getDoc(ref(a, 'rewards/spacing_anchor_target'))).data().revision, 1)
  })
  await check('an older device clock cannot overwrite a newer evaluation', async () => {
    await second.reconcileRewards(uid, now - 86400000, await feed(b))
    const value = await feed(a)
    assert.equal(value.awards.filter(award => award.status === 'valid').reduce((sum, award) => sum + award.xp, 0), 200)
    assert(value.awards.every(award => award.revision === 1))
  })
  await check('real timestamp edit invalidates XP and preserves audit history', async () => {
    await first.editEntryTime(uid, 'anchor', Date.parse('2026-10-24T13:05:00Z'))
    await first.reconcileRewards(uid, now + 2000, await feed(a))
    const value = await feed(a)
    assert(value.awards.every(award => award.status === 'invalidated'))
    assert.equal((await getDocs(collection(ref(a, 'rewards/spacing_anchor_target'), 'history'))).size, 2)
  })
  await check('correcting the timestamp back and confirming restores original IDs', async () => {
    await first.editEntryTime(uid, 'anchor', originalTime)
    await first.saveCoverage(uid, '2026-10-23', true)
    await first.reconcileRewards(uid, now + 3000, await feed(a))
    const value = await feed(a); assert.equal(value.awards.length, 5); assert(value.awards.every(award => award.status === 'valid' && award.revision === 3))
  })
  await check('real deletion and Undo restore rewards only after renewed confirmation', async () => {
    await first.deleteEntry(uid, 'anchor'); await first.reconcileRewards(uid, now + 4000, await feed(a))
    assert((await feed(a)).awards.every(award => award.status === 'invalidated'))
    await first.restoreEntry(uid, { ...entry, pending: false }); await first.reconcileRewards(uid, now + 5000, await feed(a))
    assert((await feed(a)).awards.every(award => award.status === 'provisional'))
    await first.saveCoverage(uid, '2026-10-23', true); await first.reconcileRewards(uid, now + 6000, await feed(a))
    assert((await feed(a)).awards.every(award => award.status === 'valid')); assert.equal((await feed(a)).awards.length, 5)
  })
  await check('stale second-client model cannot overwrite a corrected source revision', async () => {
    const batch = writeBatch(a)
    batch.set(ref(a, 'entries/missing'), { ...entry, id: 'missing', occurredAt: Timestamp.fromMillis(originalTime + 30 * 60000) })
    batch.set(ref(a, 'settings/rewardState'), { sourceRevision: increment(1) }, { merge: true }); await batch.commit()
    await second.reconcileRewards(uid, now + 7000, await feed(b))
    assert.equal((await getDoc(ref(a, 'rewards/spacing_anchor_target'))).data().status, 'invalidated')
  })
  await check('reward read/write denied across users', async () => {
    await denied(() => getDocs(collection(root(outsider), 'rewards')))
    const saved = (await getDoc(ref(a, 'rewards/spacing_anchor_target'))).data()
    await denied(() => setDoc(ref(outsider, 'rewards/spacing_anchor_target'), saved))
  })
  await check('reward deletion and audit alteration are denied', async () => {
    const { deleteDoc, updateDoc } = require('firebase/firestore')
    await denied(() => deleteDoc(ref(a, 'rewards/spacing_anchor_target')))
    await denied(() => updateDoc(ref(a, 'rewards/spacing_anchor_target/history/1'), { xp: 200 }))
  })
  await check('negative XP, inflated XP and missing audit are denied', async () => {
    const saved = (await getDoc(ref(a, 'rewards/spacing_anchor_target'))).data()
    await denied(() => setDoc(ref(a, 'rewards/bad'), { ...saved, id: 'bad', xp: -1, revision: 1 }))
    await denied(() => setDoc(ref(a, 'rewards/bad'), { ...saved, id: 'bad', xp: 10000, revision: 1 }))
    await denied(() => setDoc(ref(a, 'rewards/bad'), { ...saved, id: 'bad', revision: 1 }))
  })
}
