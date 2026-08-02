'use client'

import type { PublicQuestion } from '@/lib/utils/question-public'
import { GAMES } from '@/lib/constants/games'
import { renderRichText } from '@/lib/utils/rich-text'

const DIFF_CONFIG: Record<number, { label: string; color: string; text: string }> = {
  1: { label: 'KOLAY', color: 'var(--growth)', text: 'var(--growth-text)' },
  2: { label: 'ORTA', color: 'var(--focus)', text: 'var(--focus-text)' },
  3: { label: 'ZOR', color: 'var(--reward)', text: 'var(--reward-text)' },
  4: { label: 'BOSS', color: 'var(--wisdom)', text: 'var(--wisdom-text)' },
  5: { label: 'BOSS', color: 'var(--wisdom)', text: 'var(--wisdom-text)' },
}

const GAME_EMOJI: Record<string, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
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
  const emoji = GAME_EMOJI[question.game] || '📋'
  const progress = ((currentIndex + 1) / totalQuestions) * 100

  return (
    <section
      aria-labelledby="question-text"
      className="relative animate-fadeUp overflow-hidden rounded-xl border-[1.5px] border-[var(--border)] bg-gradient-to-br from-[var(--card-bg)] to-[var(--bg-secondary)] p-4 md:rounded-2xl md:p-5 xl:p-6 2xl:p-7"
    >
      {/* Glow */}
      <div className="pointer-events-none absolute -right-[50px] -top-[50px] h-[180px] w-[180px] rounded-full bg-[radial-gradient(circle,var(--focus-bg)_0%,transparent_70%)]" />

      {/* Meta bar */}
      <div className="mb-3.5 flex items-center gap-2">
        <span className="text-[15px]">{emoji}</span>

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
              backgroundColor: `color-mix(in srgb, ${game?.colorHex || '#3B82F6'} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${game?.colorHex || '#3B82F6'} 20%, transparent)`,
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
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--text-sub)] transition-all hover:bg-[color-mix(in_srgb,var(--reward)_14%,transparent)] hover:text-[var(--reward-text)] active:scale-95"
            title="Soruyu raporla (hata/eksik içerik)"
            aria-label="Soruyu raporla"
          >
            <span className="text-sm">🐛</span>
            <span className="hidden sm:inline">Bildir</span>
          </button>
        )}

        <span className="text-xs font-semibold text-[var(--text-sub)] md:text-sm">
          {currentIndex + 1}
          <span className="text-[var(--text-muted)]">/{totalQuestions}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="mb-5 h-1 overflow-hidden rounded-full bg-[var(--border)]"
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
        <p className="mb-4 whitespace-pre-line text-[15px] leading-7 text-[var(--text-sub)] md:text-base xl:text-[17px]">
          {renderRichText(question.content.passage)}
        </p>
      )}

      {/* Soru metni — <u>...</u> markup'i altcizili render edilir (alti cizili sozcuk sorulari) */}
      <h2 id="question-text" className="text-base font-semibold leading-7 md:text-[17px] xl:text-lg 2xl:text-xl">
        {renderRichText(question.content.question || question.content.sentence)}
      </h2>

      {/* Burst particles slot */}
      {children}
    </section>
  )
}
