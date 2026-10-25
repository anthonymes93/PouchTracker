import { elapsedSeconds, durationParts } from '../utils/tracking'
import { useClock } from './useClock'
export function usePouchTimer(lastPouchMs: number | null) {
  const now = useClock()
  const elapsed = elapsedSeconds(lastPouchMs, now)
  return { now, elapsed, parts: elapsed === null ? ['--', '--', '--'] : durationParts(elapsed) }
}
