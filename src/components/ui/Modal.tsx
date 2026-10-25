import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = previous }
  }, [])
  return <dialog className="modal panel" ref={ref} aria-labelledby="modal-title" onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose() }}><div className="modal-content"><div className="section-label"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close panel"><X size={20} /></button></div>{children}</div></dialog>
}
