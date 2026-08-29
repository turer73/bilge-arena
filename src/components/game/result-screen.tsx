'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { calculateRank, RANK_CONFIG } from '@/lib/utils/xp'
import { useQuizStore } from '@/stores/quiz-store'
import { useAuthStore } from '@/stores/auth-store'
import { ShareButtons } from '@/components/social/share-buttons'
import { trackEvent } from '@/lib/utils/plausible'
import { SignupPromptModal } from './signup-prompt-modal'
import { useGuestSession, computePromptLevel } from '@/lib/hooks/use-guest-session'
import { BilgeChan } from '@/components/ui/bilge-chan'

interface ResultScreenProps {
  onRestart: () => void
  onExit: () => void
  /** Bu oturumun kazandirdigi altin (sunucudan, reward_ledger). Oturum kaydi
   * sonuc ekrani acildiktan SONRA tamamlandigi icin ilk render'da null gelir ve
   * rozet o an gizlidir. null = bilinmiyor/misafir, 0 = gunluk tavan dolu. */
  coinsEarned?: number | null
}

export function ResultScreen({ onRestart, onExit, coinsEarned = null }: ResultScreenProps) {
  const { score, questions, answers, xpEarned, maxStreak, lives, livesEnabled } = useQuizStore()
  const { user } = useAuthStore()
  const { incrementQuizCount } = useGuestSession()
  const [prompt, setPrompt] = useState<{ open: boolean; level: 1 | 2 | 3 }>({ open: false, level: 1 })
  const totalQuestions = questions.length
  const answeredCount = answers.length
  const pct = answeredCount > 0 ? Math.round((score / answeredCount) * 100) : 0
  const rank = calculateRank(score, answeredCount)
  const config = RANK_CONFIG[rank]
  const gameOver = livesEnabled && lives === 0
  const isGuest = !user

  // Analytics: bu ekran render olunca quiz tamamlandi demek
  // useRef guard: React 19 double-mount'a karsi tek sefer gonder
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
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
  }, [isGuest, rank, pct, score, answeredCount, xpEarned, gameOver, maxStreak])

  // Guest signup prompt escalation (Gun 2)
  const promptInitialized = useRef(false)
  useEffect(() => {
    if (promptInitialized.current) return
    if (!isGuest) return
    promptInitialized.current = true

    const nextCount = incrementQuizCount()
    const level = computePromptLevel(nextCount)
    // Stat animasyonlari bitsin, rank reveal olsun, sonra modal
    const timer = setTimeout(() => setPrompt({ open: true, level }), 1500)
    return () => clearTimeout(timer)
  }, [isGuest, incrementQuizCount])

  const stats = [
    { label: 'DOĞRU', value: `${score}/${answeredCount}`, color: 'var(--app-success)', tint: 'var(--app-success-tint)' },
    { label: 'BAŞARI', value: `%${pct}`, color: config.color, tint: 'var(--app-accent-tint)' },
    { label: 'XP KAZANCI', value: String(xpEarned), color: 'var(--app-warn)', tint: 'var(--app-warn-tint)' },
  ]

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[440px] flex-col justify-center gap-4 bg-[var(--app-bg)] px-4 py-5 text-[var(--app-accent-ink)] md:max-w-[720px] md:min-h-[calc(100dvh-5rem)]">
      {/* Can bitti uyarisi */}
      {gameOver && (
        <div className="animate-fadeUp rounded-2xl border-2 border-[var(--app-danger-border)] bg-[var(--app-danger-tint)] px-5 py-3 text-center shadow-[0_4px_0_var(--app-danger-border)]">
          <div className="text-base font-black text-[var(--app-danger)]">💔 Canlar bitti</div>
          <div className="mt-1 text-xs font-semibold text-[var(--app-text-sub)]">
            {answeredCount}/{totalQuestions} soru cevaplanabildi
          </div>
        </div>
      )}

      <div className="relative min-h-[210px] overflow-hidden rounded-[28px] border-2 border-[var(--app-accent-strong)] bg-gradient-to-br from-[var(--app-accent)] via-[var(--app-accent-strong)] to-[var(--app-accent-strong)] p-5 text-white shadow-[0_6px_0_var(--app-accent-strong)] animate-fadeUp">
        <div className="relative z-10 max-w-[58%] pt-2">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/75">
            Tur tamamlandı
          </div>
          <div
            className="mt-1 animate-rankReveal font-display text-[72px] font-black leading-none"
            style={{ color: 'var(--app-warn-border)', textShadow: '0 3px 0 rgba(120,53,15,.35)' }}
          >
            {rank}
          </div>
          <div className="mt-2 text-xl font-black leading-tight">{config.message}</div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-[var(--app-accent-border)]">
            {gameOver ? 'Bir sonraki turda daha güçlü döneceğiz.' : 'Harika iş! İlerlemen kaydedildi.'}
          </p>
        </div>
        <BilgeChan
          pose={gameOver ? 'sad' : 'victory'}
          height={168}
          className="absolute -bottom-2 -right-2 z-10 animate-fadeUp"
        />
        <div aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
      </div>

      {/* Stat kartlari */}
      <div className="grid w-full grid-cols-3 gap-2.5 animate-fadeUp" style={{ animationDelay: '0.25s', animationFillMode: 'both' }}>
        {stats.map((s, i) => (
          <div
            key={i}
            className="rounded-2xl border-2 p-3 text-center shadow-[0_4px_0_var(--app-border)]"
            style={{
              background: s.tint,
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="font-display text-xl font-black" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="mt-1 text-[9px] font-extrabold tracking-wider text-[var(--app-text-sub)]">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Kazanilan altin — oturum kaydi tamamlaninca gorunur. Altin XP'den ayri
          bir para birimi: XP seviye ilerlemesi, altin magaza alimi. Kullanici
          kazandigini burada gormezse magazaya yonelmiyor. */}
      {coinsEarned !== null && (
        <div
          className="rounded-2xl border-2 border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] px-4 py-3 text-center shadow-[0_4px_0_var(--app-warn-border)] animate-fadeUp"
          style={{ animationDelay: '0.6s', animationFillMode: 'both' }}
        >
          {coinsEarned > 0 ? (
            <span className="text-[13px] font-bold text-[var(--app-warn-ink)]">
              🪙 +{coinsEarned} altın kazandın!{' '}
              <Link href="/arena/magaza" className="underline underline-offset-2 hover:opacity-80">
                Mağaza →
              </Link>
            </span>
          ) : (
            <span className="text-[13px] font-semibold text-[var(--app-text-sub)]">
              🪙 Bugünlük altın sınırına ulaştın — yarın kazanmaya devam!
            </span>
          )}
        </div>
      )}

      {/* Max streak */}
      {maxStreak >= 3 && (
        <div
          className="rounded-2xl border-2 border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] px-4 py-3 text-center shadow-[0_4px_0_var(--app-warn-border)] animate-fadeUp"
          style={{ animationDelay: '0.7s', animationFillMode: 'both' }}
        >
          <span className="text-[13px] font-bold text-[var(--app-warn-ink)]">
            🔥 En yüksek seri: {maxStreak} soru doğru!
          </span>
        </div>
      )}

      {/* Sosyal medya paylasim */}
      <div className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-3 shadow-[0_4px_0_var(--app-border)] animate-fadeUp" style={{ animationDelay: '0.55s', animationFillMode: 'both' }}>
        <ShareButtons rank={rank} score={score} total={totalQuestions} xp={xpEarned} />
      </div>

      {/* Butonlar */}
      <div className="grid grid-cols-2 gap-3 animate-fadeUp" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
        <button
          onClick={onRestart}
          className="min-h-12 rounded-2xl border-2 border-[var(--app-accent-strong)] bg-[var(--app-accent)] px-4 py-3 font-display text-sm font-black tracking-wide text-white shadow-[0_5px_0_var(--app-accent-strong)] transition-transform active:translate-y-1 active:shadow-none"
        >
          Tekrar Oyna →
        </button>
        <button
          onClick={onExit}
          className="min-h-12 rounded-2xl border-2 border-[var(--app-disabled)] bg-[var(--app-card)] px-4 py-3 text-sm font-black text-[var(--app-text)] shadow-[0_5px_0_var(--app-disabled)] transition-transform active:translate-y-1 active:shadow-none"
        >
          Lobiye Dön
        </button>
      </div>

      {/* Guest signup prompt — Gun 2 escalation modal */}
      {isGuest && (
        <SignupPromptModal
          level={prompt.level}
          open={prompt.open}
          onDismiss={() => setPrompt((p) => ({ ...p, open: false }))}
          onExitToLobby={onExit}
        />
      )}
    </div>
  )
}
