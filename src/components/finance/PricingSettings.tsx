import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useFinance } from '../../contexts/FinanceContext'
import { savePricing } from '../../services/finance'
import { dataErrorMessage } from '../../utils/dataErrors'
import { cigarPresets, parseCigarPrice } from '../../utils/cigarPricing'
import { PriceFields, parsePrice, priceDraft } from './PriceFields'

export function PricingSettings() {
  const { uid, pricing, pricingReady } = useFinance()
  const [pouch, setPouch] = useState(priceDraft(pricing.pouch)), [cigarette, setCigarette] = useState(priceDraft(pricing.cigarette))
  const [cigars, setCigars] = useState(() => cigarPresets(pricing).map(value => (value / 100).toFixed(2)))
  const dirty = useRef(false)
  const [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { if (!dirty.current) { setPouch(priceDraft(pricing.pouch)); setCigarette(priceDraft(pricing.cigarette)); setCigars(cigarPresets(pricing).map(value => (value / 100).toFixed(2))) } }, [pricing])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    try {
      const values = { cigarPresetsCents: cigars.map(parseCigarPrice), pouch: !pouch.amount && !pouch.quantity ? null : parsePrice(pouch), cigarette: !cigarette.amount && !cigarette.quantity ? null : parsePrice(cigarette) }
      setSaving(true); setMessage('Saving pricing… Keep this tab open if offline.')
      await savePricing(uid, values); dirty.current = false; setMessage('Pricing saved. Existing entries keep their recorded costs.')
    } catch (err) { setMessage(dataErrorMessage(err)) } finally { setSaving(false) }
  }
  return <section className="panel finance-settings"><h2>Nicotine Pricing</h2><p className="data-note">New entries use these prices. Leave both fields blank for an unknown cost; older entries are never repriced automatically.</p><form onSubmit={event => void submit(event)}><PriceFields label="Pouches" prefix="pricing-pouch" value={pouch} onChange={value => { dirty.current = true; setPouch(value) }} /><PriceFields label="Cigarettes" prefix="pricing-cigarette" value={cigarette} onChange={value => { dirty.current = true; setCigarette(value) }} /><fieldset className="price-fields"><legend>Cigar Pricing</legend><p className="data-note">Three individual cigar prices in CAD. Changes apply to future logs only.</p><div className="cigar-preset-fields">{cigars.map((value, index) => <label key={index} htmlFor={`cigar-preset-${index}`}>Per-cigar preset {index + 1} (CAD)<input id={`cigar-preset-${index}`} inputMode="decimal" value={value} onChange={event => { dirty.current = true; setCigars(values => values.map((item, position) => position === index ? event.target.value : item)) }} /></label>)}</div></fieldset><button className="primary-button modal-submit" disabled={saving || !pricingReady}>Save pricing</button><p role="status" className="data-note">{!pricingReady ? 'Loading saved pricing…' : message}</p></form></section>
}
