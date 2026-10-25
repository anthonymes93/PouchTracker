import { useMemo, useState } from 'react'
import { useEntryRange } from '../../hooks/usePerformance'
import { useFinance } from '../../contexts/FinanceContext'
import { useTheme } from '../../hooks/useTheme'
import { comparePeriods, monthBounds, performanceDays, shiftMonth } from '../../utils/performance'
import type { SleepWindow } from '../../utils/performance'
import { Bests, numberText } from './Reports'
import { MonthlyChart } from './Charts'
import { formatCost, dollars } from '../../utils/money'

function direction(label: string, before: number | null, after: number | null) {
  if (before === null || after === null) return 'Insufficient data'
  if (before === after) return 'Unchanged'
  const more = after > before
  if (label.endsWith('days')) return more ? '↑ More days' : '↓ Fewer days'
  const lowerBetter = label.startsWith('Pouches') || label === 'Cigarettes' || label === 'Cigars'
  return `${more ? '↑' : '↓'} ${more !== lowerBetter ? 'Improvement' : 'Lower performance'}${label.includes('target') || label.includes('Target') ? ' relative to target' : ''}`
}

export function usePeriod(start: string, end: string, today: string, sleep: SleepWindow) {
  const feed = useEntryRange(start, end), finance = useFinance(), { schedule } = useTheme()
  const days = useMemo(() => performanceDays(feed.data?.entries ?? [], finance.baselines, finance.coverage, schedule, sleep, start, end, today), [feed.data, finance.baselines, finance.coverage, schedule, sleep, start, end, today])
  return { ...feed, days }
}
export function ExtendedProgress({ start, end, today, sleep, allTime = false }: { start: string; end: string; today: string; sleep: SleepWindow; allTime?: boolean }) {
  const result = usePeriod(start, end, today, sleep)
  if (result.error) return <p role="alert" className="error-banner">{result.error} <button onClick={result.retry}>Retry</button></p>
  if (!result.data) return <p role="status">Loading progress…</p>
  return <>{result.data.fromCache && <p className="data-note">Cached progress; may be incomplete until connected.</p>}{allTime ? <Bests days={result.days} label={`All confirmed history · ${start} to ${end}`} /> : <MonthlyChart days={result.days} />}</>
}
export function PeriodExplorer({ month, today, sleep }: { month: string; today: string; sleep: SleepWindow }) {
  const current = monthBounds(month), previous = monthBounds(shiftMonth(month, -1))
  const [draft, setDraft] = useState({ aStart: previous.start, aEnd: previous.end, bStart: current.start, bEnd: current.end })
  const [range, setRange] = useState(draft), [error, setError] = useState('')
  const a = usePeriod(range.aStart, range.aEnd, today, sleep), b = usePeriod(range.bStart, range.bEnd, today, sleep)
  const compared = useMemo(() => comparePeriods(a.days, b.days), [a.days, b.days])
  const rows: [string, number | null, number | null, string][] = [
    ['Pouches, total', compared.a.counts.pouch, compared.b.counts.pouch, ''], ['Pouches / confirmed day', compared.a.averagePouches, compared.b.averagePouches, ''],
    ['Average spacing', compared.a.average, compared.b.average, ' min'], ['Spacing / scheduled target', compared.a.ratio === null ? null : compared.a.ratio * 100, compared.b.ratio === null ? null : compared.b.ratio * 100, '%'],
    ['Target success', compared.a.success === null ? null : compared.a.success * 100, compared.b.success === null ? null : compared.b.success * 100, '%'],
    ['Cigarettes', compared.a.counts.cigarette, compared.b.counts.cigarette, ''], ['Cigars', compared.a.counts.cigar, compared.b.counts.cigar, ''],
    ['Excellent days', compared.a.ratings.Excellent, compared.b.ratings.Excellent, ''], ['On Target days', compared.a.ratings['On Target'], compared.b.ratings['On Target'], ''],
  ]
  const spendPercent = !compared.a.spending.unknown && !compared.b.spending.unknown && compared.a.spending.total.n > 0n ? (dollars(compared.b.spending.total) / dollars(compared.a.spending.total) - 1) * 100 : null
  return <section className="panel performance-section"><h2>Compare periods</h2><p className="data-note">Defaults to this month and the previous month. Choose any two completed months or custom ranges. Matched samples use the first N confirmed completed dates in each range, where N is the smaller available count; dates need not be consecutive. This is descriptive, not a claim about untracked days.</p><form onSubmit={event => { event.preventDefault(); if (draft.aStart > draft.aEnd || draft.bStart > draft.bEnd) { setError('Each start must be before its end.'); return } setError(''); setRange(draft) }}><div className="performance-controls">{(['a', 'b'] as const).map(key => <fieldset key={key}><legend>Period {key.toUpperCase()}</legend><label className="field-label">Whole month {key.toUpperCase()}<input type="month" max={shiftMonth(today.slice(0, 7), -1)} onChange={e => { if (e.target.value) { const bounds = monthBounds(e.target.value); setDraft(value => ({ ...value, [`${key}Start`]: bounds.start, [`${key}End`]: bounds.end })) } }} /></label>{(['Start', 'End'] as const).map(part => <label className="field-label" key={part}>{key.toUpperCase()} {part.toLowerCase()}<input type="date" required min="2000-01-01" max="2100-12-31" value={draft[`${key}${part}`]} onChange={e => setDraft(value => ({ ...value, [`${key}${part}`]: e.target.value }))} /></label>)}</fieldset>)}</div><button className="secondary-button">Compare selected ranges</button></form>{error && <p role="alert">{error}</p>}{a.error || b.error ? <p role="alert">{a.error ?? b.error} <button onClick={() => { a.retry(); b.retry() }}>Retry comparison</button></p> : !a.data || !b.data ? <p role="status">Loading comparison…</p> : <><p className="data-note">{compared.partial ? 'Partial comparison' : 'Complete comparison'} · {compared.a.days} matched days per period. {a.data.fromCache || b.data.fromCache ? 'Cached data may be incomplete.' : ''}</p><p className="data-note">A: {range.aStart}–{range.aEnd} · B: {range.bStart}–{range.bEnd}. Actual duration and target-relative spacing are shown separately; changing targets can change success even when actual spacing improves.</p>{compared.a.days === 0 ? <p>No equivalent confirmed days available.</p> : <><div className="performance-table"><table><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Change B vs A</th></tr></thead><tbody>{rows.map(([label, av, bv, suffix]) => <tr key={label}><th>{label}</th><td>{numberText(av, suffix)}</td><td>{numberText(bv, suffix)}</td><td><span className="comparison-direction">{direction(label, av, bv)}</span>{av !== null && av > 0 && bv !== null ? `${((bv / av - 1) * 100).toFixed(1)}%` : 'Unavailable'}</td></tr>)}<tr><th>Known spending (CAD)</th><td>{formatCost(compared.a.spending.total)}</td><td>{formatCost(compared.b.spending.total)}</td><td>{numberText(spendPercent, '%')}</td></tr><tr><th>Verified savings (CAD)</th><td>{formatCost(compared.a.savings)}</td><td>{formatCost(compared.b.savings)}</td><td>Eligible days only</td></tr></tbody></table></div><p className="data-note">Unpriced entries: A {compared.a.spending.unknown}, B {compared.b.spending.unknown}. Savings eligible days: A {compared.a.savingsDays}, B {compared.b.savingsDays}. Savings with different eligibility counts are not a like-for-like change.</p></>}<details><summary>Dates included in comparison</summary><p className="data-note">A: {compared.aDates.join(', ') || 'None'}</p><p className="data-note">B: {compared.bDates.join(', ') || 'None'}</p></details></>}</section>
}
