'use client'

import { useCallback, useEffect, useState } from 'react'
import { GAMES } from '@/lib/constants/games'
import { stripRichText } from '@/lib/utils/rich-text'
import { ContentGovernancePanel } from '@/components/admin/content-governance-panel'
import { ValidationVerdictPanel } from '@/components/admin/validation-verdict-panel'
import { ContentAppealsPanel } from '@/components/admin/content-appeals-panel'

// #378 Tier 2: gercek cevap verisinden dusuk-basarili ("production drift")
// sorulari + bekleyen kullanici raporlarini tek triage kuyrugunda gosterir.

interface QualityItem {
  id: string
  game: string
  category: string
  subcategory: string | null
  difficulty: number
  is_active: boolean
  question_text: string
  times_answered: number
  times_correct: number
  success_rate: number
  pending_reports: number
}

const MIN_ANSWERED_OPTIONS = [10, 20, 50, 100]
const MAX_RATE_OPTIONS = [30, 40, 50, 60]

export default function AdminQuestionQualityPage() {
  const [items, setItems] = useState<QualityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [capped, setCapped] = useState(false)
  const [minAnswered, setMinAnswered] = useState(20)
  const [maxRate, setMaxRate] = useState(50)
  const [mutationError, setMutationError] = useState('')

  const fetchQueue = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        minAnswered: String(minAnswered),
        maxRate: String(maxRate),
      })
      const res = await fetch(`/api/admin/question-quality?${params}`, { signal })
      if (!res.ok) throw new Error('Kuyruk yuklenemedi')
      const data = await res.json()
      setItems(data.questions ?? [])
      setCapped(!!data.capped)
    } catch (err) {
      // P2d fix (Codex PR#242): iptal edilen (bayat-filtre) isteği yoksay — eski
      // yanıt yeniyi ezmesin. Sadece güncel istek state'i güncelleyebilir.
      if ((err as Error)?.name === 'AbortError') return
      console.error('Soru kalite kuyrugu hatasi:', err)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [minAnswered, maxRate])

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => void fetchQueue(ctrl.signal), 0)
    return () => { window.clearTimeout(timer); ctrl.abort() }
  }, [fetchQueue])

  const toggleActive = async (id: string, current: boolean) => {
    setMutationError('')
    try {
      if (current) {
        const quarantine = await fetch(`/api/admin/content-quality/questions/${id}/quarantine`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Kalite kuyruğundan acil görünürlük kapatma', requestId: crypto.randomUUID() }),
        })
        if (quarantine.ok) {
          setItems((prev) => prev.map((question) => question.id === id ? { ...question, is_active: false } : question))
          return
        }
        if (quarantine.status !== 503) {
          const body = await quarantine.json().catch(() => ({}))
          throw new Error(body.error ?? 'Soru karantinaya alınamadı')
        }
      }
      const res = await fetch('/api/questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: id, updates: { is_active: !current } }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.code === 'CONTENT_GOVERNANCE_REQUIRED'
          ? 'Pasif soru yalnız onaylı bir revizyon yayınlanarak etkinleştirilebilir.'
          : (body.error ?? 'Durum güncellenemedi'))
      }
      setItems((prev) => prev.map((question) => question.id === id ? { ...question, is_active: !current } : question))
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : 'Durum güncellenemedi')
    }
  }

  const rateColor = (pct: number) =>
    pct >= 50 ? 'var(--reward)' : pct >= 35 ? 'var(--urgency)' : '#DC2626'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Soru Kalitesi</h1>
        <p className="text-sm text-[var(--text-sub)]">
          Dusuk basarili (production drift) sorular + bekleyen raporlar. Yanlis
          isaretlenmis cevap veya anlasilmaz soru tespiti icin.
        </p>
      </div>

      <ValidationVerdictPanel />
      <ContentGovernancePanel />
      <ContentAppealsPanel />

      {mutationError && <p role="alert" className="mb-4 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-xs text-[var(--urgency)]">{mutationError}</p>}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[var(--text-sub)]">
          Min. oynanma
          <select
            value={minAnswered}
            onChange={(e) => setMinAnswered(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
          >
            {MIN_ANSWERED_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}+</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-sub)]">
          Max. basari
          <select
            value={maxRate}
            onChange={(e) => setMaxRate(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
          >
            {MAX_RATE_OPTIONS.map((n) => (
              <option key={n} value={n}>%{n}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-[var(--text-sub)]">{items.length} soru</span>
      </div>

      {capped && (
        <div className="mb-3 rounded-lg border border-[var(--reward-border)] bg-[var(--reward-bg)] px-3 py-2 text-[11px] text-[var(--reward)]">
          Aday havuzu 500 ile sinirli (en cok oynanan oncelikli). Daha az oynanan
          drift sorular kapsam disi kalmis olabilir — esikleri daraltarak inceleyin.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--border)]" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="px-4 py-3 font-bold text-[var(--text-sub)]">Soru</th>
                  <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Oyun</th>
                  <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Oynanma</th>
                  <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Basari</th>
                  <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-center">Rapor</th>
                  <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-center">Durum</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)] transition-colors">
                    <td className="max-w-[320px] truncate px-4 py-3">
                      <div className="font-medium">{stripRichText(q.question_text)}</div>
                      <div className="mt-0.5 text-[10px] text-[var(--text-sub)]">
                        {q.category}{q.subcategory ? ` / ${q.subcategory}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {GAMES[q.game as keyof typeof GAMES] && (
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${GAMES[q.game as keyof typeof GAMES].colorHex} 12%, transparent)`,
                            color: GAMES[q.game as keyof typeof GAMES].colorHex,
                          }}
                        >
                          {GAMES[q.game as keyof typeof GAMES].name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{q.times_answered}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-bold" style={{ color: rateColor(q.success_rate) }}>
                        %{q.success_rate}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {q.pending_reports > 0 ? (
                        <span className="rounded-full bg-[var(--urgency-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--urgency)]">
                          {q.pending_reports} 🐛
                        </span>
                      ) : (
                        <span className="text-[var(--text-sub)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleActive(q.id, q.is_active)}
                        className={`min-h-11 rounded-full px-3 py-1 text-[10px] font-bold transition-colors ${
                          q.is_active
                            ? 'bg-[var(--growth-bg)] text-[var(--growth)]'
                            : 'bg-[var(--surface)] text-[var(--text-sub)]'
                        }`}
                        title={q.is_active ? 'Pasiflestir' : 'Aktiflestir'}
                      >
                        {q.is_active ? 'Aktif' : 'Pasif'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--text-sub)]">
            Bu esiklerde drift soru yok — kalite iyi gorunuyor.
          </div>
        )}
      </div>
    </div>
  )
}
