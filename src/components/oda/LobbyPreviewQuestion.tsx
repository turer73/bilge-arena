'use client'

/**
 * Bilge Arena Oda: <LobbyPreviewQuestion> "Aklında Tut" widget
 * Sprint 2A Task 2
 *
 * Lobby beklerken host'un "Başlat" tıklamasini bekleyen kullanicilara
 * kategori-uygun rastgele 1 soru gosterir (anti-cheat: cevap saklı).
 * Sadece beyin ısıtma — sayım/cevap yok.
 *
 * Beklenen etki: lobby dwell +40 sn, drop %30→%15.
 *
 * SSR initial soru ile mount, "Yeni Soru" butonu Server Action ile yeni
 * soru ister. Anti-cheat: correct_answer hic gelmiyor (server-fetch sift).
 *
 * Tradeoff: Plan "ayri preview pool" diyordu, MVP gercek havuzdan random
 * (plan-deviation #62, ~%1-5 oyunda cikma riski).
 */

import { useActionState } from 'react'
import {
  refreshLobbyPreviewAction,
  type RefreshLobbyPreviewActionState,
} from '@/lib/rooms/actions'
import type { LobbyPreviewQuestion as PreviewQ } from '@/lib/rooms/server-fetch'

interface LobbyPreviewQuestionProps {
  initialQuestion: PreviewQ | null
  category: string
}

export function LobbyPreviewQuestion({
  initialQuestion,
  category,
}: LobbyPreviewQuestionProps) {
  const initial: RefreshLobbyPreviewActionState = { question: initialQuestion }
  const [state, formAction, isPending] = useActionState(
    refreshLobbyPreviewAction,
    initial,
  )

  // state.question = undefined (initial mount) -> initialQuestion fallback
  const currentQuestion =
    state.question === undefined ? initialQuestion : state.question

  return (
    <section
      aria-label="Aklında tut sorusu"
      data-testid="lobby-preview-question"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--text-sub)]">
          Aklında Tut
        </h2>
        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
          Beyin Isınma
        </span>
      </header>

      {currentQuestion ? (
        <>
          <p className="mb-4 text-base font-semibold leading-relaxed">
            {currentQuestion.question}
          </p>
          <ul className="mb-4 space-y-2">
            {currentQuestion.options.map((opt, idx) => (
              <li
                key={idx}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--card)] text-xs font-bold text-[var(--text-sub)]"
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1">{opt}</span>
              </li>
            ))}
          </ul>
          <p className="mb-3 text-xs text-[var(--text-sub)]">
            Bu soru sadece beyin ısıtma — cevap gizli, oyun başlayınca asıl
            sorular gelir.
          </p>
        </>
      ) : (
        <p className="mb-4 text-sm text-[var(--text-sub)]">
          Bu kategoride henüz uygun soru yok.
        </p>
      )}

      {state.error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="category" value={category} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-bold transition-colors hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Yükleniyor…' : 'Yeni Soru'}
        </button>
      </form>
    </section>
  )
}
