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
import { fetchLobbyPreviewQuestion } from './server-fetch'
import type { LobbyPreviewQuestion } from './server-fetch'
import {
  createRoomSchema,
  joinRoomSchema,
  startRoomSchema,
  cancelRoomActionSchema,
  kickMemberActionSchema,
  submitAnswerActionSchema,
  advanceRoundActionSchema,
  revealRoundActionSchema,
  refreshLobbyPreviewActionSchema,
  quickPlayRoomActionSchema,
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
  // Codex P2: numeric field bos string ise Number('') === 0 -> manuel mode
  // istem disi enable olur. Bos/null durumunda undefined gonder, Zod .default(5)
  // devreye girsin.
  const autoAdvanceRaw = formData.get('auto_advance_seconds')?.toString() ?? ''
  // is_public: <input type="checkbox" name="is_public" /> checked iken
  // FormData'da deger 'on' (HTML standardi); unchecked ise yok. Boolean
  // donusumu acik: deger varligi -> true, yoksa false (Zod .default(false)
  // de yedek emniyet).
  const raw = {
    title: formData.get('title')?.toString() ?? '',
    category: formData.get('category')?.toString() ?? '',
    difficulty: Number(formData.get('difficulty') ?? 2),
    question_count: Number(formData.get('question_count') ?? 10),
    max_players: Number(formData.get('max_players') ?? 8),
    per_question_seconds: Number(formData.get('per_question_seconds') ?? 20),
    mode: formData.get('mode')?.toString() ?? 'sync',
    auto_advance_seconds:
      autoAdvanceRaw.trim() === '' ? undefined : Number(autoAdvanceRaw),
    is_public: formData.get('is_public') !== null,
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

// =============================================================================
// leaveRoomAction: form submit → leave_room RPC → redirect /oda (PR4b Task 6)
// =============================================================================

export type LeaveRoomActionState = {
  /** Top-level hata (auth, RPC P0001 oda lobby disinda) */
  error?: string
}

/**
 * `<MemberActions>` leave button form action handler. Member room_members'tan
 * silinir, /oda listesine donulur.
 *
 * Server Action ile progressive enhancement — JS yokken bile calisir.
 *
 * @returns Hata state veya throw NEXT_REDIRECT.
 */
export async function leaveRoomAction(
  _prev: LeaveRoomActionState,
  formData: FormData,
): Promise<LeaveRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const roomId = formData.get('room_id')?.toString()
  if (!roomId) {
    return { error: 'Oda kimligi eksik' }
  }

  const result = await callRpc<null>(auth.jwt, 'leave_room', {
    p_room_id: roomId,
  })
  if (!result.ok) return { error: result.error.message }

  // Listeyi guncelle, anasayfaya don
  revalidatePath('/oda')
  redirect('/oda')
}

// =============================================================================
// startRoomAction: host oyunu baslatir (PR4c Task 2)
// =============================================================================

export type StartRoomActionState = {
  /** Top-level hata: auth, P0001 sadece host, P0003 lobby disinda, vb. */
  error?: string
}

/**
 * Host icin oyunu baslat. start_room RPC lobby → active gecisi yapar
 * (audit_log 'room_started'). Realtime UPDATE event ile UI durum
 * gecisini otomatik gosterecek (no redirect — lobby ayni sayfa).
 */
export async function startRoomAction(
  _prev: StartRoomActionState,
  formData: FormData,
): Promise<StartRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = startRoomSchema.safeParse({
    room_id: formData.get('room_id')?.toString() ?? '',
  })
  if (!parsed.success) return { error: 'Gecersiz oda kimligi' }

  const result = await callRpc<null>(auth.jwt, 'start_room', {
    p_room_id: parsed.data.room_id,
  })
  if (!result.ok) return { error: result.error.message }

  revalidatePath('/oda')
  return {}
}

// =============================================================================
// cancelRoomAction: host odayi iptal eder (PR4c Task 3)
// =============================================================================

export type CancelRoomActionState = {
  error?: string
}

/**
 * Host icin odayi iptal et. cancel_room RPC state'i 'completed' yapar
 * (plan-deviation #39: chk_rooms_state 'canceled' icermez), audit_log
 * 'room_canceled' marker + reason. Player /oda listesine yonlendirilir.
 */
export async function cancelRoomAction(
  _prev: CancelRoomActionState,
  formData: FormData,
): Promise<CancelRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = cancelRoomActionSchema.safeParse({
    room_id: formData.get('room_id')?.toString() ?? '',
    reason: formData.get('reason')?.toString() ?? 'host_canceled',
  })
  if (!parsed.success) return { error: 'Form verisi gecersiz' }

  const result = await callRpc<null>(auth.jwt, 'cancel_room', {
    p_room_id: parsed.data.room_id,
    p_reason: parsed.data.reason,
  })
  if (!result.ok) return { error: result.error.message }

  revalidatePath('/oda')
  redirect('/oda')
}

// =============================================================================
// kickMemberAction: host uyeyi odadan cikarir (PR4d)
// =============================================================================

export type KickMemberActionState = {
  /** Top-level hata: auth, P0001 sadece host, P0003 completed/archived'ta yasak */
  error?: string
}

/**
 * Host icin uyeyi odadan cikar. kick_member RPC P0001 sadece host (auth.uid()
 * = host_id) check, P0003 state IN ('completed','archived')'ta yasak. Realtime
 * MEMBER_UPDATE event ile UI is_kicked=true gosterir (member_row opacity).
 */
export async function kickMemberAction(
  _prev: KickMemberActionState,
  formData: FormData,
): Promise<KickMemberActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = kickMemberActionSchema.safeParse({
    room_id: formData.get('room_id')?.toString() ?? '',
    target_user_id: formData.get('target_user_id')?.toString() ?? '',
  })
  if (!parsed.success) return { error: 'Gecersiz form verisi' }

  const result = await callRpc<null>(auth.jwt, 'kick_member', {
    p_room_id: parsed.data.room_id,
    p_target_user_id: parsed.data.target_user_id,
  })
  if (!result.ok) return { error: result.error.message }

  return {}
}

// =============================================================================
// submitAnswerAction: oyuncu cevap gonder (PR4e-2)
// =============================================================================

export type SubmitAnswerActionState = {
  /** Top-level hata: auth, P0001 oda active degil, P0003 zaten cevap gonderdi */
  error?: string
}

/**
 * Oyuncu submit_answer RPC ile aktif soruya cevap verir. response_ms
 * server-side hesaplanir (anti-cheat: client supplied degil). Reveal'a
 * kadar is_correct + points NULL kalir.
 *
 * Realtime: room_answers INSERT event ile UI'lar answers_count guncelleyebilir
 * (4e-3'te). Bu PR'da sadece submit + hata gosterimi.
 */
export async function submitAnswerAction(
  _prev: SubmitAnswerActionState,
  formData: FormData,
): Promise<SubmitAnswerActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = submitAnswerActionSchema.safeParse({
    room_id: formData.get('room_id')?.toString() ?? '',
    answer_value: formData.get('answer_value')?.toString() ?? '',
  })
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors
    const msg = first.answer_value?.[0] ?? first.room_id?.[0] ?? 'Gecersiz form'
    return { error: msg }
  }

  const result = await callRpc<null>(auth.jwt, 'submit_answer', {
    p_room_id: parsed.data.room_id,
    p_answer_value: parsed.data.answer_value,
  })
  if (!result.ok) return { error: result.error.message }

  return {}
}

// =============================================================================
// advanceRoundAction + revealRoundAction (host) — PR4e-3
// =============================================================================

export type AdvanceRoundActionState = { error?: string }
export type RevealRoundActionState = { error?: string }

/**
 * Host icin sonraki tura geç (active state'inde, current_round bittiyse).
 * advance_round RPC: yeni round olusturur (round_index + 1), question_id
 * randomize, started_at = now(), ends_at = started_at + per_question_seconds.
 * Son tursa room.state -> completed (all rounds done).
 *
 * Realtime: rooms UPDATE + room_rounds INSERT eventlari client'lara yayinlanir.
 */
export async function advanceRoundAction(
  _prev: AdvanceRoundActionState,
  formData: FormData,
): Promise<AdvanceRoundActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = advanceRoundActionSchema.safeParse({
    room_id: formData.get('room_id')?.toString() ?? '',
  })
  if (!parsed.success) return { error: 'Gecersiz oda kimligi' }

  const result = await callRpc<null>(auth.jwt, 'advance_round', {
    p_room_id: parsed.data.room_id,
  })
  if (!result.ok) return { error: result.error.message }

  return {}
}

/**
 * Host icin mevcut turu reveal et (active -> reveal). reveal_round RPC:
 * room_rounds.revealed_at = now(); is_correct + points_awarded computed
 * (linear decay #43); room.state = 'reveal'.
 *
 * Realtime: room.state UPDATE + room_answers UPDATE (is_correct/points_awarded
 * dolar) ile client SonucView'i (PR4e-4) gosterir.
 */
export async function revealRoundAction(
  _prev: RevealRoundActionState,
  formData: FormData,
): Promise<RevealRoundActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = revealRoundActionSchema.safeParse({
    room_id: formData.get('room_id')?.toString() ?? '',
  })
  if (!parsed.success) return { error: 'Gecersiz oda kimligi' }

  const result = await callRpc<null>(auth.jwt, 'reveal_round', {
    p_room_id: parsed.data.room_id,
  })
  if (!result.ok) return { error: result.error.message }

  return {}
}

// =============================================================================
// quickPlayRoomAction — Sprint 2B Task 4 (Solo mode skeleton)
// =============================================================================

export type QuickPlayRoomActionState = {
  /** Field-level Zod hatalari */
  fieldErrors?: { category?: string[]; difficulty?: string[]; question_count?: string[] }
  /** Top-level hata: auth, RPC */
  error?: string
}

/**
 * "Hızlı Oyun" Server Action — kullaniciyi 3 bot rakiple solo odaya
 * yonlendirir. quick_play_room RPC oda + 4 member (1 host + 3 bot)
 * olusturur, lobby state'inde host start_room basana kadar bekler.
 *
 * Plan-deviation #71: bot answer logic dahil DEGIL (PR2'de eklenir).
 * Bot uyeler reveal'a kadar pasif kalir, auto_relay deadline -> 0 puan.
 */
export async function quickPlayRoomAction(
  _prev: QuickPlayRoomActionState,
  formData: FormData,
): Promise<QuickPlayRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = quickPlayRoomActionSchema.safeParse({
    category: formData.get('category')?.toString() ?? '',
    difficulty: Number(formData.get('difficulty') ?? 2),
    question_count: Number(formData.get('question_count') ?? 10),
  })
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten()
        .fieldErrors as QuickPlayRoomActionState['fieldErrors'],
    }
  }

  const result = await callRpc<{ id: string; code: string }>(
    auth.jwt,
    'quick_play_room',
    {
      p_category: parsed.data.category,
      p_difficulty: parsed.data.difficulty,
      p_question_count: parsed.data.question_count,
    },
  )
  if (!result.ok) return { error: result.error.message }

  revalidatePath('/oda')
  redirect(`/oda/${result.data.code}`)
}

// =============================================================================
// refreshLobbyPreviewAction — Sprint 2A Task 2 (Lobby auto-question widget)
// =============================================================================

export type RefreshLobbyPreviewActionState = {
  /** Yeni cekilen soru, ilk render'da SSR initial; refresh sonrasi guncellenir */
  question?: LobbyPreviewQuestion | null
  /** Top-level hata: auth, fetch fail, kategori bos */
  error?: string
}

/**
 * Lobby preview widget'ta "Yeni Soru" butonu Server Action handler.
 * useActionState ile in-place update — redirect veya revalidatePath YOK,
 * sadece state.question doner UI bunu render eder.
 *
 * Anti-cheat: get_lobby_preview_question RPC correct_answer dondurmez,
 * server-fetch sift de typecheck eder. Bu action sadece passthrough.
 */
export async function refreshLobbyPreviewAction(
  _prev: RefreshLobbyPreviewActionState,
  formData: FormData,
): Promise<RefreshLobbyPreviewActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = refreshLobbyPreviewActionSchema.safeParse({
    category: formData.get('category')?.toString() ?? '',
  })
  if (!parsed.success) return { error: 'Gecersiz kategori' }

  const question = await fetchLobbyPreviewQuestion(
    auth.jwt,
    parsed.data.category,
  )

  return { question }
}
