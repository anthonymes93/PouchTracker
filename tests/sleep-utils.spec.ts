import { expect,test } from '@playwright/test'
import { EMPTY_SLEEP,changeSleep,interruptSleep,sleepEvidence,sleepTimestamp } from '../src/utils/sleep'
import { awakeProgress } from '../src/utils/rewardTime'
import { reconcilePlan,rewardTotals } from '../src/utils/rewards'
import type { SleepData } from '../src/types/sleep'
import type { StoredAward } from '../src/types/rewards'
import { fromDateTimeInput } from '../src/utils/dateTime'
const at=(value:string)=>fromDateTimeInput(value)
test('no fixed nighttime assumption: unrecorded day and night are unknown, not awake',()=>{
  for(const hour of ['02','14']){
    const start=at(`2026-10-25T${hour}:00`)
    expect(sleepEvidence(start,start+3600000,EMPTY_SLEEP)).toMatchObject({awakeMinutes:0,sleepMinutes:0,unknownMinutes:60})
    expect(awakeProgress(start,start+3600000,EMPTY_SLEEP,[60]).reached).toEqual([])
  }
})
test('multiple daytime naps subtract accurately without double counting overlaps',()=>{
  const start=at('2026-10-24T09:00'),end=at('2026-10-24T18:00')
  const data:SleepData={...EMPTY_SLEEP,periods:[{id:'awake',kind:'awake',startMs:start,endMs:end},{id:'nap1',kind:'sleep',startMs:start+3600000,endMs:start+7200000},{id:'overlap',kind:'sleep',startMs:start+5400000,endMs:start+10800000},{id:'nap2',kind:'sleep',startMs:start+21600000,endMs:start+25200000}]}
  expect(sleepEvidence(start,end,data)).toMatchObject({awakeMinutes:360,sleepMinutes:180,unknownMinutes:0})
  expect(awakeProgress(start,end,data,[60,120]).reached).toEqual([start+3600000,start+14400000])
})
test('interrupted active sleep ends at the pouch timestamp and never restarts itself',()=>{
  const start=at('2026-10-24T13:00'),pouch=start+3600000
  const active=changeSleep(EMPTY_SLEEP,{kind:'start',id:'nap',atMs:start},pouch)
  const ended=interruptSleep(active,pouch,'pouch-id')!
  expect(ended.periods[0].endMs).toBe(pouch)
  expect(ended.interruption).toEqual({entryId:'pouch-id',atMs:pouch})
  expect(sleepEvidence(start,pouch+3600000,ended)).toMatchObject({sleepMinutes:60,awakeMinutes:0,unknownMinutes:60})
  const returned=changeSleep(ended,{kind:'start',id:'return',atMs:pouch+600000},pouch+600000)
  expect(returned.periods).toHaveLength(2);expect(returned.interruption).toBeNull()
  expect(interruptSleep(ended,pouch+1000,'other')).toBeNull()
})
test('overnight and Toronto DST periods measure actual milliseconds',()=>{
  for(const [start,end,minutes] of [['2026-10-24T23:00','2026-10-25T09:00',600],['2026-11-01T00:00','2026-11-01T04:00',300],['2026-03-08T00:00','2026-03-08T04:00',180]] as const){
    const a=at(start),b=at(end),data:SleepData={...EMPTY_SLEEP,periods:[{id:'night',kind:'sleep',startMs:a,endMs:b}]}
    expect(sleepEvidence(a,b,data).sleepMinutes).toBe(minutes)
    expect(sleepEvidence(a,b,data).unknownMinutes).toBe(0)
  }
  expect(sleepTimestamp('2026-11-01T01:30','later')-sleepTimestamp('2026-11-01T01:30','earlier')).toBe(3600000)
  expect(()=>sleepTimestamp('2026-03-08T02:30','earlier')).toThrow(/does not exist/)
})
test('historical corrections and deletion restore unknown coverage; awake confirmation is explicit',()=>{
  const start=at('2026-10-24T12:00'),end=start+7200000
  let data=changeSleep(EMPTY_SLEEP,{kind:'put',period:{id:'record',kind:'sleep',startMs:start,endMs:end}},end)
  data=changeSleep(data,{kind:'put',period:{...data.periods[0],kind:'awake'}},end)
  expect(awakeProgress(start,end,data,[60]).minutes).toBe(120)
  data=changeSleep(data,{kind:'delete',id:'record'},end)
  expect(sleepEvidence(start,end,data).unknownMinutes).toBe(120)
  expect(()=>changeSleep(data,{kind:'put',period:{id:'open',kind:'awake',startMs:start,endMs:null}},end)).toThrow()
  expect(()=>changeSleep(data,{kind:'put',period:{id:'future',kind:'sleep',startMs:start,endMs:end+1}},end)).toThrow()
})
test('legacy ordinary XP is provisional during unknown coverage and invalidated only with reviewed contradictory evidence',()=>{
  const start=at('2026-10-23T09:00'),end=start+3600000
  const award:StoredAward={id:'spacing_p_target',name:'Target',type:'spacing',milestone:'target',earnedAt:end,date:'2026-10-23',xp:10,status:'valid',revision:1,firstRecordedAt:end,updatedAt:end,reason:'old',evidence:{startDate:'2026-10-23',endDate:'2026-10-23',startEntryId:'p',startMs:start,targetMinutes:60,awakeMinutes:60,intervalMinutes:60,detail:'Old fixed-window evidence'}}
  const pending=reconcilePlan([award],[],EMPTY_SLEEP)
  expect(pending[0].status).toBe('provisional');expect(rewardTotals(pending).xp).toBe(0)
  const recorded:SleepData={...EMPTY_SLEEP,periods:[{id:'nap',kind:'sleep',startMs:start,endMs:end}]}
  expect(reconcilePlan([award],[],recorded)[0].status).toBe('invalidated')
  expect(reconcilePlan([award],[award],EMPTY_SLEEP)).toHaveLength(1)
})
