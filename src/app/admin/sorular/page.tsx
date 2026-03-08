'use client'

import { useState } from 'react'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import type { Question, Difficulty } from '@/types/database'

// Mock soru verisi
const MOCK_QUESTIONS: Question[] = [
  { id: 'q1', game: 'matematik', category: 'problemler', sub_category: 'Isci-Havuz', difficulty: 2, content: { question: 'Bir isi Ahmet 6 gunde, Mehmet 12 gunde bitirebiliyor. Birlikte kac gunde?', options: ['3', '4', '5', '6'], answer: 1, solution: '1/6+1/12=1/4' }, is_active: true, play_count: 142, success_rate: 68, created_at: '2024-01-15' },
  { id: 'q2', game: 'turkce', category: 'paragraf', sub_category: 'Anlam', difficulty: 3, content: { question: 'Asagidaki cumlelerden hangisinde nesnel yargi vardir?', options: ['A', 'B', 'C', 'D'], answer: 2, solution: 'Nesnel yargi...' }, is_active: true, play_count: 98, success_rate: 54, created_at: '2024-01-16' },
  { id: 'q3', game: 'fen', category: 'fizik', sub_category: 'Kuvvet', difficulty: 2, content: { question: 'F=m.a formulune gore 5kg kutle 20N kuvvet → ivme?', options: ['2', '4', '10', '25'], answer: 1, solution: 'a=F/m=4' }, is_active: true, play_count: 210, success_rate: 72, created_at: '2024-01-14' },
  { id: 'q4', game: 'sosyal', category: 'tarih', sub_category: 'Selcuklu', difficulty: 2, content: { question: 'Malazgirt Savasi hangi yil?', options: ['1048', '1071', '1096', '1204'], answer: 1, solution: '1071' }, is_active: false, play_count: 56, success_rate: 81, created_at: '2024-01-17' },
  { id: 'q5', game: 'wordquest', category: 'vocabulary', sub_category: null, difficulty: 1, content: { question: 'What is the meaning of "abundant"?', options: ['Rare', 'Plentiful', 'Tiny', 'Fast'], answer: 1, solution: 'Abundant = bol, bereketli' }, is_active: true, play_count: 320, success_rate: 45, created_at: '2024-01-13' },
]

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState(MOCK_QUESTIONS)
  const [filterGame, setFilterGame] = useState<GameSlug | 'all'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')

  const filtered = questions.filter((q) => {
    if (filterGame !== 'all' && q.game !== filterGame) return false
    if (filterActive === 'active' && !q.is_active) return false
    if (filterActive === 'inactive' && q.is_active) return false
    if (search && !q.content.question.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleActive = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, is_active: !q.is_active } : q))
    )
  }

  const difficultyLabel = (d: Difficulty) => {
    const labels = { 1: 'Kolay', 2: 'Orta', 3: 'Zor', 4: 'Cok Zor', 5: 'Uzman' }
    return labels[d] || d
  }

  const difficultyColor = (d: Difficulty) => {
    const colors = { 1: 'var(--growth)', 2: 'var(--focus)', 3: 'var(--reward)', 4: 'var(--urgency)', 5: '#DC2626' }
    return colors[d] || 'var(--text-sub)'
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Soru Yonetimi</h1>
          <p className="text-sm text-[var(--text-sub)]">{questions.length} soru kayitli</p>
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
          onChange={(e) => setFilterGame(e.target.value as GameSlug | 'all')}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="all">Tum Oyunlar</option>
          {GAME_SLUGS.map((slug) => (
            <option key={slug} value={slug}>{GAMES[slug].name}</option>
          ))}
        </select>

        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
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
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${GAMES[q.game].colorHex} 12%, transparent)`,
                      color: GAMES[q.game].colorHex,
                    }}
                  >
                    {GAMES[q.game].name}
                  </span>
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

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--text-sub)]">
            Sonuc bulunamadi
          </div>
        )}
      </div>
    </div>
  )
}
