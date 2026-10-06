'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { useQuizStore } from '@/stores/quiz-store'
import { trackEvent } from '@/lib/utils/plausible'
import { BilgeChan } from '@/components/ui/bilge-chan'
import quizStyles from './academy-quiz.module.css'

interface GuestPreviewResultProps {
  game: GameSlug
  onRestart: () => void
}

/**
 * Misafir önizleme sonucu: giriş yapmadan oynanan 1 soruluk turun kayıt CTA'sı.
 *
 * Misafir ResultScreen'e hiç ulaşmaz; bu yüzden misafir hunisinin event'leri
 * burada atılır. Mevcut Plausible goal ve property adları kullanılır (yeni goal
 * tanımı gerekmez); önizleme yüzeyi `mode: 'preview'` / `level: 'preview'` ile
 * eski çok soruluk misafir akışından ayrılır.
 */
export function GuestPreviewResult({ game, onRestart }: GuestPreviewResultProps) {
  const gameDef = GAMES[game]
  const answers = useQuizStore((s) => s.answers)
  const correct = answers.filter((answer) => answer.isCorrect).length
  const answered = answers.length
  const loginHref = `/giris?redirect=${encodeURIComponent(`/arena/${game}`)}`

  // useRef guard: React 19 double-mount'a karşı tek sefer gönder
  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    trackEvent('GuestQuizComplete', {
      props: { game, mode: 'preview', correct, total: answered },
    })
  }, [game, correct, answered])

  return (
    <div data-game={game} className={`mx-auto flex min-h-[100dvh] max-w-[440px] flex-col justify-center gap-4 bg-[var(--app-bg)] p-4 text-center text-[var(--app-text)] animate-scaleIn md:max-w-[680px] ${game === 'wordquest' ? quizStyles.wordQuestTheme : ''}`}>
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--app-accent)] to-[var(--app-accent-strong)] p-5 pb-7 text-white shadow-[0_7px_0_var(--app-accent-strong)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full border-[24px] border-white/10" />
        <BilgeChan pose="wave" height={148} priority className="mx-auto drop-shadow-[0_8px_10px_rgba(15,23,42,.18)]" />
        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">İlk turun tamam</p>
        <h2 className="mt-1 text-2xl font-black">Nasıl buldun?</h2>
      </div>
      <div className="rounded-[22px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-5 shadow-[0_5px_0_var(--app-shadow-accent)]">
        <p className="text-sm font-semibold leading-6 text-[var(--app-text-sub)]">
          <span className="font-black" style={{ color: gameDef.colorHex }}>{gameDef.name}</span>
          {' '}arenasında yüzlerce soru seni bekliyor. İlerlemeni kaydetmek ve serini korumak için ücretsiz hesap oluştur.
        </p>
        <div className="mt-5 flex w-full flex-col gap-3">
          {/* next/link: istemci tarafı geçiş, event isteği sayfa kapanırken kesilmez */}
          <Link
            href={loginHref}
            onClick={() => trackEvent('PromptCtaClicked', { props: { level: 'preview', outcome: 'signup' } })}
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none"
          >
            Ücretsiz Kayıt Ol
          </Link>
          <button
            onClick={() => {
              trackEvent('PromptDismissed', { props: { level: 'preview', method: 'retry' } })
              onRestart()
            }}
            className="min-h-12 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] text-sm font-black text-[var(--app-text-sub)] shadow-[0_4px_0_var(--app-shadow)] active:translate-y-1 active:shadow-none"
          >
            Tekrar Dene
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-[var(--app-text-muted)]">
          Zaten hesabın var mı?{' '}
          <Link
            href={loginHref}
            onClick={() => trackEvent('PromptCtaClicked', { props: { level: 'preview', outcome: 'login' } })}
            className="font-black text-[var(--app-accent-text)] underline underline-offset-2"
          >
            Giriş yap
          </Link>
        </p>
      </div>
    </div>
  )
}
