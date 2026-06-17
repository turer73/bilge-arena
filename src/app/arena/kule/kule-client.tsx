'use client'

import { useEffect, useCallback, useReducer } from 'react'
import Link from 'next/link'
import { GAME_LIST } from '@/lib/constants/games'
import type { GameSlug } from '@/lib/constants/games'
import { shuffleOptions } from '@/lib/utils/question'
import { renderRichText } from '@/lib/utils/rich-text'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LIVES = 3
const SCORE_PER_FLOOR = 10
const DIFFICULTY_TIERS = [
  { from: 1,  to: 5,  difficulty: 1, label: 'Temel' },
  { from: 6,  to: 12, difficulty: 2, label: 'Orta' },
  { from: 13, to: 20, difficulty: 3, label: 'Zor' },
  { from: 21, to: 99, difficulty: 3, label: 'Uzman' },
]

const GAME_EMOJI: Record<string, string> = {
  matematik: '🧮', turkce: '📝', fen: '🔬', sosyal: '🌍', wordquest: '🌐',
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

interface KuleQuestion {
  id: string
  content: { question: string; options: string[]; answer: number; solution?: string }
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
  | { type: 'SELECT_ANSWER'; idx: number }
  | { type: 'NEXT_FLOOR' }
  | { type: 'RESTART' }
  | { type: 'BACK_TO_MENU' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SELECT_GAME':
      return { ...state, phase: 'playing', game: action.game, floor: 1, lives: MAX_LIVES, score: 0, highScore: action.highScore, question: null, selected: null, loading: true, error: null }
    case 'SET_QUESTION':
      return { ...state, question: action.question, loading: false, error: null, selected: null }
    case 'SET_LOADING':
      return { ...state, loading: action.loading }
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false }
    case 'SELECT_ANSWER': {
      if (state.selected !== null || !state.question) return state
      const correct = action.idx === state.question.content.answer
      const newLives = correct ? state.lives : state.lives - 1
      const newScore = correct ? state.score + SCORE_PER_FLOOR : state.score
      const gameOver = newLives <= 0
      return {
        ...state,
        selected: action.idx,
        lives: newLives,
        score: newScore,
        lastCorrect: correct,
        phase: gameOver ? 'gameover' : 'feedback',
      }
    }
    case 'NEXT_FLOOR':
      return { ...state, phase: 'playing', floor: state.floor + 1, question: null, selected: null, loading: true, error: null }
    case 'RESTART':
      return { ...state, phase: 'playing', floor: 1, lives: MAX_LIVES, score: 0, question: null, selected: null, loading: true, error: null, highScore: Math.max(state.score, state.highScore) }
    case 'BACK_TO_MENU':
      return { ...state, phase: 'menu', game: null, question: null }
    default: return state
  }
}

const INIT: State = {
  phase: 'menu', game: null, floor: 1, lives: MAX_LIVES, score: 0, highScore: 0,
  question: null, selected: null, loading: false, error: null, lastCorrect: false,
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KuleClient() {
  const [state, dispatch] = useReducer(reducer, INIT)

  const fetchQuestion = useCallback(async (game: string, floor: number) => {
    dispatch({ type: 'SET_LOADING', loading: true })
    const diff = getDifficulty(floor)
    try {
      // 1. deneme: zorluk filtreli
      let res = await fetch(`/api/questions/random?game=${game}&difficulty=${diff}&limit=1`)
      if (!res.ok) throw new Error('Soru alınamadı')
      let data = await res.json()
      let qs: KuleQuestion[] = data.questions ?? []

      // 2. deneme: zorluk filtresi olmadan (o zorlukta soru yoksa)
      if (qs.length === 0) {
        res = await fetch(`/api/questions/random?game=${game}&limit=1`)
        if (!res.ok) throw new Error('Soru alınamadı')
        data = await res.json()
        qs = data.questions ?? []
      }

      if (qs.length === 0) throw new Error('Soru bulunamadı')
      // Seçenek sırasını karıştır — her oynayışta farklı görünüm
      const q = qs[0]
      dispatch({ type: 'SET_QUESTION', question: { ...q, content: shuffleOptions(q.content) } })
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message })
    }
  }, [])

  // Yeni kat / yeni oyun → soru çek
  useEffect(() => {
    if (state.phase === 'playing' && state.game && state.loading && !state.question) {
      fetchQuestion(state.game, state.floor)
    }
  }, [state.phase, state.game, state.floor, state.loading, state.question, fetchQuestion])

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
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <h1 className="mb-2 font-display text-3xl font-black md:text-4xl">
          🗼{' '}
          <span className="bg-gradient-to-b from-[var(--reward)] to-[var(--focus)] bg-clip-text text-transparent">
            Kule Modu
          </span>
        </h1>
        <p className="mb-1 text-sm text-[var(--text-sub)]">
          3 can ile kuleyi tırman. Her katta zorluk artar.
        </p>
        <div className="mb-6 flex justify-center gap-3 text-xs text-[var(--text-muted)]">
          <span>❤️ 3 can</span>
          <span>·</span>
          <span>⬆️ Sonsuz kat</span>
          <span>·</span>
          <span>🏆 Skor kazan</span>
        </div>

        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Bir Oyun Seç
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GAME_LIST.map((game) => {
            const hs = loadHighScore(game.slug)
            return (
              <button
                key={game.slug}
                onClick={() => {
                  const highScore = loadHighScore(game.slug)
                  dispatch({ type: 'SELECT_GAME', game: game.slug as GameSlug, highScore })
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ '--c': game.colorHex } as React.CSSProperties}
              >
                <span className="text-2xl leading-none">{GAME_EMOJI[game.slug] || '📋'}</span>
                <span className="text-xs font-bold" style={{ color: game.colorHex }}>
                  {game.name}
                </span>
                {hs > 0 && (
                  <span className="text-[9px] text-[var(--text-muted)]">En iyi: {hs}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          <Link href="/arena" className="text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-sub)]">
            ← Arena&apos;ya Dön
          </Link>
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
      <div className="mx-auto max-w-sm px-4 py-10 text-center">
        <div className="mb-2 text-6xl">💀</div>
        <h2 className="mb-1 font-display text-2xl font-black">Oyun Bitti</h2>
        <p className="mb-5 text-sm text-[var(--text-sub)]">
          {state.floor - 1}. kata kadar çıktın
        </p>

        <div
          className="mb-6 rounded-2xl border p-5"
          style={{ borderColor: `${color}40`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
        >
          <div className="mb-1 text-[10px] font-extrabold tracking-widest text-[var(--text-muted)] uppercase">
            Skor
          </div>
          <div className="font-display text-4xl font-black" style={{ color }}>
            {state.score}
          </div>
          {isNewRecord ? (
            <div className="mt-1 text-xs font-bold" style={{ color: 'var(--reward)' }}>
              🏆 Yeni rekoru kırdın!
            </div>
          ) : (
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              En iyi: {best}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => dispatch({ type: 'RESTART' })}
            className="flex-1 rounded-xl py-3 text-sm font-bold text-white"
            style={{ background: color }}
          >
            Tekrar Oyna
          </button>
          <button
            onClick={() => dispatch({ type: 'BACK_TO_MENU' })}
            className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-semibold text-[var(--text-sub)]"
          >
            Menüye Dön
          </button>
        </div>
      </div>
    )
  }

  // ── Oyun HUD ──
  const liveArr = Array.from({ length: MAX_LIVES }, (_, i) => i < state.lives)

  return (
    <div className="mx-auto max-w-lg px-4 py-5">

      {/* HUD */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5">
        <div className="flex items-center gap-1">
          {liveArr.map((alive, i) => (
            <span key={i} className="text-lg leading-none" style={{ opacity: alive ? 1 : 0.25 }}>
              ❤️
            </span>
          ))}
        </div>

        <div className="text-center">
          <div
            className="font-display text-lg font-black leading-none"
            style={{ color }}
          >
            {state.floor}. KAT
          </div>
          <div className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
            {tierLabel}
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-black" style={{ color: 'var(--reward)' }}>
            {state.score}
          </div>
          <div className="text-[9px] text-[var(--text-muted)]">skor</div>
        </div>
      </div>

      {/* Yükleniyor */}
      {state.loading && (
        <div className="flex h-60 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
        </div>
      )}

      {/* Hata */}
      {!state.loading && state.error && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="text-3xl">😕</span>
          <p className="text-sm text-[var(--text-sub)]">{state.error}</p>
          <button
            onClick={() => fetchQuestion(state.game!, state.floor)}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Soru */}
      {!state.loading && !state.error && state.question && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
          <p className="mb-5 text-sm font-semibold leading-relaxed md:text-base">
            {renderRichText(state.question.content.question)}
          </p>

          <div className="space-y-2">
            {state.question.content.options.map((opt, i) => {
              const answered = state.selected !== null
              const isCorrect = i === state.question!.content.answer
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

              const label = ['A', 'B', 'C', 'D'][i]

              return (
                <button
                  key={i}
                  onClick={() => dispatch({ type: 'SELECT_ANSWER', idx: i })}
                  disabled={answered}
                  className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 disabled:cursor-default"
                  style={{ background: bg, borderColor, color: textColor }}
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
          {state.phase === 'feedback' && (
            <>
              <div
                className={`mt-4 rounded-xl border p-3 text-center text-sm font-bold ${
                  state.lastCorrect ? 'border-[var(--growth-border)] bg-[var(--growth-bg)] text-[var(--growth)]' : 'border-[color-mix(in_srgb,var(--urgency)_30%,transparent)] bg-[color-mix(in_srgb,var(--urgency)_10%,transparent)] text-[var(--urgency)]'
                }`}
              >
                {state.lastCorrect
                  ? `✓ Doğru! +${SCORE_PER_FLOOR} puan`
                  : `✕ Yanlış! ${state.lives} can kaldı`}
              </div>
              {state.question.content.solution && (
                <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[10px] text-[var(--text-sub)]">
                  💡 {state.question.content.solution}
                </p>
              )}
              <button
                onClick={() => dispatch({ type: 'NEXT_FLOOR' })}
                className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: color }}
              >
                Sonraki Kat ↑
              </button>
            </>
          )}
        </div>
      )}

      {/* Menüye dön linki */}
      <div className="mt-4 text-center">
        <button
          onClick={() => dispatch({ type: 'BACK_TO_MENU' })}
          className="text-[10px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-sub)]"
        >
          ← Menüye Dön
        </button>
      </div>
    </div>
  )
}
