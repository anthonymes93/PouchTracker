import type { LucideIcon } from 'lucide-react'
export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="empty-state panel"><span className="empty-icon"><Icon size={30} strokeWidth={1.5} /></span><span className="eyebrow">A little more perspective</span><h2>{title}</h2><p>{description}</p><span className="badge">Coming in a future update</span></div>
}
