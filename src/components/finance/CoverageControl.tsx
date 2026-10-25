import { useState } from 'react'
import { useFinance } from '../../contexts/FinanceContext'
import { saveCoverage } from '../../services/finance'
import { shiftDate, torontoToday } from '../../utils/financeDates'
import { dataErrorMessage } from '../../utils/dataErrors'
export function CoverageControl() {
  const { uid, coverage, loading, error } = useFinance()
  const yesterday = shiftDate(torontoToday(), -1)
  const [date, setDate] = useState(yesterday), [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  const complete = coverage.some(day => day.date === date && day.complete)
  async function save(value: boolean) {
    if (saving) return
    setSaving(true); setMessage('Saving day confirmation… Keep this tab open if offline.')
    try { await saveCoverage(uid, date, value); setMessage(value ? 'Day confirmed complete.' : 'Day marked incomplete.') } catch (err) { setMessage(dataErrorMessage(err)) } finally { setSaving(false) }
  }
  return <details className="panel coverage-control"><summary>Confirm a complete tracking day</summary><p className="data-note">Confirm only after recording every use for that day. Confirming a day with no entries means zero use. Unconfirmed days are excluded from savings and comparisons.</p><label className="field-label">Completed day (Toronto)<input type="date" value={date} max={yesterday} onChange={event => setDate(event.target.value)} /></label><p className="data-note">{complete ? 'This day is confirmed complete.' : 'This day has not been confirmed.'}</p><button className="secondary-button" disabled={saving || loading || Boolean(error)} onClick={() => void save(!complete)}>{complete ? 'Mark day incomplete' : 'I recorded all use for this day'}</button><p className="data-note" role="status">{message}</p></details>
}
