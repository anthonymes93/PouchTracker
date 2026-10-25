import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Entry } from '../types/data'
import { PageHeader } from '../components/ui/PageHeader'
import { Modal } from '../components/ui/Modal'
import { EntryEditor } from '../components/EntryEditor'
import { useNicotineEntries } from '../hooks/useNicotineEntries'
import { useTheme } from '../hooks/useTheme'
import { formatTimestamp } from '../utils/dateTime'
import { entryCost, formatCost } from '../utils/money'
export default function History() {
  const { recent, pendingIds, remove, retry } = useNicotineEntries()
  const { preferences } = useTheme()
  const [editing, setEditing] = useState<Entry | null>(null)
  const [deleting, setDeleting] = useState<Entry | null>(null)
  return <><PageHeader eyebrow="YOUR TIMELINE" title="A space to look back." description="Your most recent 100 entries, newest first." />
    {recent.error && <div className="error-banner" role="alert">{recent.error}<button className="text-button" onClick={retry}>Retry history</button></div>}
    {recent.loading ? <p role="status">Loading your entries…</p> : recent.snapshot.entries.length === 0 ? <div className="empty-state panel"><h2>No entries to show.</h2><p>{recent.snapshot.fromCache ? 'Connecting to your records. Your local history is empty.' : 'Your logged pouches, cigarettes, and cigars will appear here.'}</p></div> : <ol className="history-list">{recent.snapshot.entries.map(entry => <li className="history-row panel" key={entry.id}><div className="history-details"><h2 className="product-name">{entry.kind} <span className="badge">{entryCost(entry) === null ? "Unknown cost" : `${formatCost(entryCost(entry), entry.kind === 'cigar' ? 2 : 4)} CAD`}</span></h2><time dateTime={entry.occurredAt.toDate().toISOString()}>{formatTimestamp(entry.occurredAt.toMillis(), preferences.timeZone)}</time>{entry.pending && <p className="data-note">Waiting to sync</p>}</div><div className="history-actions"><button className="icon-button" aria-label={`Edit ${entry.kind} at ${formatTimestamp(entry.occurredAt.toMillis(), preferences.timeZone)}`} disabled={entry.pending || pendingIds.has(entry.id)} onClick={() => setEditing(entry)}><Pencil size={18} /></button><button className="icon-button" aria-label={`Delete ${entry.kind} at ${formatTimestamp(entry.occurredAt.toMillis(), preferences.timeZone)}`} disabled={entry.pending || pendingIds.has(`delete:${entry.id}`)} onClick={() => setDeleting(entry)}><Trash2 size={18} /></button></div></li>)}</ol>}
    {recent.snapshot.fromCache && <p className="data-note">History is showing locally available records while connecting.</p>}
    {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
    {deleting && <Modal title="Delete this entry?" onClose={() => setDeleting(null)}><p>{deleting.kind} · {formatTimestamp(deleting.occurredAt.toMillis(), preferences.timeZone)}</p><p className="data-note">This removes the entry from your records and updates your timer and daily totals.</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setDeleting(null)}>Keep entry</button><button className="primary-button" onClick={() => { remove(deleting.id, deleting); setDeleting(null) }}>Delete entry</button></div></Modal>}
  </>
}
