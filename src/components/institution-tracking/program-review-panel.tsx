'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, SearchCheck } from 'lucide-react'
import {
  fetchInstitutionStudentProgramHistory,
  previewInstitutionStudyProgramReview,
  reviewInstitutionStudyProgram,
} from '@/lib/institution-tracking/client'
import type { InstitutionProgramReviewEvidence, InstitutionStudentProgramHistory } from '@/lib/institution-tracking/program-review'

const resultCopy = {
  effective: 'Etkili', partial: 'Kısmen etkili', ineffective: 'Etkili değil', insufficient: 'Kanıt yetersiz',
} as const
type ResultCode = keyof typeof resultCopy

export function ProgramReviewPanel({ classroomId, memberRef }: { classroomId: string; memberRef: string }) {
  const [history, setHistory] = useState<InstitutionStudentProgramHistory | null>(null)
  const [previewRef, setPreviewRef] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<InstitutionProgramReviewEvidence | null>(null)
  const [teacherResult, setTeacherResult] = useState<ResultCode>('insufficient')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(async () => {
      setError(null); setPreviewRef(null); setEvidence(null)
      try { setHistory(await fetchInstitutionStudentProgramHistory(classroomId, memberRef, controller.signal)) }
      catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError('Program geçmişi alınamadı.')
      }
    })
    return () => controller.abort()
  }, [classroomId, memberRef])

  async function openPreview(programRef: string) {
    setBusy(true); setError(null)
    try {
      const next = await previewInstitutionStudyProgramReview(programRef)
      setPreviewRef(programRef); setEvidence(next); setTeacherResult(next.systemSuggestion); setNote('')
    } catch { setError('Değerlendirme kanıtı alınamadı.') }
    finally { setBusy(false) }
  }

  async function saveReview() {
    if (!previewRef || !evidence) return
    setBusy(true); setError(null)
    try {
      const review = await reviewInstitutionStudyProgram(previewRef, { teacherResult, note: note.trim() || null })
      setHistory((current) => ({ programs: (current?.programs ?? []).map((program) => program.programRef === previewRef
        ? { ...program, status: 'completed' as const, reviewEligible: true, review: {
          reviewRef: review.reviewRef, teacherResult: review.teacherResult,
          systemSuggestion: review.systemSuggestion, evidence: review.evidence,
          note: review.note, reviewedAt: review.reviewedAt,
        } } : program) }))
      setPreviewRef(null); setEvidence(null); setNote('')
    } catch { setError('Program değerlendirmesi kaydedilemedi.') }
    finally { setBusy(false) }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-black"><SearchCheck className="h-5 w-5 text-[var(--primary)]" /> Program sonuçları</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Yayınlanan program tek başına başarı sayılmaz. Hedef kazanımlardaki önce/sonra kanıtını inceleyip nihai değerlendirmeyi öğretmen kaydeder.</p>
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
      <div className="mt-4 space-y-2">
        {history && history.programs.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-3 text-sm text-[var(--text-sub)]">Değerlendirilebilecek yayınlanmış program yok.</p>}
        {history?.programs.map((program) => (
          <article key={program.programRef} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-black">{program.weekStart} haftası</p><p className="mt-1 text-xs text-[var(--text-sub)]">{program.itemCount} görev · {program.review ? 'Değerlendirildi' : program.reviewEligible ? 'Kanıt penceresi hazır' : 'Kanıt penceresi olgunlaşıyor'}</p></div>
              {!program.review && program.reviewEligible && <button type="button" disabled={busy} onClick={() => openPreview(program.programRef)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold disabled:opacity-50 sm:w-auto"><ClipboardCheck className="h-4 w-4" /> Kanıtı incele</button>}
            </div>
            {program.review && <div className="mt-3 rounded-lg bg-emerald-400/5 p-3 text-sm"><strong>{resultCopy[program.review.teacherResult]}</strong><span className="ml-2 text-xs text-[var(--text-sub)]">Sistem önerisi: {resultCopy[program.review.systemSuggestion]}</span>{program.review.note && <p className="mt-2 break-words">{program.review.note}</p>}</div>}
            {previewRef === program.programRef && evidence && <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span className="rounded-lg bg-white/5 p-2">Hedef <strong className="block text-base">{evidence.targetedOutcomeCount}</strong></span><span className="rounded-lg bg-white/5 p-2">Ölçülen <strong className="block text-base">{evidence.assessedOutcomeCount}</strong></span><span className="rounded-lg bg-white/5 p-2">Gelişen <strong className="block text-base">{evidence.improvedOutcomeCount}</strong></span><span className="rounded-lg bg-white/5 p-2">Yetersiz <strong className="block text-base">{evidence.insufficientOutcomeCount}</strong></span></div>
              <p className="text-xs text-[var(--text-sub)]">Sistem önerisi: <strong className="text-[var(--text)]">{resultCopy[evidence.systemSuggestion]}</strong>. Bu öneri öğretmen kararının yerine geçmez.</p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-start">
                <label className="text-xs font-bold text-[var(--text-sub)]">Öğretmen değerlendirmesi<select value={teacherResult} onChange={(event) => setTeacherResult(event.target.value as ResultCode)} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[var(--surface)] px-3 text-sm text-[var(--text)]">{Object.entries(resultCopy).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-xs font-bold text-[var(--text-sub)]">Kısa not (isteğe bağlı)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-white/15 bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]" /></label>
                <button type="button" disabled={busy} onClick={saveReview} className="btn-primary min-h-11 w-full rounded-xl px-4 text-sm font-bold disabled:opacity-50 sm:mt-5 sm:w-auto">{busy ? 'Kaydediliyor…' : 'Değerlendirmeyi kaydet'}</button>
              </div>
            </div>}
          </article>
        ))}
      </div>
    </section>
  )
}
