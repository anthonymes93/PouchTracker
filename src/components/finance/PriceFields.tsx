import { formatCost, parseDecimal, priceCost } from '../../utils/money'
import type { PriceSnapshot } from '../../types/finance'
export interface PriceDraft { amount: string; quantity: string }
export const priceDraft = (price: PriceSnapshot | null | undefined): PriceDraft => ({ amount: price ? (price.packCents / 100).toFixed(2) : '', quantity: price ? String(price.quantity) : '' })
export function parsePrice(draft: PriceDraft): PriceSnapshot {
  const price = { packCents: parseDecimal(draft.amount, 2), quantity: Number(draft.quantity) }
  priceCost(price)
  return price
}
export function PriceFields({ label, value, onChange, prefix }: { label: string; value: PriceDraft; onChange: (value: PriceDraft) => void; prefix: string }) {
  let preview = 'Enter a price and quantity'
  try { preview = `${formatCost(priceCost(parsePrice(value)), 4)} CAD per unit` } catch { /* incomplete form */ }
  return <fieldset className="price-fields"><legend>{label}</legend><div className="form-grid"><label htmlFor={`${prefix}-price`}>Container / pack price (CAD)<input id={`${prefix}-price`} inputMode="decimal" value={value.amount} placeholder="Not configured" onChange={event => onChange({ ...value, amount: event.target.value })} /></label><label htmlFor={`${prefix}-quantity`}>Units per container / pack<input id={`${prefix}-quantity`} inputMode="numeric" value={value.quantity} placeholder="Quantity" onChange={event => onChange({ ...value, quantity: event.target.value })} /></label></div><p className="data-note">{preview}</p></fieldset>
}
