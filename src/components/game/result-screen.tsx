'use client'

import { useEffect, useRef } from 'react'
import { calculateRank, RANK_CONFIG } from '@/lib/utils/xp'
import { useQuizStore } from '@/stores/quiz-store'
import { useAuthStore } from '@/stores/auth-store'
import { ShareButtons } from '@/components/social/share-buttons'
import { trackEvent } from '@/lib/utils/plausible'

interface ResultScreenProps {
  onRestart: () => void
  onExit: () => void
}

export function ResultScreen({ onRestart, onExit }: ResultScreenProps) {
  const { score, questions, answers, xpEarned, maxStreak, lives, livesEnabled, maxLives } = useQuizStore()
  const { user } = useAuthStore()
  const totalQuestions = questions.length
  const answeredCount = answers.length
  const pct = answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 0
  const rank = calculateRank(score, answeredCount)
  const config = RANK_CONFIG[rank]
  const gameOver = livesEnabled && lives === 0

  // Analytics: bu ekran render olunca quiz tamamlandi demek
  // useRef guard: React 19 double-mount'a karsi tek sefer gonder
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    const isGuest = !user
    const eventName = isGuest ? 'GuestQuizComplete' : 'QuizComplete'
    trackEvent(eventName, {
      props: {
        rank,
        pct,
        correct: score,
        total: answeredCount,
        xp: xpEarned,
        gameOver,
        maxStreak,
      },
    })
  }, [user, rank, pct, score, answeredCount, xpEarned, gameOver, maxStreak])

  const stats = [
    { label: 'DOĞRU', value: `${score}/${answeredCount}`, color: 'var(--growth)' },
    { label: 'BAŞARI', value: `%${pct}`, color: config.color },
    { label: 'XP +', value: String(xpEarned), color: 'var(--reward)' },
  ]

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-4 md:gap-4 md:p-6 xl:gap-5 xl:p-8">
      {/* Can bitti uyarisi */}
      {gameOver && (
        <div className="animate-fadeUp rounded-xl border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-5 py-3 text-center">
          <div className="text-lg font-bold text-[var(--urgency)]">💔 Canlar Bitti!</div>
          <div className="mt-1 text-[11px] text-[var(--text-sub)]">
            {answeredCount}/{totalQuestions} soru cevaplanabildi
          </div>
        </div>
      )}

      {/* Rank */}
      <div
        className="animate-rankReveal font-display text-[80px] font-black leading-none md:text-[120px] xl:text-[150px] 2xl:text-[180px]"
        style={{
          color: config.color,
          textShadow: `0 0 30px color-mix(in srgb, ${config.color} 53%, transparent), 0 0 80px color-mix(in srgb, ${config.color} 27%, transparent)`,
        }}
      >
        {rank}
      </div>

      {/* Mesaj */}
      <div className="animate-fadeUp font-display text-lg font-bold md:text-[22px] xl:text-2xl 2xl:text-3xl" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        {config.message}
      </div>

      {/* Stat kartlari */}
      <div className="grid w-full max-w-[360px] grid-cols-3 gap-2 animate-fadeUp md:max-w-[420px] md:gap-3 xl:max-w-[520px] xl:gap-4 2xl:max-w-[600px]" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
        {stats.map((s, i) => (
          <div
            key={i}
            className="rounded-lg border p-2.5 text-center md:rounded-xl md:p-3.5 xl:p-4 2xl:p-5"
            style={{
              background: 'var(--card-bg)',
              borderColor: `color-mix(in srgb, ${s.color} 20%, transparent)`,
            }}
          >
            <div className="font-display text-xl font-black md:text-2xl xl:text-3xl 2xl:text-4xl" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="mt-1 text-[9px] font-extrabold tracking-wider text-[var(--text-sub)]">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Max streak */}
      {maxStreak >= 3 && (
        <div
          className="rounded-[10px] border border-[var(--reward-border)] bg-[var(--reward-bg)] px-5 py-2.5 animate-fadeUp"
          style={{ animationDelay: '0.7s', animationFillMode: 'both' }}
        >
          <span className="text-[13px] font-semibold text-[var(--reward)]">
            🔥 En yüksek seri: {maxStreak} soru doğru!
          </span>
        </div>
      )}

      {/* Sosyal medya paylasim */}
      <div className="animate-fadeUp" style={{ animationDelay: '0.9s', animationFillMode: 'both' }}>
        <ShareButtons rank={rank} score={score} total={totalQuestions} xp={xpEarned} />
      </div>

      {/* Butonlar */}
      <div className="flex gap-3 animate-fadeUp" style={{ animationDelay: '1.1s', animationFillMode: 'both' }}>
        <button
          onClick={onRestart}
          className="btn-primary rounded-[10px] px-6 py-3 font-display text-xs font-bold tracking-wider shadow-lg transition-transform hover:scale-[1.03] md:px-9 md:py-[13px] md:text-sm xl:text-base xl:px-10 xl:py-4"
        >
          Tekrar Oyna →
        </button>
        <button
          onClick={onExit}
          className="btn-ghost rounded-[10px] px-4 py-3 text-xs font-bold md:px-6 md:py-[13px] md:text-sm xl:text-base xl:py-4"
        >
          Lobiye Dön
        </button>
      </div>
    </div>
  )
}
