'use client'

import { useCallback, useEffect, useState } from 'react'

interface QueueItem { revisionId: string; questionId: string; status: string; createdAt: string }
interface RevisionDetail {
  revisionId: string
  questionId: string
  revisionNo: number
  status: string
  changeKind?: string
  summary?: string
  content?: { question?: string; options?: string[]; answer?: number; solution?: string }
  metadata?: { game?: string; category?: string; difficulty?: number; topic?: string }
  source?: { kind?: string; title?: string; licenseCode?: string; attribution?: string }
  outcomes?: Array<{ outcomeId: string; weight: number; primary: boolean }>
  approvals?: Array<{ stage: number; decision: string; decidedAt: string }>
  psychometrics?: Array<{ windowStart: string; windowEnd: string; sampleN: number; correctN: number; pCorrect: number | null; wilsonLow: number | null; wilsonHigh: number | null; discrimination: number | null; materializedAt: string }>
  incidents?: Array<{ incidentId: string; erroneousRevisionId: string; correctedRevisionId: string; errorType: 'wrong_key' | 'ambiguous' | 'invalid_content' | 'outcome_mismatch'; status: string; eligibleCount: number; changedCount: number; manualRequiredCount: number; createdAt: string; closedAt: string | null }>
}

const statusLabel: Record<string, string> = {
  draft: 'Taslak', stage1_approved: '1. aşama onaylı', stage2_approved: '2. aşama onaylı',
  published: 'Yayında', rejected: 'Reddedildi', superseded: 'Eski revizyon',
}

export function ContentGovernancePanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [detail, setDetail] = useState<RevisionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [incidentType, setIncidentType] = useState<'wrong_key' | 'ambiguous' | 'invalid_content' | 'outcome_mismatch'>('wrong_key')

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/content-quality?limit=50', { cache: 'no-store' })
      if (response.status === 503) { setEnabled(false); return }
      setEnabled(true)
      if (!response.ok) throw new Error('Yönetişim kuyruğu alınamadı')
      const data = await response.json()
      setItems(data.items ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Yönetişim kuyruğu alınamadı')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => void loadQueue(), 0); return () => window.clearTimeout(timer) }, [loadQueue])

  const openRevision = async (revisionId: string) => {
    setError('')
    const response = await fetch(`/api/admin/content-quality?revisionId=${encodeURIComponent(revisionId)}`, { cache: 'no-store' })
    if (!response.ok) { setError('Revizyon ayrıntısı alınamadı'); return }
    const data = await response.json()
    setDetail(data.revision ?? null)
  }

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true); setError('')
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'İşlem tamamlanamadı')
      setDetail(null)
      await loadQueue()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı')
    } finally { setBusy(false) }
  }

  const review = async (stage: 1 | 2, decision: 'approved' | 'rejected') => {
    if (!detail) return
    const rationale = window.prompt(decision === 'approved' ? 'Onay gerekçesi:' : 'Red gerekçesi:')?.trim()
    if (!rationale) return
    await post(`/api/admin/content-quality/revisions/${detail.revisionId}/review`, { stage, decision, rationale, requestId: crypto.randomUUID() })
  }

  const refreshPsychometrics = async () => {
    if (!detail) return
    setBusy(true); setError('')
    try {
      const windowEnd = new Date(); windowEnd.setUTCHours(0, 0, 0, 0)
      const windowStart = new Date(windowEnd); windowStart.setUTCDate(windowStart.getUTCDate() - 30)
      const response = await fetch(`/api/admin/content-quality/revisions/${detail.revisionId}/psychometrics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), requestId: crypto.randomUUID() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Psikometri yenilenemedi')
      await openRevision(detail.revisionId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Psikometri yenilenemedi')
    } finally { setBusy(false) }
  }

  const createIncident = async () => {
    if (!detail) return
    setBusy(true); setError('')
    try {
      const publishedResponse = await fetch(`/api/admin/content-quality?questionId=${encodeURIComponent(detail.questionId)}`, { cache: 'no-store' })
      const publishedData = await publishedResponse.json().catch(() => ({}))
      if (!publishedResponse.ok) throw new Error(publishedData.error ?? 'Yayındaki düzeltme revizyonu alınamadı')
      const correctedRevisionId = publishedData.revision?.revisionId
      if (!correctedRevisionId || correctedRevisionId === detail.revisionId) throw new Error('Önce düzeltilmiş revizyon iki aşamalı olarak yayınlanmalı')
      const response = await fetch('/api/admin/content-quality/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: detail.questionId, revisionId: detail.revisionId, correctedRevisionId, errorType: incidentType, requestId: crypto.randomUUID() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Düzeltme olayı oluşturulamadı')
      await openRevision(detail.revisionId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Düzeltme olayı oluşturulamadı')
    } finally { setBusy(false) }
  }

  const applyIncident = async (incidentId: string) => {
    if (!detail) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/content-quality/incidents/${incidentId}/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Sonuç düzeltmeleri uygulanamadı')
      await openRevision(detail.revisionId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sonuç düzeltmeleri uygulanamadı')
    } finally { setBusy(false) }
  }

  if (enabled === false) return null
  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4" aria-labelledby="governance-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="governance-title" className="text-lg font-black">İçerik Yönetişimi</h2>
          <p className="mt-1 text-xs text-[var(--text-sub)]">Taslak, iki bağımsız kontrol ve yayın sırası. Doğrudan içerik değişikliği yapılmaz.</p>
        </div>
        <button onClick={() => void loadQueue()} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-xs font-bold">Yenile</button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] p-3 text-xs text-[var(--urgency)]">{error}</p>}
      {loading ? <p className="mt-4 text-sm text-[var(--text-sub)]">Yükleniyor…</p> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1.2fr)]">
          <div className="space-y-2" aria-label="Revizyon kuyruğu">
            {items.map((item) => (
              <button key={item.revisionId} onClick={() => void openRevision(item.revisionId)} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
                <span className="block text-xs font-bold">{statusLabel[item.status] ?? item.status}</span>
                <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-sub)]">{item.revisionId}</span>
                <span className="mt-1 block text-[10px] text-[var(--text-sub)]">{new Date(item.createdAt).toLocaleString('tr-TR')}</span>
              </button>
            ))}
            {items.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-sub)]">Bekleyen revizyon yok.</p>}
          </div>
          <div className="min-w-0 rounded-lg border border-[var(--border)] p-4">
            {!detail ? <p className="text-xs text-[var(--text-sub)]">Kanıtları ve karar geçmişini görmek için bir revizyon seçin.</p> : (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sub)]">Revizyon {detail.revisionNo} · {statusLabel[detail.status] ?? detail.status}</p>
                  <h3 className="mt-1 text-sm font-bold">{detail.content?.question ?? 'Soru metni yok'}</h3>
                  {detail.summary && <p className="mt-1 text-xs text-[var(--text-sub)]">{detail.summary}</p>}
                </div>
                <ol className="space-y-1 text-xs">
                  {(detail.content?.options ?? []).map((option, index) => <li key={index} className={index === detail.content?.answer ? 'font-bold text-[var(--growth)]' : ''}>{String.fromCharCode(65 + index)}) {option}</li>)}
                </ol>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="font-bold text-[var(--text-sub)]">Kaynak / lisans</dt><dd>{detail.source?.title ?? '—'} · {detail.source?.licenseCode ?? '—'}</dd></div>
                  <div><dt className="font-bold text-[var(--text-sub)]">Kapsam</dt><dd>{detail.metadata?.game} / {detail.metadata?.category} / zorluk {detail.metadata?.difficulty}</dd></div>
                  <div><dt className="font-bold text-[var(--text-sub)]">Kazanım kanıtı</dt><dd>{detail.outcomes?.length ?? 0} eşleme · {(detail.outcomes ?? []).filter((outcome) => outcome.primary).length} birincil</dd></div>
                  <div><dt className="font-bold text-[var(--text-sub)]">Kararlar</dt><dd>{detail.approvals?.map((approval) => `${approval.stage}. aşama ${approval.decision}`).join(' · ') || 'Henüz yok'}</dd></div>
                  <div><dt className="font-bold text-[var(--text-sub)]">Son 30 gün psikometri</dt><dd>{detail.psychometrics?.[0] ? `n=${detail.psychometrics[0].sampleN} · başarı ${detail.psychometrics[0].pCorrect === null ? '—' : `%${Math.round(detail.psychometrics[0].pCorrect * 100)}`} · ayırıcılık ${detail.psychometrics[0].discrimination === null ? 'n<30 / hesaplanamadı' : detail.psychometrics[0].discrimination.toFixed(2)}` : 'Henüz hesaplanmadı'}</dd></div>
                </dl>
                {(detail.incidents?.length ?? 0) > 0 && <div className="space-y-2 rounded-lg border border-[var(--border)] p-3" aria-label="Sonuç düzeltme etkileri">
                  <p className="text-xs font-bold">Sonuç düzeltme etkileri</p>
                  {detail.incidents?.map((incident) => <div key={incident.incidentId} className="rounded-lg bg-[var(--surface)] p-3 text-xs">
                    <p className="font-bold">{incident.errorType} · {incident.status}</p>
                    <p className="mt-1 text-[var(--text-sub)]">Uygun {incident.eligibleCount} · düzeltildi {incident.changedCount} · manuel inceleme {incident.manualRequiredCount}</p>
                    {incident.status === 'open' && incident.errorType === 'wrong_key' && <button disabled={busy} onClick={() => void applyIncident(incident.incidentId)} className="mt-2 min-h-11 rounded-lg bg-[var(--urgency)] px-4 text-xs font-bold text-white disabled:opacity-50">Append-only düzeltmeleri uygula</button>}
                  </div>)}
                </div>}
                {detail.status === 'superseded' && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] p-3">
                  <label className="text-xs font-bold">Kanıtlı hata türü<select value={incidentType} onChange={(event) => setIncidentType(event.target.value as typeof incidentType)} className="ml-2 min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3"><option value="wrong_key">Yanlış anahtar</option><option value="ambiguous">Belirsiz</option><option value="invalid_content">Geçersiz içerik</option><option value="outcome_mismatch">Kazanım uyumsuzluğu</option></select></label>
                  <button disabled={busy} onClick={() => void createIncident()} className="min-h-11 rounded-lg bg-[var(--urgency)] px-4 text-xs font-bold text-white disabled:opacity-50">Etki önizlemesi oluştur</button>
                </div>}
                <div className="flex flex-wrap gap-2">
                  {detail.status === 'draft' && <><button disabled={busy} onClick={() => void review(1, 'approved')} className="min-h-11 rounded-lg bg-[var(--focus)] px-4 text-xs font-bold text-white disabled:opacity-50">1. aşama onayla</button><button disabled={busy} onClick={() => void review(1, 'rejected')} className="min-h-11 rounded-lg border border-[var(--urgency)] px-4 text-xs font-bold text-[var(--urgency)]">Reddet</button></>}
                  {detail.status === 'stage1_approved' && <><button disabled={busy} onClick={() => void review(2, 'approved')} className="min-h-11 rounded-lg bg-[var(--focus)] px-4 text-xs font-bold text-white disabled:opacity-50">2. aşama onayla</button><button disabled={busy} onClick={() => void review(2, 'rejected')} className="min-h-11 rounded-lg border border-[var(--urgency)] px-4 text-xs font-bold text-[var(--urgency)]">Reddet</button></>}
                  {detail.status === 'stage2_approved' && <button disabled={busy} onClick={() => void post(`/api/admin/content-quality/revisions/${detail.revisionId}/publish`, { requestId: crypto.randomUUID() })} className="min-h-11 rounded-lg bg-[var(--growth)] px-4 text-xs font-bold text-white disabled:opacity-50">Yayınla</button>}
                  <button disabled={busy} onClick={() => void refreshPsychometrics()} className="min-h-11 rounded-lg border border-[var(--focus)] px-4 text-xs font-bold text-[var(--focus)] disabled:opacity-50">Psikometriyi yenile</button>
                  <button onClick={() => setDetail(null)} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-xs font-bold">Kapat</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
