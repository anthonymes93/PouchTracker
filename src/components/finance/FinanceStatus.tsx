import { useFinance } from '../../contexts/FinanceContext'
export function FinanceStatus() {
  const { loading, error, fromCache, pending, retry } = useFinance()
  if (error) return <div className="error-banner" role="alert">{error}<button className="text-button" onClick={retry}>Retry financial data</button></div>
  if (loading) return <p role="status" className="data-note">Loading financial records…</p>
  return <>{fromCache && <p className="sync-note" role="status">Locally available financial data only. Totals may be incomplete until synchronized.</p>}{pending && <p className="sync-note" role="status">Financial totals include pending changes. Keep this tab open until saving finishes.</p>}</>
}
