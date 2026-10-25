import type { Timestamp } from 'firebase/firestore'
import type { PriceSnapshot } from './finance'

export type ProductKind = 'pouch' | 'cigarette' | 'cigar'
export interface UsageEntry {
  id: string; uid: string; kind: ProductKind; occurredAt: Timestamp
  createdAt: Timestamp | null; updatedAt: Timestamp | null
  costCents: number | null; currency: 'CAD'
  priceSnapshot?: PriceSnapshot | null
}
export interface Entry extends UsageEntry { pending: boolean }
export type Theme = 'forest' | 'ocean'
export interface Preferences { theme: Theme; currency: 'CAD'; timeZone: string; lastCigarPriceCents: number | null }
export interface SpacingStep { week: number; startsOn: string; minimumMinutes: number }
export interface SpacingSchedule { timeZone: string; steps: SpacingStep[]; schemaVersion?: 2; revision?: number }
export interface ProductPrice { name: string; kind: ProductKind; packPrice: number; unitsPerPack: number; currency: string }
export interface WeeklySpacingGoal { weekStartsOn: string; minimumMinutes: number }
export interface Progress { xp: number; level: number }
export interface Achievement { key: string; unlockedAt: Timestamp }
export interface UserSettings { theme: 'dark'; currency: string; timeZone: string }
export interface UserProfile { displayName: string | null; photoURL: string | null; createdAt: Timestamp; settings: UserSettings }
