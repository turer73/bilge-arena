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
        label="Oda Kodu (6 karakter)"
        name="code"
        required
        maxLength={6}
        error={state.fieldErrors?.code?.[0]}
      />

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
        {isPending ? 'Katılıyor…' : 'Odaya Katıl'}
      </button>
    </form>
  )
}
