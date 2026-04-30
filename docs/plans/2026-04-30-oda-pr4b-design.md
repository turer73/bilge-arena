# Oda Sistemi PR4b — Lobby UI + Realtime Design Doc

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` to create the implementation plan from this design (`docs/plans/2026-04-30-oda-pr4b-lobby-realtime-plan.md`).

**Goal:** PR4'un Realtime kismi — `/oda/[code]` lobby sayfasi (4a placeholder yerine real-time member roster) + `useRoomChannel` hook + `GET /api/rooms/[id]/state` endpoint + `/oda/kod` join page.

**Onceki PR:** PR4a (#44 mergelendi `9682dfe`) — Server Action form + my-rooms list + placeholder lobby. PR4b o placeholder'i gercek lobby ile **REPLACE eder**.

**Tech Stack:** Next.js 16 + React 19 (`useReducer`, `useEffect` orchestrator), Supabase Realtime (postgres_changes + presence), Vitest + @testing-library/react.

---

## Bolum 1 — 4 Karar (brainstorming ozeti)

| # | Konu | Karar | Sebep |
|---|---|---|---|
| Q1 | Realtime mekanizma | **postgres_changes + presence** (broadcast YOK, 4c ekleyebilir) | Member online/offline lobby'de kritik; typing/ready MVP'de gereksiz; Anatolia360 BilgiArena modelinde de yok |
| Q2 | GET /state payload | **Full state** (`room` + `members` + `current_round?` + `answers_count` + `scoreboard`) | Endpoint signature stabilize, 4c degistirme yok, single source of truth |
| Q3 | 4b vs 4c action bolumu | **4b: member-side** (leave + kod paylas), **4c: host-side** (start/cancel/kick) | Mantiken ayri, RLS host olmasalardan butonlar gizlenir, 4b kapsami temiz |
| Q4 | TDD strategy | **Reducer-extracted** (pure func 100%, channel setup mock, hook smoke) | Realtime hard-to-mock, reducer pure func clean test, future-proof |

---

## Bolum 2 — Mimari (3 Katman)

```
┌──────────────────────────────────────────────────────────────────┐
│ /oda/[code]/page.tsx (Server Component)                          │
│  - createClient + auth                                            │
│  - fetchState (REST)                                              │
│  - render <LobbyContainer initialState={...} />                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ initialState (SSR data)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ <LobbyContainer> ('use client')                                   │
│  const { state, isOnline } = useRoomChannel(roomId, initialState) │
│                                                                    │
│  └── <LobbyHeader title state code />                              │
│  └── <RoomInfoPanel info />                                        │
│  └── <MemberRoster members presence />                             │
│  └── <MemberActions />        ← leave + share (4b)                │
│  └── <HostActionsPlaceholder /> ← yer tutar (4c'de doldurulur)    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ subscribe
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ useRoomChannel (orchestrator hook)                                │
│  ┌─────────────────┐    dispatch(event)     ┌──────────────────┐ │
│  │ setupChannel    │ ──────────────────────>│ roomStateReducer │ │
│  │ - postgres      │                         │  (state, event)  │ │
│  │   _changes      │                         │  → newState pure │ │
│  │ - presence      │                         └──────────────────┘ │
│  │ - reconnect     │ ──── REST hydrate ────>      ▲              │
│  └────────┬────────┘                              │              │
│           ▼                                       │              │
│   Supabase Realtime channel                       │              │
│   ws://realtime.bilgearena.com/socket             │              │
│                                                    │              │
│   useEffect cleanup: channel.unsubscribe()        │              │
└────────────────────────────────────────────────────┼─────────────┘
                                                     │
                                              useReducer state
```

---

## Bolum 3 — Reducer (Pure State Machine)

`src/lib/rooms/room-state-reducer.ts`:

```typescript
export type Member = {
  user_id: string
  display_name: string
  emoji?: string
  joined_at: string
  is_host: boolean
  is_kicked: boolean
  score?: number
}

export type Room = {
  id: string
  code: string
  title: string
  state: 'lobby' | 'in_progress' | 'finished' | 'cancelled'
  mode: 'sync' | 'async'
  host_id: string
  category: string
  difficulty: number
  question_count: number
  max_players: number
  per_question_seconds: number
  created_at: string
  started_at?: string
}

export type RoomState = {
  room: Room
  members: Member[]
  current_round: null | {
    round_number: number
    question_id: string
    started_at: string
    deadline: string  // server-computed: started_at + per_question_seconds
    revealed_at: string | null
  }
  answers_count: number
  scoreboard: Array<{ user_id: string; score: number; correct_count: number }>
  online: Set<string>  // presence-derived
  isStale: boolean     // channel error → true, hydrate → false
}

export type RoomEvent =
  | { type: 'HYDRATE'; payload: Omit<RoomState, 'online' | 'isStale'> }
  | { type: 'ROOM_UPDATE'; payload: Partial<Room> }
  | { type: 'MEMBER_INSERT'; payload: Member }
  | { type: 'MEMBER_UPDATE'; payload: Member }
  | { type: 'MEMBER_DELETE'; payload: { user_id: string } }
  | { type: 'PRESENCE_SYNC'; payload: { online: string[] } }
  | { type: 'PRESENCE_JOIN'; payload: { user_id: string } }
  | { type: 'PRESENCE_LEAVE'; payload: { user_id: string } }
  | { type: 'CHANNEL_ERROR'; payload: { error: string } }

export function roomStateReducer(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case 'HYDRATE':
      return { ...event.payload, online: state.online, isStale: false }

    case 'ROOM_UPDATE':
      return { ...state, room: { ...state.room, ...event.payload } }

    case 'MEMBER_INSERT': {
      // Idempotent: ayni user_id varsa update, yoksa append
      const existing = state.members.find(m => m.user_id === event.payload.user_id)
      if (existing) return state
      return { ...state, members: [...state.members, event.payload] }
    }

    case 'MEMBER_UPDATE':
      return {
        ...state,
        members: state.members.map(m =>
          m.user_id === event.payload.user_id ? event.payload : m,
        ),
      }

    case 'MEMBER_DELETE':
      return {
        ...state,
        members: state.members.filter(m => m.user_id !== event.payload.user_id),
      }

    case 'PRESENCE_SYNC':
      return { ...state, online: new Set(event.payload.online) }

    case 'PRESENCE_JOIN': {
      const next = new Set(state.online)
      next.add(event.payload.user_id)
      return { ...state, online: next }
    }

    case 'PRESENCE_LEAVE': {
      const next = new Set(state.online)
      next.delete(event.payload.user_id)
      return { ...state, online: next }
    }

    case 'CHANNEL_ERROR':
      return { ...state, isStale: true }

    default:
      return state  // exhaustive check via TS, defensive at runtime
  }
}
```

**Test surface (10):**
1. HYDRATE → tum state set
2. MEMBER_INSERT → liste buyur (idempotent: ayni user_id append etmez)
3. MEMBER_UPDATE → kicked=true update
4. MEMBER_DELETE → liste kucur
5. ROOM_UPDATE → state lobby→in_progress
6. PRESENCE_SYNC → online Set replace
7. PRESENCE_JOIN → online'a ekle
8. PRESENCE_LEAVE → online'dan cikar
9. CHANNEL_ERROR → isStale=true
10. Unknown event → state unchanged

---

## Bolum 4 — Channel Setup (Side-Effect Layer)

`src/lib/rooms/setup-room-channel.ts`:

```typescript
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { RoomEvent } from './room-state-reducer'

export function setupRoomChannel(
  supabase: SupabaseClient,
  roomId: string,
  userId: string,
  dispatch: (event: RoomEvent) => void,
): RealtimeChannel {
  const channel = supabase.channel(`room-${roomId}`, {
    config: { presence: { key: userId } },
  })

  // postgres_changes: rooms table
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
    (payload) => dispatch({ type: 'ROOM_UPDATE', payload: payload.new as never }),
  )

  // postgres_changes: room_members table (3 events)
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
    (payload) => dispatch({ type: 'MEMBER_INSERT', payload: payload.new as never }),
  )
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
    (payload) => dispatch({ type: 'MEMBER_UPDATE', payload: payload.new as never }),
  )
  channel.on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
    (payload) => dispatch({ type: 'MEMBER_DELETE', payload: payload.old as never }),
  )

  // Presence
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    const online = Object.keys(state)
    dispatch({ type: 'PRESENCE_SYNC', payload: { online } })
  })
  channel.on('presence', { event: 'join' }, ({ key }) =>
    dispatch({ type: 'PRESENCE_JOIN', payload: { user_id: key } }),
  )
  channel.on('presence', { event: 'leave' }, ({ key }) =>
    dispatch({ type: 'PRESENCE_LEAVE', payload: { user_id: key } }),
  )

  // System events (errors)
  channel.on('system', { event: '*' }, (payload) => {
    if (payload.status === 'error') {
      dispatch({ type: 'CHANNEL_ERROR', payload: { error: payload.message } })
    }
  })

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: userId, online_at: new Date().toISOString() })
    }
  })

  return channel
}
```

**Test surface (3):**
11. Channel name = `room-${roomId}`
12. postgres_changes filter format dogru (id eq, room_id eq)
13. subscribe + presence track called

---

## Bolum 5 — `useRoomChannel` Hook (Orchestrator)

`src/lib/rooms/use-room-channel.ts`:

```typescript
'use client'

import { useEffect, useReducer, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'  // browser client
import { setupRoomChannel } from './setup-room-channel'
import { roomStateReducer, type RoomState } from './room-state-reducer'

export function useRoomChannel(
  roomId: string,
  userId: string,
  initialState: RoomState,
) {
  const [state, dispatch] = useReducer(roomStateReducer, initialState)
  const isMounted = useRef(true)

  useEffect(() => {
    const supabase = createClient()
    const channel = setupRoomChannel(supabase, roomId, userId, (event) => {
      // Race protection: unmounted'a dispatch yapma
      if (isMounted.current) dispatch(event)
    })

    // Reconnect: REST resync (memory id=335)
    const reconnectListener = async () => {
      const fresh = await fetch(`/api/rooms/${roomId}/state`).then(r => r.json())
      if (isMounted.current) {
        dispatch({ type: 'HYDRATE', payload: fresh })
      }
    }
    channel.socket.onMessage((msg) => {
      if (msg.event === 'phx_reply' && msg.payload.status === 'ok') {
        // first connect, no resync needed
      }
    })
    channel.socket.onError(() => reconnectListener())

    return () => {
      isMounted.current = false
      channel.unsubscribe()
    }
  }, [roomId, userId])

  return { state, isOnline: !state.isStale }
}
```

**Test surface (1 smoke):**
14. Mount → setupRoomChannel called once with correct args; unmount → channel.unsubscribe called

---

## Bolum 6 — GET /api/rooms/[id]/state Endpoint

`src/app/api/rooms/[id]/state/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getAuthAndJwt } from '@/lib/rooms/api-helpers'
import { fetchRoomState } from '@/lib/rooms/server-fetch'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthAndJwt()
  if (!auth.ok) return auth.response

  const { id } = await params
  const state = await fetchRoomState(auth.jwt, id)
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(state)
}
```

**`fetchRoomState`** — server-fetch.ts'e eklenen yeni fonksiyon (4 paralel PostgREST query):

```typescript
export async function fetchRoomState(jwt: string, roomId: string) {
  const [room, members, currentRound, answersCount] = await Promise.all([
    fetchRoom(jwt, roomId),                 // GET rooms?id=eq.X
    fetchMembers(jwt, roomId),              // GET room_members?room_id=eq.X
    fetchCurrentRound(jwt, roomId),         // GET room_rounds?room_id=eq.X&order=round_number.desc&limit=1
    fetchAnswersCount(jwt, roomId),         // GET room_answers?...&select=count
  ])
  if (!room) return null
  return {
    room,
    members,
    current_round: currentRound,
    answers_count: answersCount,
    scoreboard: [],  // 4c'de room_answers + question correctness ile compute edilir
  }
}
```

**Test surface (6):**
15-20: API route — auth fail (401), member degil (404), happy path (200), full payload sema, current_round null (lobby state), 4 paralel fetch yapildi (Promise.all spy)

---

## Bolum 7 — /oda/kod Join Page

`src/app/(player)/oda/kod/page.tsx`:

```typescript
import { JoinRoomForm } from '@/components/oda/JoinRoomForm'
// Server Component shell (auth guard parent layout)
export default function Page() {
  return (
    <>
      <h1>Kod ile Katil</h1>
      <JoinRoomForm />
    </>
  )
}
```

`src/components/oda/JoinRoomForm.tsx`:
```typescript
'use client'
// Aynen CreateRoomForm patterni: useActionState + joinRoomAction
```

`src/lib/rooms/actions.ts`'e ikinci action:
```typescript
export async function joinRoomAction(prev, formData) {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const parsed = joinRoomSchema.safeParse({ code: formData.get('code')?.toString() })
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

  const result = await callRpc(auth.jwt, 'join_room', { p_code: parsed.data.code })
  if (!result.ok) return { error: result.error.message }

  redirect(`/oda/${parsed.data.code}`)
}
```

**Test surface (3):** auth fail, invalid code, success redirect.

---

## Bolum 8 — /oda/[code] Real Lobby

4a placeholder'i REPLACE et:

```typescript
// src/app/(player)/oda/[code]/page.tsx (NEW)
export default async function Page({ params }) {
  const { code } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/giris?redirect=/oda/${code}`)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect(`/giris?redirect=/oda/${code}`)

  // Code → ID resolve
  const room = await fetchRoomByCode(session.access_token, code)
  if (!room) notFound()

  // Initial state for SSR
  const initialState = await fetchRoomState(session.access_token, room.id)

  return <LobbyContainer roomId={room.id} userId={user.id} initialState={initialState} />
}
```

```typescript
// src/components/oda/LobbyContainer.tsx ('use client')
import { useRoomChannel } from '@/lib/rooms/use-room-channel'
import { LobbyHeader, RoomInfoPanel, MemberRoster, MemberActions, HostActionsPlaceholder } from '...'

export function LobbyContainer({ roomId, userId, initialState }) {
  const { state, isOnline } = useRoomChannel(roomId, userId, initialState)
  return (
    <>
      <LobbyHeader room={state.room} isOnline={isOnline} />
      <RoomInfoPanel room={state.room} />
      <MemberRoster members={state.members} online={state.online} hostId={state.room.host_id} />
      <MemberActions roomId={state.room.id} userId={userId} hostId={state.room.host_id} />
      <HostActionsPlaceholder isHost={userId === state.room.host_id} />
    </>
  )
}
```

---

## Bolum 9 — Test Plan (24 test)

| Dosya | Test |
|---|---|
| room-state-reducer.test.ts | 10 (HYDRATE + 9 events + idempotency + unknown) |
| setup-room-channel.test.ts | 3 (name, filters, subscribe+track) |
| use-room-channel.test.tsx | 1 (mount/unmount smoke) |
| state route.test.ts | 6 (auth, RLS, payload, parallel, current_round null, scoreboard placeholder) |
| MemberRoster.test.tsx | 2 (presence dot, host badge) |
| ShareCodeButton.test.tsx | 1 (clipboard mock + toast) |
| MemberActions.test.tsx | 1 (leave button → joinRoomAction) |

**Toplam: 24 test, ~620 LOC test, ~870 LOC prod.**

---

## Bolum 10 — Implementation Order (yarinki execute)

```
Adim 0: master fast-forward + branch (zaten yapildi: feat/oda-pr4b-lobby-realtime)
Adim 1: actions.ts'e joinRoomAction + 3 test (kucuk, momentum)
Adim 2: room-state-reducer.ts + 10 test (RED→GREEN, pure func test eglenceli)
Adim 3: setup-room-channel.ts + 3 test
Adim 4: use-room-channel.ts + 1 smoke
Adim 5: server-fetch.ts'e fetchRoomState + GET /state route + 6 test
Adim 6: Component'ler (LobbyHeader, MemberRoster, MemberRow, RoomInfoPanel, MemberActions, ShareCodeButton, HostActionsPlaceholder, LobbyContainer) + 4 test
Adim 7: /oda/kod sayfasi + JoinRoomForm + visual smoke
Adim 8: /oda/[code] REPLACE (4a placeholder yerine LobbyContainer)
Adim 9: Lint + build + full test
Adim 10: PR ac
```

**Tahmin:** 7-9 saat, 10 commit.

---

## Bolum 11 — Risk + Mitigasyon

| Risk | Olasilik | Etki | Mitigasyon |
|---|---|---|---|
| Supabase Realtime VPS container instability (Phoenix recreate sonrasi 30-60sn warmup, ref `plausible_phoenix_boot`) | Orta | Dusuk-orta | Implementation basinda Realtime container health check; Sentry error monitoring; UI'da `isStale=true` banner ile kullaniciya bildirim |
| RLS realtime.messages policy member-only delivery yanlis | Orta | Yuksek | Test: kicked member event almaya devam ederse RLS policy bug; Codex P1 review'da spotlanir |
| useEffect cleanup race (roomId degisirken eski channel'a event geldigi) | Dusuk | Orta | `isMounted.current` ref guard, dispatch ignore unmounted (kod halletti) |
| Reducer ile component prop drift (ornek: state.room.host_id'yi degistirir, ama component eski prop'u tutar) | Dusuk | Dusuk | useReducer + spread = referansi kirar, React re-render guarantee |
| Browser realtime WebSocket connection limits (free tier limit 100 conn/proje) | Dusuk MVP | Orta | Production'da Pro/self-host plan; Sprint 2'de monitoring |
| presence ile concurrent updates (50+ member, ama MVP max=20) | Dusuk | Dusuk | YAGNI |
| TypeScript discriminated union exhaustiveness (yeni RoomEvent type eklenirse reducer breaks) | Dusuk | Dusuk | `default` case + tsc strict, lint detection |

---

## Bolum 12 — Acik Sorular (yarinki implementation'da netlestir)

1. **`current_round.deadline` server-computed mu?** → **Evet**, `started_at + per_question_seconds` server-side compute. Client clock drift yok.
2. **`fetchRoomState` icin yeni RPC mi yoksa 4 paralel REST mi?** → **4 paralel REST** (Promise.all). RPC yapip 4 query'i tek atmak Sprint 2'de optimize edilebilir, MVP'de kabul edilebilir latency.
3. **`<MemberRoster>` order** → host once, sonra joined_at ASC. (UI karari, plan'a yazilir.)
4. **`isOnline` state** → 4b'de `<LobbyHeader>`da gorunur (kucuk indicator), 4c'de host start butonu disable edilir eger `isOnline=false`.
5. **`presence` heartbeat interval** → Supabase default 30sn yeterli. Custom config Sprint 2.

---

## Bolum 13 — Acceptance Criteria

PR4b mergelenmek icin:

- [ ] 24 Vitest test GREEN
- [ ] /oda/kod form + Server Action calisir (kod gir → /oda/[code] redirect)
- [ ] /oda/[code] real lobby render (member roster + presence + info panel)
- [ ] Iki sekme ayni odada → ikisi de gercek-zamanli member listesi gorur (manuel test)
- [ ] Reconnect sonrasi REST resync calisir (network kesintisi simulator + reconnect)
- [ ] pnpm lint 0 error, pnpm build success, pnpm type-check 0 error
- [ ] PR description Realtime mimarisi + 4 Q karari belirtilmis
- [ ] Codex P1 review 1 round + follow-up
- [ ] Memory POST: session + feedback (Realtime pattern) + task

---

## Referanslar

**Memory:**
- id=143 — Bilge Arena Oda feature roadmap
- id=324 — Anatolia360 BilgiArena referans modeli
- id=335 — `realtime_reconnect_replay_yok` (CRITIKAL — REST resync mandatory)
- id=336 — `bilge_arena_oda_bolum3_realtime` (mimari blueprint)
- id=337 — `supabase_realtime_tier_pricing_2026`
- id=403 — `server_action_codebase_first_pattern` (PR4a'dan, joinRoomAction icin reuse)
- id=361 — `auth_schema_grant_gap` (RLS pattern)

**External:**
- Supabase Realtime docs: https://supabase.com/docs/guides/realtime
- React 19 useReducer: https://react.dev/reference/react/useReducer

**PR4a patternleri:**
- `src/lib/rooms/actions.ts` (joinRoomAction icin paralel)
- `src/lib/rooms/server-fetch.ts` (fetchRoomState icin extend)
- `src/components/oda/CreateRoomForm.tsx` (JoinRoomForm icin parallel pattern)
- `src/test/server-only-stub.ts` + vitest alias (kullanilir)
