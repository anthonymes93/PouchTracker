import { useState } from 'react'
import { LogOut, Moon, ShieldCheck, UserRound } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { PricingSettings } from '../components/finance/PricingSettings'
import { BaselineSettings } from '../components/finance/BaselineSettings'
import { FinanceStatus } from '../components/finance/FinanceStatus'
import { SleepSettings } from '../components/SleepSettings'
export default function Settings() {
  const { user, logout, busy, error } = useAuth()
  const [photoFailed, setPhotoFailed] = useState(false)
  return <><PageHeader eyebrow="YOUR SPACE, YOUR WAY" title="Settings" description="Your account and the essentials." /><section className="panel settings-panel"><h2>Google account</h2><div className="profile-row">{user?.photoURL && !photoFailed ? <img className="profile-photo" src={user.photoURL} alt="Your Google profile" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} /> : <span className="profile-photo avatar"><UserRound /></span>}<div><h3>{user?.displayName || 'Your account'}</h3><p>{user?.email}</p></div></div><div className="settings-row"><span><Moon size={19} /> Appearance</span><span>Dark</span></div><ThemeSwitcher /><div className="settings-row"><span><ShieldCheck size={19} /> Sign-in method</span><span>Google</span></div>{error && <p className="error-banner" role="alert">{error}</p>}<button className="secondary-button signout" onClick={() => void logout()} disabled={busy}><LogOut size={18} />{busy ? 'Please wait…' : 'Sign out'}</button></section><FinanceStatus /><PricingSettings /><BaselineSettings /><SleepSettings /><p className="data-note">Pouch Tracker · Spending & savings</p></>
}

