'use client'

import type { Question } from '@/types/database'
import { GAMES } from '@/lib/constants/games'
import { useChatStore } from '@/stores/chat-store'

const DIFF_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: 'KOLAY', color: 'var(--growth)' },
  2: { label: 'ORTA', color: 'var(--focus)' },
  3: { label: 'ZOR', color: 'var(--reward)' },
  4: { label: 'BOSS', color: 'var(--wisdom)' },
  5: { label: 'BOSS', color: 'var(--wisdom)' },
}

const GAME_EMOJI: Record<string, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

interface QuestionCardProps {
  question: Question
  currentIndex: number
  totalQuestions: number
  children?: React.ReactNode // Burst particles slot
}

export function QuestionCard({
  question,
  currentIndex,
  totalQuestions,
  children,
}: QuestionCardProps) {
  const diff = DIFF_CONFIG[question.difficulty] || DIFF_CONFIG[2]
  const game = GAMES[question.game]
  const emoji = GAME_EMOJI[question.game] || '📋'
  const progress = ((currentIndex + 1) / totalQuestions) * 100

  const handleAskAssistant = () => {
    const opts = question.content.options
      .map((o, i) => `${'ABCDE'[i]}) ${o}`)
      .join('\n')
    const ctx = `[${question.game.toUpperCase()} - ${question.category}${question.sub_category ? ' / ' + question.sub_category : ''}]\n\nSoru: ${question.content.question}\n\n${opts}`
    useChatStore.getState().setQuestionContext(ctx)
    useChatStore.getState().clearMessages()
    useChatStore.getState().setOpen(true)
  }

  return (
    <div className="relative overflow-hidden rounded-xl border-[1.5px] border-[var(--border)] bg-gradient-to-br from-[var(--card-bg)] to-[var(--bg-secondary)] p-3.5 animate-fadeUp md:rounded-2xl md:p-5 xl:p-6 2xl:p-7">
      {/* Glow */}
      <div className="pointer-events-none absolute -right-[50px] -top-[50px] h-[180px] w-[180px] rounded-full bg-[radial-gradient(circle,var(--focus-bg)_0%,transparent_70%)]" />

      {/* Meta bar */}
      <div className="mb-3.5 flex items-center gap-2">
        <span className="text-[15px]">{emoji}</span>

        <span
          className="rounded px-[7px] py-0.5 text-[9px] font-extrabold tracking-wider"
          style={{
            backgroundColor: `color-mix(in srgb, ${diff.color} 15%, transparent)`,
            color: diff.color,
            border: `1px solid color-mix(in srgb, ${diff.color} 27%, transparent)`,
          }}
        >
          {diff.label}
        </span>

        {question.sub_category && (
          <span
            className="rounded px-[7px] py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: `color-mix(in srgb, ${game?.colorHex || '#3B82F6'} 10%, transparent)`,
              color: game?.colorHex || 'var(--focus)',
              border: `1px solid color-mix(in srgb, ${game?.colorHex || '#3B82F6'} 20%, transparent)`,
            }}
          >
            {question.sub_category}
          </span>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleAskAssistant}
          className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-[var(--text-sub)] transition-all hover:bg-[var(--focus-bg)] hover:text-[var(--focus)] active:scale-95"
          title="Bilge Asistan'a sor"
        >
          <span className="text-sm">🦉</span>
          <span className="hidden sm:inline">Sor</span>
        </button>

        <span className="text-[11px] font-semibold text-[var(--text-sub)]">
          {currentIndex + 1}
          <span className="text-[var(--text-muted)]">/{totalQuestions}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-[2.5px] overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--focus-dark)] to-[var(--focus)] shadow-[0_0_5px_var(--focus-light)] transition-[width] duration-600"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Soru metni */}
      <p className="text-[13px] font-medium leading-[1.72] md:text-[15px] xl:text-base 2xl:text-lg">
        {question.content.question}
      </p>

      {/* Burst particles slot */}
      {children}
    </div>
  )
}
