'use client'

import { useCallback, useEffect, useState } from 'react'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import type { Question, Difficulty } from '@/types/database'

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterGame, setFilterGame] = useState<GameSlug | 'all'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (filterGame !== 'all') params.set('game', filterGame)
      if (filterActive === 'active') params.set('active', 'true')
      if (filterActive === 'inactive') params.set('active', 'false')

      const res = await fetch(`/api/questions?${params}`)
      if (!res.ok) throw new Error('Sorular yuklenemedi')
      const data = await res.json()
      setQuestions(data.questions ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error('Soru yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }, [page, filterGame, filterActive])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  // Client-side arama filtresi (sunucudan gelen veriler uzerinde)
  const filtered = questions.filter((q) => {
    if (search && !q.content.question.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleActive = async (id: string) => {
    const question = questions.find((q) => q.id === id)
    if (!question) return

    // Iyimser guncelleme
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, is_active: !q.is_active } : q))
    )

    try {
      const res = await fetch('/api/questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: id, updates: { is_active: !question.is_active } }),
      })
      if (!res.ok) {
        // Basarisiz — geri al
        setQuestions((prev) =>
          prev.map((q) => (q.id === id ? { ...q, is_active: question.is_active } : q))
        )
      }
    } catch {
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, is_active: question.is_active } : q))
      )
    }
  }

  const difficultyLabel = (d: Difficulty) => {
    const labels: Record<number, string> = { 1: 'Kolay', 2: 'Orta', 3: 'Zor', 4: 'Cok Zor', 5: 'Uzman' }
    return labels[d] || String(d)
  }

  const difficultyColor = (d: Difficulty) => {
    const colors: Record<number, string> = { 1: 'var(--growth)', 2: 'var(--focus)', 3: 'var(--reward)', 4: 'var(--urgency)', 5: '#DC2626' }
    return colors[d] || 'var(--text-sub)'
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Soru Yonetimi</h1>
          <p className="text-sm text-[var(--text-sub)]">{total} soru kayitli</p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Soru ara..."
          className="w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        />

        <select
          value={filterGame}
          onChange={(e) => { setFilterGame(e.target.value as GameSlug | 'all'); setPage(1) }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="all">Tum Oyunlar</option>
          {GAME_SLUGS.map((slug) => (
            <option key={slug} value={slug}>{GAMES[slug].name}</option>
          ))}
        </select>

        <select
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value as 'all' | 'active' | 'inactive'); setPage(1) }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="all">Tum Durum</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>

        <span className="text-xs text-[var(--text-sub)]">{filtered.length} sonuc</span>
      </div>

      {/* Tablo */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--border)]" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="px-4 py-3 font-bold text-[var(--text-sub)]">Soru</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Oyun</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Zorluk</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Oynanma</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Basari</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-center">Durum</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)] transition-colors">
                  <td className="max-w-[300px] truncate px-4 py-3">
                    <div className="font-medium">{q.content.question}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-sub)]">
                      {q.category}{q.sub_category ? ` / ${q.sub_category}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {GAMES[q.game] && (
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${GAMES[q.game].colorHex} 12%, transparent)`,
                          color: GAMES[q.game].colorHex,
                        }}
                      >
                        {GAMES[q.game].name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-bold" style={{ color: difficultyColor(q.difficulty) }}>
                      {difficultyLabel(q.difficulty)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{q.play_count}</td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className="font-bold"
                      style={{ color: q.success_rate >= 60 ? 'var(--growth)' : q.success_rate >= 40 ? 'var(--reward)' : 'var(--urgency)' }}
                    >
                      %{q.success_rate}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleActive(q.id)}
                      className={`rounded-full px-3 py-1 text-[10px] font-bold transition-colors ${
                        q.is_active
                          ? 'bg-[var(--growth-bg)] text-[var(--growth)]'
                          : 'bg-[var(--surface)] text-[var(--text-sub)]'
                      }`}
                    >
                      {q.is_active ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--text-sub)]">
            Sonuc bulunamadi
          </div>
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            ← Onceki
          </button>
          <span className="text-xs text-[var(--text-sub)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            Sonraki →
          </button>
        </div>
      )}
    </div>
  )
}
