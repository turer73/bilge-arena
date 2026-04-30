# Oda PR4b Implementation Plan — Lobby UI + Realtime

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** `/oda/[code]` lobby sayfasi (4a placeholder REPLACE) + `useRoomChannel` hook (postgres_changes + presence) + `GET /api/rooms/[id]/state` endpoint + `/oda/kod` join page, 24 Vitest test GREEN.

**Architecture:** Reducer-extracted Realtime pattern. Pure `roomStateReducer` (state machine), side-effect `setupRoomChannel` (Supabase subscribe), thin `useRoomChannel` hook (orchestrator). REST resync on reconnect (memory id=335 mandatory).

**Tech Stack:** React 19 (`useReducer`, `useEffect`), Supabase Realtime v2 (`postgres_changes`+`presence`), Next.js 16 Server Action, Vitest.

**Reference Design:** `docs/plans/2026-04-30-oda-pr4b-design.md` (13 bolum)

**Branch:** `feat/oda-pr4b-lobby-realtime` (master `9682dfe` + design commit)

---

## Pre-Implementation Checklist

- [x] Master `9682dfe` (PR4a + create_room + 8 RPC dahil)
- [x] Branch `feat/oda-pr4b-lobby-realtime` master'dan acildi
- [x] PR4a patterns sahip: actions.ts, server-fetch.ts, server-only stub, vitest alias
- [ ] Supabase Realtime VPS container saglikli (smoke test Adim 0)
- [ ] `@supabase/supabase-js` browser client `src/lib/supabase/client.ts` mevcut

**Not:** `pnpm install` PR4a'da yapildi, vitest 4.1.5 kuruldu, `node_modules/next/cache.js` var.

---

## Task 0 — Realtime VPS Container Smoke Check

**Why:** Memory `plausible_phoenix_boot` ref: VPS Supabase Realtime container recreate sonrasi 30-60sn warmup, 502 transient. Implementation oncesi container saglikli mi check et.

**Step 1: VPS Realtime container ping**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://realtime.bilgearena.com/api/health 2>&1
# Or via Tailscale: curl http://100.126.113.23:4000/api/health
```

Expected: `200`. Eger 502 ise 1 dk sonra retry. Eger 5 dk sonra hala 502 → container restart gerekir, `/api/v1/vps/exec` ile `docker restart bilge-arena-realtime`.

**Step 2: Browser supabase client mevcut mu**

Run: `ls src/lib/supabase/client.ts`
Expected: var. Yoksa Task 0 expand eder, browser client olustur.

**Step 3: Commit yok** — sadece environment validation.

> Eger Task 0 fail ederse: VPS team ile koordine et, blocked.

---

## Task 1 — joinRoomAction + 3 test (warm-up)

**Files:**
- Modify: `src/lib/rooms/actions.ts` (yeni export `joinRoomAction`)
- Test: `src/lib/rooms/__tests__/actions.test.ts` (mevcut dosyaya `describe('joinRoomAction', ...)` blok ekle)

**Step 1: actions.test.ts'e 3 yeni test ekle**

```typescript
// (mevcut dosyanin sonuna ekle)
import { joinRoomAction } from '../actions'

describe('joinRoomAction', () => {
  beforeEach(() => vi.clearAllMocks())

  test('1) anon user → error: Giris yapmalisin', async () => {
    mockSupabase(null, null)
    const fd = new FormData(); fd.set('code', 'BIL2GE')
    const r = await joinRoomAction({}, fd)
    expect(r.error).toMatch(/Giris yapmalisin/)
  })

  test('2) invalid code → fieldErrors.code', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    const fd = new FormData(); fd.set('code', 'abc')  // 3 char, regex fail
    const r = await joinRoomAction({}, fd)
    expect(r.fieldErrors?.code?.length).toBeGreaterThan(0)
  })

  test('3) success → callRpc(join_room) + redirect', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: null })  // RPC VOID
    const fd = new FormData(); fd.set('code', 'BIL2GE')
    await joinRoomAction({}, fd)
    expect(mockCallRpc).toHaveBeenCalledWith('jwt', 'join_room', { p_code: 'BIL2GE' })
    expect(mockRedirect).toHaveBeenCalledWith('/oda/BIL2GE')
  })
})
```

**Step 2: Test calistir, RED**

Run: `pnpm test --run src/lib/rooms/__tests__/actions.test.ts`
Expected: 12 GREEN (mevcut) + 3 FAIL ("joinRoomAction is not exported")

**Step 3: actions.ts'e joinRoomAction ekle**

```typescript
// (createRoomAction'in altina ekle, ayni dosya)
import { joinRoomSchema } from './validations'

export type JoinRoomActionState = {
  fieldErrors?: { code?: string[] }
  error?: string
}

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

  const result = await callRpc<null>(auth.jwt, 'join_room', {
    p_code: parsed.data.code,
  })
  if (!result.ok) return { error: result.error.message }

  redirect(`/oda/${parsed.data.code}`)
}
```

**Step 4: Test tekrar, 15/15 GREEN**

Run: `pnpm test --run src/lib/rooms/__tests__/actions.test.ts`
Expected: 15 PASS

**Step 5: Commit**

```bash
git add src/lib/rooms/actions.ts src/lib/rooms/__tests__/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-1 joinRoomAction + 3 TDD GREEN

joinRoomSchema (PR3 validations.ts) + callRpc('join_room') +
redirect /oda/[code]. createRoomAction patterni paralel.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `room-state-reducer.ts` + 10 test

**Files:**
- Create: `src/lib/rooms/room-state-reducer.ts`
- Test: `src/lib/rooms/__tests__/room-state-reducer.test.ts`

**Step 1: 10 test (RED)**

```typescript
// src/lib/rooms/__tests__/room-state-reducer.test.ts
import { describe, test, expect } from 'vitest'
import {
  roomStateReducer,
  type RoomState,
  type Member,
} from '../room-state-reducer'

const initialMember = (overrides: Partial<Member> = {}): Member => ({
  user_id: 'u1',
  display_name: 'Player1',
  joined_at: '2026-04-30T00:00:00Z',
  is_host: false,
  is_kicked: false,
  ...overrides,
})

const initialState = (): RoomState => ({
  room: {
    id: 'r1',
    code: 'BIL2GE',
    title: 'Test',
    state: 'lobby',
    mode: 'sync',
    host_id: 'u-host',
    category: 'genel-kultur',
    difficulty: 2,
    question_count: 10,
    max_players: 8,
    per_question_seconds: 20,
    created_at: '2026-04-30T00:00:00Z',
  },
  members: [],
  current_round: null,
  answers_count: 0,
  scoreboard: [],
  online: new Set<string>(),
  isStale: false,
})

describe('roomStateReducer', () => {
  test('1) HYDRATE → tum state set', () => {
    const fresh = { ...initialState(), members: [initialMember()] }
    const result = roomStateReducer(initialState(), {
      type: 'HYDRATE',
      payload: fresh,
    })
    expect(result.members).toHaveLength(1)
    expect(result.isStale).toBe(false)
  })

  test('2) MEMBER_INSERT → liste buyur', () => {
    const result = roomStateReducer(initialState(), {
      type: 'MEMBER_INSERT',
      payload: initialMember(),
    })
    expect(result.members).toHaveLength(1)
    expect(result.members[0].user_id).toBe('u1')
  })

  test('3) MEMBER_INSERT idempotent — ayni user_id eklenmiyor', () => {
    const s = { ...initialState(), members: [initialMember()] }
    const result = roomStateReducer(s, {
      type: 'MEMBER_INSERT',
      payload: initialMember(),
    })
    expect(result.members).toHaveLength(1)  // Hala 1
  })

  test('4) MEMBER_UPDATE → kicked=true update', () => {
    const s = { ...initialState(), members: [initialMember()] }
    const result = roomStateReducer(s, {
      type: 'MEMBER_UPDATE',
      payload: initialMember({ is_kicked: true }),
    })
    expect(result.members[0].is_kicked).toBe(true)
  })

  test('5) MEMBER_DELETE → liste kucur', () => {
    const s = { ...initialState(), members: [initialMember()] }
    const result = roomStateReducer(s, {
      type: 'MEMBER_DELETE',
      payload: { user_id: 'u1' },
    })
    expect(result.members).toHaveLength(0)
  })

  test('6) ROOM_UPDATE → state lobby→in_progress', () => {
    const result = roomStateReducer(initialState(), {
      type: 'ROOM_UPDATE',
      payload: { state: 'in_progress', started_at: '2026-04-30T01:00:00Z' },
    })
    expect(result.room.state).toBe('in_progress')
    expect(result.room.started_at).toBe('2026-04-30T01:00:00Z')
  })

  test('7) PRESENCE_SYNC → online Set replace', () => {
    const s = { ...initialState(), online: new Set(['old']) }
    const result = roomStateReducer(s, {
      type: 'PRESENCE_SYNC',
      payload: { online: ['u1', 'u2'] },
    })
    expect(result.online.has('u1')).toBe(true)
    expect(result.online.has('old')).toBe(false)
  })

  test('8) PRESENCE_JOIN → online ekle, PRESENCE_LEAVE → cikar', () => {
    const s1 = roomStateReducer(initialState(), {
      type: 'PRESENCE_JOIN',
      payload: { user_id: 'u1' },
    })
    expect(s1.online.has('u1')).toBe(true)
    const s2 = roomStateReducer(s1, {
      type: 'PRESENCE_LEAVE',
      payload: { user_id: 'u1' },
    })
    expect(s2.online.has('u1')).toBe(false)
  })

  test('9) CHANNEL_ERROR → isStale=true', () => {
    const result = roomStateReducer(initialState(), {
      type: 'CHANNEL_ERROR',
      payload: { error: 'connection lost' },
    })
    expect(result.isStale).toBe(true)
  })

  test('10) Unknown event (defensive) → state unchanged', () => {
    const s = initialState()
    // @ts-expect-error - unknown event tipi test ediliyor
    const result = roomStateReducer(s, { type: 'UNKNOWN', payload: {} })
    expect(result).toBe(s)  // referansi degismez
  })
})
```

**Step 2: Run, RED**

Run: `pnpm test --run src/lib/rooms/__tests__/room-state-reducer.test.ts`
Expected: 10 FAIL ("Cannot find module '../room-state-reducer'")

**Step 3: room-state-reducer.ts implement**

(Design Bolum 3'teki kodu tam olarak kullan — type'lar + reducer switch case)

**Step 4: Run, 10 GREEN**

Run: `pnpm test --run src/lib/rooms/__tests__/room-state-reducer.test.ts`
Expected: 10 PASS

**Step 5: Commit**

```bash
git add src/lib/rooms/room-state-reducer.ts src/lib/rooms/__tests__/room-state-reducer.test.ts
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-2 roomStateReducer + 10 TDD GREEN

Pure state machine, 9 event type. HYDRATE (REST resync), 4 member event
(INSERT idempotent / UPDATE / DELETE), ROOM_UPDATE, 3 presence event,
CHANNEL_ERROR, defensive default.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `setup-room-channel.ts` + 3 test

**Files:**
- Create: `src/lib/rooms/setup-room-channel.ts`
- Test: `src/lib/rooms/__tests__/setup-room-channel.test.ts`

**Step 1: 3 test (RED)**

```typescript
// src/lib/rooms/__tests__/setup-room-channel.test.ts
import { describe, test, expect, vi } from 'vitest'
import { setupRoomChannel } from '../setup-room-channel'

const mockChannel = () => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockResolvedValue('SUBSCRIBED'),
  track: vi.fn(),
})

const mockSupabase = (channel: ReturnType<typeof mockChannel>) => ({
  channel: vi.fn().mockReturnValue(channel),
})

describe('setupRoomChannel', () => {
  test('11) channel name format: room-${roomId}', () => {
    const ch = mockChannel()
    const sb = mockSupabase(ch)
    setupRoomChannel(sb as never, 'r1', 'u1', vi.fn())
    expect(sb.channel).toHaveBeenCalledWith('room-r1', expect.any(Object))
  })

  test('12) postgres_changes filters: rooms (id eq), room_members (room_id eq)', () => {
    const ch = mockChannel()
    const sb = mockSupabase(ch)
    setupRoomChannel(sb as never, 'r1', 'u1', vi.fn())

    // 4 postgres_changes call: rooms UPDATE, room_members INSERT/UPDATE/DELETE
    const calls = ch.on.mock.calls.filter(c => c[0] === 'postgres_changes')
    expect(calls).toHaveLength(4)

    const filters = calls.map(c => c[1].filter)
    expect(filters).toContain('id=eq.r1')
    expect(filters.filter(f => f === 'room_id=eq.r1')).toHaveLength(3)
  })

  test('13) subscribe + presence track called', () => {
    const ch = mockChannel()
    const sb = mockSupabase(ch)
    setupRoomChannel(sb as never, 'r1', 'u1', vi.fn())
    expect(ch.subscribe).toHaveBeenCalled()
  })
})
```

**Step 2: Run, RED**

Run: `pnpm test --run src/lib/rooms/__tests__/setup-room-channel.test.ts`
Expected: 3 FAIL ("Cannot find module '../setup-room-channel'")

**Step 3: setup-room-channel.ts implement**

(Design Bolum 4'teki kodu tam olarak kullan)

**Step 4: Run, 3 GREEN**

**Step 5: Commit**

```bash
git add src/lib/rooms/setup-room-channel.ts src/lib/rooms/__tests__/setup-room-channel.test.ts
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-3 setupRoomChannel + 3 TDD GREEN

Side-effect Realtime channel layer. 4 postgres_changes listener
(rooms UPDATE + room_members 3 event), 3 presence listener
(sync/join/leave), 1 system error listener. presence track + subscribe.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `use-room-channel.ts` + 1 smoke test

**Files:**
- Create: `src/lib/rooms/use-room-channel.ts`
- Test: `src/lib/rooms/__tests__/use-room-channel.test.tsx`

**Step 1: smoke test (RED)**

```typescript
// src/lib/rooms/__tests__/use-room-channel.test.tsx
import { describe, test, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockSetupChannel, mockUnsubscribe, mockCreateClient } = vi.hoisted(() => ({
  mockSetupChannel: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ createClient: mockCreateClient }))
vi.mock('../setup-room-channel', () => ({ setupRoomChannel: mockSetupChannel }))

import { useRoomChannel } from '../use-room-channel'

const dummyInitial = {
  room: { id: 'r1', code: 'X', title: 'T', state: 'lobby' as const, mode: 'sync' as const,
    host_id: 'h', category: 'g', difficulty: 2, question_count: 10, max_players: 8,
    per_question_seconds: 20, created_at: '2026-04-30' },
  members: [], current_round: null, answers_count: 0, scoreboard: [],
  online: new Set<string>(), isStale: false,
}

describe('useRoomChannel', () => {
  test('14) Mount → setupRoomChannel called once; unmount → channel.unsubscribe called', () => {
    const channelMock = {
      unsubscribe: mockUnsubscribe,
      socket: { onMessage: vi.fn(), onError: vi.fn() },
    }
    mockSetupChannel.mockReturnValue(channelMock)
    mockCreateClient.mockReturnValue({})

    const { unmount } = renderHook(() =>
      useRoomChannel('r1', 'u1', dummyInitial),
    )
    expect(mockSetupChannel).toHaveBeenCalledTimes(1)
    expect(mockSetupChannel).toHaveBeenCalledWith({}, 'r1', 'u1', expect.any(Function))

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run, RED**

**Step 3: use-room-channel.ts implement**

(Design Bolum 5'teki kodu tam olarak kullan)

**Step 4: Run, 1 GREEN**

**Step 5: Commit**

```bash
git add src/lib/rooms/use-room-channel.ts src/lib/rooms/__tests__/use-room-channel.test.tsx
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-4 useRoomChannel hook + 1 smoke GREEN

useReducer + useEffect orchestrator. Mount: setupRoomChannel + reconnect
listener + REST hydrate. Unmount: channel.unsubscribe + isMounted guard.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — `fetchRoomState` + GET /state Route + 6 test

**Files:**
- Modify: `src/lib/rooms/server-fetch.ts` (add `fetchRoomState`)
- Create: `src/app/api/rooms/[id]/state/route.ts`
- Test: `src/app/api/rooms/[id]/state/__tests__/route.test.ts`

**Step 1: 6 test (RED)**

```typescript
// src/app/api/rooms/[id]/state/__tests__/route.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetAuth, mockFetchRoomState } = vi.hoisted(() => ({
  mockGetAuth: vi.fn(),
  mockFetchRoomState: vi.fn(),
}))

vi.mock('@/lib/rooms/api-helpers', () => ({ getAuthAndJwt: mockGetAuth }))
vi.mock('@/lib/rooms/server-fetch', () => ({ fetchRoomState: mockFetchRoomState }))

import { GET } from '../route'

const params = { params: Promise.resolve({ id: 'r1' }) }
const req = () => new NextRequest('http://localhost/api/rooms/r1/state')

describe('GET /api/rooms/[id]/state', () => {
  beforeEach(() => vi.clearAllMocks())

  test('15) auth fail → 401', async () => {
    const { NextResponse } = await import('next/server')
    mockGetAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }),
    })
    const res = await GET(req(), params)
    expect(res.status).toBe(401)
  })

  test('16) fetchRoomState null → 404', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue(null)
    const res = await GET(req(), params)
    expect(res.status).toBe(404)
  })

  test('17) success → 200 + full payload', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    const payload = {
      room: { id: 'r1', code: 'X' }, members: [], current_round: null,
      answers_count: 0, scoreboard: [],
    }
    mockFetchRoomState.mockResolvedValue(payload)
    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(payload)
  })

  test('18) fetchRoomState called with jwt + roomId', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue({ room: {}, members: [] })
    await GET(req(), params)
    expect(mockFetchRoomState).toHaveBeenCalledWith('jwt', 'r1')
  })

  test('19) lobby state → current_round null', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue({
      room: { state: 'lobby' }, members: [], current_round: null,
      answers_count: 0, scoreboard: [],
    })
    const res = await GET(req(), params)
    expect((await res.json()).current_round).toBeNull()
  })

  test('20) scoreboard placeholder [] in 4b (4c populates)', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue({
      room: {}, members: [], current_round: null, answers_count: 0, scoreboard: [],
    })
    const res = await GET(req(), params)
    expect((await res.json()).scoreboard).toEqual([])
  })
})
```

**Step 2: server-fetch.ts'e fetchRoomState ekle (4 paralel REST)**

```typescript
// (mevcut server-fetch.ts'e ekle)
export async function fetchRoomState(
  jwt: string,
  roomId: string,
): Promise<RoomState | null> {
  const headers = { Authorization: `Bearer ${jwt}` }
  const opts = { headers, cache: 'no-store' as const }

  const [roomRes, membersRes, roundRes, answersRes] = await Promise.all([
    fetch(`${RPC_URL}/rooms?id=eq.${roomId}&select=*&limit=1`, opts),
    fetch(`${RPC_URL}/room_members?room_id=eq.${roomId}&select=*&order=joined_at.asc`, opts),
    fetch(`${RPC_URL}/room_rounds?room_id=eq.${roomId}&select=*&order=round_number.desc&limit=1`, opts),
    fetch(`${RPC_URL}/room_answers?select=count`, opts),  // simplified for now
  ])

  if (!roomRes.ok) return null
  const rooms = await roomRes.json() as Room[]
  if (rooms.length === 0) return null

  const members = membersRes.ok ? await membersRes.json() as Member[] : []
  const rounds = roundRes.ok ? await roundRes.json() : []
  const current_round = rounds[0] ?? null

  return {
    room: rooms[0],
    members,
    current_round,
    answers_count: 0,  // TODO 4c: count from answersRes
    scoreboard: [],    // TODO 4c
  }
}
```

**Step 3: route.ts implement**

(Design Bolum 6 kullan)

**Step 4: Run, 6 GREEN**

**Step 5: Commit**

```bash
git add src/lib/rooms/server-fetch.ts src/app/api/rooms/\[id\]/state/
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-5 GET /state + fetchRoomState + 6 TDD GREEN

4 paralel PostgREST query (rooms, room_members, room_rounds latest,
room_answers count). Promise.all ile latency optimize.

answers_count + scoreboard 4c'de doldurulur (placeholder 0/[]).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Lobby Components (8 component + 4 test)

**Files (8 component):**
- `src/components/oda/LobbyHeader.tsx` (server, ~60 LOC)
- `src/components/oda/MemberRoster.tsx` (`'use client'`, ~100 LOC)
- `src/components/oda/MemberRow.tsx` (server, ~50 LOC)
- `src/components/oda/RoomInfoPanel.tsx` (server, ~60 LOC)
- `src/components/oda/MemberActions.tsx` (`'use client'`, ~80 LOC)
- `src/components/oda/ShareCodeButton.tsx` (`'use client'`, ~50 LOC)
- `src/components/oda/HostActionsPlaceholder.tsx` (server, ~30 LOC)
- `src/components/oda/LobbyContainer.tsx` (`'use client'`, ~50 LOC, root)

**Tests (4):**
- `MemberRoster.test.tsx` (2): presence dot + host badge
- `ShareCodeButton.test.tsx` (1): clipboard mock
- `MemberActions.test.tsx` (1): leave button → leaveRoomAction call

**Step 1: 4 test (RED)** + **Step 2: 8 component implement** + **Step 3: GREEN**

> Components yapisi PR4a atom paterni paralel: CSS variables + Field-style accessibility. Tam kod design Bolum 8 + Bolum 5 referansi. Detaylar PR4a `RoomCard.tsx`, `EmptyState.tsx` paterni.

**MemberRoster.test.tsx ornek:**

```typescript
test('21) presence dot - online member yesil indicator', () => {
  render(<MemberRoster
    members={[{ user_id: 'u1', display_name: 'A', joined_at: '2026-04-30',
                is_host: false, is_kicked: false }]}
    online={new Set(['u1'])}
    hostId="u-host"
  />)
  expect(screen.getByLabelText(/online/i)).toBeInTheDocument()
})

test('22) host badge - is_host=true icin "Host" rozet', () => {
  render(<MemberRoster
    members={[{ user_id: 'h1', display_name: 'Host', joined_at: '2026-04-30',
                is_host: true, is_kicked: false }]}
    online={new Set()}
    hostId="h1"
  />)
  expect(screen.getByText(/Host/)).toBeInTheDocument()
})
```

**Step 4: 4 GREEN dogrula**

**Step 5: Commit**

```bash
git add src/components/oda/
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-6 lobby componentleri + 4 TDD GREEN

8 yeni component: LobbyHeader, MemberRoster (presence dot), MemberRow,
RoomInfoPanel, MemberActions (leave + share), ShareCodeButton (clipboard),
HostActionsPlaceholder (4c yer tutar), LobbyContainer (orchestrator).

CSS variables paterni (PR4a uyumlu). Member roster host badge + online
indicator. ShareCodeButton clipboard.writeText + toast feedback.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — `/oda/kod` Join Page + JoinRoomForm

**Files:**
- Create: `src/app/(player)/oda/kod/page.tsx`
- Create: `src/components/oda/JoinRoomForm.tsx`
- Test: yok (Task 1 zaten joinRoomAction'i kapsiyor; form smoke 4d Playwright'ta)

**Step 1: JoinRoomForm.tsx**

```typescript
'use client'
import { useActionState } from 'react'
import { joinRoomAction, type JoinRoomActionState } from '@/lib/rooms/actions'
import { Field } from './Field'

const initialState: JoinRoomActionState = {}

export function JoinRoomForm() {
  const [state, formAction, isPending] = useActionState(joinRoomAction, initialState)
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field
        label="Oda Kodu (6 karakter)"
        name="code"
        required
        maxLength={6}
        error={state.fieldErrors?.code?.[0]}
      />
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
```

**Step 2: page.tsx**

```typescript
// src/app/(player)/oda/kod/page.tsx
import Link from 'next/link'
import { JoinRoomForm } from '@/components/oda/JoinRoomForm'

export default function Page() {
  return (
    <>
      <header className="mb-6">
        <Link href="/oda" className="text-sm text-[var(--text-sub)] hover:underline">
          ← Odalarım
        </Link>
        <h1 className="mt-2 text-xl font-bold">Kod ile Katıl</h1>
      </header>
      <JoinRoomForm />
    </>
  )
}
```

**Step 3: Visual smoke (manuel)**

Run: `pnpm dev`
Browse: http://localhost:3000/oda/kod
Action: Form goruntulu mu? Submit invalid kod → fieldErrors. Valid kod → /oda/[code] redirect.

**Step 4: Commit**

```bash
git add src/components/oda/JoinRoomForm.tsx 'src/app/(player)/oda/kod/'
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-7 /oda/kod join page + JoinRoomForm

useActionState + joinRoomAction (Task 1 backend). Field reuse, 6-char
maxLength. CreateRoomForm patterni paralel.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — `/oda/[code]` REPLACE (Real Lobby)

**Files:**
- Replace: `src/app/(player)/oda/[code]/page.tsx` (PR4a placeholder yerine LobbyContainer)

**Step 1: page.tsx REPLACE**

(Design Bolum 8 kodu tam olarak kullan)

**Step 2: Visual smoke (manuel)**

Run: `pnpm dev`
Browse: http://localhost:3000/oda/[bir-kod]
- 2 sekme ayni odada → ikisi de ayni member listesi gormeli
- 2. sekme katilirken 1. sekme INSERT event almali
- 2. sekmenin sayfasi kapatildiginda 1. sekme presence offline gormeli

**Step 3: Commit**

```bash
git add 'src/app/(player)/oda/[code]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(oda): PR4b-8 /oda/[code] real lobby (PR4a placeholder REPLACE)

Server Component fetch + auth + initial state SSR. <LobbyContainer/>
client component useRoomChannel ile postgres_changes + presence
gercek-zamanli sync.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — Lint + Build + Full Test

**Step 1: pnpm test (full)**

Run: `pnpm test --run`
Expected: 24 yeni PR4b test GREEN, mevcut 1091 test regression yok = **1115/1115 GREEN**.

**Step 2: pnpm lint**

Run: `pnpm lint`
Expected: 0 error, ideal 0 warning ekle.

**Step 3: pnpm build**

Run: `pnpm build`
Expected: success, /oda/kod + /oda/[code] dynamic routes uretildi.

**Step 4: pnpm type-check**

Run: `pnpm type-check`
Expected: 0 error.

**Step 5: Commit (varsa minor fix)**

```bash
git add -A
git commit -m "chore(oda): PR4b-9 lint/build clean"
```

---

## Task 10 — PR Open + Memory POST

**Step 1: Push**

Run: `git push -u origin feat/oda-pr4b-lobby-realtime`

**Step 2: gh pr create**

```bash
gh pr create --title "feat(oda): Sprint 1 PR4b — Lobby UI + Realtime (postgres_changes + presence)" --body "$(cat <<'EOF'
## Summary

PR4'un Realtime kismi — `/oda/[code]` lobby (4a placeholder REPLACE) +
`useRoomChannel` hook (postgres_changes + presence) + `GET /api/rooms/[id]/state` endpoint + `/oda/kod` join page.

**Karar (brainstorming):** Q1 postgres_changes+presence (broadcast YOK),
Q2 full state payload, Q3 4b member-side actions (leave+share),
Q4 Reducer-extracted TDD pattern.

**Architecture:** Pure roomStateReducer (state machine, 9 events) + side-effect
setupRoomChannel (Supabase subscribe) + thin useRoomChannel hook (orchestrator).
REST resync on reconnect (memory id=335 mandatory).

**Test:** 24 Vitest test GREEN, total 1115 (regression yok)
- room-state-reducer: 10 (HYDRATE + 9 events + idempotency + unknown)
- setup-room-channel: 3 (name, filters, subscribe)
- use-room-channel: 1 smoke (mount/unmount)
- state route: 6 (auth, payload, parallel)
- joinRoomAction: 3 (auth, validation, success)
- Components: 4 (presence, host badge, clipboard, leave)

**Out-of-scope (4c/4d):**
- Host start/cancel/kick UI buttons
- Realtime broadcast (typing/ready)
- Playwright multi-tab + reconnect e2e

## Plan/Design

- Design: `docs/plans/2026-04-30-oda-pr4b-design.md`
- Plan: `docs/plans/2026-04-30-oda-pr4b-lobby-realtime-plan.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Memory POST 3'lusu (zorunlu kayit)**

```bash
# Session
curl -s -X POST -H "X-Memory-Key: ..." -H "Content-Type: application/json" \
  -d '{"device_name":"...","platform":"windows","summary":"Bilge Arena PR4b TAMAMLANDI - Realtime lobby + 24 TDD GREEN."}' \
  http://100.113.153.62:8420/api/v1/memory/sessions

# Feedback (Realtime pattern)
curl -s -X POST ... -d '{"type":"feedback","name":"realtime_reducer_extracted_pattern","description":"...","content":"..."}' \
  .../memories

# Task
curl -s -X POST ... -d '{"project":"bilge-arena","task":"...","status":"completed",...}' \
  .../tasks
```

---

## Acceptance Criteria

- [ ] 10 commit (PR4b-1 to PR4b-9 + push)
- [ ] 24 Vitest test GREEN (PR4b)
- [ ] 1115/1115 toplam GREEN (regression yok)
- [ ] pnpm lint 0 error
- [ ] pnpm build success
- [ ] pnpm type-check 0 error
- [ ] /oda/kod, /oda/[code] dynamic routes uretildi
- [ ] Visual smoke 2-tab Realtime sync (manuel)
- [ ] Reconnect REST resync calisir (network simulator)
- [ ] PR description Realtime mimarisi + 4 Q karari belirtilmis
- [ ] Codex P1 review tamamlandi
- [ ] Memory POST: session + feedback + task

---

## Plan Verification Step

Implementation oncesi dogrulamalar:

- [x] Master `9682dfe` (PR4a + PR3bc + earlier)
- [x] Branch `feat/oda-pr4b-lobby-realtime` master'dan acildi
- [x] PR4a patternleri sahip: actions.ts, server-fetch.ts, vitest alias
- [ ] Task 0: Realtime VPS container saglikli (curl healthcheck)
- [ ] `src/lib/supabase/client.ts` browser client mevcut (yoksa Task 0 expand)
- [ ] `pnpm test --run` mevcut state'te 1091/1091 GREEN

Tum kosullar saglandiysa Task 1 ile baslar.
