import { useState } from 'react'
import type { FormEvent } from 'react'
import { useFinance } from '../contexts/FinanceContext'
import { useNicotineEntries } from '../hooks/useNicotineEntries'
import { useTheme } from '../hooks/useTheme'
import { cigarPresets, parseCigarPrice } from '../utils/cigarPricing'
import { formatMoney } from '../utils/dateTime'
import { Modal } from './ui/Modal'

export function CigarLogPanel({ onClose }: { onClose: () => void }) {
  const { pricing, pricingReady, error } = useFinance()
  const { log, cooldown } = useNicotineEntries()
  const { preferences } = useTheme()
  const presets = cigarPresets(pricing)
  const last = preferences.lastCigarPriceCents
  const [custom, setCustom] = useState(last !== null && !presets.includes(last) ? (last / 100).toFixed(2) : '')
  const [validation, setValidation] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    try { if (log('cigar', parseCigarPrice(custom))) onClose() }
    catch (err) { setValidation(err instanceof Error ? err.message : 'Enter a valid price.') }
  }
  return <Modal title="Choose a cigar price" onClose={onClose}><p className="small-muted">Price for one cigar, in CAD. Tapping a preset logs one cigar.</p>
    {!pricingReady || error ? <p className="data-note">Saved presets are unavailable. You can enter the actual individual price below.</p> : <div className="price-options">{presets.map((price, index) => <button key={index} className={`price-button ${last === price ? 'selected' : ''}`} disabled={cooldown} onClick={() => { if (log('cigar', price)) onClose() }}>{formatMoney(price)}<small>{last === price ? 'Last selected' : 'CAD'}</small></button>)}</div>}
    <form className="custom-cigar" onSubmit={submit}><label className="field-label" htmlFor="custom-cigar-price">Custom price for one cigar (CAD)<input id="custom-cigar-price" inputMode="decimal" value={custom} placeholder="Optional" onChange={event => { setCustom(event.target.value); setValidation('') }} /></label>{last !== null && !presets.includes(last) && <p className="data-note">Last selected: {formatMoney(last)} CAD per cigar</p>}{validation && <p role="alert" className="error-banner">{validation}</p>}<button className="secondary-button" disabled={cooldown || !custom.trim()}>Log custom-priced cigar</button></form>
  </Modal>
}
