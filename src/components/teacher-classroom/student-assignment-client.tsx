'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, CircleSlash2, RefreshCw, Send, XCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { renderRichText } from '@/lib/utils/rich-text'
import {
  fetchStudentTeacherAssignment,
  submitStudentTeacherAssignment,
} from '@/lib/teacher-classroom/client'
import type {
  StudentAssignmentSubmitInput,
  StudentTeacherAssignment,
} from '@/lib/teacher-classroom/server-contract'
import {
  assignmentStatusLabels,
  formatIstanbulDateTime,
} from '@/lib/teacher-classroom/view-utils'

const OPTION_LETTERS = 'ABCDEFGHIJ'.split('')

function ResultIcon({ value }: { value: boolean | null }) {
  if (value === true) return <CheckCircle2 className="h-5 w-5 text-[var(--growth)]" aria-hidden="true" />
  if (value === false) return <XCircle className="h-5 w-5 text-[var(--urgency)]" aria-hidden="true" />
  return <CircleSlash2 className="h-5 w-5 text-[var(--text-sub)]" aria-hidden="true" />
}

export function StudentAssignmentClient({ assignmentId }: { assignmentId: string }) {
  const { user, loading: authLoading } = useAuthStore()
  const [assignment, setAssignment] = useState<StudentTeacherAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selections, setSelections] = useState<Record<number, number | null>>({})
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)
  const pendingRef = useRef<{ fingerprint: string; requestId: string } | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    await Promise.resolve()
    if (signal?.aborted) return
    setLoading(true)
    setLoadFailed(false)
    try {
      setAssignment(await fetchStudentTeacherAssignment(assignmentId, signal))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setLoadFailed(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [assignmentId])

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal)
    })
    return () => controller.abort()
  }, [load, user])

  const answers = useMemo<StudentAssignmentSubmitInput['answers']>(() => (
    (assignment?.items ?? []).map((item) => ({
      position: item.position,
      selectedOption: Object.prototype.hasOwnProperty.call(selections, item.position)
        ? selections[item.position]
        : null,
    }))
  ), [assignment?.items, selections])
  const answeredCount = answers.filter((answer) => answer.selectedOption !== null).length

  const submit = async () => {
    if (!assignment || assignment.status !== 'active' || submitting) return
    const fingerprint = JSON.stringify(answers)
    const pending = pendingRef.current?.fingerprint === fingerprint
      ? pendingRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    pendingRef.current = pending
    setSubmitting(true)
    setSubmitFailed(false)
    try {
      const result = await submitStudentTeacherAssignment(assignment.id, {
        requestId: pending.requestId,
        answers,
      })
      setAssignment(result.assignment)
      setConfirming(false)
      pendingRef.current = null
    } catch {
      setSubmitFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || (user && loading)) {
    return <div role="status" className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">Ödevin yükleniyor...</div>
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-black">Ödev için giriş yap</h1>
        <Link href="/giris" className="btn-primary mt-5 inline-flex min-h-11 items-center rounded-xl px-6 text-sm font-bold">Giriş yap</Link>
      </div>
    )
  }
  if (loadFailed || !assignment) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">Ödev açılamadı</h1>
        <p role="alert" className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
          Ödev sana ait olmayabilir, sınıf paylaşımı durmuş olabilir veya geçici bir sorun oluşmuş olabilir.
        </p>
        <button type="button" onClick={() => void load()} className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
        </button>
      </div>
    )
  }

  const editable = assignment.status === 'active'
  const resultByPosition = new Map(
    (assignment.result?.items ?? []).map((item) => [item.position, item]),
  )

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 md:px-6 md:py-8">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
              {assignment.classroom.name} · {assignment.classroom.teacherAlias}
            </p>
            <h1 className="mt-1 text-2xl font-black">{assignment.title}</h1>
          </div>
          <Link
            href="/arena/sinif"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Sınıflarıma dön
          </Link>
        </div>
        <dl className="mt-4 grid gap-2 rounded-xl bg-[var(--surface)] p-4 text-sm sm:grid-cols-2">
          <div><dt className="font-bold">Durum</dt><dd>{assignmentStatusLabels[assignment.status]}</dd></div>
          <div><dt className="font-bold">Son teslim</dt><dd>{formatIstanbulDateTime(assignment.dueAt)}</dd></div>
        </dl>
        <p className="mt-4 text-sm leading-6 text-[var(--text-sub)]">
          Bu çalışma tek final teslimlidir. Öğretmenin hangi seçeneği işaretlediğini veya hangi soruyu yanlış yaptığını göremez;
          yalnız yanıtlanan ve doğru sayılarını görür. XP, coin, görev, seri ve sıralama puanı üretilmez.
        </p>
        {assignment.result && (
          <div role="status" className="mt-4 grid gap-2 rounded-xl border border-[var(--growth)]/30 bg-[var(--growth)]/5 p-4 sm:grid-cols-2">
            <div><span className="block text-[10px] font-bold text-[var(--text-sub)]">YANITLANAN</span><strong className="text-xl">{assignment.result.answeredCount}/{assignment.items.length}</strong></div>
            <div><span className="block text-[10px] font-bold text-[var(--text-sub)]">DOĞRU</span><strong className="text-xl">{assignment.result.correctCount}</strong></div>
          </div>
        )}
        {!editable && !assignment.result && (
          <p role="alert" className="mt-4 rounded-xl border border-[var(--urgency)]/30 bg-[var(--urgency)]/5 px-4 py-3 text-sm">
            Bu ödev artık teslime açık değil.
          </p>
        )}
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (editable) setConfirming(true)
        }}
        className="space-y-4"
      >
        {assignment.items.map((item) => {
          const selected = Object.prototype.hasOwnProperty.call(selections, item.position)
            ? selections[item.position]
            : null
          const result = resultByPosition.get(item.position)
          return (
            <fieldset
              key={item.position}
              disabled={!editable || submitting}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 disabled:opacity-90 md:p-6"
            >
              <legend className="px-1 text-xs font-black tracking-wide text-[var(--text-sub)]">SORU {item.position}</legend>
              {item.question.content.passage && (
                <p className="mb-3 whitespace-pre-line text-sm leading-6 text-[var(--text-sub)]">{renderRichText(item.question.content.passage)}</p>
              )}
              {item.question.content.context && (
                <p className="mb-3 whitespace-pre-line rounded-lg bg-[var(--surface)] px-3 py-2 text-sm leading-6">{renderRichText(item.question.content.context)}</p>
              )}
              <p className="whitespace-pre-line text-base font-bold leading-7">{renderRichText(item.question.content.question)}</p>

              {result && (
                <p className={`mt-3 inline-flex items-center gap-2 text-sm font-bold ${result.isCorrect === true ? 'text-[var(--growth)]' : result.isCorrect === false ? 'text-[var(--urgency)]' : 'text-[var(--text-sub)]'}`}>
                  <ResultIcon value={result.isCorrect} />
                  {result.isCorrect === true ? 'Doğru' : result.isCorrect === false ? 'Yanlış' : 'Boş bırakıldı'}
                  {' · '}Doğru cevap {OPTION_LETTERS[result.correctOption]}
                </p>
              )}

              <div className="mt-4 grid gap-2">
                {item.question.content.options.map((option, optionIndex) => {
                  const checked = editable ? selected === optionIndex : result?.selectedOption === optionIndex
                  return (
                    <label key={optionIndex} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-3 text-sm leading-6 has-[:checked]:border-[var(--focus)] has-[:checked]:bg-[var(--focus)]/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
                      <input
                        type="radio"
                        name={`teacher-assignment-${item.position}`}
                        value={optionIndex}
                        checked={checked}
                        onChange={() => {
                          pendingRef.current = null
                          setConfirming(false)
                          setSelections((current) => ({ ...current, [item.position]: optionIndex }))
                        }}
                        className="mt-1 h-5 w-5 shrink-0 accent-[var(--focus)]"
                      />
                      <span><strong className="mr-2">{OPTION_LETTERS[optionIndex]}.</strong>{renderRichText(option)}</span>
                    </label>
                  )
                })}
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--text-sub)] has-[:checked]:border-[var(--focus)] has-[:checked]:bg-[var(--focus)]/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
                  <input
                    type="radio"
                    name={`teacher-assignment-${item.position}`}
                    value="blank"
                    checked={editable ? selected === null : result?.selectedOption === null}
                    onChange={() => {
                      pendingRef.current = null
                      setConfirming(false)
                      setSelections((current) => ({ ...current, [item.position]: null }))
                    }}
                    className="h-5 w-5 shrink-0 accent-[var(--focus)]"
                  />
                  Boş bırak
                </label>
              </div>
            </fieldset>
          )
        })}

        {editable && (
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]/95 p-4 shadow-xl backdrop-blur md:bottom-4">
            {confirming ? (
              <div role="group" aria-label="Final ödev teslimini onayla">
                <p className="text-sm font-bold">Bu teslim finaldir ve daha sonra değiştirilemez.</p>
                <p className="mt-1 text-sm text-[var(--text-sub)]">{answeredCount}/{assignment.items.length} yanıt · {assignment.items.length - answeredCount} boş</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting}
                    className="btn-primary inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-sm font-black disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {submitting ? 'Teslim ediliyor...' : 'Final teslimi yap'}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="inline-flex min-h-12 items-center rounded-xl px-5 text-sm font-bold">
                    Cevaplara dön
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--text-sub)]"><strong className="text-[var(--text)]">{answeredCount}/{assignment.items.length}</strong> soru yanıtlandı</p>
                <button type="submit" className="btn-primary inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-sm font-black">
                  <Send className="h-4 w-4" aria-hidden="true" /> Teslimi gözden geçir
                </button>
              </div>
            )}
            {submitFailed && (
              <p role="alert" className="mt-3 text-sm text-[var(--urgency)]">
                Ödev teslim edilemedi. Aynı cevaplarla güvenle yeniden deneyebilirsin.
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
