# Oda PR4c Implementation Plan — Host Actions

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** PR4b lobby'sine host icin start_room + cancel_room butonlari eklemek (HostActionsPlaceholder REPLACE), 8 yeni Vitest test GREEN.

**Architecture:** PR4a/4b Server Action patterni paralel — `useActionState` + `callRpc` + revalidate/redirect. Native `<dialog>` confirm modal cancel icin (dependency yok).

**Tech Stack:** React 19 (`useActionState`, `useRef`), Next.js 16 Server Action, Vitest, Zod.

**Reference Design:** `docs/plans/2026-04-30-oda-pr4c-host-actions-design.md` (9 bolum)

**Branch:** `feat/oda-pr4c-host-actions` (base: `feat/oda-pr4b-lobby-realtime`, stack PR)

---

## Pre-Implementation Checklist

- [x] PR4b branch (commit `8fbdb96`) base
- [x] Branch `feat/oda-pr4c-host-actions` PR4b'den acildi
- [x] Design doc commit `c125db7`
- [x] PR4b patterns: actions.ts (createRoom + join + leave), HostActionsPlaceholder placeholder
- [x] PR3b/c: start_room + cancel_room RPC tested (8_rooms_functions_*.sql)

---

## Task 1 — `startRoomSchema` + `cancelRoomActionSchema` (validations.ts ek)

**Files:**
- Modify: `src/lib/rooms/validations.ts` (ek 2 schema)

**Step 1: validations.ts'e 2 schema ekle**

```typescript
// (mevcut sema'lardan sonra ek)

// =============================================================================
// POST /api/rooms/[id]/start (start_room input - Server Action sarmali)
// =============================================================================
export const startRoomSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
})
export type StartRoomBody = z.infer<typeof startRoomSchema>

// =============================================================================
// POST /api/rooms/[id]/cancel — Server Action variant
// =============================================================================
export const cancelRoomActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
  reason: z.string().trim().min(1).max(100).default('host_canceled'),
})
export type CancelRoomActionBody = z.infer<typeof cancelRoomActionSchema>
```

**Step 2: type-check (kontrol)**

Run: `pnpm type-check`
Expected: 0 error.

**Step 3: Commit**

```bash
git add src/lib/rooms/validations.ts
git commit -m "feat(oda): PR4c-1 startRoom + cancelRoomAction Zod schemas

UUID validate + reason default 'host_canceled' (audit_log marker).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 — `startRoomAction` + 3 TDD test

**Files:**
- Modify: `src/lib/rooms/actions.ts` (ek `startRoomAction` + type)
- Modify: `src/lib/rooms/__tests__/actions.test.ts` (ek `describe` blok)

**Step 1: actions.test.ts'e 3 yeni test ekle (en sona)**

```typescript
// (en alta ekle, joinRoomAction + leaveRoomAction'dan sonra)
import { startRoomAction } from '../actions'

const validUuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('startRoomAction', () => {
  beforeEach(() => vi.clearAllMocks())

  test('25) anon user → error: Giris yapmalisin', async () => {
    mockSupabase(null, null)
    const fd = new FormData()
    fd.set('room_id', validUuid)
    const r = await startRoomAction({}, fd)
    expect(r.error).toMatch(/Giris yapmalisin/)
  })

  test('26) invalid room_id (not uuid) → error', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    const fd = new FormData()
    fd.set('room_id', 'not-a-uuid')
    const r = await startRoomAction({}, fd)
    expect(r.error).toMatch(/gecersiz/i)
  })

  test('27) success → callRpc(start_room) + revalidatePath /oda', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: null })
    const fd = new FormData()
    fd.set('room_id', validUuid)
    await startRoomAction({}, fd)
    expect(mockCallRpc).toHaveBeenCalledWith('jwt', 'start_room', {
      p_room_id: validUuid,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/oda')
  })
})
```

**Step 2: Test calistir, RED**

Run: `pnpm test --run src/lib/rooms/__tests__/actions.test.ts`
Expected: 18 GREEN (mevcut) + 3 FAIL ("startRoomAction is not exported")

**Step 3: actions.ts'e startRoomAction ekle (leaveRoomAction'dan sonra)**

```typescript
// (leaveRoomAction'dan sonra ekle)
// Imports'a ek:
//   import { startRoomSchema, ... } from './validations'

// =============================================================================
// startRoomAction: form submit → start_room RPC (PR4c Task 2)
// =============================================================================

export type StartRoomActionState = {
  /** Top-level hata (auth, RPC P0001 sadece host, P0003 state disinda) */
  error?: string
}

/**
 * Host icin oyunu baslat. start_room RPC lobby → active gecisi yapar,
 * audit_log 'room_started'. Realtime UPDATE event ile UI Lobby->Game
 * akislari otomatik degisecek (no redirect).
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
```

**Step 4: Test tekrar, 21/21 GREEN**

Run: `pnpm test --run src/lib/rooms/__tests__/actions.test.ts`
Expected: 21 PASS (18 mevcut + 3 yeni).

**Step 5: Commit**

```bash
git add src/lib/rooms/actions.ts src/lib/rooms/__tests__/actions.test.ts
git commit -m "feat(oda): PR4c-2 startRoomAction + 3 TDD GREEN

start_room RPC lobby → active gecisi (audit_log 'room_started').
revalidatePath /oda; lobby kendisi Realtime UPDATE event ile state
degisikligini gorur (no redirect).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3 — `cancelRoomAction` + 3 TDD test

**Files:**
- Modify: `src/lib/rooms/actions.ts` (ek `cancelRoomAction` + type)
- Modify: `src/lib/rooms/__tests__/actions.test.ts` (ek `describe` blok)

**Step 1: actions.test.ts'e 3 yeni test ekle**

```typescript
import { cancelRoomAction } from '../actions'

describe('cancelRoomAction', () => {
  beforeEach(() => vi.clearAllMocks())

  test('28) anon user → error: Giris yapmalisin', async () => {
    mockSupabase(null, null)
    const fd = new FormData()
    fd.set('room_id', validUuid)
    const r = await cancelRoomAction({}, fd)
    expect(r.error).toMatch(/Giris yapmalisin/)
  })

  test('29) success → callRpc(cancel_room) + redirect /oda', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: null })
    const fd = new FormData()
    fd.set('room_id', validUuid)
    fd.set('reason', 'host_canceled')
    await cancelRoomAction({}, fd)
    expect(mockCallRpc).toHaveBeenCalledWith('jwt', 'cancel_room', {
      p_room_id: validUuid,
      p_reason: 'host_canceled',
    })
    expect(mockRedirect).toHaveBeenCalledWith('/oda')
  })

  test('30) RPC P0003 (state disinda) → error: Oda zaten...', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({
      ok: false,
      error: {
        code: 'P0003',
        message: 'Oda zaten completed durumunda; iptal edilemez',
        status: 409,
      },
    })
    const fd = new FormData()
    fd.set('room_id', validUuid)
    fd.set('reason', 'host_canceled')
    const r = await cancelRoomAction({}, fd)
    expect(r.error).toMatch(/Oda zaten/)
  })
})
```

**Step 2: RED**

Run: `pnpm test --run src/lib/rooms/__tests__/actions.test.ts`
Expected: 21 GREEN + 3 FAIL.

**Step 3: actions.ts'e cancelRoomAction ekle**

```typescript
// (startRoomAction'dan sonra ekle)
// Imports update:
//   import { ..., cancelRoomActionSchema } from './validations'

// =============================================================================
// cancelRoomAction: form submit → cancel_room RPC + redirect /oda (PR4c Task 3)
// =============================================================================

export type CancelRoomActionState = {
  error?: string
}

/**
 * Host icin odayi iptal et. cancel_room RPC state'i 'completed' yapar
 * (plan-deviation #39: chk_rooms_state 'canceled' icermez), audit_log
 * 'room_canceled' marker + reason.
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
```

**Step 4: GREEN**

Run: `pnpm test --run src/lib/rooms/__tests__/actions.test.ts`
Expected: 24 PASS.

**Step 5: Commit**

```bash
git add src/lib/rooms/actions.ts src/lib/rooms/__tests__/actions.test.ts
git commit -m "feat(oda): PR4c-3 cancelRoomAction + 3 TDD GREEN

cancel_room RPC state='completed' (plan-deviation #39). audit_log
'room_canceled' marker + reason. redirect /oda lista sayfasina.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4 — `<HostActions>` component + 2 TDD test

**Files:**
- Create: `src/components/oda/HostActions.tsx`
- Create: `src/components/oda/__tests__/HostActions.test.tsx`
- Delete: `src/components/oda/HostActionsPlaceholder.tsx` (4b yer tutar, REPLACE)

**Step 1: HostActions.test.tsx (RED)**

```typescript
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  startRoomAction: vi.fn(),
  cancelRoomAction: vi.fn(),
}))

import { HostActions } from '../HostActions'

const formAction = vi.fn()

describe('HostActions', () => {
  test('1) isHost=false → null render', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostActions isHost={false} roomId="r1" roomState="lobby" />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('2) isHost=true + state=lobby → 2 button (Start + Cancel) gorunur', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<HostActions isHost={true} roomId="r1" roomState="lobby" />)
    expect(
      screen.getByRole('button', { name: /Oyunu Başlat/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Odayı İptal Et/i }),
    ).toBeInTheDocument()
  })
})
```

**Step 2: RED**

Run: `pnpm test --run src/components/oda/__tests__/HostActions.test.tsx`
Expected: FAIL "Cannot find module '../HostActions'".

**Step 3: HostActions.tsx implement**

```typescript
'use client'

/**
 * Bilge Arena Oda: <HostActions> host eylemleri (start + cancel)
 * Sprint 1 PR4c Task 4
 *
 * 2 host action: oyunu baslat + odayi iptal et. Cancel native dialog
 * confirm. Server Action canonical state guard (UI sadece visual disable).
 *
 * isHost=false → null render (server'da useActionState cagrilmasin diye
 * early return).
 */

import { useActionState, useRef } from 'react'
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

const startInitial: StartRoomActionState = {}
const cancelInitial: CancelRoomActionState = {}

export function HostActions({ isHost, roomId, roomState }: HostActionsProps) {
  const [startState, startAction, startPending] = useActionState(
    startRoomAction,
    startInitial,
  )
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelRoomAction,
    cancelInitial,
  )
  const dialogRef = useRef<HTMLDialogElement>(null)

  if (!isHost) return null

  const canStart = roomState === 'lobby'
  const canCancel = (
    ['lobby', 'active', 'reveal'] as const
  ).includes(roomState as 'lobby' | 'active' | 'reveal')

  const showError = startState.error ?? cancelState.error

  return (
    <section
      aria-label="Host eylemleri"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <h2 className="mb-3 text-sm font-bold">Host Paneli</h2>
      <div className="flex flex-wrap gap-2">
        <form action={startAction}>
          <input type="hidden" name="room_id" value={roomId} />
          <button
            type="submit"
            disabled={!canStart || startPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startPending ? 'Başlatılıyor…' : 'Oyunu Başlat'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          disabled={!canCancel || cancelPending}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
        >
          {cancelPending ? 'İptal ediliyor…' : 'Odayı İptal Et'}
        </button>

        <dialog
          ref={dialogRef}
          aria-label="Iptal onay"
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 backdrop:bg-black/40"
        >
          <form action={cancelAction} className="space-y-3">
            <input type="hidden" name="room_id" value={roomId} />
            <input type="hidden" name="reason" value="host_canceled" />
            <p className="text-sm">
              Bu odayı iptal etmek istediğine emin misin? Tüm üyeler odadan çıkarılır.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white"
              >
                Evet, İptal Et
              </button>
            </div>
          </form>
        </dialog>
      </div>

      {showError && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {showError}
        </p>
      )}

      {!canStart && roomState === 'lobby' === false && (
        <p className="mt-2 text-xs text-[var(--text-sub)]">
          Oyun zaten başlatıldı veya bitti.
        </p>
      )}
    </section>
  )
}
```

**Step 4: GREEN**

Run: `pnpm test --run src/components/oda/__tests__/HostActions.test.tsx`
Expected: 2 PASS.

**Step 5: HostActionsPlaceholder DELETE**

```bash
rm src/components/oda/HostActionsPlaceholder.tsx
```

**Step 6: LobbyContainer.tsx update — HostActionsPlaceholder → HostActions**

```typescript
// Modify: src/components/oda/LobbyContainer.tsx
// Replace:
//   import { HostActionsPlaceholder } from './HostActionsPlaceholder'
// With:
//   import { HostActions } from './HostActions'
//
// Replace:
//   <HostActionsPlaceholder isHost={isHost} />
// With:
//   <HostActions isHost={isHost} roomId={state.room.id} roomState={state.room.state} />
```

**Step 7: Type-check + full test**

Run: `pnpm type-check && pnpm test --run`
Expected: 0 type error, 1127/1127 GREEN (1119 baseline + 6 actions + 2 component).

**Step 8: Commit**

```bash
git add src/components/oda/HostActions.tsx \
        src/components/oda/__tests__/HostActions.test.tsx \
        src/components/oda/LobbyContainer.tsx
git rm src/components/oda/HostActionsPlaceholder.tsx
git commit -m "feat(oda): PR4c-4 HostActions component + 2 TDD GREEN

HostActionsPlaceholder REPLACE. 2 host action:
- Oyunu Başlat: form action={startRoomAction}, lobby disinda disabled
- Odayı İptal Et: native <dialog> confirm modal, lobby/active/reveal'da aktif

LobbyContainer HostActions kullanacak (roomId + roomState prop).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5 — Lint + build + full test (sanity)

**Step 1: Lint**

Run: `pnpm lint`
Expected: 0 error (warning kabul edilebilir, 25 pre-existing).

**Step 2: Type-check**

Run: `pnpm type-check`
Expected: 0 error.

**Step 3: Build**

Run: `pnpm build`
Expected: success.

**Step 4: Full test**

Run: `pnpm test --run`
Expected: 1127/1127 GREEN.

**Step 5: Commit (varsa minor fix)**

```bash
git add -A
git commit -m "chore(oda): PR4c-5 lint/build/test sanity"
# Eger fix yoksa skip (no-op).
```

---

## Task 6 — PR open + Memory POST

**Step 1: Push**

```bash
git push -u origin feat/oda-pr4c-host-actions
```

**Step 2: gh pr create (base = PR4b branch)**

```bash
gh pr create \
  --base feat/oda-pr4b-lobby-realtime \
  --title "feat(oda): Sprint 1 PR4c — Host Actions (start + cancel)" \
  --body "$(cat <<'EOF'
## Summary

PR4b lobby'sine host icin **start_room** + **cancel_room** butonlari.
HostActionsPlaceholder REPLACE (4b yer tutar). 2-action MVP — kick_member
ve Realtime broadcast (typing/ready) PR4d/4e'ye ertelendi (memory id=
feedback_mvp_over_bigbang).

**Karar (brainstorming, kullanici delegasyonu):**
Q1 HostActions component (Placeholder REPLACE),
Q2 native `<dialog>` confirm modal (dependency yok),
Q3 Server Action canonical state guard (UI visual disable),
Q4 PR4b TDD pattern paralel.

**Stack PR:** Base = `feat/oda-pr4b-lobby-realtime` (PR #45). PR4b
mergelendiğinde rebase to master.

## Test sonucu — 1127/1127 GREEN

8 yeni test (24 → 32 oda action testi):
- startRoomAction: 3 (auth, validation uuid, success + revalidate)
- cancelRoomAction: 3 (auth, success + redirect, RPC P0003)
- HostActions: 2 (isHost=false null, isHost=true 2 button)

## Out-of-scope (PR4d/4e)

- kick_member UI (host moderation)
- Realtime broadcast: typing indicator, ready state
- Game loop UI: advance_round, reveal_round, submit_answer integration
- Playwright multi-tab e2e

## Plan/Design

- Design: `docs/plans/2026-04-30-oda-pr4c-host-actions-design.md`
- Plan: `docs/plans/2026-04-30-oda-pr4c-host-actions-plan.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Memory POST 3'lusu (zorunlu kayit)**

```bash
# Session
curl -s -X POST -H "X-Memory-Key: ..." -H "Content-Type: application/json" \
  -d '{"device_name":"windows-masaustu","platform":"windows","summary":"Bilge Arena PR4c TAMAMLANDI - Host actions MVP (start + cancel) + 8 TDD GREEN. PR acildi (stack PR4b base)."}' \
  http://100.113.153.62:8420/api/v1/memory/sessions

# Feedback (Server Action 2-action pattern)
curl -s -X POST ... -d '{"type":"feedback","name":"server_action_pair_pattern","description":"...","content":"..."}' \
  .../memories

# Task
curl -s -X POST ... -d '{"project":"bilge-arena","task":"PR4c host actions MVP","status":"completed",...}' \
  .../tasks
```

---

## Acceptance Criteria

- [ ] 6 commit (PR4c-1 to PR4c-5 + push)
- [ ] 8 yeni Vitest test GREEN
- [ ] 1127/1127 toplam GREEN (1119 baseline + 8)
- [ ] pnpm lint 0 error
- [ ] pnpm build success
- [ ] pnpm type-check 0 error
- [ ] HostActionsPlaceholder.tsx DELETE
- [ ] HostActions.tsx LobbyContainer'da kullaniliyor
- [ ] PR base = feat/oda-pr4b-lobby-realtime (stack)
- [ ] PR description: 4 Q karari + MVP scope + out-of-scope listed
- [ ] Memory POST: session + feedback + task
