import { useState } from 'react'
import type { FormEvent } from 'react'
import { useFinance } from '../../contexts/FinanceContext'
import { appendBaseline } from '../../services/finance'
import { KINDS, LABELS } from '../../types/finance'
import type { Baseline } from '../../types/finance'
import { formatCost, parseDecimal, priceCost } from '../../utils/money'
import { suggestBaseline } from '../../utils/finance'
import { shiftDate, torontoToday } from '../../utils/financeDates'
import { dataErrorMessage } from '../../utils/dataErrors'
import { formatTimestamp } from '../../utils/dateTime'
import { cigarSnapshot, parseCigarPrice } from '../../utils/cigarPricing'
import { PriceFields, parsePrice, priceDraft } from './PriceFields'
export function BaselineSettings() {
  const { uid, baselines, entries, coverage, loading, error } = useFinance()
  const today = torontoToday()
  const [effective, setEffective] = useState(today)
  const [draft, setDraft] = useState(() => Object.fromEntries(KINDS.map(kind => [kind, { enabled: false, count: '', price: priceDraft(null) }])) as Record<typeof KINDS[number], { enabled: boolean; count: string; price: ReturnType<typeof priceDraft> }>)
  const [start, setStart] = useState(shiftDate(today, -7)), [end, setEnd] = useState(shiftDate(today, -1))
  const [suggestion, setSuggestion] = useState<ReturnType<typeof suggestBaseline> | null>(null)
  const [message, setMessage] = useState(''), [saving, setSaving] = useState(false)
  function suggest() { try { setSuggestion(suggestBaseline(entries, coverage, start, end, today)); setMessage('Review the suggestion, then explicitly accept it. Reference prices still need your input.') } catch (err) { setMessage(dataErrorMessage(err)) } }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    try {
      const categories: Baseline['categories'] = {}
      for (const kind of KINDS) if (draft[kind].enabled) categories[kind] = { dailyCountMilli: parseDecimal(draft[kind].count, 3), price: kind === 'cigar' ? cigarSnapshot(parseCigarPrice(draft[kind].price.amount)) : parsePrice(draft[kind].price) }
      setSaving(true); setMessage('Saving a new baseline version… An internet connection is required.')
      await appendBaseline(uid, { effectiveOn: effective, categories }); setMessage('Baseline version saved. Earlier versions are preserved.')
    } catch (err) { setMessage(dataErrorMessage(err)) } finally { setSaving(false) }
  }
  return <section className="panel finance-settings"><h2>Savings baseline</h2><p className="data-note">Choose only the categories you want to compare. Savings are estimates for confirmed complete days, using the reference prices saved in each version. Today is excluded.</p><form onSubmit={event => void submit(event)}><label className="field-label">Effective start date<input type="date" value={effective} onChange={event => setEffective(event.target.value)} required /></label>{KINDS.map(kind => <div className="baseline-category" key={kind}><label className="check-label"><input type="checkbox" checked={draft[kind].enabled} onChange={event => setDraft(value => ({ ...value, [kind]: { ...value[kind], enabled: event.target.checked } }))} /> Include {LABELS[kind]}</label>{draft[kind].enabled && <><label className="field-label">Baseline {LABELS[kind].toLowerCase()} per day<input inputMode="decimal" value={draft[kind].count} onChange={event => setDraft(value => ({ ...value, [kind]: { ...value[kind], count: event.target.value } }))} /></label>{kind === 'cigar' ? <label className="field-label">Reference price per cigar (CAD)<input id="baseline-cigar-price" inputMode="decimal" value={draft.cigar.price.amount} onChange={event => setDraft(value => ({ ...value, cigar: { ...value.cigar, price: { amount: event.target.value, quantity: '1' } } }))} /></label> : <PriceFields label={`${LABELS[kind]} reference price`} prefix={`baseline-${kind}`} value={draft[kind].price} onChange={price => setDraft(value => ({ ...value, [kind]: { ...value[kind], price } }))} />}</>}</div>)}<button className="primary-button modal-submit" disabled={saving || loading || Boolean(error)}>Save new baseline version</button></form>
    <details className="finance-details"><summary>Suggest daily quantities from my history</summary><p className="data-note">Uses all confirmed complete days in your chosen range, including confirmed zero-use days. Nothing is applied automatically.</p><div className="form-grid"><label>From<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Through<input type="date" value={end} max={shiftDate(today, -1)} onChange={event => setEnd(event.target.value)} /></label></div><button className="secondary-button" onClick={suggest} disabled={loading || Boolean(error)}>Calculate suggestion</button>{suggestion && <div className="suggestion"><p>{KINDS.map(kind => `${LABELS[kind]}: ${suggestion[kind] / 1000}/day`).join(' · ')}</p><button className="secondary-button" onClick={() => { setDraft(value => Object.fromEntries(KINDS.map(kind => [kind, { ...value[kind], count: String(suggestion[kind] / 1000) }])) as typeof value); setSuggestion(null); setMessage('Suggested quantities accepted into the form. Select categories, set reference prices, and save to activate.') }}>Accept suggested quantities</button></div>}</details>
    <p role="status" className="data-note">{message}</p><h3>Baseline history</h3>{baselines.length ? <ul className="baseline-history">{baselines.map(baseline => <li key={baseline.id}><strong>Effective {baseline.effectiveOn}</strong><span>{KINDS.filter(kind => baseline.categories[kind]).map(kind => `${LABELS[kind]}: ${baseline.categories[kind]!.dailyCountMilli / 1000}/day at ${formatCost(priceCost(baseline.categories[kind]!.price), 4)} CAD per unit`).join(' · ')}</span><small>{baseline.createdAt ? `Saved ${formatTimestamp(baseline.createdAt.toMillis())}` : 'Awaiting server timestamp'}</small></li>)}</ul> : <p className="data-note">No baseline configured. We will not assume your previous consumption.</p>}<p className="data-note">The first version may start in the past. Later versions must start today or later and after the last version’s effective date. Saved versions cannot be edited.</p></section>
}
