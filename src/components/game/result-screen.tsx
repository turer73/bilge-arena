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
    { label: 'DOĞRU', value: `${score}/${answeredCount}`, color: '#16a34a', tint: '#f0fdf4' },
    { label: 'BAŞARI', value: `%${pct}`, color: config.color, tint: '#eff6ff' },
    { label: 'XP KAZANCI', value: String(xpEarned), color: '#d97706', tint: '#fffbeb' },
  ]

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[440px] flex-col justify-center gap-4 bg-[#f7f8fa] px-4 py-5 text-[#172554] md:min-h-[calc(100dvh-5rem)]">
      {/* Can bitti uyarisi */}
      {gameOver && (
        <div className="animate-fadeUp rounded-2xl border-2 border-[#fecaca] bg-[#fff1f2] px-5 py-3 text-center shadow-[0_4px_0_#fecaca]">
          <div className="text-base font-black text-[#dc2626]">💔 Canlar bitti</div>
          <div className="mt-1 text-xs font-semibold text-[#64748b]">
            {answeredCount}/{totalQuestions} soru cevaplanabildi
          </div>
        </div>
      )}

      <div className="relative min-h-[210px] overflow-hidden rounded-[28px] border-2 border-[#1d4ed8] bg-gradient-to-br from-[#2563eb] via-[#1d4ed8] to-[#1e40af] p-5 text-white shadow-[0_6px_0_#1e3a8a] animate-fadeUp">
        <div className="relative z-10 max-w-[58%] pt-2">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#bfdbfe]">
            Tur tamamlandı
          </div>
          <div
            className="mt-1 animate-rankReveal font-display text-[72px] font-black leading-none"
            style={{ color: '#fef08a', textShadow: '0 3px 0 rgba(120,53,15,.35)' }}
          >
            {rank}
          </div>
          <div className="mt-2 text-xl font-black leading-tight">{config.message}</div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-[#dbeafe]">
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
            className="rounded-2xl border-2 p-3 text-center shadow-[0_4px_0_#dbe2ea]"
            style={{
              background: s.tint,
              borderColor: '#e2e8f0',
            }}
          >
            <div className="font-display text-xl font-black" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="mt-1 text-[9px] font-extrabold tracking-wider text-[#64748b]">
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
          className="rounded-2xl border-2 border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-center shadow-[0_4px_0_#fde68a] animate-fadeUp"
          style={{ animationDelay: '0.6s', animationFillMode: 'both' }}
        >
          {coinsEarned > 0 ? (
            <span className="text-[13px] font-bold text-[#b45309]">
              🪙 +{coinsEarned} altın kazandın!{' '}
              <Link href="/arena/magaza" className="underline underline-offset-2 hover:opacity-80">
                Mağaza →
              </Link>
            </span>
          ) : (
            <span className="text-[13px] font-semibold text-[#64748b]">
              🪙 Bugünlük altın sınırına ulaştın — yarın kazanmaya devam!
            </span>
          )}
        </div>
      )}

      {/* Max streak */}
      {maxStreak >= 3 && (
        <div
          className="rounded-2xl border-2 border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-center shadow-[0_4px_0_#fed7aa] animate-fadeUp"
          style={{ animationDelay: '0.7s', animationFillMode: 'both' }}
        >
          <span className="text-[13px] font-bold text-[#c2410c]">
            🔥 En yüksek seri: {maxStreak} soru doğru!
          </span>
        </div>
      )}

      {/* Sosyal medya paylasim */}
      <div className="rounded-2xl border-2 border-[#e2e8f0] bg-white p-3 shadow-[0_4px_0_#dbe2ea] animate-fadeUp" style={{ animationDelay: '0.55s', animationFillMode: 'both' }}>
        <ShareButtons rank={rank} score={score} total={totalQuestions} xp={xpEarned} />
      </div>

      {/* Butonlar */}
      <div className="grid grid-cols-2 gap-3 animate-fadeUp" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
        <button
          onClick={onRestart}
          className="min-h-12 rounded-2xl border-2 border-[#1d4ed8] bg-[#2563eb] px-4 py-3 font-display text-sm font-black tracking-wide text-white shadow-[0_5px_0_#1e40af] transition-transform active:translate-y-1 active:shadow-none"
        >
          Tekrar Oyna →
        </button>
        <button
          onClick={onExit}
          className="min-h-12 rounded-2xl border-2 border-[#cbd5e1] bg-white px-4 py-3 text-sm font-black text-[#334155] shadow-[0_5px_0_#cbd5e1] transition-transform active:translate-y-1 active:shadow-none"
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
