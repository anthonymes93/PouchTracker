import type { LucideIcon } from 'lucide-react'
export function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: number | string }) {
  return <div className="stat-card panel"><Icon size={19} strokeWidth={1.6} /><div className="stat-value" aria-label={value === undefined ? 'Not available' : undefined}>{value ?? '—'}</div><p>{label}</p></div>
}
