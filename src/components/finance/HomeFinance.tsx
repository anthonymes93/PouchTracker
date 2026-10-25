import { Link } from 'react-router'
import { useFinancialReport } from '../../hooks/useFinancialReport'
import { formatCost } from '../../utils/money'
import { FinanceStatus } from './FinanceStatus'
export function HomeFinance() {
  const report = useFinancialReport('month')
  return <section className="panel compact-finance"><div className="section-label"><h2>A little financial perspective</h2><Link className="text-link" to="/stats">View financial stats →</Link></div><FinanceStatus />{!report.loading && !report.error && <><div className="compact-values"><div><span>Recorded spending this month</span><strong>{formatCost(report.totals.total)}</strong><small>{report.totals.unknown ? `Known costs only · ${report.totals.unknown} unpriced entries` : 'CAD · based on logged entries'}</small></div><div><span>Estimated savings this month</span><strong>{report.summary.savings === null ? 'Not available' : formatCost(report.summary.savings)}</strong><small>{report.summary.savings === null ? 'Set a baseline and confirm complete days.' : `${report.summary.eligibleDays} confirmed, priced days only · excludes today`}</small></div></div><p className="data-note">Missing days are never treated as zero use.</p></>}</section>
}
