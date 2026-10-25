import { CIGAR_PRICES } from '../config/defaults'
import type { Pricing, PriceSnapshot } from '../types/finance'
import { parseDecimal } from './money'

export function validCigarPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000
}
export function validCigarPresets(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every(validCigarPrice)
}
export function cigarPresets(pricing: Pricing): readonly number[] {
  return pricing.cigarPresetsCents ?? CIGAR_PRICES
}
export function cigarSnapshot(cents: number): PriceSnapshot {
  if (!validCigarPrice(cents)) throw new Error('Enter an individual cigar price from $0.00 to $100,000.00 CAD.')
  // Preserve the existing historical cost schema; a cigar is always one individual unit.
  return { packCents: cents, quantity: 1 }
}
export function parseCigarPrice(value: string): number {
  const cents = parseDecimal(value, 2)
  cigarSnapshot(cents)
  return cents
}
