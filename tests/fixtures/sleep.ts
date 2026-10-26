import type { SleepData } from '../../src/types/sleep'
import { fromDateTimeInput } from '../../src/utils/dateTime'
import { dateRange,shiftDate } from '../../src/utils/financeDates'
// Explicit synthetic recorded periods for old scoring scenarios, not production defaults.
export function recordedFixture():SleepData {
  const days=dateRange('2026-10-01','2026-11-30')
  return {schemaVersion:2,revision:1,interruption:null,periods:[{id:'awake-confirmation',kind:'awake',startMs:fromDateTimeInput('2026-10-01T00:00'),endMs:fromDateTimeInput('2026-12-01T00:00')},...days.map(date=>({id:`sleep-${date}`,kind:'sleep' as const,startMs:fromDateTimeInput(`${date}T23:00`),endMs:fromDateTimeInput(`${shiftDate(date,1)}T09:00`)}))]}
}
export const RECORDED_SLEEP=recordedFixture()
export function awakeRange(start:number,end:number):SleepData{return{schemaVersion:2,revision:1,interruption:null,periods:[{id:'confirmed',kind:'awake',startMs:start,endMs:end}]}}
