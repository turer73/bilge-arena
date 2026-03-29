'use client'

import { useState } from 'react'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { toast } from '@/stores/toast-store'

interface GeneratedQuestion {
  question: string
  options: string[]
  answer: number
  solution: string
}

/**
 * Admin paneli icin AI soru uretici.
 * Gemini API kullanarak secilen oyun/kategori/zorluk icin soru uretir.
 */
export function AIQuestionGenerator({ onGenerated }: { onGenerated?: () => void }) {
  const [game, setGame] = useState<GameSlug>('matematik')
  const [category, setCategory] = useState('')
  const [difficulty, setDifficulty] = useState(3)
  const [count, setCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<GeneratedQuestion[]>([])
  const [open, setOpen] = useState(false)

  const gameDef = GAMES[game]

  const handleGenerate = async () => {
    if (!category) {
      toast.error('Kategori secin')
      return
    }

    setLoading(true)
    setPreview([])

    try {
      const res = await fetch('/api/admin/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, category, difficulty, count }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success(`${data.generated} soru uretildi ve kaydedildi (pasif)`)
        setPreview(data.questions || [])
        onGenerated?.()
      } else {
        toast.error(data.error || 'Uretim basarisiz')
      }
    } catch {
      toast.error('Bir hata olustu')
    }

    setLoading(false)
  }

  return (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold">AI Soru Uretici</span>
        <span className="text-xs text-[var(--muted)]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">OYUN</label>
              <select
                value={game}
                onChange={(e) => { setGame(e.target.value as GameSlug); setCategory('') }}
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
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
              >
                <option value="">Sec...</option>
                {gameDef.categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
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

            <div>
              <label className="mb-1 block text-[10px] font-bold text-[var(--text-sub)]">ADET</label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
              >
                {[3, 5, 10].map((n) => (
                  <option key={n} value={n}>{n} soru</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !category}
            className="mt-4 rounded-lg bg-[var(--focus)] px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Uretiliyor...' : 'AI ile Uret'}
          </button>

          <p className="mt-2 text-[10px] text-[var(--muted)]">
            Uretilenler pasif olarak kaydedilir. Soru listesinden aktif hale getirin.
          </p>

          {/* Onizleme */}
          {preview.length > 0 && (
            <div className="mt-4 space-y-3">
              <h4 className="text-xs font-bold text-[var(--text-sub)]">ONIZLEME ({preview.length} soru)</h4>
              {preview.map((q, i) => (
                <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <p className="text-xs font-medium">{i + 1}. {q.question}</p>
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
                    <p className="mt-1 text-[10px] text-[var(--muted)]">Cozum: {q.solution}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
