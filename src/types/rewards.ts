import type { Entry, SpacingSchedule } from './data'
import type { Baseline, Coverage } from './finance'
import type { SleepWindow } from '../utils/performance'
export type RewardStatus = 'valid' | 'provisional' | 'invalidated'
export interface RewardEvidence {
  startDate: string; endDate: string; startEntryId: string; startMs: number
  targetMinutes: number; awakeMinutes: number; intervalMinutes: number; detail: string
}
export interface Award {
  id: string; type: 'spacing' | 'abstinence' | 'achievement'; name: string; milestone: string
  earnedAt: number; date: string; xp: number; status: RewardStatus; evidence: RewardEvidence
}
export interface StoredAward extends Award { revision: number; firstRecordedAt: number; updatedAt: number; reason: string }
export interface RewardSource { entries: Entry[]; coverage: Coverage[]; baselines: Baseline[]; schedule: SpacingSchedule | null; sleep: SleepWindow }
export interface RewardFeed { awards: StoredAward[]; achievements: StoredAward[]; revision: number; processedRevision: number; loading: boolean; fromCache: boolean; pending: boolean }
