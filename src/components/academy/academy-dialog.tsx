'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './academy.module.css'

export function AcademyDialog({ title, onClose, children, size = 'wide', mobileSheet = false }: { title: string; onClose: () => void; children: ReactNode; size?: 'wide' | 'compact'; mobileSheet?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const heading = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Keep the original trigger across Strict Mode's effect replay. Once the
    // modal is open, activeElement is inside it and the page is inert.
    if (!returnFocus.current && document.activeElement instanceof HTMLElement) {
      returnFocus.current = document.activeElement
    }
    const previousOverflow = document.body.style.overflow
    if (!dialog.open) dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      // Removing the element closes a modal dialog. Calling close() here also
      // emits a close event; React Strict Mode's effect replay would then tell
      // the parent to unmount the freshly opened dialog.
      document.body.style.overflow = previousOverflow
      returnFocus.current?.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className={styles.dialog} data-size={size} data-mobile-sheet={mobileSheet} aria-labelledby={heading} onClose={onClose}
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
