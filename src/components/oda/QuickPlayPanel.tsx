'use client'

/**
 * Bilge Arena Oda: <QuickPlayPanel> "Hızlı Oyun" CTA
 * Sprint 2B Task 4 (Solo mode) + Codex review fix
 *
 * /oda sekmesinin ust kisminda gosterilir. Tek tikla 3 bot rakiple solo
 * oyun olusturur (quick_play_room RPC -> redirect /oda/[code]).
 *
 * Plan-deviation #71: bot ANSWER logic dahil DEGIL (PR2'de eklenir).
 * Plan-deviation #72: max_players=4 sabit (1 user + 3 bot).
 *
 * Codex P3 #3 fix: state.fieldErrors UI'da render edilir (action signature
 * vaat ettigi gibi).
 * Codex P3 #5 fix: kategori whitelist Zod enum (validations.ts), UI labelli
 * Record ile single source of truth.
 *
 * Beklenen etki: yeni user dwell 0:45 -> 4:30 (Sprint 2 plan Task 4).
 */

import { useActionState } from 'react'
import {
  quickPlayRoomAction,
  type QuickPlayRoomActionState,
} from '@/lib/rooms/actions'
import { CATEGORY_GROUPS } from '@/lib/rooms/validations'

const initialState: QuickPlayRoomActionState = {}

export function QuickPlayPanel() {
  const [state, formAction, isPending] = useActionState(
    quickPlayRoomAction,
    initialState,
  )

  return (
    <section
      aria-label="Hızlı Oyun"
      data-testid="quick-play-panel"
      className="mb-6 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-5"
    >
      <header className="mb-3">
        <h2 className="text-lg font-bold">🤖 Hızlı Oyun</h2>
        <p className="text-xs text-[var(--text-sub)]">
          Beklemeden 3 bot rakiple oyna. Tek tıkla başla!
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <select
            id="quick-play-category"
            name="category"
            required
            defaultValue="paragraf"
            aria-label="Hızlı oyun kategorisi"
            aria-invalid={state.fieldErrors?.category ? 'true' : undefined}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
          >
            {CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.game} label={group.label}>
                {group.categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {/* Codex P3 #3 fix: fieldErrors UI'da render */}
          {state.fieldErrors?.category && state.fieldErrors.category[0] && (
            <p
              role="alert"
              className="mt-1 text-xs text-red-700 dark:text-red-300"
            >
              {state.fieldErrors.category[0]}
            </p>
          )}
        </div>

        <input type="hidden" name="difficulty" value="2" />
        <input type="hidden" name="question_count" value="10" />

        <button
          type="submit"
          disabled={isPending}
          className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
        >
          {isPending ? 'Hazırlanıyor…' : '⚡ Hızlı Oyun (3 bot rakip)'}
        </button>
      </form>

      {state.error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
    </section>
  )
}
