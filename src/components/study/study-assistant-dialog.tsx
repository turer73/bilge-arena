'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { StudyAssistant } from './study-assistant'
import type { GameSlug } from '@/lib/constants/games'

interface StudyAssistantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  game: GameSlug
  examRef: string | null
  initialRequest: {
    id: string
    prompt: string
    mode: 'chat' | 'topic_explanation'
  } | null
}

export function StudyAssistantDialog({
  open,
  onOpenChange,
  game,
  examRef,
  initialRequest,
}: StudyAssistantDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    queueMicrotask(() => closeRef.current?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>([
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',')))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [onOpenChange, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onOpenChange(false)
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl sm:rounded-3xl"
      >
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--focus-text)]">DERS ÇALIŞ</p>
            <h2 id={titleId} className="truncate text-base font-black text-[var(--text)]">Bilge Asistan</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-sub)] hover:bg-[var(--card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            aria-label="Bilge Asistan'ı kapat"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto">
          <StudyAssistant
            embedded
            game={game}
            examRef={examRef}
            initialRequest={initialRequest}
          />
        </div>
      </section>
    </div>
  )
}
