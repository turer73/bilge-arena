/**
 * Bilge Arena Oda Sistemi: Server Actions
 * Sprint 1 PR4a Task 1
 *
 * Codebase'in ILK Server Action ornegi. PR3'teki api-helpers.ts'in
 * NextResponse-based pattern'ine paralel: action shape ile { error | fieldErrors }
 * doner, redirect()/revalidatePath() server-side cagrilir.
 *
 * Plan-deviation #56: actions.ts pattern Sprint 2 RFC adayi (4b/4c host
 * butonlari da Server Action kullanacak).
 *
 * Mimari:
 *   1. getAuthForAction(): auth + session JWT extract, action shape
 *   2. createRoomAction(prev, formData): FormData → Zod → callRpc → redirect
 *
 * Flow:
 *   <form action={createRoomAction}>
 *     → Next.js encrypted action ID + Origin check (built-in CSRF)
 *     → cookies() ile Panola Supabase auth
 *     → callRpc(jwt, 'create_room', validated) [bilge-arena PostgREST]
 *     → revalidatePath('/oda') + redirect('/oda/<code>')
 */

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { callRpc } from './client'
import {
  createRoomSchema,
  joinRoomSchema,
  type CreateRoomBody,
} from './validations'

// =============================================================================
// Action State (useActionState ile uyumlu)
// =============================================================================

export type CreateRoomActionState = {
  /** Field-level Zod hatalari, form alti gosterilir */
  fieldErrors?: Partial<Record<keyof CreateRoomBody, string[]>>
  /** Top-level hata, banner gosterilir (auth/RPC/network) */
  error?: string
}

// =============================================================================
// Auth helper (action-shaped, NextResponse degil)
// =============================================================================

/**
 * Panola Supabase auth dogrulamasi + JWT extract.
 * api-helpers.ts'in `getAuthAndJwt()` paraleli ama action shape doner.
 *
 * Iki katman dogrulama:
 *   1. auth.getUser() → session cookie var ama user yoksa anon
 *   2. auth.getSession() → access_token (JWT) bilge-arena PostgREST'e gonderilir
 */
async function getAuthForAction(): Promise<
  | { ok: true; userId: string; jwt: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'Giris yapmalisin.' }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'Oturum suresi doldu, tekrar giris yap.' }
  }
  return { ok: true, userId: user.id, jwt: session.access_token }
}

// =============================================================================
// createRoomAction: form submit → create_room RPC → redirect
// =============================================================================

/**
 * `<CreateRoomForm>` form action handler.
 *
 * @param _prev useActionState'in ilk arg'i (initial state), kullanilmaz
 * @param formData Browser form data (7 alan)
 * @returns Hata state (UI'a gosterilir) VEYA throw NEXT_REDIRECT (caller'a propagate)
 *
 * Hata path'leri:
 *   - Anon/expired auth → { error: 'Giris...' | 'Oturum suresi...' }
 *   - Zod validation → { fieldErrors: {field: [...]} }
 *   - RPC error (P0001/P0002/UNKNOWN) → { error: rpcError.message }
 *
 * Success path: redirect('/oda/${code}') — return value yok, throw eder.
 *   redirect() try/catch icine ALINMAMALI, propagate etmeli.
 */
export async function createRoomAction(
  _prev: CreateRoomActionState,
  formData: FormData,
): Promise<CreateRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  // FormData → object → Zod (defaults schemada tanimli)
  const raw = {
    title: formData.get('title')?.toString() ?? '',
    category: formData.get('category')?.toString() ?? '',
    difficulty: Number(formData.get('difficulty') ?? 2),
    question_count: Number(formData.get('question_count') ?? 10),
    max_players: Number(formData.get('max_players') ?? 8),
    per_question_seconds: Number(formData.get('per_question_seconds') ?? 20),
    mode: formData.get('mode')?.toString() ?? 'sync',
  }
  const parsed = createRoomSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten()
        .fieldErrors as CreateRoomActionState['fieldErrors'],
    }
  }

  const result = await callRpc<{ id: string; code: string }>(
    auth.jwt,
    'create_room',
    parsed.data,
  )
  if (!result.ok) return { error: result.error.message }

  // List sayfasi yeni odayi gormeli (cache invalidate)
  revalidatePath('/oda')
  // Lobby'ye yonlendir (4a placeholder, 4b'de gercek lobby)
  redirect(`/oda/${result.data.code}`)
}

// =============================================================================
// joinRoomAction: form submit → join_room RPC → redirect (PR4b Task 1)
// =============================================================================

export type JoinRoomActionState = {
  /** Field-level Zod hatalari (gecersiz kod) */
  fieldErrors?: { code?: string[] }
  /** Top-level hata (auth, RPC P0001 oda dolu, vb) */
  error?: string
}

/**
 * `<JoinRoomForm>` form action handler. Kullanici 6-char kod girer,
 * `join_room` RPC ile uyelik kaydi olusur ve `/oda/[code]`e yonlendirilir.
 *
 * createRoomAction patterni paralel — auth, Zod validate, callRpc, redirect.
 *
 * @returns Hata state (UI'a gosterilir) VEYA throw NEXT_REDIRECT.
 */
export async function joinRoomAction(
  _prev: JoinRoomActionState,
  formData: FormData,
): Promise<JoinRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = joinRoomSchema.safeParse({
    code: formData.get('code')?.toString() ?? '',
  })
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  // join_room VOID RPC, 204 No Content (callRpc null doner)
  const result = await callRpc<null>(auth.jwt, 'join_room', {
    p_code: parsed.data.code,
  })
  if (!result.ok) return { error: result.error.message }

  redirect(`/oda/${parsed.data.code}`)
}
