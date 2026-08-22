'use client'

import { useCallback, useEffect, useState } from 'react'

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

export function ValidationVerdictPanel() {
  const [verdict, setVerdict] = useState<Verdict>('NEEDS_REVIEW')
  const [activeOnly, setActiveOnly] = useState<'all' | 'true' | 'false'>('all')
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [policyVersion, setPolicyVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ verdict, limit: '50' })
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
  }, [verdict, activeOnly])

  useEffect(() => {
    const ctrl = new AbortController()
    void load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  return (
    <section aria-labelledby="dogrulama-basligi" className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 id="dogrulama-basligi" className="text-sm font-bold">Otomatik doğrulama</h2>
      <p className="mt-1 text-xs text-[var(--text-sub)]">{VERDICT_HINT[verdict]}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[var(--text-sub)]">
          Sonuç
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as Verdict)}
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
            onChange={(e) => setActiveOnly(e.target.value as 'all' | 'true' | 'false')}
            className="min-h-[44px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
          >
            <option value="all">Hepsi</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif / karantina</option>
          </select>
        </label>

        <span className="text-xs text-[var(--text-sub)]">
          {loading ? 'Yükleniyor…' : `${total} soru`}
          {policyVersion && ` · ${policyVersion}`}
        </span>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-xs text-[var(--urgency)]">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="mt-3 text-xs text-[var(--text-sub)]">
          Bu sonuçta soru yok. Otomatik denetim hiç çalıştırılmadıysa liste boş görünür.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.questionId} className="rounded-lg border border-[var(--border)] p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{item.category ?? '—'}</span>
                <span className="text-[var(--text-sub)]">{item.game ?? '—'}</span>
                {item.isActive === false && (
                  <span className="rounded-full border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-2 py-0.5 text-[var(--urgency)]">pasif</span>
                )}
                {item.blindAgreementRatio !== null && (
                  <span className="text-[var(--text-sub)]">mutabakat %{Math.round(item.blindAgreementRatio * 100)}</span>
                )}
                {item.findingCodes.map((code, i) => (
                  <span key={`${code}-${i}`} className="rounded-full border border-[var(--border)] px-2 py-0.5">{code}</span>
                ))}
                <button
                  type="button"
                  onClick={() => setOpen(open === item.questionId ? null : item.questionId)}
                  aria-expanded={open === item.questionId}
                  className="ml-auto min-h-[44px] rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--focus)]"
                >
                  {open === item.questionId ? 'Kanıtı gizle' : 'Kanıtı göster'}
                </button>
              </div>

              {open === item.questionId && (
                <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2">
                  <p className="text-[var(--text-sub)]">{item.rationale}</p>
                  {item.findings.map((f, i) => (
                    <div key={`${f.code}-${i}`}>
                      <p className="font-bold">{f.code}</p>
                      <p className="mt-0.5 text-[var(--text-sub)]">{f.evidence}</p>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
