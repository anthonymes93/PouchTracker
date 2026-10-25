import { useTheme } from './useTheme'
import { spacingGoal } from '../utils/tracking'
export function useSpacingGoal(now: number) {
  const { schedule, scheduleError } = useTheme()
  return { ...(schedule ? spacingGoal(schedule, now) : { current: null, next: null }), loading: !schedule && !scheduleError, error: scheduleError }
}
