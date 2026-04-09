'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { useAuthStore } from '@/stores/auth-store'
import { refreshProfile } from '@/lib/hooks/use-auth'

const GAME_EMOJIS: Record<GameSlug, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

const GRADES = [
  { value: '9', label: '9. Sinif' },
  { value: '10', label: '10. Sinif' },
  { value: '11', label: '11. Sinif' },
  { value: '12', label: '12. Sinif' },
  { value: '13', label: 'Mezun' },
]

export function OnboardingOverlay() {
  const [step, setStep] = useState(0)
  const [grade, setGrade] = useState<string>('')
  const [selectedGame, setSelectedGame] = useState<GameSlug | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { profile } = useAuthStore()

  if (!profile || profile.onboarding_completed) return null

  const handleComplete = async () => {
    setSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_completed: true,
          ...(grade ? { grade } : {}),
        }),
      })
      await refreshProfile()
      router.push(selectedGame ? `/arena/${selectedGame}` : '/arena')
    } catch {
      // Hata olsa bile devam et
      router.push('/arena')
    }
    setSaving(false)
  }

  const steps = [
    // Adim 0: Hosgeldin + Video
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="text-5xl">🏛️</div>
      <h1 className="font-display text-3xl font-black tracking-tight">
        Bilge Arena'ya Hosgeldin!
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-[var(--text-sub)]">
        YKS'ye hazirlanmak artik oyun kadar eglenceli.
        Sorulari coz, XP kazan, liderboardda yuksel!
      </p>

      {/* Video placeholder — kullanici hazirladiktan sonra degistirilecek */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex aspect-video items-center justify-center">
          <div className="text-center">
            <div className="mb-2 text-4xl">🎮</div>
            <p className="text-xs font-bold text-[var(--text-sub)]">Tanitim Videosu</p>
            <p className="text-[10px] text-[var(--text-muted)]">Yakinda eklenecek</p>
          </div>
        </div>
      </div>

      <button
        onClick={() => setStep(1)}
        className="rounded-xl bg-[var(--focus)] px-8 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        Baslayalim →
      </button>
    </motion.div>,

    // Adim 1: Sinif secimi
    <motion.div
      key="grade"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="text-4xl">🎓</div>
      <h2 className="font-display text-2xl font-bold">Kacinci Sinifsin?</h2>
      <p className="text-sm text-[var(--text-sub)]">Sana uygun zorlukta sorular hazirlayalim.</p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {GRADES.map((g) => (
          <button
            key={g.value}
            onClick={() => setGrade(g.value)}
            className={`rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all ${
              grade === g.value
                ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus)] scale-105'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-sub)] hover:border-[var(--focus-light)]'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep(0)}
          className="rounded-lg px-5 py-2 text-xs font-medium text-[var(--text-sub)] hover:bg-[var(--surface)]"
        >
          ← Geri
        </button>
        <button
          onClick={() => setStep(2)}
          className="rounded-xl bg-[var(--focus)] px-6 py-2.5 text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95"
        >
          Devam →
        </button>
      </div>
    </motion.div>,

    // Adim 2: Oyun secimi
    <motion.div
      key="game"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="text-4xl">🎯</div>
      <h2 className="font-display text-2xl font-bold">Hangi Dersten Baslamak Istersin?</h2>
      <p className="text-sm text-[var(--text-sub)]">Istedigini sec, daha sonra hepsini oynayabilirsin.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {GAME_SLUGS.map((slug) => {
          const game = GAMES[slug]
          return (
            <button
              key={slug}
              onClick={() => setSelectedGame(slug)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
                selectedGame === slug
                  ? 'scale-105 shadow-lg'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--focus-light)]'
              }`}
              style={selectedGame === slug ? {
                borderColor: game.colorHex,
                backgroundColor: `${game.colorHex}15`,
              } : undefined}
            >
              <span className="text-3xl">{GAME_EMOJIS[slug]}</span>
              <span className="text-xs font-bold" style={selectedGame === slug ? { color: game.colorHex } : undefined}>
                {game.name}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className="rounded-lg px-5 py-2 text-xs font-medium text-[var(--text-sub)] hover:bg-[var(--surface)]"
        >
          ← Geri
        </button>
        <button
          onClick={handleComplete}
          disabled={saving}
          className="rounded-xl bg-[var(--focus)] px-8 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Hazirlaniyor...' : 'Hemen Oyna! 🚀'}
        </button>
      </div>
    </motion.div>,
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]/95 px-4 backdrop-blur-sm">
      {/* Progress dots */}
      <div className="absolute top-6 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === step ? 'w-8 bg-[var(--focus)]' : i < step ? 'w-2 bg-[var(--focus)]' : 'w-2 bg-[var(--border)]'
            }`}
          />
        ))}
      </div>

      {/* Skip button */}
      <button
        onClick={handleComplete}
        className="absolute right-4 top-4 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-sub)]"
      >
        Atla
      </button>

      <AnimatePresence mode="wait">
        {steps[step]}
      </AnimatePresence>
    </div>
  )
}
