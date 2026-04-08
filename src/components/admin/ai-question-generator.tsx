'use client'

import { useState, useEffect } from 'react'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { toast } from '@/stores/toast-store'

interface GeneratedQuestion {
  question: string
  options: string[]
  answer: number
  solution: string
  topic?: string
}

/**
 * Admin paneli icin AI soru uretici + manuel soru ekleme.
 */
export function AIQuestionGenerator({ onGenerated }: { onGenerated?: () => void }) {
  // Ortak state
  const [game, setGame] = useState<GameSlug>('matematik')
  const [category, setCategory] = useState('')
  const [topic, setTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [difficulty, setDifficulty] = useState(3)
  const [topics, setTopics] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'ai' | 'manual'>('ai')

  // AI state
  const [count, setCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<GeneratedQuestion[]>([])

  // Manuel state
  const [manualQ, setManualQ] = useState('')
  const [manualOpts, setManualOpts] = useState(['', '', '', '', ''])
  const [manualAnswer, setManualAnswer] = useState(0)
  const [manualSolution, setManualSolution] = useState('')
  const [manualSaving, setManualSaving] = useState(false)

  const gameDef = GAMES[game]

  // Konu listesini cek
  useEffect(() => {
    if (!category) { setTopics([]); return }
    fetch(`/api/admin/generate-questions?game=${game}&category=${category}`)
      .then(r => r.ok ? r.json() : { topics: [] })
      .then(d => setTopics(d.topics || []))
      .catch(() => setTopics([]))
  }, [game, category])

  const effectiveTopic = topic === '__custom__' ? customTopic : topic

  // ── AI Uretim ──────────────────────────────────────
  const handleGenerate = async () => {
    if (!category) { toast.error('Kategori secin'); return }
    setLoading(true)
    setPreview([])

    try {
      const res = await fetch('/api/admin/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game, category, difficulty, count,
          ...(effectiveTopic ? { topic: effectiveTopic } : {}),
        }),
      })

      const data = await res.json()

      if (res.ok) {
        const dupMsg = data.duplicateCount > 0 ? ` (${data.duplicateCount} tekrar filtrelendi)` : ''
        toast.success(`${data.saved} soru pasif olarak kaydedildi${dupMsg}`)
        setPreview([])
        onGenerated?.()
      } else {
        toast.error(data.error || 'Uretim basarisiz')
      }
    } catch {
      toast.error('Bir hata olustu')
    }
    setLoading(false)
  }

  // ── Manuel Kaydet ──────────────────────────────────
  const handleManualSave = async () => {
    if (!category) { toast.error('Kategori secin'); return }
    if (!manualQ || manualQ.length < 10) { toast.error('Soru en az 10 karakter olmali'); return }
    if (manualOpts.some(o => !o.trim())) { toast.error('Tum secenekleri doldurun'); return }
    if (!manualSolution || manualSolution.length < 5) { toast.error('Cozum en az 5 karakter olmali'); return }

    setManualSaving(true)
    try {
      const res = await fetch('/api/admin/generate-questions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game, category, difficulty,
          topic: effectiveTopic || undefined,
          question: manualQ,
          options: manualOpts,
          answer: manualAnswer,
          solution: manualSolution,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Soru kaydedildi (aktif)')
        setManualQ('')
        setManualOpts(['', '', '', '', ''])
        setManualAnswer(0)
        setManualSolution('')
        onGenerated?.()
      } else {
        toast.error(data.error || 'Kayit basarisiz')
      }
    } catch {
      toast.error('Bir hata olustu')
    }
    setManualSaving(false)
  }

  return (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">Soru Ekle</span>
        <span className="text-xs text-[var(--text-sub)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-4">
          {/* Tab secici */}
          <div className="mb-4 flex gap-1 rounded-lg bg-[var(--surface)] p-1">
            <button
              onClick={() => setTab('ai')}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === 'ai' ? 'bg-[var(--focus)] text-white' : 'text-[var(--text-sub)] hover:text-[var(--text)]'
              }`}
            >
              AI ile Uret
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === 'manual' ? 'bg-[var(--focus)] text-white' : 'text-[var(--text-sub)] hover:text-[var(--text)]'
              }`}
            >
              Manuel Ekle
            </button>
          </div>

          {/* Ortak filtreler */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">OYUN</label>
              <select
                value={game}
                onChange={(e) => { setGame(e.target.value as GameSlug); setCategory(''); setTopic('') }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
              >
                {GAME_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>{GAMES[slug].name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">KATEGORI</label>
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setTopic('') }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
              >
                <option value="">Sec...</option>
                {gameDef.categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">KONU</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
              >
                <option value="">Tumu</option>
                {topics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__custom__">+ Yeni konu...</option>
              </select>
              {topic === '__custom__' && (
                <input
                  type="text"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Konu adini yaz..."
                  className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">ZORLUK</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
              >
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d} - {['Kolay', 'Orta', 'Zor', 'Cok Zor', 'Uzman'][d - 1]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── AI Tab ─────────────────────────────── */}
          {tab === 'ai' && (
            <>
              <div className="mt-3 flex items-center gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">ADET</label>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                  >
                    {[3, 5, 10].map((n) => (
                      <option key={n} value={n}>{n} soru</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={loading || !category}
                  className="mt-4 rounded-lg bg-[var(--focus)] px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {loading ? 'Uretiliyor...' : 'AI ile Uret'}
                </button>
              </div>

              <p className="mt-2 text-[10px] text-[var(--text-sub)]">
                Uretilenler pasif olarak kaydedilir. Soru listesinden aktif hale getirin.
              </p>

              {/* Onizleme */}
              {preview.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-xs font-bold text-[var(--text-sub)]">ONIZLEME ({preview.length} soru)</h4>
                  {preview.map((q, i) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium">{i + 1}. {q.question}</p>
                        {q.topic && (
                          <span className="shrink-0 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[9px] text-[var(--text-sub)]">
                            {q.topic}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        {q.options.map((opt, j) => (
                          <p
                            key={j}
                            className={`text-[11px] ${j === q.answer ? 'font-bold text-[var(--growth)]' : 'text-[var(--text-sub)]'}`}
                          >
                            {String.fromCharCode(65 + j)}) {opt} {j === q.answer && '✓'}
                          </p>
                        ))}
                      </div>
                      {q.solution && (
                        <p className="mt-1 text-[10px] text-[var(--text-sub)]">Cozum: {q.solution}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Manuel Tab ────────────────────────── */}
          {tab === 'manual' && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">SORU METNI</label>
                <textarea
                  value={manualQ}
                  onChange={(e) => setManualQ(e.target.value)}
                  placeholder="Soru metnini yazin..."
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-[var(--text-sub)]">SECENEKLER (dogru olani tiklayin)</label>
                {manualOpts.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setManualAnswer(i)}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                        manualAnswer === i
                          ? 'bg-[var(--growth)] text-white'
                          : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-sub)] hover:border-[var(--growth)]'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...manualOpts]
                        next[i] = e.target.value
                        setManualOpts(next)
                      }}
                      placeholder={`${String.fromCharCode(65 + i)} secenegi`}
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">COZUM ACIKLAMASI</label>
                <textarea
                  value={manualSolution}
                  onChange={(e) => setManualSolution(e.target.value)}
                  placeholder="Cozum aciklamasi..."
                  rows={2}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                />
              </div>

              <button
                onClick={handleManualSave}
                disabled={manualSaving || !category || !manualQ}
                className="rounded-lg bg-[var(--growth)] px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {manualSaving ? 'Kaydediliyor...' : 'Kaydet (Aktif)'}
              </button>
              <p className="text-[10px] text-[var(--text-sub)]">
                Manuel eklenen sorular dogrudan aktif olarak kaydedilir.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
