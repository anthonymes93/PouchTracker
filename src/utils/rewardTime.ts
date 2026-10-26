import { fromDateTimeInput } from './dateTime'
import { shiftDate } from './financeDates'
import type { SleepWindow } from './performance'
import { sleepEvidence } from './sleep'
export function awakeWindows(date:string,sleep:SleepWindow):[number,number][] {
 return sleepEvidence(fromDateTimeInput(`${date}T00:00`),fromDateTimeInput(`${shiftDate(date,1)}T00:00`),sleep).awake
}
export function awakeProgress(start:number,end:number,sleep:SleepWindow,thresholds:number[],_cache = new Map<string,[number,number][]>()) {
 const evidence=sleepEvidence(start,end,sleep),reached:number[]=[]
 let elapsed=0
 for(const [from,to] of evidence.awake){
   const duration=to-from
   while(reached.length<thresholds.length && thresholds[reached.length]*60000<=elapsed+duration) reached.push(from+thresholds[reached.length]*60000-elapsed)
   elapsed+=duration
 }
 return {minutes:evidence.awakeMinutes,reached,unknownMinutes:evidence.unknownMinutes,sleepMinutes:evidence.sleepMinutes}
}
export function levelProgress(xp: number) {
  const total = Number.isSafeInteger(xp) && xp > 0 ? xp : 0
  const level = Math.floor(Math.sqrt(total / 100)) + 1
  const floor = 100 * (level - 1) ** 2, next = 100 * level ** 2
  return { level, total, floor, next, within: total - floor, remaining: next - total, percent: (total - floor) / (next - floor) * 100 }
}
