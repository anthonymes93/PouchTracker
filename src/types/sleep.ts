export interface SleepPeriod { id: string; kind: 'sleep' | 'awake'; startMs: number; endMs: number | null }
export interface SleepData {
  schemaVersion: 2; revision: number; periods: SleepPeriod[]
  interruption: { entryId: string; atMs: number } | null
}
export const EMPTY_SLEEP: SleepData = { schemaVersion: 2, revision: 0, periods: [], interruption: null }
