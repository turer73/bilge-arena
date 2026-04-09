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
  { value: '9', label: '9. Sınıf' },
  { value: '10', label: '10. Sınıf' },
  { value: '11', label: '11. Sınıf' },
  { value: '12', label: '12. Sınıf' },
  { value: '13', label: 'Mezun' },
]

const FEATURES = [
  { icon: '🎮', label: '5 Ders', desc: 'Mat, Türkçe, Fen, Sosyal, İngilizce' },
  { icon: '⚡', label: 'XP Kazan', desc: 'Doğru cevapla puan topla' },
  { icon: '🔥', label: 'Seri Yap', desc: 'Üst üste doğrularla bonus' },
  { icon: '🏆', label: 'Liderboard', desc: 'Arkadaşlarınla yarış' },
  { icon: '⚔️', label: 'Düello', desc: 'Arkadaşına meydan oku' },
  { icon: '🎯', label: '3700+ Soru', desc: 'YKS müfredatına uygun' },
]

export function OnboardingOverlay() {
  const [step, setStep] = useState(0)
  const [grade, setGrade] = useState<string>('')
  const [selectedGame, setSelectedGame] = useState<GameSlug | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { profile } = useAuthStore()

  // Debug — canlıda kontrol sonrası kaldırılacak
  if (typeof window !== 'undefined') {
    console.log('[Onboarding] profile:', profile?.display_name, 'onboarding_completed:', profile?.onboarding_completed)
  }
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
      router.push('/arena')
    }
    setSaving(false)
  }

  const steps = [
    // Adım 0: Hoş geldin + animasyonlu tanıtım
    <motion.div
      key="welcome"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      {/* Logo animasyonu */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] shadow-2xl"
      >
        <span className="text-4xl">🏛️</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h1 className="font-display text-3xl font-black tracking-tight">
          Bilge Arena&apos;ya<br />
          <span className="bg-gradient-to-r from-[#2563EB] to-[#7C3AED] bg-clip-text text-transparent">
            Hoş Geldin!
          </span>
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-sub)]">
          YKS&apos;ye hazırlanmak artık oyun kadar eğlenceli.
        </p>
      </motion.div>

      {/* Özellik kartları — staggered animasyon */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.label}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 + i * 0.1, type: 'spring', stiffness: 300 }}
            className="flex flex-col items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5"
          >
            <span className="text-xl">{f.icon}</span>
            <span className="text-[9px] font-bold">{f.label}</span>
            <span className="text-[8px] text-[var(--text-muted)] leading-tight">{f.desc}</span>
          </motion.div>
        ))}
      </div>

      {/* Animasyonlu XP counter */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.5 }}
        className="flex items-center gap-3 rounded-full border border-[var(--reward)]/30 bg-[var(--reward)]/10 px-5 py-2"
      >
        <motion.span
          animate={{ rotate: [0, 15, -15, 0] }}
          transition={{ repeat: Infinity, duration: 2, delay: 2 }}
          className="text-lg"
        >
          ⚡
        </motion.span>
        <span className="text-sm font-bold text-[var(--reward)]">
          Hazır mısın?
        </span>
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        onClick={() => setStep(1)}
        className="rounded-xl bg-[var(--focus)] px-8 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        Başlayalım →
      </motion.button>
    </motion.div>,

    // Adım 1: Sınıf seçimi
    <motion.div
      key="grade"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring' }}
        className="text-4xl"
      >
        🎓
      </motion.div>
      <h2 className="font-display text-2xl font-bold">Kaçıncı Sınıfsın?</h2>
      <p className="text-sm text-[var(--text-sub)]">Sana uygun zorlukta sorular hazırlayalım.</p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {GRADES.map((g, i) => (
          <motion.button
            key={g.value}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            onClick={() => setGrade(g.value)}
            className={`rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all ${
              grade === g.value
                ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus)] scale-105'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-sub)] hover:border-[var(--focus-light)]'
            }`}
          >
            {g.label}
          </motion.button>
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

    // Adım 2: Oyun seçimi
    <motion.div
      key="game"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring' }}
        className="text-4xl"
      >
        🎯
      </motion.div>
      <h2 className="font-display text-2xl font-bold">Hangi Dersten Başlayalım?</h2>
      <p className="text-sm text-[var(--text-sub)]">İstediğini seç, sonra hepsini oynayabilirsin.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {GAME_SLUGS.map((slug, i) => {
          const game = GAMES[slug]
          return (
            <motion.button
              key={slug}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, type: 'spring' }}
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
              <motion.span
                className="text-3xl"
                animate={selectedGame === slug ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {GAME_EMOJIS[slug]}
              </motion.span>
              <span className="text-xs font-bold" style={selectedGame === slug ? { color: game.colorHex } : undefined}>
                {game.name}
              </span>
            </motion.button>
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
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleComplete}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-8 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
        >
          {saving ? 'Hazırlanıyor...' : 'Hemen Oyna! 🚀'}
        </motion.button>
      </div>
    </motion.div>,
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[var(--bg)]/80 px-4 py-8 backdrop-blur-md">
      {/* Progress dots */}
      <div className="absolute top-6 flex gap-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            layout
            className={`h-2 rounded-full ${
              i === step ? 'w-8 bg-[var(--focus)]' : i < step ? 'w-2 bg-[var(--focus)]' : 'w-2 bg-[var(--border)]'
            }`}
          />
        ))}
      </div>

      {/* Atla */}
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
