'use client'

/**
 * Bilge Arena Oda: <QuickPlayPanel> "Hızlı Oyun" CTA
 * Sprint 2B Task 4 (Solo mode)
 *
 * /oda sekmesinin ust kisminda gosterilir. Tek tikla 3 bot rakiple solo
 * oyun olusturur (quick_play_room RPC -> redirect /oda/[code]).
 *
 * Plan-deviation #71: bot ANSWER logic dahil DEGIL (PR2'de eklenir).
 * Bot uyeler reveal'a kadar pasif kalir, auto_relay deadline -> 0 puan.
 *
 * Plan-deviation #72: max_players=4 sabit (1 user + 3 bot).
 *
 * Beklenen etki: yeni user dwell 0:45 -> 4:30 (Sprint 2 plan Task 4).
 */

import { useActionState } from 'react'
import {
  quickPlayRoomAction,
  type QuickPlayRoomActionState,
} from '@/lib/rooms/actions'

const CATEGORIES = [
  { value: 'genel-kultur', label: 'Genel Kültür' },
  { value: 'tarih', label: 'Tarih' },
  { value: 'cografya', label: 'Coğrafya' },
  { value: 'edebiyat', label: 'Edebiyat' },
  { value: 'matematik', label: 'Matematik' },
  { value: 'fen', label: 'Fen Bilimleri' },
  { value: 'ingilizce', label: 'İngilizce' },
  { value: 'vatandaslik', label: 'Vatandaşlık' },
  { value: 'futbol', label: 'Futbol' },
  { value: 'sinema', label: 'Sinema' },
]

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
        <select
          id="quick-play-category"
          name="category"
          required
          defaultValue="genel-kultur"
          aria-label="Hızlı oyun kategorisi"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

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
