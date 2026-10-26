import { BrowserRouter, Route, Routes } from 'react-router'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGuard } from './components/AuthGuard'
import { AppLayout } from './components/layout/AppLayout'
import Home from './pages/Home'
const Calendar = lazy(() => import('./pages/Calendar'))
import History from './pages/History'
const Stats = lazy(() => import('./pages/Stats'))
import Rewards from './pages/Rewards'
import Settings from './pages/Settings'
import SpacingGoals from './pages/SpacingGoals'
import SleepTracking from './pages/SleepTracking'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import { PreferencesProvider } from './contexts/PreferencesContext'
export default function App() {
  return <BrowserRouter><AuthProvider><PreferencesProvider><Routes><Route path="/login" element={<Login />} /><Route element={<AuthGuard />}><Route element={<AppLayout />}><Route index element={<Home />} /><Route path="calendar" element={<Suspense fallback={<p role="status">Loading calendar?</p>}><Calendar /></Suspense>} /><Route path="history" element={<History />} /><Route path="stats" element={<Suspense fallback={<p role="status">Loading financial stats…</p>}><Stats /></Suspense>} /><Route path="rewards" element={<Rewards />} /><Route path="settings" element={<Settings />} /><Route path="settings/goals" element={<SpacingGoals />} /><Route path="settings/sleep" element={<SleepTracking />} /><Route path="*" element={<NotFound />} /></Route></Route></Routes></PreferencesProvider></AuthProvider></BrowserRouter>
}
