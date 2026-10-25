import { useEffect, useMemo, useState } from 'react'
import { useFinance } from '../contexts/FinanceContext'
import type { Period } from '../types/finance'
import { baselineDaily, baselineForDay, comparison, dailyReport, entriesInRange, reportSummary, spending } from '../utils/finance'
import { monday, periodStart, shiftDate, torontoToday } from '../utils/financeDates'
import { dateKey } from '../utils/dateTime'
import { KINDS } from '../types/finance'
import { sumMoney, ZERO } from '../utils/money'
export function useFinancialReport(period: Period = 'month') {
  const data = useFinance()
  const [today, setToday] = useState(torontoToday)
  useEffect(() => { const timer = setInterval(() => setToday(torontoToday()), 1000); return () => clearInterval(timer) }, [])
  const report = useMemo(() => {
    const earliest = [today, ...data.entries.map(entry => dateKey(entry.occurredAt.toMillis())), ...data.baselines.map(baseline => baseline.effectiveOn), ...data.coverage.map(day => day.date)].sort()[0]
    const start = periodStart(period, today, earliest)
    const days = dailyReport(data.entries, data.baselines, data.coverage, start, today, today)
    const cumulativeDays = dailyReport(data.entries, data.baselines, data.coverage, data.baselines[0]?.effectiveOn ?? today, shiftDate(today, -1), today)
    const totals = spending(entriesInRange(data.entries, start, today))
    const summary = reportSummary(days)
    const currentBaseline = baselineForDay(data.baselines, today)
    return { today, earliest, start, days, totals, summary, cumulative: reportSummary(cumulativeDays),
      comparison: period === 'all' ? null : comparison(data.entries, data.coverage, start, today),
      todayReference: currentBaseline ? sumMoney(KINDS.map(kind => baselineDaily(currentBaseline, kind) ?? ZERO)) : null,
      horizons: [
        { label: 'Today', start: today }, { label: 'This week', start: monday(today) },
        { label: 'This month', start: `${today.slice(0, 7)}-01` }, { label: 'This year', start: `${today.slice(0, 4)}-01-01` }, { label: 'All time', start: earliest },
      ].map(range => ({ ...range, spending: spending(entriesInRange(data.entries, range.start, today)), savings: reportSummary(dailyReport(data.entries, data.baselines, data.coverage, range.start, today, today)) })),
    }
  }, [data.entries, data.baselines, data.coverage, today, period])
  return { ...data, ...report }
}
