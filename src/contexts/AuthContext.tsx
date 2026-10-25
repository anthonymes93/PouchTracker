import { createContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { browserLocalPersistence, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { authErrorMessage } from '../utils/authErrors'
import { ensureUserProfile } from '../services/userData'

interface AuthState {
  user: User | null; loading: boolean; busy: boolean; error: string | null; profileError: string | null
  login: () => Promise<void>; logout: () => Promise<void>; retryProfile: () => Promise<void>
}
export const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(auth))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  useEffect(() => {
    if (!auth) return
    const client = auth
    let active = true
    let unsubscribe = () => {}
    async function initialize() {
      try {
        await setPersistence(client, browserLocalPersistence)
        await getRedirectResult(client)
      } catch (err) { if (active) setError(authErrorMessage(err)) }
      if (!active) return
      unsubscribe = onAuthStateChanged(client, nextUser => {
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
    if (!auth || busy) return
    setBusy(true); setError(null)
    try {
      await setPersistence(auth, browserLocalPersistence)
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (mobile) await signInWithRedirect(auth, provider)
      else await signInWithPopup(auth, provider)
    } catch (err) { setError(authErrorMessage(err)) }
    finally { setBusy(false) }
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
  return <AuthContext.Provider value={{ user, loading, busy, error, profileError, login, logout, retryProfile }}>{children}</AuthContext.Provider>
}
