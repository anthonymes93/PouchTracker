import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
async function setup(page: Page) {
  await page.route('https://auth.test/**', async route => { await route.fulfill({ response: await route.fetch({ url: route.request().url().replace('https://auth.test', 'http://127.0.0.1:4173') }) }) })
  await page.route('**/src/lib/firebase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export {client as auth} from '/tests/fixtures/auth.ts'; export const db=null; export const firebaseConfigured=true;" }))
  await page.route('**/node_modules/.vite/deps/firebase_auth.js*', route => route.fulfill({ contentType: 'application/javascript', body: "export * from '/tests/fixtures/auth.ts';" }))
  for (const module of ['entries', 'preferences', 'finance', 'performance', 'rewards']) await page.route(`**/src/services/${module}.ts`, route => route.fulfill({ contentType: 'application/javascript', body: "export * from '/tests/fixtures/tracking.ts';" }))
  await page.route('**/src/services/userData.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export async function ensureUserProfile(user) { sessionStorage.setItem('profile-uid', user.uid); }" }))
}
test.beforeEach(async ({ page }) => { await setup(page); await page.clock.setFixedTime(new Date('2026-10-25T16:00:00Z')) })
test.afterEach(async ({ page }) => expect((await page.pageErrors()).map(error => error.message)).toEqual([]))
test('protected routes wait for local persistence and the first authenticated state', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('auth-init-delay', '800'); localStorage.setItem('auth-session', 'yes') })
  await page.goto('/history'); await expect(page).toHaveURL(/\/history$/)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('auth-calls')!))).toEqual(['persistence:LOCAL', 'redirect-result'])
  expect(await page.evaluate(() => sessionStorage.getItem('profile-uid'))).toBe('auth-test-user')
})
for (const mobile of [false, true]) test(`${mobile ? 'iPhone-style' : 'desktop'} login invokes popup within user activation, refresh and logout work`, async ({ page }) => {
  if (mobile) { await page.setViewportSize({ width: 390, height: 844 }); await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1' })) }
  await page.goto('/history'); await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page).toHaveURL(/\/history$/)
  expect(await page.evaluate(() => sessionStorage.getItem('auth-popup-user-activation'))).toBe('true')
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('auth-calls')!).filter((value: string) => value === 'redirect'))).toEqual([])
  await page.reload(); await expect(page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation' })).toBeVisible(); await expect(page).toHaveURL(/\/history$/)
  await page.goto('/settings'); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/login$/)
  await page.goto('/rewards'); await expect(page).toHaveURL(/\/login$/)
})
for (const code of ['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/unauthorized-domain']) test(`Firebase error ${code} is visible without cross-origin redirect fallback`, async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('auth-popup-error', value), code)
  await page.goto('/login'); await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(code)
  await expect(page.getByRole('button', { name: 'Continue in this tab instead' })).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('auth-calls')!).includes('redirect'))).toBe(false)
})
test('storage initialization failures remain visible and prevent unpersisted login', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('auth-persistence-error', 'yes'))
  await page.goto('/login'); await expect(page.getByRole('alert')).toContainText('auth/web-storage-unsupported')
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('auth-calls')!).includes('popup'))).toBe(false)
})
test('legacy redirect errors do not prevent a fresh popup login', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('auth-redirect-error', 'auth/network-request-failed'))
  await page.goto('/login'); await expect(page.getByRole('alert')).toContainText('auth/network-request-failed')
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click(); await expect(page).toHaveURL(/\/$/)
})
test('same-origin HTTPS fallback is explicit and consumes the return before routing', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('auth-same-origin', 'yes'); localStorage.setItem('auth-popup-error', 'auth/popup-blocked') })
  await page.goto('https://auth.test/login'); await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('auth/popup-blocked')
  await page.getByRole('button', { name: 'Continue in this tab instead' }).click()
  await expect(page).toHaveURL('https://auth.test/'); await expect(page.getByRole('heading', { name: 'Make room for progress.' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('pouchtracker:auth-redirect-pending'))).toBeNull()
})
test('missing redirect sessions show a diagnostic instead of silently returning to login', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pouchtracker:auth-redirect-pending', '1'))
  await page.goto('/login'); await expect(page.getByRole('alert')).toContainText('auth/redirect-result-missing')
})
