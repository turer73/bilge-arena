'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { getCategoryLabel } from '@/lib/constants/games'

type FormState = 'idle' | 'sending' | 'sent' | 'error'

const inputCls =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--focus)]'

export function SubmitQuestionClient() {
  const { user } = useAuthStore()
  const [game, setGame] = useState<GameSlug>('matematik')
  const [category, setCategory] = useState(GAMES.matematik.categories[0])
  const [difficulty, setDifficulty] = useState(3)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [answer, setAnswer] = useState(0)
  const [solution, setSolution] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState('')

  if (!user) {
    return (
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-center">
        <p className="text-sm text-[var(--text-sub)]">
          Soru göndermek için giriş yapman gerekiyor.
        </p>
        <Link
          href="/giris?redirect=/arena/soru-gonder"
          className="mt-3 inline-block rounded-lg bg-[var(--focus)] px-5 py-2 text-sm font-bold text-white"
        >
          Giriş Yap
        </Link>
      </div>
    )
  }

  if (state === 'sent') {
    return (
      <div className="mt-6 rounded-xl border border-[var(--growth-border)] bg-[var(--growth-bg)] p-6 text-center">
        <p className="font-bold text-[var(--growth)]">✓ Sorun moderasyon kuyruğuna alındı!</p>
        <p className="mt-1 text-sm text-[var(--text-sub)]">
          Onaylanınca soru havuzuna eklenecek. Katkın için teşekkürler 💙
        </p>
        <button
          onClick={() => {
            setQuestion(''); setOptions(['', '', '', '']); setAnswer(0); setSolution(''); setState('idle')
          }}
          className="mt-3 rounded-lg bg-[var(--focus)] px-5 py-2 text-sm font-bold text-white"
        >
          Yeni Soru Gönder
        </button>
      </div>
    )
  }

  const updateOption = (i: number, v: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)))
  }

  const handleGameChange = (g: GameSlug) => {
    setGame(g)
    setCategory(GAMES[g].categories[0])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const res = await fetch('/api/questions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, category, difficulty, question, options, answer, solution }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Bir şeyler ters gitti')
        setState('error')
        return
      }
      setState('sent')
    } catch {
      setError('Bağlantı hatası — tekrar dene')
      setState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
          DERS
          <select value={game} onChange={(e) => handleGameChange(e.target.value as GameSlug)} className={inputCls}>
            {GAME_SLUGS.map((g) => (
              <option key={g} value={g}>{GAMES[g].name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
          KONU
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {GAMES[game].categories.map((c) => (
              <option key={c} value={c}>{getCategoryLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
          ZORLUK (1-5)
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className={inputCls}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
        SORU METNİ
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          minLength={10}
          maxLength={600}
          required
          placeholder="Soruyu buraya yaz…"
          className={inputCls}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-bold text-[var(--text-sub)]">
          ŞIKLAR — doğru olanı işaretle
        </legend>
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="answer"
              checked={answer === i}
              onChange={() => setAnswer(i)}
              aria-label={`Doğru cevap ${String.fromCharCode(65 + i)}`}
            />
            <span className="w-5 text-xs font-bold text-[var(--text-sub)]">{String.fromCharCode(65 + i)})</span>
            <input
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              maxLength={200}
              required
              placeholder={`${String.fromCharCode(65 + i)} şıkkı`}
              className={inputCls}
            />
          </div>
        ))}
        <div className="flex gap-2">
          {options.length < 5 && (
            <button type="button" onClick={() => setOptions((p) => [...p, ''])} className="text-xs text-[var(--focus)]">
              + 5. şık ekle
            </button>
          )}
          {options.length === 5 && (
            <button
              type="button"
              onClick={() => { setOptions((p) => p.slice(0, 4)); if (answer === 4) setAnswer(0) }}
              className="text-xs text-[var(--urgency)]"
            >
              − 5. şıkkı kaldır
            </button>
          )}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
        ÇÖZÜM AÇIKLAMASI (opsiyonel ama önerilir)
        <textarea
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          rows={2}
          maxLength={1200}
          placeholder="Doğru cevabın kısa açıklaması…"
          className={inputCls}
        />
      </label>

      {error && (
        <p className="rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-sm text-[var(--urgency)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === 'sending'}
        className="rounded-lg bg-[var(--focus)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--focus-light)] disabled:opacity-60"
      >
        {state === 'sending' ? 'Gönderiliyor…' : 'Moderasyona Gönder'}
      </button>
      <p className="text-[11px] text-[var(--text-sub)]">
        Saatte en fazla 10 gönderim. Telif içeren sorular (yayınevi/ÖSYM kopyası) reddedilir.
      </p>
    </form>
  )
}
