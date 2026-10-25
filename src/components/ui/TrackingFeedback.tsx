import { X } from 'lucide-react'
import { useNicotineEntries } from '../../hooks/useNicotineEntries'
export function TrackingFeedback() {
  const { toast, actionError, pendingIds, dismissToast, undo, clearError } = useNicotineEntries()
  return <>{actionError && <div className="error-banner" role="alert">{actionError}<button className="text-button" onClick={clearError}>Dismiss</button></div>}{pendingIds.size > 0 && <p className="sync-note" role="status">Saving changes… If offline, keep this tab open until saving finishes.</p>}{toast && <div className="toast" role="status"><span>{toast.message}</span>{(toast.undoId || toast.restore) && <button className="text-button" onClick={undo}>Undo</button>}<button className="icon-button" onClick={dismissToast} aria-label="Dismiss notification"><X size={17} /></button></div>}</>
}
