import type { Preferences, SpacingSchedule } from '../types/data'
import { correctedSchedule } from '../utils/spacingSchedule'
import { TIME_ZONE } from './timeZone'
export { TIME_ZONE } from './timeZone'
export const CIGAR_PRICES = [190, 230, 250] as const
export const DEFAULT_PREFERENCES: Preferences = { theme: 'forest', currency: 'CAD', timeZone: TIME_ZONE, lastCigarPriceCents: null }
export const DEFAULT_SCHEDULE: SpacingSchedule = correctedSchedule()
