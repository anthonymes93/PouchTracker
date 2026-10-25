import { expect, test } from '@playwright/test'
import { isolateFirebase } from './fixtures/browser'
test.beforeEach(async ({ page }) => {
  await isolateFirebase(page); await page.clock.setFixedTime(new Date('2026-10-24T16:00:00Z'))
  await page.addInitScript(() => {
    if (localStorage.getItem('rewards-seeded')) return
    localStorage.setItem('rewards-seeded', 'true')
    localStorage.setItem('fixture-entries', JSON.stringify([{ id: 'anchor', uid: 'test-user', kind: 'pouch', time: Date.parse('2026-10-23T13:00:00Z'), costCents: 100 }]))
    localStorage.setItem('fixture-coverage', JSON.stringify([{ date: '2026-10-23', complete: true }]))
  })
})
test.afterEach(async ({ page }) => expect((await page.pageErrors()).map(value => value.message)).toEqual([]))
test('verified XP persists across reload, gallery filters and calendar share stored awards', async ({ page }) => {
  await page.goto('/rewards'); await expect(page.locator('.reward-total')).toHaveText('200 XP')
  await expect(page.getByText('Level 2', { exact: true })).toBeVisible()
  await expect(page.locator('.achievement-card.unlocked')).toHaveCount(6)
  const records = await page.evaluate(() => localStorage.getItem('fixture-rewards'))
  await page.reload(); await expect(page.locator('.reward-total')).toHaveText('200 XP')
  expect(await page.evaluate(() => localStorage.getItem('fixture-rewards'))).toBe(records)
  await expect(page.locator('.reward-celebration')).toHaveCount(0)
  await page.getByLabel('Show achievements').selectOption('Locked'); await expect(page.locator('.achievement-card.unlocked')).toHaveCount(0)
  await page.getByLabel('Show achievements').selectOption('Unlocked'); await expect(page.locator('.achievement-card')).toHaveCount(6)
  await page.goto('/calendar'); await page.getByRole('button', { name: '2026-10-23, Unrated', exact: true }).click()
  await expect(page.getByLabel('Daily rewards').getByText('200 verified XP · 6 achievements')).toBeVisible()
})
test('active milestones update without logging; offline progress is provisional until reconnect and coverage', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fixture-offline', 'true')
    localStorage.setItem('fixture-entries', JSON.stringify([{ id: 'active', uid: 'test-user', kind: 'pouch', time: Date.parse('2026-10-24T15:00:00Z'), costCents: 100 }]))
    localStorage.setItem('fixture-coverage', '[]')
  })
  await page.goto('/'); await expect(page.getByLabel('Current Interval Rewards').getByText('10 (0 verified)')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('fixture-rewards'))).toBeNull()
  await page.clock.setFixedTime(new Date('2026-10-24T16:15:00Z'))
  await expect(page.getByLabel('Current Interval Rewards').getByText('25 (0 verified)')).toBeVisible()
  await page.evaluate(() => { localStorage.removeItem('fixture-offline'); dispatchEvent(new Event('fixture-update')) })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('fixture-rewards') || '[]').length)).toBe(2)
  await expect(page.getByText(/Level 1.*0 verified lifetime XP/)).toBeVisible()
})
test('corrections invalidate saved XP and restore it after review without duplicate records', async ({ page }) => {
  await page.goto('/rewards'); await expect(page.locator('.reward-total')).toHaveText('200 XP')
  await page.evaluate(() => { localStorage.setItem('fixture-entries', '[]'); localStorage.setItem('fixture-coverage', '[]'); dispatchEvent(new Event('fixture-update')) })
  await expect(page.locator('.reward-total')).toHaveText('0 XP')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-rewards')!).every((value: { status: string }) => value.status === 'invalidated'))).toBe(true)
  await page.evaluate(() => { localStorage.setItem('fixture-entries', JSON.stringify([{ id: 'anchor', uid: 'test-user', kind: 'pouch', time: Date.parse('2026-10-23T13:00:00Z'), costCents: 100 }])); localStorage.setItem('fixture-coverage', JSON.stringify([{ date: '2026-10-23', complete: true }])); dispatchEvent(new Event('fixture-update')) })
  await expect(page.locator('.reward-total')).toHaveText('200 XP')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-rewards')!).length)).toBe(5)
})
test('a recent active pouch does not block reconciliation of earlier earned XP', async ({ page }) => {
  await page.addInitScript(() => {
    const values = JSON.parse(localStorage.getItem('fixture-entries') || '[]')
    localStorage.setItem('fixture-entries', JSON.stringify([...values, { id: 'recent', uid: 'test-user', kind: 'pouch', time: Date.parse('2026-10-24T15:59:00Z'), costCents: 100 }]))
  })
  await page.goto('/rewards'); await expect(page.locator('.reward-total')).toHaveText('200 XP')
})
test('level-up is announced once and does not replay on refresh', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('level-seeded')) { localStorage.setItem('fixture-coverage', '[]'); sessionStorage.setItem('level-seeded', 'true') } })
  await page.goto('/rewards'); await expect(page.locator('.reward-total')).toHaveText('0 XP')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pouchtracker:test-user:reward-notices'))).not.toBeNull()
  await page.evaluate(() => { localStorage.setItem('fixture-coverage', JSON.stringify([{ date: '2026-10-23', complete: true }])); dispatchEvent(new Event('fixture-update')) })
  await expect(page.getByText("You've reached Level 2. Your progress is adding up.")).toBeVisible()
  await page.reload(); await expect(page.locator('.reward-total')).toHaveText('200 XP'); await expect(page.locator('.reward-celebration')).toHaveCount(0)
})
for (const theme of ['forest', 'ocean']) test(`${theme} rewards fit small screens and honor reduced motion`, async ({ page }, testInfo) => {
  await page.addInitScript(value => localStorage.setItem('fixture-preferences', JSON.stringify({ theme: value })), theme)
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/rewards')
  await expect(page.locator('.reward-total')).toHaveText('200 XP')
  for (const width of [320, 375, 390, 1440]) { await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
  expect(await page.locator('.reward-progress span').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: testInfo.outputPath('rewards-mobile.png'), fullPage: true })
  await page.goto('/'); await expect(page.getByLabel('Current Interval Rewards')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
