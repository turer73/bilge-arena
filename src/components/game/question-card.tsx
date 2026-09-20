'use client'

import { useId } from 'react'
import {
  BookOpenText,
  Calculator,
  FileText,
  Flag,
  FlaskConical,
  Globe2,
  Languages,
  type LucideIcon,
} from 'lucide-react'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { GAMES } from '@/lib/constants/games'
import { renderRichText } from '@/lib/utils/rich-text'
import styles from './academy-quiz.module.css'

const DIFF_CONFIG: Record<number, { label: string; color: string; text: string }> = {
  1: { label: 'KOLAY', color: 'var(--growth)', text: 'var(--growth-text)' },
  2: { label: 'ORTA', color: 'var(--focus)', text: 'var(--focus-text)' },
  3: { label: 'ZOR', color: 'var(--reward)', text: 'var(--reward-text)' },
  4: { label: 'BOSS', color: 'var(--wisdom)', text: 'var(--wisdom-text)' },
  5: { label: 'BOSS', color: 'var(--wisdom)', text: 'var(--wisdom-text)' },
}

const GAME_ICON: Record<string, LucideIcon> = {
  matematik: Calculator,
  turkce: BookOpenText,
  fen: FlaskConical,
  sosyal: Globe2,
  wordquest: Languages,
}

interface QuestionCardProps {
  question: PublicQuestion
  currentIndex: number
  totalQuestions: number
  onReport?: () => void // Oyun sırasında soruyu raporla (cevaptan bağımsız)
  children?: React.ReactNode // Burst particles slot
}

export function QuestionCard({
  question,
  currentIndex,
  totalQuestions,
  onReport,
  children,
}: QuestionCardProps) {
  const diff = DIFF_CONFIG[question.difficulty] || DIFF_CONFIG[2]
  const game = GAMES[question.game]
  const GameIcon = GAME_ICON[question.game] || FileText
  const progress = ((currentIndex + 1) / totalQuestions) * 100
  // Sabit id yerine useId: aynı sayfada birden fazla kart render edilirse
  // (ör. düello) duplicate id oluşup aria-labelledby belirsizleşiyordu.
  const questionTextId = useId()

  return (
    <section
      data-quiz-question
      aria-labelledby={questionTextId}
      className="relative animate-fadeUp overflow-hidden rounded-[22px] border-2 border-[var(--app-shadow-accent)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-shadow-accent)]"
    >
      {/* Glow */}
      <div className="pointer-events-none absolute -right-[50px] -top-[50px] hidden h-[180px] w-[180px] rounded-full bg-[radial-gradient(circle,var(--focus-bg)_0%,transparent_70%)]" />

      {/* Meta bar */}
      <div data-quiz-question-meta className="mb-3 flex items-center gap-2">
        <span data-quiz-question-number className={styles.wideOnly}>SORU {currentIndex + 1}</span>
        <span
          data-question-subject-icon={question.game}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]"
          aria-hidden="true"
        >
          <GameIcon className="h-4 w-4" strokeWidth={2.2} />
        </span>

        <span
          className="rounded-md px-2 py-1 text-xs font-extrabold tracking-wider"
          style={{
            backgroundColor: `color-mix(in srgb, ${diff.color} 15%, transparent)`,
            color: diff.text,
            border: `1px solid color-mix(in srgb, ${diff.color} 27%, transparent)`,
          }}
        >
          {diff.label}
        </span>

        {question.subcategory && (
          <span
            className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-sub)]"
            style={{
              backgroundColor: `color-mix(in srgb, ${game?.colorHex || 'var(--app-accent)'} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${game?.colorHex || 'var(--app-accent)'} 20%, transparent)`,
            }}
          >
            {question.subcategory}
          </span>
        )}

        <div className="flex-1" />

        {/* Soruyu raporla — cevaptan bağımsız, oyun sırasında (Ensar 06-16:
            denemede bozuk soruyu cevaplamadan bildirememe sorunu) */}
        {onReport && (
          <button
            type="button"
            onClick={onReport}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold text-[var(--app-text-muted)] transition-all hover:bg-[var(--app-warn-tint)] hover:text-[var(--app-warn)] active:scale-95"
            title="Soruyu raporla (hata/eksik içerik)"
            aria-label="Soruyu raporla"
          >
            <Flag className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            <span className="hidden sm:inline">Bildir</span>
          </button>
        )}

        <span className="hidden text-xs font-semibold text-[var(--text-sub)]">
          {currentIndex + 1}
          <span className="text-[var(--text-muted)]">/{totalQuestions}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="mb-5 hidden h-1 overflow-hidden rounded-full bg-[var(--border)]"
        role="progressbar"
        aria-label="Soru ilerlemesi"
        aria-valuemin={1}
        aria-valuemax={totalQuestions}
        aria-valuenow={currentIndex + 1}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--focus-dark)] to-[var(--focus)] shadow-[0_0_5px_var(--focus-light)] transition-[width] duration-600"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Öncül/ifade bloğu (roman_numeral) — soru kökünden ÖNCE; \n satır sonları
          korunur (I. / II. / III. alt alta). Eksikse soru "Yukarıdaki ifadeler..."
          deyip boş görünüyordu (Ensar 06-16). */}
      {question.content.passage && (
        <p className="mb-4 whitespace-pre-line text-[15px] leading-7 text-[var(--app-text-sub)]">
          {renderRichText(question.content.passage)}
        </p>
      )}

      {/* Soru metni — <u>...</u> markup'i altcizili render edilir (alti cizili sozcuk sorulari) */}
      <h2 id={questionTextId} className="text-[17px] font-extrabold leading-7 text-[var(--app-text)]">
        {renderRichText(question.content.question || question.content.sentence)}
      </h2>

      {/* Burst particles slot */}
      {children}
    </section>
  )
}
