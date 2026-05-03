'use client'

/**
 * Bilge Arena Oda: <CreateRoomForm> /oda/yeni form bileseni
 * Sprint 1 PR4a Task 4
 *
 * Codebase'in ilk Server Action form'u. useActionState (React 19) ile
 * pending state + fieldErrors + global error UX'i.
 *
 * 7 alan: title, category, difficulty, question_count, max_players,
 * per_question_seconds, mode. Defaults Zod schema ile uyumlu.
 *
 * Category: 4a icin hard-coded 10 secenek (genel-kultur, tarih, cografya,
 * edebiyat, matematik, fen, ingilizce, vatandaslik, futbol, sinema).
 * Dynamic fetch (games.categories) Sprint 2 backlog.
 */

import { useActionState } from 'react'
import {
  createRoomAction,
  type CreateRoomActionState,
} from '@/lib/rooms/actions'
import { CATEGORY_GROUPS } from '@/lib/rooms/validations'
import { Field } from './Field'
import { NumField } from './NumField'

const initialState: CreateRoomActionState = {}

export function CreateRoomForm() {
  const [state, formAction, isPending] = useActionState(
    createRoomAction,
    initialState,
  )

  return (
    <form
      action={formAction}
      className="space-y-4"
      noValidate
      aria-label="Yeni oda olusturma formu"
    >
      <Field
        label="Oda Adı"
        name="title"
        required
        maxLength={80}
        error={state.fieldErrors?.title?.[0]}
      />

      <Field
        label="Kategori"
        name="category"
        error={state.fieldErrors?.category?.[0]}
      >
        <select
          id="field-category"
          name="category"
          required
          defaultValue="paragraf"
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
      </Field>

      <NumField
        label="Zorluk (1-5)"
        name="difficulty"
        min={1}
        max={5}
        defaultValue={2}
        error={state.fieldErrors?.difficulty?.[0]}
      />
      <NumField
        label="Soru Sayısı (5-30)"
        name="question_count"
        min={5}
        max={30}
        defaultValue={10}
        error={state.fieldErrors?.question_count?.[0]}
      />
      <NumField
        label="Maksimum Oyuncu (2-20)"
        name="max_players"
        min={2}
        max={20}
        defaultValue={8}
        error={state.fieldErrors?.max_players?.[0]}
      />
      <NumField
        label="Soru Süresi (10-60 sn)"
        name="per_question_seconds"
        min={10}
        max={60}
        defaultValue={20}
        error={state.fieldErrors?.per_question_seconds?.[0]}
      />

      <NumField
        label="Otomatik Geçiş Süresi (0-30 sn, 0 = manuel)"
        name="auto_advance_seconds"
        min={0}
        max={30}
        defaultValue={5}
        error={state.fieldErrors?.auto_advance_seconds?.[0]}
      />

      {/* Sprint 2A Task 3: Public oda checkbox */}
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            id="field-is-public"
            name="is_public"
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Herkese Açık</span>
            <span className="ml-1 text-xs text-[var(--text-sub)]">
              (Aktif Odalar listesinde herkes görür, max 6 oyuncu)
            </span>
          </span>
        </label>
      </div>

      <Field label="Mod" name="mode" error={state.fieldErrors?.mode?.[0]}>
        <select
          id="field-mode"
          name="mode"
          defaultValue="sync"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="sync">Senkron (host yönetir)</option>
          <option value="async">Asenkron (sırayla)</option>
        </select>
      </Field>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full px-6 py-3 text-base disabled:opacity-50"
      >
        {isPending ? 'Oluşturuluyor…' : 'Oda Oluştur'}
      </button>
    </form>
  )
}
