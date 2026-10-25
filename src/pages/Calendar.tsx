import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { useFinance } from '../contexts/FinanceContext'
import { useTheme } from '../hooks/useTheme'
import { useSleep } from '../hooks/usePerformance'
import { dateKey } from '../utils/dateTime'
import { monday, shiftDate } from '../utils/financeDates'
import { monthGrid, monthBounds, shiftMonth, RATINGS } from '../utils/performance'
import { Bests, DailyPerformance, PerformanceSummary } from '../components/performance/Reports'
import { DailyCharts } from '../components/performance/Charts'
import { ExtendedProgress, PeriodExplorer, usePeriod } from '../components/performance/PeriodExplorer'
import type { SleepWindow } from '../utils/performance'

export default function Calendar() {
  const { sleep, error, retry } = useSleep()
  return <><PageHeader eyebrow="YOUR PROGRESS, DAY BY DAY" title="One day at a time." description="Toronto days, honest records, and room to grow." />{error ? <p className="error-banner" role="alert">{error} <button onClick={retry}>Retry</button></p> : !sleep ? <p role="status">Loading calendar settings…</p> : <CalendarContent sleep={sleep} />}</>
}
function CalendarContent({ sleep }: { sleep: SleepWindow }) {
  const [today, setToday] = useState(() => dateKey(Date.now()))
  useEffect(() => { const timer = setInterval(() => setToday(dateKey(Date.now())), 1000); return () => clearInterval(timer) }, [])
  const [month, setMonth] = useState(today.slice(0, 7)), [selected, setSelected] = useState(today)
  const [compare, setCompare] = useState(false), [progress, setProgress] = useState(false), [allBests, setAllBests] = useState(false)
  const grid = useMemo(() => monthGrid(month), [month]), bounds = monthBounds(month)
  const finance = useFinance(), theme = useTheme()
  const result = usePeriod(shiftDate(grid[0], -1), grid.at(-1)!, today, sleep)
  const days = result.days.filter(day => day.date.startsWith(month))
  const selectedDay = result.days.find(day => day.date === selected)
  const weeks = [...new Set(grid.map(monday))]
  const earliest = finance.coverage.filter(day => day.complete).map(day => day.date).sort()[0] ?? bounds.start
  const error = result.error ?? finance.error ?? theme.scheduleError
  function navigate(delta: number) { const next = shiftMonth(month, delta); setMonth(next); setSelected(`${next}-01`); setAllBests(false) }
  const pending = finance.pending || !!result.data?.pending
  return <><p className="data-note">Performance is motivational feedback, not medical advice. Scores never include money. Sleep: {sleep.start}–{sleep.end} America/Toronto.</p><section className="panel performance-section"><div className="calendar-navigation"><button className="icon-button" aria-label="Previous year" onClick={() => navigate(-12)}>«</button><button className="icon-button" aria-label="Previous month" onClick={() => navigate(-1)}>‹</button><label className="field-label">Month<input aria-label="Calendar month" type="month" min="2000-01" max="2100-12" required value={month} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { setMonth(e.target.value); setSelected(`${e.target.value}-01`) } }} /></label><button className="icon-button" aria-label="Next month" onClick={() => navigate(1)}>›</button><button className="icon-button" aria-label="Next year" onClick={() => navigate(12)}>»</button></div><button className="secondary-button" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today) }}>Today · {today}</button>{error && <p className="error-banner" role="alert">{error} <button onClick={() => { result.retry(); finance.retry(); theme.retry() }}>Retry calendar</button></p>}{(!result.data || finance.loading) && !error && <p role="status">Loading calendar entries…</p>}{(result.data?.fromCache || finance.fromCache) && <p className="data-note">Showing cached records. They may be incomplete while offline.</p>}{pending && <p role="status">Saving changes…</p>}
    <div className="calendar-grid" aria-label={`${month} performance calendar`}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}{grid.map(date => { const day = result.days.find(value => value.date === date); const rating = !result.data || error || finance.loading ? 'Unrated' : day?.rating ?? 'Unrated'; return <button key={date} className={`calendar-cell rating-${RATINGS.indexOf(rating)} ${date.startsWith(month) ? '' : 'adjacent-month'}`} aria-label={`${date}, ${rating}${day?.score !== null && day?.score !== undefined && rating !== 'Unrated' ? `, ${day.score}` : ''}${date === today ? ', today' : ''}`} aria-pressed={selected === date} aria-current={date === today ? 'date' : undefined} onClick={() => setSelected(date)}><span>{Number(date.slice(-2))}</span><small>{rating === 'Unrated' ? '—' : day?.score}</small></button> })}</div><div className="rating-legend">{RATINGS.map((rating, i) => <span key={rating}><i className={`rating-dot rating-${i}`} />{rating}{i < 4 ? [' 90–100', ' 75–89', ' 50–74', ' 0–49'][i] : ''}</span>)}</div></section>
    {result.data && !finance.loading && !error && <><div className="calendar-details"><div><PerformanceSummary days={days} title="Monthly summary" /><Bests days={days} label={`Selected month · ${month}`} /><details className="panel performance-section"><summary>Weekly summaries · Monday–Sunday</summary>{weeks.map(start => <PerformanceSummary key={start} days={result.days.filter(day => day.date >= start && day.date <= shiftDate(start, 6))} title={`${start} to ${shiftDate(start, 6)}`} />)}</details></div>{selectedDay && <DailyPerformance key={selectedDay.date} day={selectedDay} previous={result.days.find(day => day.date === shiftDate(selectedDay.date, -1))} today={today} disabled={pending || !!error} />}</div><DailyCharts days={days} /><div className="performance-controls"><button className="secondary-button" onClick={() => setCompare(value => !value)}>{compare ? 'Close comparison' : 'Compare months or date ranges'}</button><button className="secondary-button" onClick={() => setProgress(value => !value)}>{progress ? 'Close monthly progress' : 'Load six-month progress'}</button><button className="secondary-button" onClick={() => setAllBests(value => !value)}>{allBests ? 'Close all-time bests' : 'Load all-time bests'}</button></div>{compare && <PeriodExplorer key={month} month={month} today={today} sleep={sleep} />}{progress && <ExtendedProgress start={`${shiftMonth(month, -5)}-01`} end={bounds.end} today={today} sleep={sleep} />}{allBests && <ExtendedProgress start={earliest} end={today} today={today} sleep={sleep} allTime />}</>}
  </>
}
