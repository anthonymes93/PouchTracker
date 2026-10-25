import { ArrowRight, Leaf, ShieldCheck } from 'lucide-react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { firebaseConfigured } from '../lib/firebase'
import { LoadingState } from '../components/ui/LoadingState'
export default function Login() {
  const { user, loading, login, busy, error, redirectAvailable, loginWithRedirect } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  const from: unknown = location.state?.from
  const destination = typeof from === 'string' && ['/', '/calendar', '/history', '/stats', '/rewards', '/settings'].includes(from) ? from : '/'
  if (user) return <Navigate to={destination} replace />
  return <main className="login-page"><div className="login-brand brand"><img src="/favicon.svg" alt="" /><span>pouch<span className="brand-light">tracker</span></span></div><section className="login-card panel"><span className="empty-icon"><Leaf size={32} strokeWidth={1.5} /></span><span className="eyebrow">A LITTLE SPACE FOR YOURSELF</span><h1>Small steps.<br /><span>More awareness.</span></h1><p>Understand your habits. Find your rhythm.<br />Build a little more intention into every day.</p><button className="google-button" disabled={!firebaseConfigured || busy} onClick={() => void login()}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M21.8 12.2c0-.7-.1-1.4-.2-2.2H12v4h5.5a4.8 4.8 0 0 1-2 3v2.5h3.2c2-1.8 3.1-4.3 3.1-7.3ZM12 22c2.7 0 5-.9 6.7-2.5L15.5 17c-.9.6-2.1 1-3.5 1-2.6 0-4.9-1.8-5.7-4.2H3v2.6A10 10 0 0 0 12 22ZM6.3 13.8a6 6 0 0 1 0-3.6V7.6H3a10 10 0 0 0 0 8.8l3.3-2.6ZM12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.5 9.5 0 0 0 12 2a10 10 0 0 0-9 5.6l3.3 2.6C7.1 7.8 9.4 6 12 6Z" /></svg>{busy ? 'Connecting…' : 'Continue with Google'}<ArrowRight size={18} /></button>{redirectAvailable && <button className="text-button" disabled={busy} onClick={() => void loginWithRedirect()}>Continue in this tab instead</button>}{!firebaseConfigured && <div className="setup-note" role="status"><strong>One small setup step.</strong><p>Add your Firebase web configuration to <code>.env.local</code> and restart the app to enable sign-in. See the README for instructions.</p></div>}{error && <p className="error-banner" role="alert">{error}</p>}<div className="login-assurance"><ShieldCheck size={15} /> Your space. Your account.</div></section><p className="login-footer">MORE MINDFUL, AT YOUR OWN PACE.</p></main>
}
