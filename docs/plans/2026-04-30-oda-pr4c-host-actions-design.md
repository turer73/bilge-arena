# Oda Sistemi PR4c — Host Actions Design Doc

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` to create the implementation plan from this design (`docs/plans/2026-04-30-oda-pr4c-host-actions-plan.md`).

**Goal:** PR4b lobby'sine host icin **start_room** + **cancel_room** butonlari eklemek (HostActionsPlaceholder REPLACE). Lobby'den oyuna gecis ve host'un odayi iptal edebilmesi MVP.

**Onceki PR:** PR4b (#45) — Real lobby + Realtime (postgres_changes + presence) + GET /state. Stack PR.

**Tech Stack:** Server Action (PR4a/4b paralel), useActionState, native `<dialog>` confirm. Vitest test.

**Branch:** `feat/oda-pr4c-host-actions` ← `feat/oda-pr4b-lobby-realtime`

**MVP justification:** memory id=feedback_mvp_over_bigbang. Kullanici delegasyonuyla (sen karar ver) 1.5h MVP > 4h full build. Kick_member ve Realtime broadcast (typing/ready) PR4d/4e'ye ertelendi.

---

## Bolum 1 — 4 Karar (brainstorming ozeti)

| # | Konu | Karar | Sebep |
|---|---|---|---|
| Q1 | UI bilesen | **HostActions** (4b'deki `HostActionsPlaceholder` REPLACE), client component | LobbyContainer prop drill paralel; `isHost` ile gizleme |
| Q2 | Cancel UX | Native `<dialog>` confirm modal | Dependency yok, accessible (ARIA built-in), bundle hafif |
| Q3 | State guard | Server Action **canonical** (RPC check), UI **visual** disable | Race condition: 2 host kullanmaz ama state degisirse RPC P0001 doner, UI fallback |
| Q4 | TDD pattern | PR4b paralel: Action 3 test x 2 = 6, component 2 smoke | actions.test.ts'e ek `describe` blok; HostActions.test.tsx yeni dosya |

---

## Bolum 2 — Architecture

```
LobbyContainer (4b, client)
  └── HostActionsPlaceholder (REPLACE)
       ↓
       HostActions ('use client', isHost guard)
         ├── <StartRoomButton room={room} />
         │     └── form action={startRoomAction} disabled={state !== 'lobby' || isPending}
         │           └── hidden room_id input
         │           └── submit button "Oyunu Baslat"
         │
         └── <CancelRoomButton room={room} />
               └── confirm dialog (native <dialog>)
                     └── form action={cancelRoomAction}
                           └── hidden room_id + reason ('host_canceled') input
                           └── submit "Odayi Iptal Et"

actions.ts (PR4b genisletilir):
  + startRoomAction (form: room_id) -> RPC start_room -> revalidate /oda
  + cancelRoomAction (form: room_id, reason) -> RPC cancel_room -> redirect /oda
```

**Server Action zinciri:**
1. `getAuthForAction()` reuse (PR4b)
2. FormData -> Zod (yeni `startRoomSchema`, `cancelRoomSchema`)
3. `callRpc(jwt, 'start_room' | 'cancel_room', {p_room_id, ...})`
4. Hata: `{error: 'Sadece host baslatabilir' | ...}` action shape
5. Basari:
   - `start_room`: revalidatePath('/oda'), redirect kalmaz (lobby ayni sayfa, Realtime UPDATE event ile state degisir)
   - `cancel_room`: revalidatePath('/oda'), redirect('/oda')

---

## Bolum 3 — Server Actions

### `startRoomAction`

```typescript
import { startRoomSchema } from './validations'  // yeni

export type StartRoomActionState = { error?: string }

export async function startRoomAction(
  _prev: StartRoomActionState,
  formData: FormData,
): Promise<StartRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = startRoomSchema.safeParse({
    room_id: formData.get('room_id')?.toString() ?? '',
  })
  if (!parsed.success) return { error: 'Oda kimligi gecersiz' }

  const result = await callRpc<null>(auth.jwt, 'start_room', {
    p_room_id: parsed.data.room_id,
  })
  if (!result.ok) return { error: result.error.message }

  // /oda listesi state degisikligini gormeli; lobby kendisi Realtime UPDATE
  // event'i ile state='active' donusumunu uygulayacak (no redirect)
  revalidatePath('/oda')
  return {}
}
```

### `cancelRoomAction`

```typescript
export type CancelRoomActionState = { error?: string }

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
```

### Yeni Zod schemas (`validations.ts` ek)

```typescript
export const startRoomSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
})

export const cancelRoomActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
  reason: z.string().trim().min(1).max(100).default('host_canceled'),
})
```

---

## Bolum 4 — `<HostActions>` Component

Replaces `HostActionsPlaceholder.tsx` (4b yer tutar).

```typescript
'use client'

import { useActionState } from 'react'
import { useRef } from 'react'
import {
  startRoomAction,
  cancelRoomAction,
  type StartRoomActionState,
  type CancelRoomActionState,
} from '@/lib/rooms/actions'

interface HostActionsProps {
  isHost: boolean
  roomId: string
  roomState: 'lobby' | 'active' | 'reveal' | 'completed' | 'archived'
}

export function HostActions({ isHost, roomId, roomState }: HostActionsProps) {
  if (!isHost) return null

  const canStart = roomState === 'lobby'
  const canCancel = ['lobby', 'active', 'reveal'].includes(roomState)

  const [startState, startAction, startPending] = useActionState(
    startRoomAction,
    {} as StartRoomActionState,
  )
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelRoomAction,
    {} as CancelRoomActionState,
  )

  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <section aria-label="Host eylemleri" className="...">
      <div className="flex flex-wrap gap-2">
        {/* Start */}
        <form action={startAction}>
          <input type="hidden" name="room_id" value={roomId} />
          <button
            type="submit"
            disabled={!canStart || startPending}
            className="btn-primary"
          >
            {startPending ? 'Baslatiliyor…' : 'Oyunu Baslat'}
          </button>
        </form>

        {/* Cancel: dialog confirm */}
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          disabled={!canCancel || cancelPending}
          className="btn-danger"
        >
          {cancelPending ? 'Iptal ediliyor…' : 'Odayi Iptal Et'}
        </button>

        <dialog ref={dialogRef}>
          <form action={cancelAction} method="dialog">
            <input type="hidden" name="room_id" value={roomId} />
            <input type="hidden" name="reason" value="host_canceled" />
            <p>Bu odayi iptal etmek istedigine emin misin?</p>
            <button type="submit">Evet, iptal et</button>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Vazgec
            </button>
          </form>
        </dialog>
      </div>

      {(startState.error || cancelState.error) && (
        <p role="alert">{startState.error ?? cancelState.error}</p>
      )}
    </section>
  )
}
```

---

## Bolum 5 — Test Plan (8 test)

### `actions.test.ts` +6 test

```typescript
describe('startRoomAction', () => {
  test('25) anon user → error: Giris yapmalisin')
  test('26) invalid room_id (not uuid) → error')
  test('27) success → callRpc(start_room, {p_room_id}) + revalidatePath')
})

describe('cancelRoomAction', () => {
  test('28) anon user → error: Giris yapmalisin')
  test('29) success → callRpc(cancel_room, {p_room_id, p_reason}) + redirect /oda')
  test('30) RPC P0003 (state disinda) → error: Oda zaten...')
})
```

### `HostActions.test.tsx` +2 test

```typescript
describe('HostActions', () => {
  test('1) isHost=false → null render')
  test('2) isHost=true + state=lobby → 2 button (Start + Cancel) gorunur')
})
```

**Toplam: 8 test, ~280 LOC test, ~250 LOC prod (Server Actions ~80 + component ~150 + schemas ~20).**

---

## Bolum 6 — Implementation Order

```
Adim 0: Branch ac (feat/oda-pr4c-host-actions ← feat/oda-pr4b-lobby-realtime)
Adim 1: validations.ts + 2 yeni Zod schema (test'siz, schema)
Adim 2: actions.ts + startRoomAction + 3 test (TDD)
Adim 3: actions.ts + cancelRoomAction + 3 test (TDD)
Adim 4: HostActions.tsx component (HostActionsPlaceholder.tsx DELETE) + 2 test
Adim 5: LobbyContainer.tsx update (HostActionsPlaceholder → HostActions, prop ekle)
Adim 6: lint + build + full test (1127 GREEN target)
Adim 7: PR ac (base = feat/oda-pr4b-lobby-realtime stack)
Adim 8: Memory POST
```

**Tahmin:** 1.5-2 saat, 5-7 commit.

---

## Bolum 7 — Risk + Mitigasyon

| Risk | Olasilik | Etki | Mitigasyon |
|---|---|---|---|
| PR4b henuz mergelenmedi, Codex P1 review fix gelirse stack drift | Orta | Dusuk | Cherry-pick fix to PR4c branch, rebase to PR4b updated head |
| `<dialog>` element jsdom test compat | Dusuk | Dusuk | Component smoke "buton var" test, dialog interaction PR4d Playwright |
| start_room RPC race (host basa basa baslat tikar) | Dusuk | Dusuk | RPC P0003 doner ikinci tikla, UI error gosterir |
| cancel_room audit_log dependency | Dusuk | Orta | PR3 zaten test ediyor (plan-deviation #39 audit_log 'room_canceled' marker) |
| Realtime UPDATE start sonrasi UI gosterilmiyor | Dusuk | Orta | useRoomChannel zaten ROOM_UPDATE handle ediyor (PR4b reducer test 6) |

---

## Bolum 8 — Acceptance Criteria

- [ ] 5-7 commit (PR4c-1 to PR4c-7)
- [ ] 8 yeni Vitest test GREEN
- [ ] 1127/1127 toplam GREEN (regression yok)
- [ ] pnpm lint 0 error
- [ ] pnpm build success
- [ ] pnpm type-check 0 error
- [ ] HostActionsPlaceholder.tsx DELETE (PR4b yer tutar)
- [ ] PR description host actions + 4 Q karari + MVP scope belirtilmis
- [ ] PR base = feat/oda-pr4b-lobby-realtime (stack)
- [ ] Memory POST: session + feedback (Server Action 2-action pattern) + task

---

## Bolum 9 — Out-of-Scope (PR4d/4e)

- Kick member UI (host moderation)
- Realtime broadcast: typing indicator, ready state
- Game loop: advance_round, reveal_round, submit_answer UI integration
- Playwright multi-tab e2e (start lobby → 2nd tab gets ROOM_UPDATE)

---

## Referanslar

**Memory:**
- id=feedback_mvp_over_bigbang — MVP > Big-Bang otonom build kurali
- id=403 — server_action_codebase_first_pattern (PR4a'dan)
- id=404 — realtime_reducer_extracted_pattern (PR4b'den)
- id=405 — db_enum_plan_drift (PR4b plan-deviation, lesson learned)
- id=361 — auth_schema_grant_gap (RLS pattern)

**RPCs (PR3b/c, tested):**
- `start_room(p_room_id uuid)` → VOID, lobby → active, audit_log 'room_started'
- `cancel_room(p_room_id uuid, p_reason text)` → VOID, *.→completed, audit_log 'room_canceled'

**PR4b patterns reuse:**
- `getAuthForAction()` actions.ts:55-73
- `callRpc<null>` 204 No Content (PR4a fix #42)
- `useActionState` form pattern
- `RoomLifecycleState` 5 enum (post-PR4b hot-fix)
