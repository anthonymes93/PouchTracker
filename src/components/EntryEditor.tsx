import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Entry } from '../types/data'
import { Modal } from './ui/Modal'
import { useTheme } from '../hooks/useTheme'
import { useNicotineEntries } from '../hooks/useNicotineEntries'
import { fromDateTimeInput, toDateTimeInput } from '../utils/dateTime'
import { PriceFields, parsePrice, priceDraft } from './finance/PriceFields'
import type { PriceSnapshot } from '../types/finance'
import { cigarPresets, cigarSnapshot, parseCigarPrice } from '../utils/cigarPricing'
import { useFinance } from '../contexts/FinanceContext'
import { entryCost, formatCost } from '../utils/money'
export function EntryEditor({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { pricing } = useFinance()
  const { preferences } = useTheme()
  const { edit } = useNicotineEntries()
  const [value, setValue] = useState(() => toDateTimeInput(entry.occurredAt.toMillis(), preferences.timeZone))
  const [error, setError] = useState<string | null>(null)
  const [priceMode, setPriceMode] = useState('keep')
  const [price, setPrice] = useState(priceDraft(entry.priceSnapshot))
  const [cigarPrice, setCigarPrice] = useState(entryCost(entry) === null ? '' : ((entry.priceSnapshot?.packCents ?? entry.costCents ?? 0) / (entry.priceSnapshot?.quantity ?? 1) / 100).toFixed(2))
  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const time = fromDateTimeInput(value, preferences.timeZone, entry.occurredAt.toMillis())
      if (time > Date.now()) throw new Error('Choose a time that is not in the future.')
      const correction: PriceSnapshot | null | undefined = priceMode === 'keep' ? undefined : priceMode === 'unknown' ? null : entry.kind === 'cigar' ? cigarSnapshot(parseCigarPrice(cigarPrice)) : parsePrice(price)
      if (edit(entry, time, correction)) onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Choose a valid time.') }
  }
  return <Modal title={`Edit ${entry.kind} time & cost`} onClose={onClose}><form onSubmit={submit}><label className="field-label" htmlFor="entry-time">Date and time · {preferences.timeZone}</label><input id="entry-time" type="datetime-local" step="1" value={value} max={toDateTimeInput(Date.now(), preferences.timeZone)} onChange={event => setValue(event.target.value)} required /><p className="data-note">During the repeated autumn hour, the existing time offset is kept when possible; otherwise the earlier occurrence is used.</p><label className="field-label">Recorded cost<select value={priceMode} onChange={event => setPriceMode(event.target.value)}><option value="keep">Keep original — {formatCost(entryCost(entry), 4)}</option><option value="correct">Assign / correct this entry’s price</option><option value="unknown">Mark cost unknown</option></select></label>{priceMode === 'correct' && (entry.kind === 'cigar' ? <label className="field-label">Individual cigar price (CAD)<input inputMode="decimal" list="cigar-edit-presets" value={cigarPrice} onChange={event => setCigarPrice(event.target.value)} /><datalist id="cigar-edit-presets">{cigarPresets(pricing).map((cents, index) => <option key={index} value={(cents / 100).toFixed(2)} />)}</datalist></label> : <PriceFields label="Original container / pack used for this entry" prefix="entry-correction" value={price} onChange={setPrice} />)}<p className="data-note">A correction affects only this entry. Editing its time alone preserves its original price.</p>{error && <p className="error-banner" role="alert">{error}</p>}<button className="primary-button modal-submit" type="submit">{priceMode === 'keep' ? 'Save time' : 'Save entry changes'}</button></form></Modal>
}
