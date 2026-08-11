'use client'

/**
 * Bilge Arena Oda: <QuickPlayPanel> "Hızlı Antrenman" CTA
 * Sprint 2B Task 4 (Solo mode) + Codex review fix
 *
 * /oda sekmesinin ust kisminda gosterilir. Tek tikla 3 deneme botuyla solo
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
import { Dumbbell, Sparkles } from 'lucide-react'
import Link from 'next/link'

const initialState: QuickPlayRoomActionState = {}

export function QuickPlayPanel({ authenticated = true }: { authenticated?: boolean }) {
  const [state, formAction, isPending] = useActionState(
    quickPlayRoomAction,
    initialState,
  )

  return (
    <section
      aria-label="Hızlı Antrenman"
      data-testid="quick-play-panel"
      className="rounded-2xl border border-[var(--focus)]/30 bg-[var(--focus-bg)] p-4 shadow-sm sm:p-5"
    >
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--focus)]/15 text-[var(--focus-text)]">
          <Dumbbell aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--focus-text)]">
            Hemen başla
          </p>
          <h2 className="mt-0.5 text-lg font-extrabold">Hızlı Antrenman</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
            10 soruluk oda anında kurulur. Deneme botları yanıt vermez;
            akışı beklemeden deneyebilirsin.
          </p>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-bold text-[var(--text-sub)]">
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1">10 soru</span>
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1">Orta seviye</span>
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1">Bekleme yok</span>
      </div>

      <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label
            htmlFor="quick-play-category"
            className="mb-1 block text-xs font-bold text-[var(--text-sub)]"
          >
            Antrenman kategorisi
          </label>
          <select
            id="quick-play-category"
            name="category"
            required
            defaultValue="paragraf"
            aria-label="Hızlı antrenman kategorisi"
            aria-invalid={state.fieldErrors?.category ? 'true' : undefined}
            className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--focus)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/30"
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
          {state.fieldErrors?.category && state.fieldErrors.category[0] && (
            <p
              role="alert"
              className="mt-1 text-xs text-[var(--urgency-text)]"
            >
              {state.fieldErrors.category[0]}
            </p>
          )}
        </div>

        <input type="hidden" name="difficulty" value="2" />
        <input type="hidden" name="question_count" value="10" />

        {authenticated ? (
          <button
            type="submit"
            disabled={isPending}
            className="btn-primary min-h-12 gap-2 px-5 text-sm disabled:opacity-50 sm:self-end"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            {isPending ? 'Hazırlanıyor…' : 'Antrenmanı Başlat'}
          </button>
        ) : (
          <Link
            href="/giris?redirect=/oda"
            className="btn-primary min-h-12 gap-2 px-5 text-sm sm:self-end"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Giriş Yap ve Başla
          </Link>
        )}
      </form>

      {state.error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-[var(--urgency-bg)] px-3 py-2 text-xs text-[var(--urgency-text)]"
        >
          {state.error}
        </p>
      )}
    </section>
  )
}
