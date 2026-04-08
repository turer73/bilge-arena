'use client'

import { useCallback, useEffect, useState } from 'react'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { AIQuestionGenerator } from '@/components/admin/ai-question-generator'
import type { Question, Difficulty } from '@/types/database'

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterGame, setFilterGame] = useState<GameSlug | 'all'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // Edit modal state
  const [editQ, setEditQ] = useState<Question | null>(null)
  const [editContent, setEditContent] = useState({ question: '', options: ['', '', '', ''], answer: 0, solution: '' })
  const [editDifficulty, setEditDifficulty] = useState<Difficulty>(2)
  const [editCategory, setEditCategory] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (filterGame !== 'all') params.set('game', filterGame)
      if (filterActive === 'active') params.set('active', 'true')
      if (filterActive === 'inactive') params.set('active', 'false')
      if (search.length >= 2) params.set('search', search)

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
  }, [page, filterGame, filterActive, search])

  // Debounce arama — 500ms bekle
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  // Server-side arama — client filtreye gerek yok
  const filtered = questions

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

  const openEdit = (q: Question) => {
    setEditQ(q)
    setEditContent({
      question: q.content.question,
      options: [...q.content.options],
      answer: q.content.answer,
      solution: q.content.solution || '',
    })
    setEditDifficulty(q.difficulty)
    setEditCategory(q.category)
  }

  const saveEdit = async () => {
    if (!editQ) return
    setSaving(true)
    try {
      const updates = {
        content: {
          ...editQ.content,
          question: editContent.question,
          options: editContent.options,
          answer: editContent.answer,
          solution: editContent.solution || undefined,
        },
        difficulty: editDifficulty,
        category: editCategory,
      }
      const res = await fetch('/api/questions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: editQ.id, updates }),
      })
      if (res.ok) {
        setQuestions((prev) =>
          prev.map((q) => q.id === editQ.id ? { ...q, ...updates, content: updates.content } : q)
        )
        setEditQ(null)
      }
    } catch (err) {
      console.error('Soru kaydetme hatasi:', err)
    } finally {
      setSaving(false)
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

      {/* AI Soru Uretici */}
      <AIQuestionGenerator onGenerated={() => fetchQuestions()} />

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)] transition-colors">
                  <td className="max-w-[300px] truncate px-4 py-3">
                    <div className="font-medium">{q.content.question}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-sub)]">
                      {q.category}{q.subcategory ? ` / ${q.subcategory}` : ''}
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
                  <td className="px-3 py-3 text-right font-mono">{q.times_answered}</td>
                  <td className="px-3 py-3 text-right">
                    {(() => {
                      const pct = q.times_answered > 0 ? Math.round((q.times_correct / q.times_answered) * 100) : 0
                      return (
                        <span
                          className="font-bold"
                          style={{ color: pct >= 60 ? 'var(--growth)' : pct >= 40 ? 'var(--reward)' : 'var(--urgency)' }}
                        >
                          %{pct}
                        </span>
                      )
                    })()}
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
                  <td className="px-2 py-3">
                    <button
                      onClick={() => openEdit(q)}
                      className="rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus-bg)]"
                    >
                      Duzenle
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

      {/* Edit Modal */}
      {editQ && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Soru Duzenle</h2>
              <button onClick={() => setEditQ(null)} className="text-lg text-[var(--text-sub)] hover:text-[var(--text)]">
                ✕
              </button>
            </div>

            {/* Soru metni */}
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Soru</label>
            <textarea
              value={editContent.question}
              onChange={(e) => setEditContent(c => ({ ...c, question: e.target.value }))}
              rows={3}
              className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
            />

            {/* Secenekler */}
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Secenekler</label>
            {editContent.options.map((opt, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditContent(c => ({ ...c, answer: i }))}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    editContent.answer === i
                      ? 'bg-[var(--growth)] text-white'
                      : 'border border-[var(--border)] text-[var(--text-sub)]'
                  }`}
                  title={editContent.answer === i ? 'Dogru cevap' : 'Dogru olarak isaretle'}
                >
                  {'ABCDE'[i]}
                </button>
                <input
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...editContent.options]
                    newOpts[i] = e.target.value
                    setEditContent(c => ({ ...c, options: newOpts }))
                  }}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs focus:border-[var(--focus)] focus:outline-none"
                />
              </div>
            ))}

            {/* Cozum */}
            <label className="mb-1 mt-3 block text-[11px] font-bold text-[var(--text-sub)]">Cozum (opsiyonel)</label>
            <textarea
              value={editContent.solution}
              onChange={(e) => setEditContent(c => ({ ...c, solution: e.target.value }))}
              rows={2}
              className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
            />

            {/* Zorluk + Kategori */}
            <div className="mb-4 flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Zorluk</label>
                <select
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(Number(e.target.value) as Difficulty)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map(d => (
                    <option key={d} value={d}>{difficultyLabel(d as Difficulty)} ({d})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Kategori</label>
                <input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
                />
              </div>
            </div>

            {/* Butonlar */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditQ(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)]"
              >
                Iptal
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !editContent.question.trim()}
                className="rounded-lg bg-[var(--focus)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
