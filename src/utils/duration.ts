/** Display only: stored targets and all calculations remain in minutes. */
export function formatMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable'
  const minutes = Math.max(0, Math.round(value * 10) / 10)
  if (minutes < 60) return `${minutes} min`
  if (minutes % 30 === 0) return `${minutes / 60} ${minutes === 60 ? 'hr' : 'hrs'}`
  const hours = Math.floor(minutes / 60), rest = Math.round((minutes % 60) * 10) / 10
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${rest} min`
}
