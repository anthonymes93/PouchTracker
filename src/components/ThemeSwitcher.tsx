import { Check } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
export function ThemeSwitcher() {
  const { preferences, setTheme, loading, saving } = useTheme()
  return <section className="theme-section" aria-labelledby="theme-title"><h2 id="theme-title">Your colours</h2><p className="data-note">Two calm palettes. Always dark.</p><div className="theme-options">{([{ key: 'forest', label: 'Forest Green' }, { key: 'ocean', label: 'Ocean Blue' }] as const).map(theme => <button key={theme.key} className={`theme-option ${preferences.theme === theme.key ? 'selected' : ''}`} aria-pressed={preferences.theme === theme.key} disabled={loading || saving} onClick={() => setTheme(theme.key)}><span className={`theme-preview ${theme.key}`}><i /><i /><i /></span><span>{theme.label}</span>{preferences.theme === theme.key && <Check size={17} />}</button>)}</div>{loading && <p className="data-note" role="status">Loading your saved theme…</p>}{saving && <p className="data-note" role="status">Saving theme… Keep this tab open if offline.</p>}</section>
}
