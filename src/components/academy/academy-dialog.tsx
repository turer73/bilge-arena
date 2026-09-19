'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './academy.module.css'

export function AcademyDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    if (!dialog.open) dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      // Removing the element closes a modal dialog. Calling close() here also
      // emits a close event; React Strict Mode's effect replay would then tell
      // the parent to unmount the freshly opened dialog.
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={heading} onClose={onClose}
      onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={styles.dialogContent}>
        <header className={styles.dialogHeader}>
          <h2 id={heading}>{title}</h2>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Pencereyi kapat"><X size={22} /></button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
