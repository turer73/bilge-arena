'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { useAuthStore } from '@/stores/auth-store'
import { calculateRank, RANK_CONFIG } from '@/lib/utils/xp'
import { getCategoryLabel } from '@/lib/constants/games'
import { ShareButtons } from '@/components/social/share-buttons'
import { trackEvent } from '@/lib/utils/plausible'
import { SignupPromptModal } from './signup-prompt-modal'
import { useGuestSession, computePromptLevel } from '@/lib/hooks/use-guest-session'

interface DenemeResultProps {
  gameName: string
  totalTime: number      // toplam sure (saniye)
  elapsedTime: number    // gecen sure (saniye)
  onRestart: () => void
  onExit: () => void
}

interface CategoryStat {
  category: string
  correct: number
  total: number
  pct: number
}

export function DenemeResult({ gameName, totalTime, elapsedTime, onRestart, onExit }: DenemeResultProps) {
  const { score, questions, xpEarned, answers } = useQuizStore()
  const { user } = useAuthStore()
  const { incrementQuizCount } = useGuestSession()
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptLevel, setPromptLevel] = useState<1 | 2 | 3>(1)
  const totalQuestions = questions.length
  const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0
  const rank = calculateRank(score, totalQuestions)
  const config = RANK_CONFIG[rank]
  const isGuest = !user

  // Deneme sinavi tamamlandiginda event
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    trackEvent('QuizComplete', {
      props: {
        mode: 'deneme',
        game: gameName,
        rank,
        pct,
        correct: score,
        total: totalQuestions,
        time_sec: elapsedTime,
        xp: xpEarned,
        isGuest,
      },
    })
  }, [isGuest, gameName, rank, pct, score, totalQuestions, elapsedTime, xpEarned])

  // Guest signup prompt escalation (Gun 2)
  const promptInitialized = useRef(false)
  useEffect(() => {
    if (promptInitialized.current) return
    if (!isGuest) return
    promptInitialized.current = true

    const nextCount = incrementQuizCount()
    setPromptLevel(computePromptLevel(nextCount))
    // Animasyonlar bitsin, modal sonra
    const timer = setTimeout(() => setPromptOpen(true), 1500)
    return () => clearTimeout(timer)
  }, [isGuest, incrementQuizCount])

  // Konu bazli analiz
  const categoryStats: CategoryStat[] = []
  const catMap = new Map<string, { correct: number; total: number }>()

  questions.forEach((q, i) => {
    const cat = (q.content as { category?: string })?.category || q.category || 'diger'
    const entry = catMap.get(cat) || { correct: 0, total: 0 }
    entry.total++
    if (answers[i]?.isCorrect) entry.correct++
    catMap.set(cat, entry)
  })

  catMap.forEach((val, key) => {
    categoryStats.push({
      category: key,
      correct: val.correct,
      total: val.total,
      pct: Math.round((val.correct / val.total) * 100),
    })
  })
  categoryStats.sort((a, b) => b.pct - a.pct)

  // Sure formatlama
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}dk ${sec}sn`
  }

  // TYT Net hesaplama: dogru - (yanlis / 4)
  const wrongCount = totalQuestions - score
  const net = (score - wrongCount / 4).toFixed(1)

  // Konu bazli renk
  const getPctColor = (p: number) => {
    if (p >= 80) return 'var(--growth)'
    if (p >= 60) return 'var(--focus)'
    if (p >= 40) return 'var(--reward)'
    return 'var(--urgency)'
  }

  // Konu ismi: ortak map'ten gelsin
  const formatCategory = (cat: string) => getCategoryLabel(cat)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 md:max-w-lg md:gap-5 md:p-6 xl:max-w-xl xl:gap-6 xl:p-8 2xl:max-w-2xl">
      {/* Baslik */}
      <div className="text-center animate-fadeUp">
        <div className="mb-1 text-[10px] font-bold tracking-widest text-[var(--text-sub)]">
          DENEME SINAVI SONUCU
        </div>
        <h1 className="font-display text-xl font-black md:text-2xl xl:text-3xl 2xl:text-4xl">{gameName}</h1>
      </div>

      {/* Rank */}
      <div className="flex justify-center animate-fadeUp" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
        <div
          className="font-display text-[60px] font-black leading-none md:text-[80px] xl:text-[100px] 2xl:text-[120px]"
          style={{
            color: config.color,
            textShadow: `0 0 20px color-mix(in srgb, ${config.color} 40%, transparent)`,
          }}
        >
          {rank}
        </div>
      </div>

      {/* Genel istatistikler */}
      <div className="grid grid-cols-4 gap-1.5 animate-fadeUp md:gap-2 xl:gap-3" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        {[
          { label: 'DOĞRU', value: String(score), color: 'var(--growth)' },
          { label: 'YANLIŞ', value: String(wrongCount), color: 'var(--urgency)' },
          { label: 'NET', value: net, color: 'var(--focus)' },
          { label: 'SÜRE', value: formatTime(elapsedTime), color: 'var(--wisdom)' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-2 text-center md:rounded-xl md:p-2.5 xl:p-3.5"
          >
            <div className="font-display text-sm font-black md:text-lg xl:text-xl 2xl:text-2xl" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="text-[8px] font-bold tracking-wider text-[var(--text-sub)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Basari cubugu */}
      <div className="animate-fadeUp" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <div className="mb-1 flex justify-between text-[10px] text-[var(--text-sub)]">
          <span>Genel Başarı</span>
          <span className="font-bold" style={{ color: config.color }}>%{pct}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--card-bg)]">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${config.color}, color-mix(in srgb, ${config.color} 70%, white))`,
            }}
          />
        </div>
      </div>

      {/* Konu bazli analiz */}
      <div className="animate-fadeUp" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
        <h2 className="mb-3 text-[10px] font-bold tracking-widest text-[var(--text-sub)]">
          KONU BAZLI ANALİZ
        </h2>
        <div className="space-y-2">
          {categoryStats.map((cat) => (
            <div key={cat.category} className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-bold">{formatCategory(cat.category)}</span>
                <span className="text-xs" style={{ color: getPctColor(cat.pct) }}>
                  {cat.correct}/{cat.total} (%{cat.pct})
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${cat.pct}%`,
                    backgroundColor: getPctColor(cat.pct),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Yorum */}
      <div className="animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
        <div className="mb-1 text-[10px] font-bold text-[var(--text-sub)]">DEĞERLENDİRME</div>
        <p className="text-xs leading-relaxed text-[var(--text)]">
          {pct >= 80
            ? 'Mükemmel performans! Bu seviyeyi koruyarak sınava hazırlanmaya devam et.'
            : pct >= 60
              ? 'İyi gidiyorsun! Zayıf konularını tekrar ederek daha da iyileşebilirsin.'
              : pct >= 40
                ? 'Geliştirmeye ihtiyacın var. Aşağıdaki zayıf konulara odaklan.'
                : 'Temel konuları tekrar etmen gerekiyor. Konu anlatımlarından faydalanabilirsin.'}
        </p>
        {categoryStats.filter(c => c.pct < 50).length > 0 && (
          <div className="mt-2 text-[10px] text-[var(--urgency)]">
            Zayıf konular: {categoryStats.filter(c => c.pct < 50).map(c => formatCategory(c.category)).join(', ')}
          </div>
        )}
      </div>

      {/* XP */}
      <div className="animate-fadeUp text-center" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
        <span className="rounded-full bg-[var(--reward-bg)] px-4 py-1.5 text-sm font-bold text-[var(--reward)]">
          +{xpEarned} XP Kazanıldı
        </span>
      </div>

      {/* Paylasim */}
      <div className="animate-fadeUp" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
        <ShareButtons rank={rank} score={score} total={totalQuestions} xp={xpEarned} gameName={gameName} />
      </div>

      {/* Butonlar */}
      <div className="flex gap-3 animate-fadeUp" style={{ animationDelay: '0.8s', animationFillMode: 'both' }}>
        <button
          onClick={onRestart}
          className="btn-primary flex-1 rounded-[10px] py-3 font-display text-sm font-bold tracking-wider"
        >
          Yeni Deneme
        </button>
        <button
          onClick={onExit}
          className="btn-ghost flex-1 rounded-[10px] py-3 text-sm font-bold"
        >
          Lobiye Dön
        </button>
      </div>

      {/* Guest signup prompt — Gun 2 escalation modal */}
      {isGuest && (
        <SignupPromptModal
          level={promptLevel}
          open={promptOpen}
          onDismiss={() => setPromptOpen(false)}
          onExitToLobby={onExit}
        />
      )}
    </div>
  )
}
