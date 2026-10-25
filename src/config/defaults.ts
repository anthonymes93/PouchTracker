import type { Preferences, SpacingSchedule } from '../types/data'
export const TIME_ZONE = 'America/Toronto'
export const CIGAR_PRICES = [190, 230, 250] as const
export const DEFAULT_PREFERENCES: Preferences = { theme: 'forest', currency: 'CAD', timeZone: TIME_ZONE, lastCigarPriceCents: null }
export const DEFAULT_SCHEDULE: SpacingSchedule = {
  timeZone: TIME_ZONE,
  steps: [
    { week: 1, startsOn: '2026-10-23', minimumMinutes: 60 },
    { week: 2, startsOn: '2026-10-30', minimumMinutes: 90 },
    { week: 3, startsOn: '2026-11-06', minimumMinutes: 120 },
    { week: 4, startsOn: '2026-11-13', minimumMinutes: 180 },
  ],
}
