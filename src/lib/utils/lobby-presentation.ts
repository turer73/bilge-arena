import { GAMES, type GameSlug } from '@/lib/constants/games'
import { DENEME_CONFIGS, type QuizMode } from '@/lib/constants/modes'

const MODE_LABELS: Readonly<Record<string, string>> = {
  classic: 'Hızlı', deneme: 'Deneme', practice: 'Pratik',
}

export function getLobbyModeLabel(mode: QuizMode) {
  return MODE_LABELS[mode.id] ?? mode.name
}

export function getPreparationLabel(game: GameSlug) {
  return `${GAMES[game].name} turunu hazırla`
}

interface PresentationOptions {
  preview?: boolean
  limitReached?: boolean
  startBlocked?: boolean
  startBlockedLabel?: string
  startLabel?: string
}

/** Shared copy and rule values; starting a round remains the engine's job. */
export function getLobbyPresentation(game: GameSlug, mode: QuizMode, options: PresentationOptions = {}) {
  const questionCount = options.preview ? 1 : mode.questionCount
  const timeLabel = mode.isDeneme && !options.preview
    ? `${Math.ceil(DENEME_CONFIGS[game].totalTime / 60)} dk toplam`
    : mode.timePerQuestion > 0 ? `${mode.timePerQuestion} sn / soru` : 'Zamansız'
  const lives = mode.lives ?? 'Sınırsız'
  const actionLabel = options.startBlocked
    ? options.startBlockedLabel ?? 'Başlatılamıyor'
    : options.limitReached
      ? 'Limit doldu · Premium’a geç'
      : options.startLabel ?? (options.preview
        ? 'Önizlemeyi başlat · 1 soru'
        : mode.isDeneme ? `Denemeyi başlat · ${questionCount} soru` : `Başla · ${questionCount} soru`)
  return { questionCount, timeLabel, lives, actionLabel }
}
