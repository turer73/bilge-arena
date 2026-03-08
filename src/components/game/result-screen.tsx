'use client'

import { calculateRank, RANK_CONFIG } from '@/lib/utils/xp'
import { useQuizStore } from '@/stores/quiz-store'
import { ShareButtons } from '@/components/social/share-buttons'

interface ResultScreenProps {
  onRestart: () => void
  onExit: () => void
}

export function ResultScreen({ onRestart, onExit }: ResultScreenProps) {
  const { score, questions, xpEarned, maxStreak } = useQuizStore()
  const totalQuestions = questions.length
  const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0
  const rank = calculateRank(score, totalQuestions)
  const config = RANK_CONFIG[rank]

  const stats = [
    { label: 'DOGRU', value: `${score}/${totalQuestions}`, color: 'var(--growth)' },
    { label: 'BASARI', value: `%${pct}`, color: config.color },
    { label: 'XP +', value: String(xpEarned), color: 'var(--reward)' },
  ]

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-4 md:gap-4 md:p-6 xl:gap-5 xl:p-8">
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
            🔥 En yuksek serin: {maxStreak} soru dogru!
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
          Lobiye Don
        </button>
      </div>
    </div>
  )
}
