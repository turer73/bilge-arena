'use client'

import { useEffect, useCallback, useReducer, useRef } from 'react'
import type { CSSProperties } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpenText,
  Calculator,
  ChevronRight,
  FlaskConical,
  Globe2,
  Heart,
  Languages,
  Layers3,
  Shield,
  Sparkles,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { GAME_LIST } from '@/lib/constants/games'
import type { GameSlug } from '@/lib/constants/games'
import { shufflePublicOptionsWithMap } from '@/lib/utils/question'
import { gradeQuestion } from '@/lib/questions/grade-question'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { renderRichText } from '@/lib/utils/rich-text'
import { isValidUuid } from '@/lib/utils/uuid'
import { isTytSocialV2ClientEnabled } from '@/lib/feature-flags/tyt-social-v2-client'
import styles from './kule.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LIVES = 3
const SCORE_PER_FLOOR = 10
const DIFFICULTY_TIERS = [
  { from: 1,  to: 5,  difficulty: 1, label: 'Temel' },
  { from: 6,  to: 12, difficulty: 2, label: 'Orta' },
  { from: 13, to: 20, difficulty: 3, label: 'Zor' },
  { from: 21, to: 99, difficulty: 3, label: 'Uzman' },
]

const GAME_PRESENTATION: Record<string, { icon: LucideIcon; image: string; note: string }> = {
  matematik: { icon: Calculator, image: '/academy/subjects/matematik-magic-v1.png', note: 'Sayılar ve problem çözme' },
  turkce: { icon: BookOpenText, image: '/academy/subjects/turkce-magic-v1.png', note: 'Dil bilgisi ve anlam' },
  fen: { icon: FlaskConical, image: '/academy/subjects/fen-magic-v1.png', note: 'Bilim ve deney soruları' },
  sosyal: { icon: Globe2, image: '/academy/subjects/sosyal-magic-v1.png', note: 'Tarih ve coğrafya' },
  wordquest: { icon: Languages, image: '/academy/modes/wordquest-v1.png', note: 'İngilizce kelime ve dil' },
}
const HS_KEY = 'bilge-arena-kule-hs-v1'

function loadHighScore(game: string): number {
  try { return parseInt(localStorage.getItem(`${HS_KEY}-${game}`) ?? '0', 10) || 0 }
  catch { return 0 }
}
function saveHighScore(game: string, score: number): void {
  try { localStorage.setItem(`${HS_KEY}-${game}`, String(score)) } catch {}
}

function getDifficulty(floor: number): number {
  for (const tier of DIFFICULTY_TIERS) {
    if (floor >= tier.from && floor <= tier.to) return tier.difficulty
  }
  return 3
}
function getTierLabel(floor: number): string {
  for (const tier of DIFFICULTY_TIERS) {
    if (floor >= tier.from && floor <= tier.to) return tier.label
  }
  return 'Uzman'
}

// ─── Types ────────────────────────────────────────────────────────────────────

type KuleQuestion = PublicQuestion & {
  optionMap: number[]
  attemptId: string
}

interface RandomQuestionResponse {
  questions?: PublicQuestion[]
  attemptId?: unknown
  expiresAt?: unknown
}

type Phase = 'menu' | 'playing' | 'feedback' | 'gameover'

interface State {
  phase: Phase
  game: GameSlug | null
  floor: number
  lives: number
  score: number
  highScore: number
  question: KuleQuestion | null
  selected: number | null
  correctOption: number | null
  solution: string | null
  grading: boolean
  gradeError: string | null
  loading: boolean
  error: string | null
  /** last feedback result */
  lastCorrect: boolean
}

type Action =
  | { type: 'SELECT_GAME'; game: GameSlug; highScore: number }
  | { type: 'SET_QUESTION'; question: KuleQuestion }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'START_GRADING'; idx: number }
  | { type: 'GRADE_RESULT'; isCorrect: boolean; correctOption: number; solution: string | null }
  | { type: 'GRADE_FAILED'; error: string }
  | { type: 'NEXT_FLOOR' }
  | { type: 'RESTART' }
  | { type: 'BACK_TO_MENU' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SELECT_GAME':
      return { ...state, phase: 'playing', game: action.game, floor: 1, lives: MAX_LIVES, score: 0, highScore: action.highScore, question: null, selected: null, correctOption: null, solution: null, grading: false, gradeError: null, loading: true, error: null, lastCorrect: false }
    case 'SET_QUESTION':
      return { ...state, question: action.question, loading: false, error: null, selected: null, correctOption: null, solution: null, grading: false, gradeError: null }
    case 'SET_LOADING':
      return { ...state, loading: action.loading }
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false }
    case 'START_GRADING':
      if (state.selected !== null || !state.question || state.grading) return state
      return { ...state, selected: action.idx, grading: true, gradeError: null }
    case 'GRADE_RESULT': {
      if (state.selected === null || !state.question) return state
      const correct = action.isCorrect
      const newLives = correct ? state.lives : state.lives - 1
      const newScore = correct ? state.score + SCORE_PER_FLOOR : state.score
      const gameOver = newLives <= 0
      return {
        ...state,
        correctOption: action.correctOption,
        solution: action.solution,
        grading: false,
        lives: newLives,
        score: newScore,
        lastCorrect: correct,
        phase: gameOver ? 'gameover' : 'feedback',
      }
    }
    case 'GRADE_FAILED':
      return { ...state, selected: null, grading: false, gradeError: action.error }
    case 'NEXT_FLOOR':
      return { ...state, phase: 'playing', floor: state.floor + 1, question: null, selected: null, correctOption: null, solution: null, grading: false, gradeError: null, loading: true, error: null }
    case 'RESTART':
      return { ...state, phase: 'playing', floor: 1, lives: MAX_LIVES, score: 0, question: null, selected: null, correctOption: null, solution: null, grading: false, gradeError: null, loading: true, error: null, highScore: Math.max(state.score, state.highScore) }
    case 'BACK_TO_MENU':
      return { ...state, phase: 'menu', game: null, question: null, selected: null, correctOption: null, solution: null, grading: false, gradeError: null, loading: false, error: null, lastCorrect: false }
    default: return state
  }
}

const INIT: State = {
  phase: 'menu', game: null, floor: 1, lives: MAX_LIVES, score: 0, highScore: 0,
  question: null, selected: null, correctOption: null, solution: null, grading: false, gradeError: null, loading: false, error: null, lastCorrect: false,
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KuleClient() {
  const [state, dispatch] = useReducer(reducer, INIT)
  const gradingRef = useRef(false)
  const learnerV2Enabled = isTytSocialV2ClientEnabled()

  const fetchQuestion = useCallback(async (game: string, floor: number) => {
    dispatch({ type: 'SET_LOADING', loading: true })
    const diff = getDifficulty(floor)
    try {
      const makeQuestionUrl = (difficulty?: number) => {
        const params = new URLSearchParams({ game, limit: '1', mode: 'classic' })
        if (difficulty !== undefined) params.set('difficulty', String(difficulty))
        if (learnerV2Enabled && game === 'sosyal') params.set('examRef', 'TYT')
        return `/api/questions/random?${params.toString()}`
      }
      // 1. deneme: zorluk filtreli
      let res = await fetch(makeQuestionUrl(diff), { cache: 'no-store' })
      if (!res.ok) {
        if (learnerV2Enabled && game === 'sosyal' && res.status === 409) {
          throw new Error('Önce Çalış sayfasında TYT Sosyal cevaplama düzenini seçmelisin.')
        }
        throw new Error('Soru alınamadı')
      }
      let data = await res.json() as RandomQuestionResponse
      let qs: PublicQuestion[] = data.questions ?? []

      // 2. deneme: zorluk filtresi olmadan (o zorlukta soru yoksa)
      if (qs.length === 0) {
        res = await fetch(makeQuestionUrl(), { cache: 'no-store' })
        if (!res.ok) {
          if (learnerV2Enabled && game === 'sosyal' && res.status === 409) {
            throw new Error('Önce Çalış sayfasında TYT Sosyal cevaplama düzenini seçmelisin.')
          }
          throw new Error('Soru alınamadı')
        }
        data = await res.json() as RandomQuestionResponse
        qs = data.questions ?? []
      }

      if (qs.length === 0) throw new Error('Soru bulunamadı')
      // Seçenek sırasını karıştır — her oynayışta farklı görünüm
      if (
        typeof data.attemptId !== 'string' ||
        !isValidUuid(data.attemptId) ||
        typeof data.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(data.expiresAt)) ||
        Date.parse(data.expiresAt) <= Date.now()
      ) {
        throw new Error('Soru oturumu dogrulanamadi')
      }
      const q = qs[0]
      const shuffled = shufflePublicOptionsWithMap(q.content)
      dispatch({
        type: 'SET_QUESTION',
        question: {
          ...q,
          content: shuffled.content,
          optionMap: shuffled.map,
          attemptId: data.attemptId,
        },
      })
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message })
    }
  }, [learnerV2Enabled])

  // Yeni kat / yeni oyun → soru çek
  useEffect(() => {
    if (state.phase === 'playing' && state.game && state.loading && !state.question) {
      fetchQuestion(state.game, state.floor)
    }
  }, [state.phase, state.game, state.floor, state.loading, state.question, fetchQuestion])

  const handleAnswer = useCallback(async (displayIndex: number) => {
    const question = state.question
    if (!question || state.phase !== 'playing' || state.selected !== null || gradingRef.current) return
    const canonicalIndex = question.optionMap[displayIndex]
    if (!Number.isInteger(canonicalIndex)) return

    gradingRef.current = true
    dispatch({ type: 'START_GRADING', idx: displayIndex })
    try {
      const grade = await gradeQuestion(question.id, canonicalIndex, question.attemptId)
      const correctOption = question.optionMap.indexOf(grade.correctOption)
      if (correctOption < 0) throw new Error('invalid_grade_response')
      dispatch({ type: 'GRADE_RESULT', isCorrect: grade.isCorrect, correctOption, solution: grade.solution })
    } catch {
      dispatch({ type: 'GRADE_FAILED', error: 'Cevap kontrol edilemedi. Lütfen tekrar dene.' })
    } finally {
      gradingRef.current = false
    }
  }, [state.question, state.phase, state.selected])

  // Oyun bitti → high score kaydet
  useEffect(() => {
    if (state.phase === 'gameover' && state.game) {
      const best = Math.max(state.score, state.highScore)
      saveHighScore(state.game, best)
    }
  }, [state.phase, state.game, state.score, state.highScore])

  // ── Menü ──
  if (state.phase === 'menu') {
    return (
      <div className={styles.root}>
        <div className={styles.menuShell}>
          <section className={styles.towerHero} aria-labelledby="kule-baslik">
            <div className={styles.towerArt} aria-hidden="true">
              <Image
                src="/academy/modes/tower-portrait-v2.png"
                alt=""
                fill
                sizes="(min-width: 980px) 58vw, 100vw"
                priority
              />
            </div>
            <div className={styles.towerCopy}>
              <Link href="/arena" className={styles.backLink}>
                <ArrowLeft size={15} aria-hidden="true" /> Oyunlara dön
              </Link>
              <span className={styles.eyebrow}>Adım adım zorlaşan mücadele</span>
              <h1 id="kule-baslik">Bilginle yüksel, kulenin zirvesini gör.</h1>
              <p>
                Üç canla başla. Her doğru cevap seni bir kat yukarı taşırken sorular
                giderek zorlaşır. En yüksek skorunu geçmeye çalış.
              </p>
              <div className={styles.statRow} aria-label="Kule Modu kuralları">
                <div className={styles.statCard}>
                  <span className={styles.statIcon}><Heart size={17} aria-hidden="true" /></span>
                  <div><strong>3 can</strong><span>Yanlışlarda azalır</span></div>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statIcon}><Layers3 size={17} aria-hidden="true" /></span>
                  <div><strong>Sonsuz kat</strong><span>Zorluk yükselir</span></div>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statIcon}><Trophy size={17} aria-hidden="true" /></span>
                  <div><strong>Rekor hedefi</strong><span>Her doğru +10</span></div>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.subjectPanel} aria-labelledby="ders-sec-baslik">
            <span className={styles.eyebrow}>Mücadele alanını seç</span>
            <h2 id="ders-sec-baslik">Kuleye hangi dersle çıkacaksın?</h2>
            <p className={styles.subjectIntro}>
              Her dersin rekoru ayrı tutulur. Kartını seçtiğinde ilk kat hemen başlar.
            </p>

            <div className={styles.subjectGrid}>
              {GAME_LIST.map((game) => {
                const hs = loadHighScore(game.slug)
                const presentation = GAME_PRESENTATION[game.slug] ?? {
                  icon: Sparkles,
                  image: '/academy/modes/tower-v1.png',
                  note: 'Karışık soru mücadelesi',
                }
                const Icon = presentation.icon
                return (
                  <button
                    key={game.slug}
                    onClick={() => {
                      const highScore = loadHighScore(game.slug)
                      dispatch({ type: 'SELECT_GAME', game: game.slug as GameSlug, highScore })
                    }}
                    className={styles.subjectCard}
                    style={{ '--subject': game.colorHex } as CSSProperties}
                    aria-label={`${game.name} ile Kule Modu başlat${hs > 0 ? `, en iyi skor ${hs}` : ''}`}
                  >
                    <span className={styles.subjectArt} aria-hidden="true">
                      <Image
                        src={presentation.image}
                        alt=""
                        fill
                        sizes="(min-width: 980px) 240px, (min-width: 640px) 45vw, 100vw"
                      />
                    </span>
                    <span className={styles.subjectCardContent}>
                      <span className={styles.subjectCardIcon}><Icon size={18} aria-hidden="true" /></span>
                      <span>
                        <strong>{game.name}</strong>
                        <small>{hs > 0 ? `En iyi skor: ${hs}` : presentation.note}</small>
                      </span>
                      <span className={styles.subjectArrow}><ChevronRight size={15} aria-hidden="true" /></span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className={styles.ruleStrip} aria-label="Zorluk katları">
              <span><b>1–5</b> Temel</span>
              <span><b>6–12</b> Orta</span>
              <span><b>13–20</b> Zor</span>
              <span><b>21+</b> Uzman</span>
            </div>
          </section>
        </div>
      </div>
    )
  }

  const gameConfig = state.game ? GAME_LIST.find((g) => g.slug === state.game) : null
  const color = gameConfig?.colorHex ?? 'var(--focus)'
  const tierLabel = getTierLabel(state.floor)

  // ── Oyun Bitti ──
  if (state.phase === 'gameover') {
    const best = Math.max(state.score, state.highScore)
    const isNewRecord = state.score > state.highScore
    return (
      <div className={styles.root} style={{ '--subject': color } as CSSProperties}>
        <div className={styles.gameOverShell}>
          <section className={styles.gameOverCard} aria-labelledby="oyun-bitti-baslik">
            <div className={styles.gameOverIcon}>
              <Image src="/academy/modes/tower-v1.png" alt="Kule" fill sizes="148px" priority />
            </div>
            <span className={styles.eyebrow}>{gameConfig?.name ?? 'Kule Modu'} · Tur tamamlandı</span>
            <h2 id="oyun-bitti-baslik" className="mt-2">Oyun Bitti</h2>
            <p className="mt-2 text-sm text-[#aebddb]">
              {state.floor - 1}. kata kadar çıktın
            </p>

            <div
              className={styles.resultCard}
              style={{ border: `1px solid ${color}40`, background: `color-mix(in srgb, ${color} 10%, rgba(6, 15, 36, 0.72))` }}
            >
              <div className="mb-1 text-[10px] font-extrabold tracking-widest text-[#91a3c3] uppercase">
                Toplam skor
              </div>
              <div className="text-4xl font-black" style={{ color }}>
                {state.score}
              </div>
              {isNewRecord ? (
                <div className="mt-1 text-xs font-bold text-[#ffc44d]">
                  Yeni rekoru kırdın!
                </div>
              ) : (
                <div className="mt-1 text-xs text-[#91a3c3]">
                  En iyi: {best}
                </div>
              )}
            </div>

            <div className={styles.resultActions}>
              <button
                onClick={() => dispatch({ type: 'RESTART' })}
                className={styles.primaryButton}
                style={{ background: color, color: '#fff' }}
              >
                Tekrar Oyna
              </button>
              <button
                onClick={() => dispatch({ type: 'BACK_TO_MENU' })}
                className={styles.secondaryButton}
              >
                Ders Seçimine Dön
              </button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  // ── Oyun HUD ──
  const liveArr = Array.from({ length: MAX_LIVES }, (_, i) => i < state.lives)
  const activePresentation = state.game ? GAME_PRESENTATION[state.game] : null
  const ActiveIcon = activePresentation?.icon ?? Shield
  const towerStart = Math.max(1, state.floor - 2)
  const towerFloors = Array.from({ length: 7 }, (_, index) => towerStart + 6 - index)

  return (
    <div className={styles.root} style={{ '--subject': color } as CSSProperties}>
      <div className={styles.gameShell}>
        <div className={styles.gameTopline}>
          <button onClick={() => dispatch({ type: 'BACK_TO_MENU' })} className={styles.backButton}>
            <ArrowLeft size={15} aria-hidden="true" /> Ders seçimine dön
          </button>
          <div className={styles.gameIdentity}>
            <span><ActiveIcon size={17} aria-hidden="true" /></span>
            <span>{gameConfig?.name ?? 'Kule Modu'}</span>
          </div>
        </div>

        {/* HUD */}
        <div className={styles.hud}>
          <div className={styles.lives} aria-label={`${state.lives} can kaldı`}>
            {liveArr.map((alive, i) => (
              <Heart
                key={i}
                size={19}
                className={styles.heart}
                fill="currentColor"
                aria-hidden="true"
                style={{ opacity: alive ? 1 : 0.18 }}
              />
            ))}
          </div>

          <div className={styles.floor}>
            <strong style={{ color }}>{state.floor}. KAT</strong>
            <span>{tierLabel}</span>
          </div>

          <div className={styles.score}>
            <strong>{state.score}</strong>
            <span>Skor</span>
          </div>
        </div>

        <div className={styles.gameArena}>
          <aside className={styles.towerProgress} aria-label="Kule katları">
            <div className={styles.towerBackdrop} aria-hidden="true">
              <Image
                src="/academy/modes/tower-portrait-v2.png"
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 270px"
                priority
              />
            </div>

            <div className={styles.towerStack}>
              {towerFloors.map((floorNumber) => {
                const floorState = floorNumber === state.floor
                  ? 'active'
                  : floorNumber < state.floor
                    ? 'complete'
                    : 'locked'

                return (
                  <div
                    key={floorNumber}
                    className={styles.towerFloor}
                    data-state={floorState}
                    aria-current={floorState === 'active' ? 'step' : undefined}
                    aria-label={floorNumber + '. Kat, ' + (floorState === 'complete' ? 'geçildi' : floorState === 'active' ? 'buradasın' : 'kilitli')}
                  >
                    <span className={styles.floorCopy}>
                      <strong>{floorNumber}. Kat</strong>
                      {floorState === 'active' && <small>Buradasın</small>}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className={styles.towerRule}>
              <span>Yükseliş kuralı</span>
              <strong>Her doğru cevapta bir kat</strong>
            </div>
          </aside>

          <div className={styles.challengeColumn}>
            {/* Yükleniyor */}
            {state.loading && (
              <div className={styles.loading}>
                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
              </div>
            )}

            {/* Hata */}
            {!state.loading && state.error && (
              <div className={styles.errorState}>
                <Shield size={30} className="text-[#7eacff]" aria-hidden="true" />
                <p className="text-sm text-[#b7c4df]">{state.error}</p>
                <button
                  onClick={() => fetchQuestion(state.game!, state.floor)}
                  className={styles.secondaryButton}
                  style={{ paddingInline: 18 }}
                >
                  Tekrar Dene
                </button>
                {state.game === 'sosyal' && (
                  <Link
                    href="/arena/calisma"
                    className="text-xs font-bold text-[var(--focus)] underline underline-offset-2"
                  >
                    Çalış sayfasına git
                  </Link>
                )}
              </div>
            )}

            {/* Soru */}
            {!state.loading && !state.error && state.question && (
              <div className={styles.gamePanel}>
                <p className={styles.questionLabel}>Kule sorusu · Kat {state.floor}</p>
                <p className={styles.questionText}>
                  {renderRichText(state.question.content.question || state.question.content.sentence || '')}
                </p>

                <div className={styles.options}>
                  {state.question.content.options.map((opt, i) => {
                    const answered = state.selected !== null
                    const isCorrect = i === state.correctOption
                    const isSelected = i === state.selected

                    let bg = 'var(--bg-secondary)'
                    let borderColor = 'var(--border)'
                    let textColor = 'var(--text)'

                    if (answered) {
                      if (isCorrect) {
                        bg = 'var(--growth-bg)'
                        borderColor = 'var(--growth-border)'
                        textColor = 'var(--growth)'
                      } else if (isSelected) {
                        bg = 'color-mix(in srgb, var(--urgency) 10%, transparent)'
                        borderColor = 'color-mix(in srgb, var(--urgency) 30%, transparent)'
                        textColor = 'var(--urgency)'
                      }
                    }

                    const label = ['A', 'B', 'C', 'D', 'E'][i] ?? String(i + 1)

                    return (
                      <button
                        key={i}
                        onClick={() => void handleAnswer(i)}
                        disabled={answered || state.grading}
                        className={`${styles.option} flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 disabled:cursor-default`}
                        style={{ background: bg, borderColor, color: textColor }}
                        data-state={answered ? (isCorrect ? 'correct' : isSelected ? 'wrong' : 'answered') : 'idle'}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
                          style={{ background: borderColor, color: textColor }}
                        >
                          {answered && isCorrect ? '✓' : answered && isSelected ? '✕' : label}
                        </span>
                        <span>{renderRichText(opt)}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Geri bildirim sonrası devam */}
                {state.grading && (
                  <p className="mt-3 text-center text-xs text-[var(--text-sub)]">Kontrol ediliyor...</p>
                )}
                {state.gradeError && (
                  <p className="mt-3 text-center text-xs text-[var(--urgency)]">{state.gradeError}</p>
                )}

                {state.phase === 'feedback' && (
                  <>
                    <div
                      className={`${styles.feedback} border p-3 text-center text-sm font-bold ${
                        state.lastCorrect ? 'border-[var(--growth-border)] bg-[var(--growth-bg)] text-[var(--growth)]' : 'border-[color-mix(in_srgb,var(--urgency)_30%,transparent)] bg-[color-mix(in_srgb,var(--urgency)_10%,transparent)] text-[var(--urgency)]'
                      }`}
                    >
                      {state.lastCorrect
                        ? `✓ Doğru! +${SCORE_PER_FLOOR} puan`
                        : `✕ Yanlış! ${state.lives} can kaldı`}
                    </div>
                    {state.solution && (
                      <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[10px] text-[var(--text-sub)]">
                        💡 {state.solution}
                      </p>
                    )}
                    <button
                      onClick={() => dispatch({ type: 'NEXT_FLOOR' })}
                      className={`${styles.nextButton} mt-3 w-full text-sm text-white`}
                      style={{ background: color }}
                    >
                      Sonraki Kat ↑
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
