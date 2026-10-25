import { expect, test } from '@playwright/test'
import { isolateFirebase } from './fixtures/browser'

test('all application routes require authentication', async ({ page }) => {
  await isolateFirebase(page, false)
  for (const route of ['/', '/calendar', '/history', '/stats', '/rewards', '/settings', '/unknown']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
  }
})
for (const width of [320, 375, 390, 1440]) {
  test(`both themes and all routes fit ${width}px without browser errors`, async ({ page }) => {
    await isolateFirebase(page)
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Make room for progress.' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: width < 1000 ? 'Mobile navigation' : 'Main navigation' })
    for (const theme of ['Forest Green', 'Ocean Blue']) {
      await page.getByRole('link', { name: 'Settings', exact: true }).click()
      await page.getByRole('button', { name: theme }).click()
      await expect(page.getByRole('button', { name: theme })).toHaveAttribute('aria-pressed', 'true')
      for (const label of ['Calendar', 'History', 'Stats', 'Rewards', 'Home']) {
        await nav.getByRole('link', { name: label, exact: true }).click()
        await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      await page.screenshot({ path: `test-results/dashboard-${theme}-${width}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Log Cigar', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Close panel' }).click()
    }
    expect(errors).toEqual([])
  })
}
