import type { Theme } from '../types/data'
const KEY = 'pouch-tracker-theme'
export function readTheme(uid: string): Theme {
  try { const cached = JSON.parse(localStorage.getItem(KEY) || 'null'); return cached?.uid === uid && cached.theme === 'ocean' ? 'ocean' : 'forest' } catch { return 'forest' }
}
export function applyTheme(theme: Theme, uid: string | null) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'ocean' ? '#111923' : '#111714')
  try { if (uid) localStorage.setItem(KEY, JSON.stringify({ uid, theme })); else localStorage.removeItem(KEY) } catch { /* Browser storage may be unavailable; Firestore remains authoritative. */ }
}
