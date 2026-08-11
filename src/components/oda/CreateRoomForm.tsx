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

import { useActionState, useState } from 'react'
import {
  createRoomAction,
  type CreateRoomActionState,
} from '@/lib/rooms/actions'
import { CATEGORY_GROUPS } from '@/lib/rooms/validations'
import { Field } from './Field'
import { NumField } from './NumField'

const initialState: CreateRoomActionState = {}

type PresetKey = 'duel' | 'friends' | 'pace'

interface RoomSettings {
  difficulty: number
  questionCount: number
  maxPlayers: number
  perQuestionSeconds: number
  autoAdvanceSeconds: number
  mode: 'sync' | 'async'
}

const PRESETS: Array<{
  id: PresetKey
  title: string
  description: string
  summary: string
  settings: RoomSettings
}> = [
  {
    id: 'duel',
    title: 'Hızlı Düello',
    description: 'Kısa ve tempolu bir yarış',
    summary: '10 soru · 20 sn · 4 oyuncu',
    settings: {
      difficulty: 2,
      questionCount: 10,
      maxPlayers: 4,
      perQuestionSeconds: 20,
      autoAdvanceSeconds: 5,
      mode: 'sync',
    },
  },
  {
    id: 'friends',
    title: 'Arkadaşlarla',
    description: 'Kalabalık grup için dengeli tur',
    summary: '15 soru · 30 sn · 6 oyuncu',
    settings: {
      difficulty: 3,
      questionCount: 15,
      maxPlayers: 6,
      perQuestionSeconds: 30,
      autoAdvanceSeconds: 5,
      mode: 'sync',
    },
  },
  {
    id: 'pace',
    title: 'Kendi Hızında',
    description: 'Herkes uygun olduğunda çözer',
    summary: '10 soru · manuel geçiş · 6 oyuncu',
    settings: {
      difficulty: 2,
      questionCount: 10,
      maxPlayers: 6,
      perQuestionSeconds: 30,
      autoAdvanceSeconds: 0,
      mode: 'async',
    },
  },
]

export function CreateRoomForm() {
  const [state, formAction, isPending] = useActionState(
    createRoomAction,
    initialState,
  )
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>('duel')
  const [settings, setSettings] = useState<RoomSettings>(PRESETS[0].settings)
  const [isPublic, setIsPublic] = useState(false)

  const applyPreset = (presetId: PresetKey) => {
    const preset = PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setSelectedPreset(presetId)
    setSettings(preset.settings)
  }

  const updateNumber =
    (key: Exclude<keyof RoomSettings, 'mode'>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value)
      setSettings((current) => ({ ...current, [key]: nextValue }))
    }

  const advancedError = Boolean(
    state.fieldErrors?.difficulty?.[0] ||
      state.fieldErrors?.question_count?.[0] ||
      state.fieldErrors?.max_players?.[0] ||
      state.fieldErrors?.per_question_seconds?.[0] ||
      state.fieldErrors?.auto_advance_seconds?.[0] ||
      state.fieldErrors?.mode?.[0],
  )

  return (
    <form
      action={formAction}
      className="space-y-6"
      noValidate
      aria-label="Yeni oda olusturma formu"
    >
      <fieldset>
        <legend className="text-sm font-extrabold">Nasıl oynamak istersin?</legend>
        <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
          Bir hazır ayar seç. İstersen ayrıntıları aşağıdan değiştirebilirsin.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PRESETS.map((preset) => {
            const selected = preset.id === selectedPreset
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                onClick={() => applyPreset(preset.id)}
                className={`min-h-32 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${
                  selected
                    ? 'border-[var(--focus)] bg-[var(--focus-bg)] shadow-sm'
                    : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--focus)]/60'
                }`}
              >
                <span
                  className={`block text-sm font-extrabold ${
                    selected ? 'text-[var(--focus-text)]' : ''
                  }`}
                >
                  {preset.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-sub)]">
                  {preset.description}
                </span>
                <span className="mt-2 block text-[10px] font-bold text-[var(--text-muted)]">
                  {preset.summary}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <section aria-labelledby="room-basics-title" className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div>
          <h2 id="room-basics-title" className="text-sm font-extrabold">
            Odanı tamamla
          </h2>
          <p className="mt-1 text-xs text-[var(--text-sub)]">
            Adını ve soru kategorisini belirlemen yeterli.
          </p>
        </div>

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
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--focus)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/30"
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

        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <input
            type="checkbox"
            id="field-is-public"
            name="is_public"
            checked={isPublic}
            onChange={(event) => {
              const checked = event.target.checked
              setIsPublic(checked)
              if (checked && settings.maxPlayers > 6) {
                setSettings((current) => ({ ...current, maxPlayers: 6 }))
              }
            }}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            <span className="block font-bold">Herkese Açık</span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--text-sub)]">
              Açık Odalar listesinde görünür. En fazla 6 oyuncu katılabilir.
            </span>
          </span>
        </label>
      </section>

      <details
        className="group rounded-2xl border border-[var(--border)] bg-[var(--card)]"
        open={advancedError ? true : undefined}
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-extrabold marker:hidden">
          Ayrıntıları düzenle
          <span aria-hidden="true" className="text-[var(--text-muted)] transition-transform group-open:rotate-180">
            ↓
          </span>
        </summary>
        <div className="grid gap-4 border-t border-[var(--border)] p-4 sm:grid-cols-2">
          <NumField
            label="Zorluk (1-5)"
            name="difficulty"
            min={1}
            max={5}
            value={settings.difficulty}
            onChange={updateNumber('difficulty')}
            error={state.fieldErrors?.difficulty?.[0]}
          />
          <NumField
            label="Soru Sayısı (5-30)"
            name="question_count"
            min={5}
            max={30}
            value={settings.questionCount}
            onChange={updateNumber('questionCount')}
            error={state.fieldErrors?.question_count?.[0]}
          />
          <NumField
            label={`Maksimum Oyuncu (2-${isPublic ? 6 : 20})`}
            name="max_players"
            min={2}
            max={isPublic ? 6 : 20}
            value={settings.maxPlayers}
            onChange={updateNumber('maxPlayers')}
            error={state.fieldErrors?.max_players?.[0]}
          />
          <NumField
            label="Soru Süresi (10-60 sn)"
            name="per_question_seconds"
            min={10}
            max={60}
            value={settings.perQuestionSeconds}
            onChange={updateNumber('perQuestionSeconds')}
            error={state.fieldErrors?.per_question_seconds?.[0]}
          />
          <NumField
            label="Otomatik Geçiş (0-30 sn)"
            name="auto_advance_seconds"
            min={0}
            max={30}
            value={settings.autoAdvanceSeconds}
            onChange={updateNumber('autoAdvanceSeconds')}
            error={state.fieldErrors?.auto_advance_seconds?.[0]}
          />
          <Field label="Mod" name="mode" error={state.fieldErrors?.mode?.[0]}>
            <select
              id="field-mode"
              name="mode"
              value={settings.mode}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  mode: event.target.value as RoomSettings['mode'],
                }))
              }
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--focus)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/30"
            >
              <option value="sync">Birlikte yarış</option>
              <option value="async">Kendi hızında</option>
            </select>
          </Field>
        </div>
      </details>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--urgency-bg)] px-3 py-2 text-sm text-[var(--urgency-text)]"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary min-h-12 w-full px-6 text-base disabled:opacity-50"
      >
        {isPending ? 'Oluşturuluyor…' : 'Oda Oluştur'}
      </button>
    </form>
  )
}
