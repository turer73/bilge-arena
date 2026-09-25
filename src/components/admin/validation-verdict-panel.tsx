'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert } from 'lucide-react'
import { findingLabel } from '@/lib/question-audit/presentation'
import { GAMES, getCategoryLabel, type GameSlug } from '@/lib/constants/games'
import { AdminRecordId } from './admin-record-id'
import { FiveModelReviewReport } from './five-model-review-report'

/**
 * Otomatik dogrulama verdict'ine gore soru listesi.
 *
 * NEDEN AYRI EKSEN: governance kuyrugu EDITORYAL duruma gore filtreliyor
 * (draft/stage1_approved/published...). Bu panel OTOMATIK karara gore
 * filtreliyor. Bir soru editoryal olarak `published` iken otomatik denetimde
 * NEEDS_REVIEW olabilir; iki eksen birbirinin yerine gecmez.
 */

type Verdict = 'NEEDS_REVIEW' | 'REJECTED' | 'INCONCLUSIVE' | 'APPROVED'

interface Item {
  questionId: string
  verdict: Verdict
  game: string | null
  category: string | null
  isActive: boolean | null
  findingCodes: string[]
  findings: Array<{ code: string; evidence: string; optionIndexes?: number[] }>
  rationale: string
  blindAgreementRatio: number | null
  decidedAt: string
}

const VERDICT_LABEL: Record<Verdict, string> = {
  NEEDS_REVIEW: 'Gözden geçirilecek',
  REJECTED: 'Yayın engeli',
  INCONCLUSIVE: 'Kontrol tekrarlanmalı',
  APPROVED: 'Otomatik kontrol geçti',
}

const VERDICT_HINT: Record<Verdict, string> = {
  NEEDS_REVIEW: 'Bulgu var ama tek başına yayını engellemiyor; insan kararı gerekiyor.',
  REJECTED: 'İki bağımsız ajan aynı kusurda birleşti; yayın engelli.',
  INCONCLUSIVE: 'Ajan(lar) çalışmadı — içerik kusuru DEĞİL, koşu tekrarlanmalı.',
  APPROVED: 'Bilinen kusur sınıflarından temiz. "Kanıtlandı" anlamına gelmez.',
}

const PAGE_SIZE = 50

export function ValidationVerdictPanel() {
  const [verdict, setVerdict] = useState<Verdict>('NEEDS_REVIEW')
  const [activeOnly, setActiveOnly] = useState<'all' | 'true' | 'false'>('all')
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [policyVersion, setPolicyVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ verdict, limit: String(PAGE_SIZE), offset: String(offset) })
      if (activeOnly !== 'all') params.set('activeOnly', activeOnly)
      const res = await fetch(`/api/admin/content-quality/validation?${params}`, { signal })
      if (res.status === 503) { setError('Içerik yönetişimi kapalı (CONTENT_GOVERNANCE_ENABLED).'); setItems([]); setTotal(0); return }
      if (!res.ok) { setError('Doğrulama verisi alınamadı.'); setItems([]); setTotal(0); return }
      const body = await res.json()
      setItems(body.items ?? [])
      setTotal(body.total ?? 0)
      setPolicyVersion(body.policyVersion ?? '')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Doğrulama verisi alınamadı.')
    } finally {
      setLoading(false)
    }
  }, [verdict, activeOnly, offset])

  useEffect(() => {
    const ctrl = new AbortController()
    void load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
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
    window.addEventListener('keydown', onKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open])

  const policyNumber = policyVersion.match(/@(\d+)$/)?.[1]
  const selectedItem = items.find((item) => item.questionId === open)

  return (
    <section aria-labelledby="dogrulama-basligi" className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 id="dogrulama-basligi" className="text-sm font-bold">Otomatik doğrulama</h2>
      <p className="mt-1 text-xs text-[var(--text-sub)]">{VERDICT_HINT[verdict]}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[var(--text-sub)]">
          Sonuç
          <select
            value={verdict}
            onChange={(e) => { setOpen(null); setVerdict(e.target.value as Verdict); setOffset(0) }}
            className="min-h-[44px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
          >
            {(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => (
              <option key={v} value={v}>{VERDICT_LABEL[v]}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-[var(--text-sub)]">
          Durum
          <select
            value={activeOnly}
            onChange={(e) => { setOpen(null); setActiveOnly(e.target.value as 'all' | 'true' | 'false'); setOffset(0) }}
            className="min-h-[44px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
          >
            <option value="all">Hepsi</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif / karantina</option>
          </select>
        </label>

        <span className="text-xs text-[var(--text-sub)]">
          {loading ? 'Yükleniyor…' : items.length > 0 ? `${offset + 1}-${offset + items.length} / ${total} soru` : `${total} soru`}
          {policyVersion && <span title={policyVersion}> · {policyNumber ? `Denetim kuralı sürüm ${policyNumber}` : 'Denetim kuralı'}</span>}
        </span>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-xs text-[var(--urgency)]">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="mt-3 text-xs text-[var(--text-sub)]">
          Bu sonuçta soru yok. Otomatik denetim hiç çalıştırılmadıysa liste boş görünür.
        </p>
      )}

      {items.length > 0 && (
        <>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
            <li key={item.questionId} className="rounded-lg border border-[var(--border)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{item.category ? getCategoryLabel(item.category) : '—'}</span>
                <span className="text-[var(--text-sub)]">{item.game ? GAMES[item.game as GameSlug]?.name ?? item.game : '—'}</span>
                {item.isActive === false && (
                  <span className="rounded-full border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-2 py-0.5 text-[var(--urgency)]">pasif</span>
                )}
                {item.blindAgreementRatio !== null && (
                  <span className="text-[var(--text-sub)]">mutabakat %{Math.round(item.blindAgreementRatio * 100)}</span>
                )}
                {item.findingCodes.map((code, i) => (
                  <span key={`${code}-${i}`} title={`Bulgu kodu: ${code}`} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1"><CircleAlert aria-hidden="true" className="h-4 w-4 text-[var(--reward)]" /><span>{findingLabel(code)}</span></span>
                ))}
                <button
                  type="button"
                  onClick={() => setOpen(item.questionId)}
                  aria-haspopup="dialog"
                  className="ml-auto min-h-[44px] rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--focus)]"
                >
                  Kanıtı göster
                </button>
              </div>

            </li>
            ))}
          </ul>
          <nav aria-label="Doğrulama sonuçları sayfaları" className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading || offset === 0}
              onClick={() => { setOpen(null); setOffset((current) => Math.max(0, current - PAGE_SIZE)) }}
              className="min-h-[44px] rounded-lg border border-[var(--border)] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Önceki
            </button>
            <button
              type="button"
              disabled={loading || offset + items.length >= total}
              onClick={() => { setOpen(null); setOffset((current) => current + PAGE_SIZE) }}
              className="min-h-[44px] rounded-lg border border-[var(--border)] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sonraki
            </button>
          </nav>
        </>
      )}
      {selectedItem && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(null) }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="validation-evidence-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="validation-evidence-title" className="text-xl font-bold">Soru kanıtı</h3>
                <AdminRecordId label="Soru" id={selectedItem.questionId} />
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setOpen(null)} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--focus)]">Kapat</button>
            </div>
            <p className="mt-4 text-sm text-[var(--text-sub)]">{selectedItem.rationale}</p>
            <div className="mt-4 space-y-3">
              {selectedItem.findings.map((finding, index) => (
                <div key={`${finding.code}-${index}`} className="rounded-lg bg-[var(--surface)] p-3">
                  <p className="flex items-center gap-2 text-sm font-bold"><CircleAlert aria-hidden="true" className="h-4 w-4 text-[var(--reward)]" />{findingLabel(finding.code)}</p>
                  <code className="text-xs text-[var(--text-sub)]">{finding.code}</code>
                  <p className="mt-2 text-sm text-[var(--text-sub)]">{finding.evidence}</p>
                </div>
              ))}
            </div>
            <FiveModelReviewReport questionId={selectedItem.questionId} />
          </div>
        </div>, document.body,
      )}
    </section>
  )
}
