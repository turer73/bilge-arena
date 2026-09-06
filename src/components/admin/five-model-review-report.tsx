'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import type { FiveModelReport } from '@/lib/question-audit/five-model-report'

type Props = { questionId?: string; revisionId?: string }

const SLOT_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek', gemini: 'Gemini', terra: 'Terra', luna: 'Luna', sol: 'Sol',
}

const STATUS_LABEL: Record<string, string> = {
  complete: 'Tamamlandı', missing: 'Eksik kayıt', failed: 'Başarısız',
  invalid: 'Geçersiz', conflict: 'Çelişkili',
}

const MODEL_SLOTS = ['deepseek', 'gemini', 'terra', 'luna', 'sol'] as const
const MODEL_STATUSES = ['missing', 'failed', 'invalid', 'conflict', 'complete'] as const
const REVISION_LABEL: Record<string, string> = {
  draft: 'İnsan incelemesi bekliyor', stage1_approved: 'İkinci inceleme bekliyor',
  stage2_approved: 'Yayın onayı bekliyor', published: 'Yayınlanmış revizyon',
  rejected: 'Reddedildi', superseded: 'Önceki revizyon',
}
const reportSchema = z.object({
  questionId: z.string().uuid(), revisionId: z.string().uuid(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/), policyVersion: z.string().min(1).max(100),
  revisionStatus: z.enum(['draft', 'stage1_approved', 'stage2_approved', 'published', 'rejected', 'superseded']),
  questionText: z.string().min(1), options: z.array(z.string()).min(2).max(5),
  markedAnswerIndex: z.number().int().nonnegative(), completedModels: z.number().int().min(0).max(5),
  requiredModels: z.literal(5), agreement: z.enum(['incomplete', 'disagreement', 'unanimous']),
  matchesKey: z.boolean().nullable(), capped: z.boolean(), warnings: z.array(z.string()),
  models: z.array(z.object({
    slot: z.enum(MODEL_SLOTS), label: z.string(), status: z.enum(MODEL_STATUSES),
    providerId: z.string().nullable(), modelId: z.string().nullable(),
    executedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))).nullable(),
    answerIndex: z.number().int().nonnegative().nullable(), computedValue: z.string().nullable(),
    summary: z.string().nullable(), sampleCount: z.number().int().nonnegative(),
  }).strict()).length(5),
}).strict()

function isReport(value: unknown, questionId?: string, revisionId?: string): value is FiveModelReport {
  const parsed = reportSchema.safeParse(value)
  if (!parsed.success) return false
  const candidate = parsed.data
  if (questionId && candidate.questionId !== questionId) return false
  if (revisionId && candidate.revisionId !== revisionId) return false
  if (candidate.markedAnswerIndex >= candidate.options.length) return false
  const models = candidate.models
  const slots = models.map((model) => model.slot)
  if (new Set(slots).size !== 5 || !MODEL_SLOTS.every((slot) => slots.includes(slot))) return false
  if (models.some((model) => model.answerIndex !== null && model.answerIndex >= candidate.options.length)) return false
  const completed = models.filter((model) => model.status === 'complete')
  if (completed.some((model) => !model.providerId || !model.modelId || !model.executedAt || model.sampleCount < 1 || (model.answerIndex === null && !model.computedValue?.trim()))) return false
  const answers = new Set(completed.map((model) => model.answerIndex === null ? `value:${model.computedValue?.trim()}` : `index:${model.answerIndex}`))
  const agreement = candidate.capped || completed.length < 5 ? 'incomplete' : answers.size === 1 ? 'unanimous' : 'disagreement'
  const matchesKey = agreement === 'incomplete' ? null : agreement === 'unanimous' && completed[0]?.answerIndex === candidate.markedAnswerIndex
  return candidate.completedModels === completed.length && candidate.agreement === agreement && candidate.matchesKey === matchesKey
}

function statusLabel(status: string) { return STATUS_LABEL[status] ?? status }

export function FiveModelReviewReport({ questionId, revisionId }: Props) {
  const [result, setResult] = useState<{ key: string; report: FiveModelReport | null; error: string } | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const headingId = useId()
  const selectionKey = `${questionId ?? ''}:${revisionId ?? ''}`
  const current = result?.key === selectionKey ? result : null
  const report = current?.report ?? null
  const error = current?.error ?? ''
  const loading = Boolean(questionId || revisionId) && current === null

  useEffect(() => {
    requestRef.current?.abort()
    if (!questionId && !revisionId) return
    const controller = new AbortController()
    requestRef.current = controller
    const query = revisionId
      ? `revisionId=${encodeURIComponent(revisionId)}`
      : `questionId=${encodeURIComponent(questionId as string)}`
    void fetch(`/api/admin/content-quality/model-report?${query}`, {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
    }).then(async (response) => {
      if (controller.signal.aborted || requestRef.current !== controller) return
      if (!response.ok) throw new Error(response.status === 404 ? 'Bu seçim için kayıtlı beş model raporu yok.' : 'Beş model raporu alınamadı.')
      const body = await response.json() as unknown
      if (controller.signal.aborted || requestRef.current !== controller) return
      const next = body && typeof body === 'object' && 'report' in body ? (body as { report?: unknown }).report : undefined
      if (!isReport(next, questionId, revisionId)) throw new Error('Beş model raporu biçimi veya seçili kimliği geçersiz.')
      setResult({ key: selectionKey, report: next, error: '' })
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || requestRef.current !== controller) return
      setResult({ key: selectionKey, report: null, error: cause instanceof Error ? cause.message : 'Beş model raporu alınamadı.' })
    })
    return () => {
      controller.abort()
      if (requestRef.current === controller) requestRef.current = null
    }
  }, [questionId, revisionId, selectionKey])

  if (!questionId && !revisionId) return null
  const models = report?.models ?? []
  const required = report?.requiredModels ?? 5
  const completed = models.filter((model) => model.status === 'complete').length
  const title = revisionId ? 'Seçili revizyona ait rapor' : 'Güncel yayınlanmış revizyonun raporu'

  return (
    <section aria-labelledby={headingId} className="mt-3 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <h3 id={headingId} className="text-sm font-bold">İnsan onayı · Beş model raporu</h3>
      <p className="mt-1 text-xs text-[var(--text-sub)]">{title}. Bu, saklanmış tam revizyon kayıtlarının gözlemidir; yeni model çalıştırılmaz.</p>
      {loading && <p className="mt-3 text-xs text-[var(--text-sub)]" role="status">Rapor yükleniyor…</p>}
      {error && <p className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] p-2 text-xs text-[var(--urgency)]" role="alert">{error}</p>}
      {!loading && !error && !report && <p className="mt-3 text-xs text-[var(--text-sub)]">Bu seçim için kayıtlı rapor bulunamadı; eksik rapor tamamlanmış sayılmaz.</p>}
      {report && (
        <>
          <div className="mt-3 min-w-0 rounded-lg border border-[var(--border)] p-2 text-[11px] text-[var(--text-sub)]">
            <p className="font-bold text-[var(--text)]">Kanıt bağlamı</p>
            <p className="mt-1 break-words">{report.questionText}</p>
            <p className="mt-1 break-all">Soru: {report.questionId} · Revizyon: {report.revisionId}</p>
            <p className="mt-1 break-all">SHA-256: {report.contentSha256} · Politika: {report.policyVersion}</p>
            <p className="mt-1">İşaretli cevap: {report.markedAnswerIndex >= 0 && report.markedAnswerIndex < report.options.length ? `${String.fromCharCode(65 + report.markedAnswerIndex)}) ${report.options[report.markedAnswerIndex]}` : 'Kayıt yok'}</p>
          </div>
          <div className="mt-3 grid min-w-0 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="font-bold">Çözüm raporu gelen</span><br />{completed}/{required}</div>
            <div><span className="font-bold">Cevapların karşılaştırması</span><br />{report.agreement === 'unanimous' ? 'Aynı sonuç' : report.agreement === 'disagreement' ? 'Görüş ayrılığı' : 'Eksik'}</div>
            <div><span className="font-bold">İşaretli anahtarla eşleşme</span><br />{report.matchesKey === true ? 'Eşleşiyor' : report.matchesKey === false ? 'Eşleşmiyor' : 'Hesaplanamadı'}</div>
            <div><span className="font-bold">İnsan incelemesi / yayın</span><br />{REVISION_LABEL[report.revisionStatus]}</div>
          </div>
          <p className="mt-3 rounded-lg border border-[var(--reward-border)] bg-[var(--reward-bg)] p-2 text-xs">Model anlaşması doğruluk garantisi değildir ve insan onayı değildir. Mevcut iki aşamalı insan incelemesi ve yayın kapıları aynen korunur.</p>
          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
            {models.map((model) => (
              <article key={model.slot} className="min-w-0 rounded-lg border border-[var(--border)] p-2 text-xs">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold">{SLOT_LABEL[model.slot] ?? model.label ?? model.slot}</h4>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{statusLabel(model.status)}</span>
                </div>
                <dl className="mt-2 grid min-w-0 gap-1 text-[11px] text-[var(--text-sub)]">
                  <div><dt className="inline font-bold">Model:</dt> <dd className="inline break-all">{model.modelId ?? 'Kayıt yok'}</dd></div>
                  <div><dt className="inline font-bold">Zaman:</dt> <dd className="inline">{model.executedAt ? new Date(model.executedAt).toLocaleString('tr-TR') : 'Kayıt yok'}</dd></div>
                  {model.summary && <div><dt className="inline font-bold">Özet:</dt> <dd className="inline break-words">{model.summary}</dd></div>}
                  <div><dt className="inline font-bold">Cevap:</dt> <dd className="inline break-words">{model.answerIndex !== null && model.answerIndex >= 0 && model.answerIndex < report.options.length ? `${String.fromCharCode(65 + model.answerIndex)}) ${report.options[model.answerIndex]}` : model.status === 'complete' && model.computedValue ? 'Şıklarda karşılık yok — insan incelemesi gerekli' : 'Cevap kaydı yok'}</dd></div>
                  <div><dt className="inline font-bold">Hesaplanan değer:</dt> <dd className="inline break-words">{model.computedValue ?? 'Yok / kaydedilmemiş'}</dd></div>
                  <div><dt className="inline font-bold">Örnek sayısı:</dt> <dd className="inline">{model.sampleCount}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          {(report.warnings?.length ?? 0) > 0 && <div className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] p-2 text-xs" role="note"><p className="font-bold">Uyarılar</p><ul className="mt-1 list-disc pl-4">{report.warnings?.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
        </>
      )}
    </section>
  )
}
