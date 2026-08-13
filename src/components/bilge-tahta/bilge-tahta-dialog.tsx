'use client'

import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { BilgeTahtaContent } from './bilge-tahta-content'
import type { BilgeTahtaLesson } from '@/lib/bilge-tahta/contract'

interface BilgeTahtaDialogProps {
  open: boolean
  lesson: BilgeTahtaLesson
  onOpenChange: (open: boolean) => void
  onReturn?: () => void
  onStepViewed?: (stepIndex: number) => void
  onComplete?: () => void
  initialStep?: number
  animate?: boolean
  busy?: boolean
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const subscribeToClientReady = () => () => {}

export function BilgeTahtaDialog({
  open,
  lesson,
  onOpenChange,
  onReturn,
  onStepViewed,
  onComplete,
  initialStep = 0,
  animate = true,
  busy = false,
}: BilgeTahtaDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const viewedStepRef = useRef<string | null>(null)
  const clientReady = useSyncExternalStore(subscribeToClientReady, () => true, () => false)
  const [stepIndex, setStepIndex] = useState(() => Math.min(Math.max(initialStep, 0), lesson.steps.length - 1))
  const currentStepIndex = Math.min(stepIndex, lesson.steps.length - 1)

  useEffect(() => {
    if (!open) return

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
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
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus()
    }
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) {
      viewedStepRef.current = null
      return
    }
    if (busy) return
    const viewedKey = `${lesson.title}:${lesson.steps[currentStepIndex].id}`
    if (viewedStepRef.current === viewedKey) return
    viewedStepRef.current = viewedKey
    onStepViewed?.(currentStepIndex)
  }, [busy, currentStepIndex, lesson.steps, lesson.title, onStepViewed, open])

  const portalTarget = clientReady ? document.body : null

  if (!open || !portalTarget) return null

  const step = lesson.steps[currentStepIndex]
  const lastStep = currentStepIndex === lesson.steps.length - 1
  const returnLabel = lesson.mode === 'game' ? 'Soruyu çözmeye dön' : 'Ders Çalış’a dön'

  const closeAndReturn = () => {
    onReturn?.()
    onOpenChange(false)
  }

  const next = () => {
    if (lastStep) {
      onComplete?.()
      if (!onComplete) onReturn?.()
      onOpenChange(false)
      return
    }
    setStepIndex((current) => current + 1)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-end justify-center bg-slate-950/90 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
      data-testid="bilge-tahta-overlay"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex max-h-[88dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border-x-4 border-t-4 border-[#2d1606] bg-[#3d200a] p-1.5 shadow-2xl sm:max-w-[900px] sm:rounded-3xl sm:border-4 sm:p-3"
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl border-2 border-black/40 bg-[radial-gradient(circle_at_center,#203f29_0%,#132719_100%)] shadow-[inset_0_0_40px_rgba(0,0,0,0.65)] sm:rounded-2xl">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-dashed border-white/20 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="mb-1 w-fit max-w-full truncate rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-200 sm:text-xs">
                {lesson.subjectLabel}
              </p>
              <h2 id={titleId} className="break-words text-lg font-black text-yellow-200 sm:text-2xl">
                {lesson.title}
              </h2>
              <p id={descriptionId} className="sr-only">
                {busy ? 'Bilge Tahta anlatımı hazırlanıyor' : `${lesson.steps.length} adımlı Bilge Tahta konu anlatımı`}
              </p>
            </div>
            <button
              type="button"
              data-initial-focus
              onClick={() => onOpenChange(false)}
              aria-label="Bilge Tahta’yı kapat"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-200 transition hover:bg-rose-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-7">
            <p className="mb-4 text-xs font-bold text-emerald-200" aria-live="polite">
              {busy ? 'Bilge Asistan tahtayı hazırlıyor…' : `Adım ${currentStepIndex + 1} / ${lesson.steps.length}`}
            </p>
            <BilgeTahtaContent key={step.id} step={step} animate={animate} />
          </main>

          <footer className="shrink-0 border-t border-dashed border-white/20 bg-black/10 px-3 py-3 sm:px-6 sm:py-4">
            <div
              className="mb-3 flex gap-1.5"
              role="progressbar"
              aria-label="Konu anlatımı ilerlemesi"
              aria-valuemin={1}
              aria-valuemax={lesson.steps.length}
              aria-valuenow={currentStepIndex + 1}
            >
              {lesson.steps.map((item, index) => (
                <span
                  key={item.id}
                  aria-hidden="true"
                  className={`h-1.5 flex-1 rounded-full ${
                    index < currentStepIndex ? 'bg-emerald-400' : index === currentStepIndex ? 'bg-yellow-200' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={busy || currentStepIndex === 0}
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
              >
                <ChevronLeft aria-hidden="true" size={18} /> Önceki
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStepIndex(0)}
                className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200 sm:order-3"
              >
                <RotateCcw aria-hidden="true" size={16} /> Baştan
              </button>
              <button
                type="button"
                onClick={closeAndReturn}
                className="col-span-2 min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200 sm:order-4 sm:col-auto"
              >
                {returnLabel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={next}
                className="col-span-2 flex min-h-11 items-center justify-center gap-1 rounded-xl bg-yellow-200 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-yellow-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:order-2 sm:col-auto"
              >
                {lastStep ? 'Tamamla' : 'Sonraki'} <ChevronRight aria-hidden="true" size={18} />
              </button>
            </div>
          </footer>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-1 left-1/2 hidden h-3 w-64 -translate-x-1/2 rounded bg-[#2d1606] shadow-lg sm:block" />
      </div>
    </div>,
    portalTarget,
  )
}
