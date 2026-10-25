import { CalendarDays, ChartNoAxesCombined, History, House, Trophy } from 'lucide-react'
import { NavLink } from 'react-router'
const tabs = [
  { to: '/', label: 'Home', icon: House }, { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/history', label: 'History', icon: History }, { to: '/stats', label: 'Stats', icon: ChartNoAxesCombined },
  { to: '/rewards', label: 'Rewards', icon: Trophy },
]
export function Navigation({ mobile = false }: { mobile?: boolean }) {
  return <nav className={mobile ? 'mobile-nav' : 'desktop-nav'} aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}>{tabs.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Icon size={21} strokeWidth={1.7} /><span>{label}</span></NavLink>)}</nav>
}
