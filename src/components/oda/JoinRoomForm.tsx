/**
 * Bilge Arena Oda: <JoinRoomForm> kod ile odaya katil formu
 * Sprint 1 PR4b Task 7
 *
 * useActionState + joinRoomAction (PR4b Task 1 backend). Field reuse.
 * 6-char Crockford-32 maxLength. Submit -> /oda/[code] redirect.
 */

'use client'

import { useActionState } from 'react'
import {
  joinRoomAction,
  type JoinRoomActionState,
} from '@/lib/rooms/actions'
import { Field } from './Field'

const initialState: JoinRoomActionState = {}

export function JoinRoomForm() {
  const [state, formAction, isPending] = useActionState(
    joinRoomAction,
    initialState,
  )
  return (
    <form
      action={formAction}
      className="space-y-4"
      noValidate
      aria-label="Oda kodu ile katilma formu"
    >
      <Field
        label="Oda Kodu"
        name="code"
        error={state.fieldErrors?.code?.[0]}
      >
        <input
          id="field-code"
          name="code"
          type="text"
          required
          minLength={6}
          maxLength={6}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          placeholder="Örn. BIL2GE"
          aria-invalid={state.fieldErrors?.code?.[0] ? 'true' : 'false'}
          aria-describedby={state.fieldErrors?.code?.[0] ? 'field-code-error' : undefined}
          className="min-h-14 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-center font-mono text-xl font-extrabold uppercase tracking-[0.28em] placeholder:text-sm placeholder:font-medium placeholder:normal-case placeholder:tracking-normal focus:border-[var(--focus)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/30"
        />
      </Field>

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
        {isPending ? 'Katılıyor…' : 'Odaya Katıl'}
      </button>
    </form>
  )
}
