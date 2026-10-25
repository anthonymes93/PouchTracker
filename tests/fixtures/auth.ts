// SDK boundary double: tests use the real AuthProvider, Login, AuthGuard and router.
import type { User } from 'firebase/auth'
const user = { uid: 'auth-test-user', displayName: 'Auth Test', email: 'auth@example.com', photoURL: null } as User
export const client = { currentUser: null as User | null, config: { authDomain: localStorage.getItem('auth-same-origin') ? location.host : 'test-project.firebaseapp.com' } }
export const browserLocalPersistence = { type: 'LOCAL' }
const listeners = new Set<(user: User | null) => void>()
function record(name: string) { const values = JSON.parse(sessionStorage.getItem('auth-calls') || '[]'); sessionStorage.setItem('auth-calls', JSON.stringify([...values, name])) }
function publish(value: User | null) { client.currentUser = value; listeners.forEach(listener => listener(value)) }
export async function setPersistence(_client: unknown, persistence: { type: string }) {
  record(`persistence:${persistence.type}`)
  if (localStorage.getItem('auth-persistence-error')) throw { code: 'auth/web-storage-unsupported' }
  await new Promise(resolve => setTimeout(resolve, Number(localStorage.getItem('auth-init-delay') || '0')))
}
export async function getRedirectResult() {
  record('redirect-result')
  const error = localStorage.getItem('auth-redirect-error')
  if (error) throw { code: error }
  if (sessionStorage.getItem('auth-redirect-success')) { sessionStorage.removeItem('auth-redirect-success'); localStorage.setItem('auth-session', 'yes'); client.currentUser = user; return { user } }
  return null
}
export function onAuthStateChanged(_client: unknown, next: (value: User | null) => void) {
  listeners.add(next); let active = true
  queueMicrotask(() => { if (active) { client.currentUser = localStorage.getItem('auth-session') ? user : null; next(client.currentUser) } })
  return () => { active = false; listeners.delete(next) }
}
export class GoogleAuthProvider { setCustomParameters(_value: unknown) {} }
export function signInWithPopup() {
  record('popup'); sessionStorage.setItem('auth-popup-user-activation', String(navigator.userActivation.isActive))
  const error = localStorage.getItem('auth-popup-error')
  if (error) return Promise.reject({ code: error })
  const popup = window.open('about:blank', 'auth-fixture', 'width=400,height=500'); popup?.close()
  localStorage.setItem('auth-session', 'yes'); publish(user)
  return Promise.resolve({ user })
}
export function signInWithRedirect() {
  record('redirect')
  sessionStorage.setItem('auth-redirect-success', '1')
  location.assign('/login')
  return new Promise<never>(() => {})
}
export async function signOut() {
  record('sign-out')
  const error = localStorage.getItem('auth-signout-error'); if (error) throw { code: error }
  localStorage.removeItem('auth-session'); publish(null)
}
