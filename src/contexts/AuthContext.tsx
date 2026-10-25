import { createContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { browserLocalPersistence, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import type { Auth, User, UserCredential } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { authErrorMessage } from '../utils/authErrors'
import { ensureUserProfile } from '../services/userData'

interface AuthState {
  user: User | null; loading: boolean; busy: boolean; error: string | null; profileError: string | null
  login: () => Promise<void>; logout: () => Promise<void>; retryProfile: () => Promise<void>
  redirectAvailable: boolean; loginWithRedirect: () => Promise<void>
}
export const AuthContext = createContext<AuthState | undefined>(undefined)
// StrictMode must not consume a redirect result twice. Persistence is ready before the button appears.
const initializations = new WeakMap<Auth, { persistence: Promise<void>; redirect: Promise<UserCredential | null> }>()
function initializeAuth(client: Auth) {
  let operation = initializations.get(client)
  if (!operation) {
    const persistence = setPersistence(client, browserLocalPersistence)
    operation = { persistence, redirect: persistence.then(() => getRedirectResult(client)) }
    // The redirect promise may reject before React's initialization continuation awaits it.
    void operation.redirect.catch(() => {})
    initializations.set(client, operation)
  }
  return operation
}
const REDIRECT_PENDING = 'pouchtracker:auth-redirect-pending'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(auth))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const ready = useRef(false), locked = useRef(false)
  const redirectAvailable = Boolean(auth && window.location.protocol === 'https:' && auth.config.authDomain === window.location.host)
  useEffect(() => {
    if (!auth) return
    const client = auth
    let active = true
    let unsubscribe = () => {}
    async function initialize() {
      try {
        const initialization = initializeAuth(client)
        await initialization.persistence
        if (!active) return
        ready.current = true
        const result = await initialization.redirect
        if (!active) return
        const pending = sessionStorage.getItem(REDIRECT_PENDING)
        sessionStorage.removeItem(REDIRECT_PENDING)
        if (pending && !result && !client.currentUser) setError('Google did not return a usable sign-in session. Try Continue with Google again. (auth/redirect-result-missing)')
      } catch (err) { if (active) setError(authErrorMessage(err)) }
      if (!active) return
      unsubscribe = onAuthStateChanged(client, nextUser => {
        if (!active) return
        setUser(nextUser)
        setLoading(false)
        setProfileError(null)
        if (nextUser) void ensureUserProfile(nextUser).catch(() => {
          if (active && client.currentUser?.uid === nextUser.uid) setProfileError('Your profile could not be initialized. Check your connection and Firestore setup, then retry.')
        })
      }, err => { if (active) { setError(authErrorMessage(err)); setLoading(false) } })
    }
    void initialize()
    return () => { active = false; unsubscribe() }
  }, [])

  async function login() {
    if (!auth || locked.current || loading) return
    if (!ready.current) { setError('Authentication could not initialize. Reload this page and retry. Check the initialization error or browser storage settings. (auth/not-initialized)'); return }
    locked.current = true
    setBusy(true); setError(null)
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      // No await before opening: preserve Safari's user activation from the actual tap.
      await signInWithPopup(auth, provider)
    } catch (err) { setError(authErrorMessage(err)) }
    finally { locked.current = false; setBusy(false) }
  }
  async function loginWithRedirect() {
    if (!auth || locked.current || loading || !ready.current) return
    if (!redirectAvailable) { setError('Same-origin sign-in has not been configured for this domain. Use Continue with Google. (auth/redirect-not-configured)'); return }
    locked.current = true; setBusy(true); setError(null)
    try {
      sessionStorage.setItem(REDIRECT_PENDING, '1')
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithRedirect(auth, provider)
    } catch (err) {
      try { sessionStorage.removeItem(REDIRECT_PENDING) } catch { /* Preserve the original storage/sign-in error. */ }
      setError(authErrorMessage(err)); locked.current = false; setBusy(false)
    }
  }
  async function logout() {
    if (!auth) return
    setBusy(true); setError(null)
    try { await signOut(auth) } catch (err) { setError(authErrorMessage(err)) }
    finally { setBusy(false) }
  }
  async function retryProfile() {
    if (!user) return
    setBusy(true)
    try { await ensureUserProfile(user); setProfileError(null) }
    catch { setProfileError('Your profile is still unavailable. Check your connection and deployed Firestore rules.') }
    finally { setBusy(false) }
  }
  return <AuthContext.Provider value={{ user, loading, busy, error, profileError, login, logout, retryProfile, redirectAvailable, loginWithRedirect }}>{children}</AuthContext.Provider>
}
