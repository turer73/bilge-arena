'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCategoryLabel, GAMES, type GameSlug } from '@/lib/constants/games'

interface Submission {
  id: string
  game: GameSlug
  category: string
  difficulty: number
  content: { question: string; options: string[]; answer: number; solution?: string }
  status: string
  created_at: string
  profiles: { username: string | null; display_name: string | null } | null
}

interface OutcomeOption { id: string; code: string; title: string; category: string }
const scopeKey = (submission: Pick<Submission, 'game' | 'category'>) => `${submission.game}:${submission.category}`

/**
 * UGC moderasyon kuyruğu — pending gönderimleri listeler; onayla → questions'a
 * source='ugc', is_active=false kopyalanır (aktivasyon /admin/sorular'da).
 */
export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [governanceMode, setGovernanceMode] = useState(false)
  const [outcomesByScope, setOutcomesByScope] = useState<Record<string, OutcomeOption[]>>({})
  const [selectedOutcomes, setSelectedOutcomes] = useState<Record<string, string>>({})

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/submissions?status=pending')
      if (!res.ok) {
        setError('Gönderimler alınamadı')
        return
      }
      const data = await res.json()
      setSubmissions(data.submissions ?? [])
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchSubmissions(), 0)
    return () => window.clearTimeout(timer)
  }, [fetchSubmissions])

  useEffect(() => {
    const scopes = Array.from(new Map(submissions.map((submission) => [scopeKey(submission), submission])).values())
    if (scopes.length === 0) return
    let cancelled = false
    Promise.all(scopes.map(async (submission) => {
      const params = new URLSearchParams({ game: submission.game, category: submission.category })
      const response = await fetch(`/api/admin/content-quality/outcomes?${params}`)
      const data = response.ok ? await response.json() : { outcomes: [] }
      return { key: scopeKey(submission), status: response.status, outcomes: (data.outcomes ?? []) as OutcomeOption[] }
    })).then((results) => {
      if (cancelled) return
      const enabled = results.some((result) => result.status !== 503)
      setGovernanceMode(enabled)
      if (enabled) setOutcomesByScope(Object.fromEntries(results.map((result) => [result.key, result.outcomes])))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [submissions])

  const review = async (id: string, action: 'approve' | 'reject') => {
    const outcomeId = selectedOutcomes[id]
    if (action === 'approve' && governanceMode && !outcomeId) {
      setError('Onaylamadan önce birincil kazanım seçin.')
      return
    }
    const note = action === 'reject'
      ? window.prompt('Red gerekçesi (gönderene gösterilebilir):') ?? undefined
      : undefined
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note, ...(outcomeId ? { outcomeId } : {}) }),
      })
      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id))
      } else {
        const data = await res.json()
        setError(data.error ?? 'İşlem başarısız')
      }
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-xl font-black text-[var(--text)]">📥 Soru Gönderimleri</h1>
      <p className="mt-1 text-sm text-[var(--text-sub)]">
        {governanceMode
          ? <>Onaylanan gönderi bir kazanıma bağlanarak <strong>yönetişim taslağına</strong> alınır; iki bağımsız kontrolden önce yayınlanmaz.</>
          : <>Onaylanan gönderi <strong>pasif</strong> soru olarak havuza eklenir — yayına alma Sorular sayfasındaki kalite kontrolünden geçer.</>}
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-sm text-[var(--urgency)]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--text-sub)]">Yükleniyor…</p>
      ) : submissions.length === 0 ? (
        <p className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-center text-sm text-[var(--text-sub)]">
          Bekleyen gönderim yok 🎉
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {submissions.map((s) => (
            <div key={s.id} className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-sub)]">
                <span className="rounded bg-[var(--surface)] px-2 py-0.5 font-bold">{GAMES[s.game]?.name ?? s.game}</span>
                <span>{getCategoryLabel(s.category)}</span>
                <span>Zorluk {s.difficulty}</span>
                <span>· {s.profiles?.display_name || s.profiles?.username || 'bilinmiyor'}</span>
                <span>· {new Date(s.created_at).toLocaleString('tr-TR')}</span>
              </div>

              <p className="mt-2 text-sm font-semibold text-[var(--text)]">{s.content.question}</p>
              <ol className="mt-2 flex flex-col gap-1 text-sm">
                {s.content.options.map((o, i) => (
                  <li
                    key={i}
                    className={i === s.content.answer
                      ? 'font-bold text-[var(--growth)]'
                      : 'text-[var(--text-sub)]'}
                  >
                    {String.fromCharCode(65 + i)}) {o} {i === s.content.answer && '✓'}
                  </li>
                ))}
              </ol>
              {s.content.solution && (
                <p className="mt-2 text-xs text-[var(--text-sub)]">📌 {s.content.solution}</p>
              )}

              {governanceMode && (
                <label className="mt-3 block max-w-xl text-xs font-bold text-[var(--text-sub)]">
                  BİRİNCİL KAZANIM
                  <select
                    value={selectedOutcomes[s.id] ?? ''}
                    onChange={(event) => setSelectedOutcomes((current) => ({ ...current, [s.id]: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
                  >
                    <option value="">Kazanım seçin…</option>
                    {(outcomesByScope[scopeKey(s)] ?? []).map((outcome) => (
                      <option key={outcome.id} value={outcome.id}>{outcome.code} — {outcome.title}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => review(s.id, 'approve')}
                  disabled={busyId === s.id || (governanceMode && !selectedOutcomes[s.id])}
                  className="min-h-11 rounded-lg bg-[var(--growth)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  {governanceMode ? 'Taslağa al' : 'Onayla (pasif ekle)'}
                </button>
                <button
                  onClick={() => review(s.id, 'reject')}
                  disabled={busyId === s.id}
                  className="min-h-11 rounded-lg bg-[var(--urgency)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  Reddet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
