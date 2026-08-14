'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Plus } from 'lucide-react'
import {
  fetchInstitutionStudentFollowups,
  InstitutionTrackingClientError,
  openInstitutionStudentFollowup,
  resolveInstitutionStudentFollowup,
} from '@/lib/institution-tracking/client'
import type { InstitutionFollowupList } from '@/lib/institution-tracking/followup'

const reasonCopy = {
  support_needed: 'Öğrenme desteği gerekli',
  inactivity: 'Çalışma etkinliği azaldı',
  learning_decline: 'Öğrenme göstergesi geriledi',
  program_review: 'Çalışma programı gözden geçirilecek',
} as const

type ReasonCode = keyof typeof reasonCopy

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(value))
}

export function StudentFollowupPanel({
  classroomId,
  memberRef,
  onChanged,
}: {
  classroomId: string
  memberRef: string
  onChanged?: () => void
}) {
  const [list, setList] = useState<InstitutionFollowupList | null>(null)
  const [reasonCode, setReasonCode] = useState<ReasonCode>('support_needed')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyRef, setBusyRef] = useState<string | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(async () => {
      setLoading(true); setError(null)
      try {
        const next = await fetchInstitutionStudentFollowups(classroomId, memberRef, controller.signal)
        if (!controller.signal.aborted) setList(next)
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        if (!controller.signal.aborted) {
          setList(null)
          setError('Takip kayıtları alınamadı.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })
    return () => controller.abort()
  }, [classroomId, memberRef])

  const openFollowups = useMemo(
    () => list?.followups.filter((item) => item.status === 'open') ?? [],
    [list],
  )

  async function openFollowup() {
    setBusyRef('new'); setError(null)
    try {
      const result = await openInstitutionStudentFollowup({
        classroomId, memberRef, reasonCode, note: note.trim() || null,
      })
      setList((current) => ({
        followups: [{
          followupRef: result.followupRef,
          reasonCode: result.reasonCode,
          status: result.status,
          note: note.trim() || null,
          openedAt: result.openedAt,
          resolvedAt: result.resolvedAt,
        }, ...(current?.followups ?? [])].slice(0, 20),
      }))
      setNote('')
      onChanged?.()
    } catch (caught) {
      setError(caught instanceof InstitutionTrackingClientError && caught.status === 409
        ? 'Bu gerekçeyle açık bir takip zaten var.'
        : 'Takip kaydı açılamadı.')
    } finally { setBusyRef(null) }
  }

  async function resolveFollowup(followupRef: string) {
    setBusyRef(followupRef); setError(null)
    try {
      const result = await resolveInstitutionStudentFollowup(followupRef)
      setList((current) => ({ followups: (current?.followups ?? []).map((item) => (
        item.followupRef === followupRef
          ? { ...item, status: result.status, resolvedAt: result.resolvedAt }
          : item
      )) }))
      onChanged?.()
    } catch { setError('Takip kaydı kapatılamadı.') }
    finally { setBusyRef(null) }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-black">
          <ClipboardList className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" /> Öğrenci destek takibi
        </h3>
        <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
          Yalnız öğrenme desteği için kullanılır. Sağlık, iletişim veya özel nitelikli kişisel veri yazmayın.
        </p>
      </div>

      {loading ? (
        <div className="mt-4 h-20 animate-pulse rounded-xl bg-white/5" aria-label="Takip kayıtları yükleniyor" />
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-start">
            <label className="min-w-0 text-xs font-bold text-[var(--text-sub)]">
              Gerekçe
              <select
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value as ReasonCode)}
                className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              >
                {Object.entries(reasonCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-xs font-bold text-[var(--text-sub)]">
              Kısa öğretmen notu (isteğe bağlı)
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Örn. Cuma günü programı birlikte gözden geçir."
                className="mt-1 min-h-11 w-full resize-y rounded-xl border border-white/15 bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-sub)]"
              />
              <span className="mt-0.5 block text-right font-normal">{note.length}/500</span>
            </label>
            <button
              type="button"
              disabled={busyRef !== null}
              onClick={openFollowup}
              className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-50 sm:mt-5 sm:w-auto"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> {busyRef === 'new' ? 'Açılıyor…' : 'Takip aç'}
            </button>
          </div>

          {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--text-sub)]">Açık takipler ({openFollowups.length})</p>
            {openFollowups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 p-3 text-sm text-[var(--text-sub)]">Bu öğrenci için açık destek takibi yok.</p>
            ) : openFollowups.map((item) => (
              <article key={item.followupRef} className="flex min-w-0 flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm font-black text-amber-100">{reasonCopy[item.reasonCode]}</p>
                  <p className="mt-1 text-xs text-[var(--text-sub)]">Açılış: {dateLabel(item.openedAt)}</p>
                  {item.note && <p className="mt-2 break-words text-sm leading-5">{item.note}</p>}
                </div>
                <button
                  type="button"
                  disabled={busyRef !== null}
                  onClick={() => resolveFollowup(item.followupRef)}
                  className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 px-4 text-sm font-bold text-emerald-200 disabled:opacity-50 sm:w-auto"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {busyRef === item.followupRef ? 'Kapatılıyor…' : 'Takibi kapat'}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
