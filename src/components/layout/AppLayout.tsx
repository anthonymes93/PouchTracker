import { ArrowUpRight, Leaf, Settings } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { Navigation } from './Navigation'
import { useAuth } from '../../hooks/useAuth'
import { EntriesProvider } from '../../contexts/EntriesContext'
import { TrackingFeedback } from '../ui/TrackingFeedback'
import { useTheme } from '../../hooks/useTheme'
import { RewardsProvider } from '../../contexts/RewardsContext'
import { FinanceProvider } from '../../contexts/FinanceContext'
export function AppLayout() {
  const { user } = useAuth()
  if (!user) return null
  return <FinanceProvider key={user.uid} uid={user.uid}><RewardsProvider><EntriesProvider uid={user.uid}><AppLayoutContent /></EntriesProvider></RewardsProvider></FinanceProvider>
}
function AppLayoutContent() {
  const { user, profileError, retryProfile, busy } = useAuth()
  const { error: preferencesError, retry: retryPreferences } = useTheme()
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar"><Link className="brand" to="/"><img src="/favicon.svg" alt="" /><span>pouch<span className="brand-light">tracker</span></span></Link><div className="sidebar-label eyebrow">Your space</div><Navigation /><div className="sidebar-note"><Leaf size={22} /><p>Small steps.<br />More awareness.</p><span>A little space for better habits.</span></div><div className="sidebar-foot">MADE FOR YOUR PACE <ArrowUpRight size={14} /></div></aside>
    <div className="main-column"><header className="topbar"><Link to="/" className="mobile-brand"><img src="/favicon.svg" alt="" />pouchtracker</Link><span className="desktop-caption">A little more mindful, every day.</span><Link to="/settings" className="settings-link" aria-label="Settings"><Settings size={21} /><span className="avatar">{user?.displayName?.slice(0, 1) || 'P'}</span></Link></header>
    <main id="main" tabIndex={-1}>{profileError && <div className="error-banner" role="alert">{profileError}<button className="text-button" onClick={() => void retryProfile()} disabled={busy}>Retry profile setup</button></div>}{preferencesError && <div className="error-banner" role="alert">{preferencesError}<button className="text-button" onClick={retryPreferences}>Reload preferences</button></div>}<TrackingFeedback /><Outlet /></main><footer className="app-footer"><Leaf size={14} /> Awareness is a good place to start.</footer></div><Navigation mobile />
  </div>
}
