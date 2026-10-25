import type { PriceSnapshot } from '../types/finance'
import type { UsageEntry } from '../types/data'

// Exact rational cents. Fractions stay exact until the final display boundary.
export interface Money { n: bigint; d: bigint }
function gcd(a: bigint, b: bigint): bigint { return b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b) }
export function money(n: bigint | number, d: bigint | number = 1): Money {
  const numerator = BigInt(n), denominator = BigInt(d)
  if (denominator <= 0n) throw new Error('Invalid money denominator.')
  const factor = gcd(numerator, denominator)
  return { n: numerator / factor, d: denominator / factor }
}
export const ZERO = money(0)
export const addMoney = (a: Money, b: Money) => money(a.n * b.d + b.n * a.d, a.d * b.d)
export const subtractMoney = (a: Money, b: Money) => addMoney(a, { n: -b.n, d: b.d })
export const multiplyMoney = (a: Money, n: number, d = 1) => money(a.n * BigInt(n), a.d * BigInt(d))
export const compareMoney = (a: Money, b: Money) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0
export const sumMoney = (items: Money[]) => items.reduce(addMoney, ZERO)
export function validPrice(value: unknown): value is PriceSnapshot {
  if (!value || typeof value !== 'object') return false
  const { packCents, quantity } = value as PriceSnapshot
  return Number.isSafeInteger(packCents) && packCents >= 0 && packCents <= 10_000_000 && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1000
}
export function priceCost(price: PriceSnapshot): Money {
  if (!validPrice(price)) throw new Error('Enter a price up to $100,000 and a whole quantity from 1 to 1,000.')
  return money(price.packCents, price.quantity)
}
export function entryCost(entry: Pick<UsageEntry, 'priceSnapshot' | 'costCents'>): Money | null {
  if (entry.priceSnapshot != null) return validPrice(entry.priceSnapshot) ? priceCost(entry.priceSnapshot) : null
  return Number.isSafeInteger(entry.costCents) && entry.costCents !== null && entry.costCents >= 0 ? money(entry.costCents) : null
}
export function parseDecimal(value: string, places: number): number {
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`)
  if (!pattern.test(value.trim())) throw new Error(`Enter a nonnegative number with at most ${places} decimal places.`)
  const [whole, decimal = ''] = value.trim().split('.')
  const result = Number(whole) * 10 ** places + Number(decimal.padEnd(places, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('That number is too large.')
  return result
}
export const dollars = (value: Money) => Number(value.n) / Number(value.d) / 100
export function formatCost(value: Money | null, precision = 2): string {
  if (value === null) return 'Unknown cost'
  const scale = 10n ** BigInt(precision)
  const absolute = value.n < 0n ? -value.n : value.n
  const divisor = value.d * 100n
  const rounded = (absolute * scale * 2n + divisor) / (divisor * 2n)
  const result = Number(rounded) / Number(scale) * (value.n < 0n ? -1 : 1)
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: precision, maximumFractionDigits: precision }).format(result)
}
