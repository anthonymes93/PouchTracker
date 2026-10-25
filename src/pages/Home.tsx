import { ArrowUpRight, CircleDashed, Cigarette, Flame, Layers3, Leaf, Wallet } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { PouchTimer } from '../components/PouchTimer'
import { OtherLogging } from '../components/QuickLog'
import { useNicotineEntries } from '../hooks/useNicotineEntries'
import { useTheme } from '../hooks/useTheme'
import { HomeFinance } from '../components/finance/HomeFinance'
import { useFinance } from '../contexts/FinanceContext'
import { spending, entriesInRange } from '../utils/finance'
import { formatCost } from '../utils/money'
import { CurrentIntervalRewards } from '../components/rewards/RewardCards'
import { torontoToday } from '../utils/financeDates'
export default function Home() {
  const finance = useFinance()
  const financialToday = spending(entriesInRange(finance.entries, torontoToday(), torontoToday()))
  const { counts, today, retry } = useNicotineEntries()
  const { preferences } = useTheme()
  const unavailable = today.loading || Boolean(today.error) || (today.snapshot.fromCache && today.snapshot.entries.length === 0)
  return <div className="home-dashboard"><PageHeader eyebrow="YOUR DAILY CHECK-IN" title="Make room for progress." description="A clearer picture of your habits, one day at a time." /><PouchTimer />
    <section aria-labelledby="overview-title"><div className="section-label"><h2 id="overview-title">Daily overview</h2><span className="small-muted">Today · {preferences.timeZone}</span></div>
      {today.error && <div className="error-banner" role="alert">{today.error}<button className="text-button" onClick={retry}>Retry daily counts</button></div>}
      <div className="stats-grid"><StatCard icon={CircleDashed} label="Pouches today" value={unavailable ? undefined : counts.pouch} /><StatCard icon={Cigarette} label="Cigarettes today" value={unavailable ? undefined : counts.cigarette} /><StatCard icon={Flame} label="Cigars today" value={unavailable ? undefined : counts.cigar} /><StatCard icon={Layers3} label="Total uses today" value={unavailable ? undefined : counts.total} /><StatCard icon={Wallet} label={financialToday.unknown ? `Spent today · known only (${financialToday.unknown} unpriced)` : 'Spent today · recorded CAD'} value={finance.loading || finance.error ? undefined : formatCost(financialToday.total)} /></div>
      <p className="data-note">{today.loading ? 'Loading today’s records…' : today.snapshot.fromCache ? 'Showing locally available records. Totals may be incomplete until connected.' : today.snapshot.pending ? 'Totals include changes waiting to sync.' : 'Your daily totals update automatically.'}</p>
    </section>
    <HomeFinance /><CurrentIntervalRewards /><div className="gentle-note"><span className="note-icon"><Leaf size={22} /></span><div><h3>Progress starts with awareness.</h3><p>This is your space to notice patterns and build more mindful habits.</p></div><ArrowUpRight className="note-arrow" size={20} /></div><OtherLogging /></div>
}
