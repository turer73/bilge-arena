'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'

type AppealStatus = 'submitted' | 'acknowledged' | 'investigating' | 'resolved' | 'rejected' | 'withdrawn'
type AppealAction = 'acknowledged' | 'investigating' | 'resolved' | 'rejected'
interface AppealItem {
  appealId: string
  questionId: string
  revisionId: string | null
  reasonCode: 'wrong_key' | 'ambiguous' | 'invalid_content' | 'outcome_mismatch' | 'other'
  description: string
  status: AppealStatus
  submittedAt: string
  ackDueAt: string
  resolveDueAt: string
  slaBreachedAt: string | null
  hasSessionEvidence: boolean
  evidenceKind?: 'legacy_report' | 'legacy_session' | 'current_revision' | 'issued_attempt' | 'verified_session'
  hasVerifiedEvidence?: boolean
  selectedOption?: number | null
  latestPublicMessage: string | null
  latestInternalNote: string | null
}
interface RevisionEvidence {
  revisionId: string
  content?: { question?: unknown; options?: unknown[]; answer?: unknown }
  validation?: { verdict?: string } | null
  psychometrics?: Array<{ sampleN: number; pCorrect: number | null; wilsonLow: number | null; wilsonHigh: number | null; eligibilityPolicy?: string }>
  appealSignals?: { openCount: number; verifiedOpenCount: number }
}

function evidenceLabel(item: AppealItem): string {
  if (item.evidenceKind === 'verified_session') return 'Doğrulanmış tamamlanmış oturum kanıtı'
  if (item.evidenceKind === 'issued_attempt') return 'Doğrulanmış soru sunumu kanıtı'
  if (item.evidenceKind === 'legacy_report' || item.evidenceKind === 'legacy_session') {
    return 'Eski bildirim · revizyon kanıtı sınırlı'
  }
  if (item.evidenceKind === 'current_revision') return 'Bildirilen andaki yayın revizyonu'
  return item.hasSessionEvidence ? 'Doğrulanmış oturum kanıtı var' : 'Genel soru bildirimi'
}

const reasonLabel: Record<AppealItem['reasonCode'], string> = {
  wrong_key: 'Yanlış cevap anahtarı', ambiguous: 'Belirsiz soru', invalid_content: 'Geçersiz içerik',
  outcome_mismatch: 'Kazanım uyumsuzluğu', other: 'Diğer',
}
const statusLabel: Record<AppealStatus, string> = {
  submitted: 'Yeni', acknowledged: 'Alındı', investigating: 'İnceleniyor', resolved: 'Çözüldü', rejected: 'Reddedildi', withdrawn: 'Geri çekildi',
}

export function ContentAppealsPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [items, setItems] = useState<AppealItem[]>([])
  const [filter, setFilter] = useState<AppealStatus | ''>('')
  const [active, setActive] = useState<AppealItem | null>(null)
  const [evidence, setEvidence] = useState<RevisionEvidence | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [action, setAction] = useState<AppealAction>('acknowledged')
  const [publicMessage, setPublicMessage] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const evidenceRequestId = useRef(0)

  const loadQueue = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (filter) params.set('status', filter)
      const response = await fetch(`/api/admin/content-quality/appeals?${params}`, { cache: 'no-store' })
      if (response.status === 403 || response.status === 503) { setEnabled(false); return }
      setEnabled(true)
      if (!response.ok) throw new Error('İtiraz kuyruğu alınamadı')
      const data = await response.json()
      setItems(data.items ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'İtiraz kuyruğu alınamadı')
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { const timer = window.setTimeout(() => void loadQueue(), 0); return () => window.clearTimeout(timer) }, [loadQueue])

  const open = async (item: AppealItem) => {
    const requestId = ++evidenceRequestId.current
    setActive(item)
    setEvidence(null)
    setAction(item.status === 'submitted' ? 'acknowledged' : 'investigating')
    setPublicMessage(item.latestPublicMessage ?? '')
    setInternalNote(item.latestInternalNote ?? '')
    setError('')
    if (!item.revisionId) {
      setEvidenceLoading(false)
      return
    }
    setEvidenceLoading(true)
    try {
      const response = await fetch(`/api/admin/content-quality?revisionId=${encodeURIComponent(item.revisionId)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Revizyon kanıtı alınamadı')
      const data = await response.json()
      if (requestId === evidenceRequestId.current) setEvidence(data.revision ?? null)
    } catch (cause) {
      if (requestId === evidenceRequestId.current) {
        setError(cause instanceof Error ? cause.message : 'Revizyon kanıtı alınamadı')
      }
    } finally {
      if (requestId === evidenceRequestId.current) setEvidenceLoading(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!active || !publicMessage.trim()) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/content-quality/appeals/${active.appealId}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action, publicMessage: publicMessage.trim(), internalNote: internalNote.trim(), requestId: crypto.randomUUID() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'İtiraz kararı kaydedilemedi')
      evidenceRequestId.current += 1
      setActive(null); setEvidence(null); setEvidenceLoading(false); setPublicMessage(''); setInternalNote('')
      await loadQueue()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'İtiraz kararı kaydedilemedi')
    } finally { setBusy(false) }
  }

  if (enabled === false) return null
  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4" aria-labelledby="appeals-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="appeals-title" className="text-lg font-black">Soru İtirazları</h2>
          <p className="mt-1 text-xs text-[var(--text-sub)]">Öğrenci kimliği gösterilmez; soru kanıtı, SLA ve karar geçmişi üzerinden inceleme yapılır.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-[var(--text-sub)]">Durum
            <select value={filter} onChange={(event) => setFilter(event.target.value as AppealStatus | '')} className="ml-2 min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3">
              <option value="">Tümü</option>
              {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button onClick={() => void loadQueue()} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-xs font-bold">Yenile</button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] p-3 text-xs text-[var(--urgency)]">{error}</p>}
      {loading ? <p className="mt-4 text-sm text-[var(--text-sub)]">Yükleniyor…</p> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1.15fr)]">
          <div className="space-y-2" aria-label="İtiraz kuyruğu">
            {items.map((item) => <button key={item.appealId} onClick={() => void open(item)} className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
              <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold"><span>{reasonLabel[item.reasonCode]}</span><span>{statusLabel[item.status]}</span></span>
              <span className="mt-1 block text-xs text-[var(--text-sub)]">{item.description || 'Açıklama eklenmedi.'}</span>
              <span className="mt-2 block text-[10px] text-[var(--text-sub)]">{evidenceLabel(item)} · çözüm {new Date(item.resolveDueAt).toLocaleString('tr-TR')}</span>
              {item.slaBreachedAt && <span className="mt-1 block text-[10px] font-bold text-[var(--urgency)]">SLA aşıldı</span>}
            </button>)}
            {items.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-sub)]">Bu filtrede itiraz yok.</p>}
          </div>
          <div className="min-w-0 rounded-lg border border-[var(--border)] p-4">
            {!active ? <p className="text-xs text-[var(--text-sub)]">İncelemek ve karar kaydetmek için bir itiraz seçin.</p> : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-[var(--text-sub)]">{reasonLabel[active.reasonCode]} · {statusLabel[active.status]}</p>
                  <p className="mt-1 break-words text-sm">{active.description || 'Açıklama eklenmedi.'}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-sub)]">Soru: {active.questionId}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-sub)]">Revizyon: {active.revisionId ?? 'kanıtsız eski kayıt'}</p>
                  {active.selectedOption !== undefined && active.selectedOption !== null && <p className="mt-1 text-xs text-[var(--text-sub)]">Öğrencinin seçimi: {active.selectedOption + 1}. seçenek</p>}
                </div>
                {evidenceLoading && <p className="rounded-lg border border-[var(--border)] p-3 text-xs text-[var(--text-sub)]">Revizyon kanıtı yükleniyor…</p>}
                {evidence && <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3" aria-label="Revizyon karar kanıtı">
                  <p className="text-xs font-bold">{typeof evidence.content?.question === 'string' ? evidence.content.question : 'Soru metni kullanılamıyor'}</p>
                  {Array.isArray(evidence.content?.options) && <ol className="space-y-1 text-xs text-[var(--text-sub)]">
                    {evidence.content.options.map((option, index) => <li key={index} className={evidence.content?.answer === index ? 'font-bold text-[var(--growth)]' : ''}>{index + 1}. {typeof option === 'string' ? option : 'Geçersiz seçenek'}{evidence.content?.answer === index ? ' · cevap anahtarı' : ''}</li>)}
                  </ol>}
                  <p className="text-[10px] text-[var(--text-sub)]">LLM doğrulaması: {evidence.validation?.verdict ?? 'yok'} · açık sinyal: {evidence.appealSignals?.openCount ?? 0} ({evidence.appealSignals?.verifiedOpenCount ?? 0} doğrulanmış)</p>
                  {evidence.psychometrics?.[0] && <p className="text-[10px] text-[var(--text-sub)]">Psikometri: n={evidence.psychometrics[0].sampleN}, p={evidence.psychometrics[0].pCorrect ?? '—'}, Wilson {evidence.psychometrics[0].wilsonLow ?? '—'}–{evidence.psychometrics[0].wilsonHigh ?? '—'} · {evidence.psychometrics[0].eligibilityPolicy ?? 'eski politika'}</p>}
                </div>}
                <label className="block text-xs font-bold">Yeni durum<select value={action} onChange={(event) => setAction(event.target.value as AppealAction)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3"><option value="acknowledged">Alındı</option><option value="investigating">İnceleniyor</option><option value="resolved">Çözüldü</option><option value="rejected">Reddedildi</option></select></label>
                <label className="block text-xs font-bold">Öğrenciye mesaj<textarea required maxLength={1000} value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-normal" /></label>
                <label className="block text-xs font-bold">İç not <span className="font-normal text-[var(--text-sub)]">(özel)</span><textarea maxLength={2000} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-normal" /></label>
                <div className="flex flex-wrap gap-2"><button disabled={busy || !publicMessage.trim()} className="min-h-11 rounded-lg bg-[var(--focus)] px-4 text-xs font-bold text-white disabled:opacity-50">Kararı kaydet</button><button type="button" onClick={() => { evidenceRequestId.current += 1; setActive(null); setEvidence(null); setEvidenceLoading(false) }} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-xs font-bold">Kapat</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
