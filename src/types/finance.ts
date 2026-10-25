import type { Timestamp } from 'firebase/firestore'
import type { ProductKind } from './data'
export interface PriceSnapshot { packCents: number; quantity: number }
export interface Pricing { pouch: PriceSnapshot | null; cigarette: PriceSnapshot | null; cigarPresetsCents?: number[] }
export interface BaselineCategory { dailyCountMilli: number; price: PriceSnapshot }
export interface Baseline {
  id: string; effectiveOn: string; createdAt: Timestamp | null
  categories: Partial<Record<ProductKind, BaselineCategory>>
}
export interface Coverage { date: string; complete: boolean; updatedAt: Timestamp | null }
export type Period = '7days' | '30days' | 'month' | 'year' | 'all'
export const KINDS: ProductKind[] = ['pouch', 'cigarette', 'cigar']
export const LABELS = { pouch: 'Pouches', cigarette: 'Cigarettes', cigar: 'Cigars' }
export const EMPTY_PRICING: Pricing = { pouch: null, cigarette: null }
