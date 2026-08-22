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
import type { MockStrategyAnalysis } from '@/lib/mock-strategy/analysis'
import { MockStrategyPanel } from './mock-strategy-panel'
import { BilgeChan } from '@/components/ui/bilge-chan'

interface DenemeResultProps {
  gameName: string
  totalTime: number      // toplam sure (saniye)
  elapsedTime: number    // gecen sure (saniye)
  strategyAnalysis?: MockStrategyAnalysis | null
  onRestart: () => void
  onExit: () => void
}

interface CategoryStat {
  category: string
  correct: number
  total: number
  pct: number
}

export function DenemeResult({
  gameName,
  totalTime: _totalTime,
  elapsedTime,
  strategyAnalysis = null,
  onRestart,
  onExit,
}: DenemeResultProps) {
  const { score, questions, xpEarned, answers } = useQuizStore()
  const { user } = useAuthStore()
  const { incrementQuizCount } = useGuestSession()
  const [prompt, setPrompt] = useState<{ open: boolean; level: 1 | 2 | 3 }>({ open: false, level: 1 })
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
    const level = computePromptLevel(nextCount)
    // Animasyonlar bitsin, modal sonra
    const timer = setTimeout(() => setPrompt({ open: true, level }), 1500)
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
    if (p >= 80) return 'var(--app-success)'
    if (p >= 60) return 'var(--app-accent)'
    if (p >= 40) return 'var(--app-warn)'
    return 'var(--app-danger)'
  }

  // Konu ismi: ortak map'ten gelsin
  const formatCategory = (cat: string) => getCategoryLabel(cat)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-4 bg-[var(--app-bg)] px-4 py-5 text-[var(--app-accent-ink)]">
      <div className="relative min-h-[210px] overflow-hidden rounded-[28px] border-2 border-[var(--app-accent-strong)] bg-gradient-to-br from-[var(--app-accent)] via-[var(--app-accent-strong)] to-[var(--app-accent-strong)] p-5 text-white shadow-[0_6px_0_var(--app-accent-strong)] animate-fadeUp">
        <div className="relative z-10 max-w-[60%]">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-shadow-accent)]">
            Deneme sonucu
          </div>
          <h1 className="mt-1 font-display text-lg font-black leading-tight">{gameName}</h1>
          <div
            className="mt-2 font-display text-[68px] font-black leading-none"
            style={{ color: 'var(--app-warn-border)', textShadow: '0 3px 0 rgba(120,53,15,.35)' }}
          >
            {rank}
          </div>
          <p className="mt-1 text-xs font-bold text-[var(--app-accent-border)]">{config.message}</p>
        </div>
        <BilgeChan pose={pct >= 50 ? 'victory' : 'tutor'} height={166} className="absolute -bottom-2 -right-2 z-10" />
        <div aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
      </div>

      {/* Genel istatistikler */}
      <div className="grid grid-cols-4 gap-2 animate-fadeUp" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
        {[
          { label: 'DOĞRU', value: String(score), color: 'var(--app-success)' },
          { label: 'YANLIŞ', value: String(wrongCount), color: 'var(--app-danger)' },
          { label: 'NET', value: net, color: 'var(--app-accent-text)' },
          { label: 'SÜRE', value: formatTime(elapsedTime), color: 'var(--wisdom-text)' },
        ].map((s) => (
          <div
            key={s.label}
            className="min-w-0 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-2.5 text-center shadow-[0_4px_0_var(--app-border)]"
          >
            <div className="truncate font-display text-base font-black" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="text-[8px] font-black tracking-wider text-[var(--app-text-sub)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Basari cubugu */}
      <div className="rounded-2xl border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-shadow-accent)] animate-fadeUp" style={{ animationDelay: '0.25s', animationFillMode: 'both' }}>
        <div className="mb-2 flex justify-between text-xs font-bold text-[var(--app-text-sub)]">
          <span>Genel başarı</span>
          <span className="font-bold" style={{ color: config.color }}>%{pct}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--app-border)]">
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
      <div className="animate-fadeUp" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
        <h2 className="mb-3 text-[11px] font-black tracking-[0.14em] text-[var(--app-text-sub)]">
          KONU BAZLI ANALİZ
        </h2>
        <div className="space-y-2">
          {categoryStats.map((cat) => (
            <div key={cat.category} className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-3.5 shadow-[0_3px_0_var(--app-border)]">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-black text-[var(--app-text)]">{formatCategory(cat.category)}</span>
                <span className="text-xs font-bold" style={{ color: getPctColor(cat.pct) }}>
                  {cat.correct}/{cat.total} (%{cat.pct})
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
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
      <div className="animate-fadeUp rounded-2xl border-2 border-[var(--wisdom-border)] bg-[var(--wisdom-bg)] p-4 shadow-[0_4px_0_var(--wisdom-border)]" style={{ animationDelay: '0.45s', animationFillMode: 'both' }}>
        <div className="mb-1 text-[10px] font-black tracking-wider text-[var(--wisdom-text)]">BİLGE CHAN&apos;IN NOTU</div>
        <p className="text-xs font-semibold leading-relaxed text-[var(--app-text)]">
          {pct >= 80
            ? 'Mükemmel performans! Bu seviyeyi koruyarak sınava hazırlanmaya devam et.'
            : pct >= 60
              ? 'İyi gidiyorsun! Zayıf konularını tekrar ederek daha da iyileşebilirsin.'
              : pct >= 40
                ? 'Geliştirmeye ihtiyacın var. Aşağıdaki zayıf konulara odaklan.'
                : 'Temel konuları tekrar etmen gerekiyor. Konu anlatımlarından faydalanabilirsin.'}
        </p>
        {categoryStats.filter(c => c.pct < 50).length > 0 && (
          <div className="mt-2 text-[10px] font-bold text-[var(--app-danger)]">
            Zayıf konular: {categoryStats.filter(c => c.pct < 50).map(c => formatCategory(c.category)).join(', ')}
          </div>
        )}
      </div>

      {strategyAnalysis && (
        <div className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-3 shadow-[0_4px_0_var(--app-border)]">
          <MockStrategyPanel analysis={strategyAnalysis} />
        </div>
      )}

      {/* XP */}
      <div className="animate-fadeUp text-center" style={{ animationDelay: '0.55s', animationFillMode: 'both' }}>
        <span className="inline-flex rounded-full border-2 border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] px-4 py-2 text-sm font-black text-[var(--app-warn-ink)] shadow-[0_3px_0_var(--app-warn-border)]">
          +{xpEarned} XP Kazanıldı
        </span>
      </div>

      {/* Paylasim */}
      <div className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-3 shadow-[0_4px_0_var(--app-border)] animate-fadeUp" style={{ animationDelay: '0.65s', animationFillMode: 'both' }}>
        <ShareButtons rank={rank} score={score} total={totalQuestions} xp={xpEarned} gameName={gameName} />
      </div>

      {/* Butonlar */}
      <div className="grid grid-cols-2 gap-3 pb-3 animate-fadeUp" style={{ animationDelay: '0.75s', animationFillMode: 'both' }}>
        <button
          onClick={onRestart}
          className="min-h-12 rounded-2xl border-2 border-[var(--app-accent-strong)] bg-[var(--app-accent)] px-4 py-3 font-display text-sm font-black tracking-wide text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
        >
          Yeni Deneme
        </button>
        <button
          onClick={onExit}
          className="min-h-12 rounded-2xl border-2 border-[var(--app-disabled)] bg-[var(--app-card)] px-4 py-3 text-sm font-black text-[var(--app-text)] shadow-[0_5px_0_var(--app-disabled)] active:translate-y-1 active:shadow-none"
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
