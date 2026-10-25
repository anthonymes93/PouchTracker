import { expect, test } from '@playwright/test'
import { isolateFirebase } from './fixtures/browser'

for (const theme of ['forest', 'ocean']) test(`Home keeps pouch logging above the fold and other logging at the bottom in ${theme}`, async ({ page }, testInfo) => {
  await isolateFirebase(page)
  await page.clock.setFixedTime(new Date('2026-10-25T16:00:00Z'))
  await page.addInitScript(value => localStorage.setItem('fixture-preferences', JSON.stringify({ theme: value })), theme)
  await page.goto('/')
  const pouch = page.getByRole('button', { name: 'Log Pouch', exact: true })
  const other = page.getByRole('region', { name: 'Other Logging', exact: true })
  await expect(pouch).toBeEnabled()
  for (const [width, height] of [[320, 568], [375, 667], [390, 664], [393, 852], [430, 932]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(() => scrollTo(0, 0))
    await expect(pouch).toBeInViewport({ ratio: 1 })
    const action = (await pouch.boundingBox())!, timer = (await page.getByRole('timer').boundingBox())!
    const goal = (await page.getByRole('progressbar', { name: 'Progress toward minimum spacing target' }).boundingBox())!
    const nav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!
    expect(action.y).toBeGreaterThanOrEqual(timer.y + timer.height)
    expect(action.y - timer.y - timer.height).toBeLessThan(30)
    expect(action.height).toBeGreaterThanOrEqual(56)
    expect(action.y + action.height).toBeLessThan(nav.y)
    expect(goal.y).toBeGreaterThan(action.y + action.height)
    for (const label of ['Log Cigarette', 'Log Cigar']) {
      const button = page.getByRole('button', { name: label, exact: true })
      await expect(button).not.toBeInViewport()
      await expect(other.getByRole('button', { name: label, exact: true })).toHaveCount(1)
      expect((await button.boundingBox())!.y).toBeGreaterThan(height)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 664 }); await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('home-first-screen.png') })
  await pouch.click()
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', '00 hours, 00 minutes, 00 seconds')
  await expect(pouch).toBeInViewport({ ratio: 1 })
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  const otherBox = (await other.boundingBox())!, rewardBox = (await page.getByLabel('Current Interval Rewards').boundingBox())!
  expect(otherBox.y).toBeGreaterThan(rewardBox.y + rewardBox.height)
  const cigar = other.getByRole('button', { name: 'Log Cigar', exact: true })
  const bottomNav = (await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox())!
  expect((await cigar.boundingBox())!.y + (await cigar.boundingBox())!.height).toBeLessThan(bottomNav.y)
  await expect(cigar).toBeEnabled()
  await cigar.click(); await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close panel' }).click()
  await other.getByRole('button', { name: 'Log Cigarette', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-entries') || '[]').filter((entry: { kind: string }) => entry.kind === 'cigarette').length)).toBe(0)
  expect((await page.pageErrors()).map(error => error.message)).toEqual([])
})
