# Oda PR4a Implementation Plan — Form + List + Placeholder

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** `/oda/yeni` Server Action create form + `/oda` "benim odalarim" listesi + `/oda/[code]` placeholder kur, 42 Vitest test GREEN ile.

**Architecture:** Next.js 16 Server Action (codebase ilk ornegi) `createRoomAction` + 7-alan form `useActionState` ile. List sayfasi server component, dogrudan PostgREST'e RLS-filtered fetch. Atom componentleri (Field, NumField, EmptyState, StateBadge, RoomCard) `var(--*)` CSS variables ile.

**Tech Stack:** Next.js 16 App Router, React 19 (`useActionState`), Zod 4 (mevcut `createRoomSchema`), Tailwind 3.4, Vitest + @testing-library/react.

**Reference Design:** `docs/plans/2026-04-29-oda-pr4-design.md` (8 bolum)

**Branch:** `feat/oda-pr4a-form-list` (master `c6e11a2` + design doc commit `84b963e` zaten icinde)

---

## Pre-Implementation Checklist

- [x] Master `c6e11a2` (PR3bc dahil) icinde
- [x] Branch `feat/oda-pr4a-form-list` olusturuldu
- [x] Design doc commit `84b963e`
- [ ] Bilge-arena VPS PostgREST `http://127.0.0.1:3001` Tailscale tunnel ile erisilebilir (dev'de `BILGE_ARENA_RPC_URL` env var)
- [ ] Panola Supabase auth dev session aktif (cookie var)

---

## Task 0 — Server Action Smoke Validation

**Why:** Codebase'in ilk Server Action'i. `getSession()` Next 16 + Supabase SSR helper'da `null` donduruyorsa **tum 4a tehlikeye girer**. Smoke test burada baska kod yazmadan riski elimine eder.

**Files:**
- Create: `src/app/_smoke/page.tsx` (gecici)
- Create: `src/app/_smoke/SmokeForm.tsx` (gecici)
- Test: `pnpm dev` → http://localhost:3000/_smoke → submit → JWT prefix gormek

**Step 1: Smoke server component + form yaz**

`src/app/_smoke/page.tsx`:
```typescript
import { SmokeForm } from './SmokeForm'
export default function Page() {
  return <SmokeForm />
}
```

`src/app/_smoke/SmokeForm.tsx`:
```typescript
'use client'
import { useActionState } from 'react'
import { smokeAction, type SmokeState } from './action'

const init: SmokeState = {}

export function SmokeForm() {
  const [state, formAction, pending] = useActionState(smokeAction, init)
  return (
    <form action={formAction}>
      <button disabled={pending}>{pending ? 'Test ediliyor...' : 'Smoke test'}</button>
      {state.result && <pre>{JSON.stringify(state.result, null, 2)}</pre>}
      {state.error && <p>{state.error}</p>}
    </form>
  )
}
```

`src/app/_smoke/action.ts`:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'

export type SmokeState = {
  result?: { hasUser: boolean; jwtPrefix: string; jwtLength: number }
  error?: string
}

export async function smokeAction(_prev: SmokeState, _form: FormData): Promise<SmokeState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No user' }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'No session' }
  return {
    result: {
      hasUser: true,
      jwtPrefix: session.access_token.slice(0, 16),
      jwtLength: session.access_token.length,
    },
  }
}
```

**Step 2: Dev server'da manual smoke test**

Run: `pnpm dev` (background)
Browser: http://localhost:3000/_smoke
Action: Login degilsen `/giris` redirect; login isen submit
Expected: `result.hasUser=true`, `jwtLength > 100`, `jwtPrefix` JWT base64 prefix

**Step 3: Smoke gecince temizlik**

Run:
```bash
rm -rf src/app/_smoke
```

**Step 4: Commit**

```bash
git add -A && git status  # _smoke dosyalari deleted gorunmeli
git commit -m "chore(oda): PR4a-0 Server Action smoke validation (deleted)

Validation step: getSession().access_token Next 16 + Supabase SSR ile calisiyor.
JWT length > 100 char, hasUser true. createRoomAction icin yesil isik.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

> **Eger smoke fail ederse:** Plan'i durdur. `getSession()` yerine `getUser()` veya cookie-based fallback arastir. Bu degisiklik Task 1'in `getAuthForAction` implementasyonunu degistirecek.

---

## Task 1 — `actions.ts` + 14 TDD test

**Files:**
- Create: `src/lib/rooms/actions.ts`
- Test: `src/lib/rooms/__tests__/actions.test.ts`

**Step 1: actions.test.ts iskelet + tum 14 test (RED)**

```typescript
// src/lib/rooms/__tests__/actions.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mocks once tanimla, sonra import et
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('../client', () => ({ callRpc: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { callRpc } from '../client'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createRoomAction } from '../actions'

const mockSupabase = (user: any, session: any) => {
  ;(createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
    },
  })
}

const validForm = () => {
  const fd = new FormData()
  fd.set('title', 'Genel Kultur Yarismasi')
  fd.set('category', 'genel-kultur')
  fd.set('difficulty', '3')
  fd.set('question_count', '10')
  fd.set('max_players', '6')
  fd.set('per_question_seconds', '20')
  fd.set('mode', 'sync')
  return fd
}

describe('createRoomAction', () => {
  beforeEach(() => vi.clearAllMocks())

  test('1) anon user → error: Giris yapmalisin', async () => {
    mockSupabase(null, null)
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/Giris yapmalisin/)
  })

  test('2) expired session → error: Oturum suresi doldu', async () => {
    mockSupabase({ id: 'u1' }, null)
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/Oturum suresi doldu/)
  })

  test('3) invalid title (2 char) → fieldErrors.title', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    const fd = validForm(); fd.set('title', 'Ab')
    const r = await createRoomAction({}, fd)
    expect(r.fieldErrors?.title?.length).toBeGreaterThan(0)
  })

  test('4) RPC P0002 → error: Profil olusturulmali', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({
      ok: false,
      error: { code: 'P0002', message: 'Profil olusturulmali', status: 400 },
    })
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/Profil olusturulmali/)
  })

  test('5) success → callRpc + revalidatePath + redirect chain', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({
      ok: true,
      data: { id: 'room1', code: 'BIL2GE' },
    })
    await createRoomAction({}, validForm())
    expect(callRpc).toHaveBeenCalledWith(
      'jwt',
      'create_room',
      expect.objectContaining({ title: 'Genel Kultur Yarismasi', mode: 'sync' }),
    )
    expect(revalidatePath).toHaveBeenCalledWith('/oda')
    expect(redirect).toHaveBeenCalledWith('/oda/BIL2GE')
  })

  test('6) max_players boundary 1/2/20/21', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    for (const [val, valid] of [['1', false], ['2', true], ['20', true], ['21', false]] as const) {
      const fd = validForm(); fd.set('max_players', val)
      const r = await createRoomAction({}, fd)
      if (valid) expect(r.fieldErrors).toBeUndefined()
      else expect(r.fieldErrors?.max_players?.length).toBeGreaterThan(0)
    }
  })

  test('7) per_question_seconds boundary 9/10/60/61', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    for (const [val, valid] of [['9', false], ['10', true], ['60', true], ['61', false]] as const) {
      const fd = validForm(); fd.set('per_question_seconds', val)
      const r = await createRoomAction({}, fd)
      if (valid) expect(r.fieldErrors).toBeUndefined()
      else expect(r.fieldErrors?.per_question_seconds?.length).toBeGreaterThan(0)
    }
  })

  test('8) FormData eksik field → Zod default uygulanir', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    const fd = new FormData()
    fd.set('title', 'Bos Form')
    fd.set('category', 'genel')
    // difficulty, question_count, max_players, per_question_seconds, mode set edilmedi
    await createRoomAction({}, fd)
    expect(callRpc).toHaveBeenCalledWith('jwt', 'create_room', expect.objectContaining({
      difficulty: 2, question_count: 10, max_players: 8, per_question_seconds: 20, mode: 'sync',
    }))
  })

  test('9) mode "invalid" → fieldErrors.mode', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    const fd = validForm(); fd.set('mode', 'invalid')
    const r = await createRoomAction({}, fd)
    expect(r.fieldErrors?.mode?.length).toBeGreaterThan(0)
  })

  test('10) callRpc network exception → error: Network', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({
      ok: false,
      error: { code: 'UNKNOWN', message: 'fetch failed', status: 502 },
    })
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/fetch failed|Network/)
  })

  test('11) success: revalidatePath ONCE redirect ONCE order', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    await createRoomAction({}, validForm())
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(redirect).toHaveBeenCalledTimes(1)
    const revalidateOrder = (revalidatePath as any).mock.invocationCallOrder[0]
    const redirectOrder = (redirect as any).mock.invocationCallOrder[0]
    expect(revalidateOrder).toBeLessThan(redirectOrder)
  })

  test('12) FormData fazladan field → Zod strip', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    ;(callRpc as any).mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    const fd = validForm()
    fd.set('csrf', 'xxx'); fd.set('garbage', '123')
    await createRoomAction({}, fd)
    const callArgs = (callRpc as any).mock.calls[0]
    expect(callArgs[2]).not.toHaveProperty('csrf')
    expect(callArgs[2]).not.toHaveProperty('garbage')
  })
})

describe('getAuthForAction (export internally for test)', () => {
  // 13, 14 — getAuthForAction'i internal export et veya integration test
  // (Bu testler 1, 2 ile zaten kapsanyor; ayri export gerekmez.
  //  Eger getAuthForAction signature'inda ozel davranis test edilecekse
  //  internal export edilebilir.)
})
```

> NOT: Test 13/14 zaten Test 1 ve 2 ile kapsanyor (getAuthForAction `createRoomAction` icinden cagrilir). Eger yine de explicit test isteniyorsa, `getAuthForAction`'i actions.ts'ten **non-default export** yap, test dosyasinda direkt cagri. Bu plan'da Test 1+2 yeterli sayilir; 14 yerine **12 test** sayilir gercek implementasyonda. (Test sayisi guncellenmeli, design doc 14 dedi ama redundant.)

**Step 2: Test calistir, RED dogrula**

Run: `pnpm test src/lib/rooms/__tests__/actions.test.ts`
Expected: FAIL — `Cannot find module '../actions'`

**Step 3: actions.ts implement et**

```typescript
// src/lib/rooms/actions.ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { callRpc } from './client'
import { createRoomSchema, type CreateRoomBody } from './validations'

export type CreateRoomActionState = {
  fieldErrors?: Partial<Record<keyof CreateRoomBody, string[]>>
  error?: string
}

async function getAuthForAction(): Promise<
  | { ok: true; userId: string; jwt: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Giris yapmalisin.' }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'Oturum suresi doldu, tekrar giris yap.' }
  }
  return { ok: true, userId: user.id, jwt: session.access_token }
}

export async function createRoomAction(
  _prev: CreateRoomActionState,
  formData: FormData,
): Promise<CreateRoomActionState> {
  const auth = await getAuthForAction()
  if (!auth.ok) return { error: auth.error }

  const raw = {
    title: formData.get('title')?.toString() ?? '',
    category: formData.get('category')?.toString() ?? '',
    difficulty: Number(formData.get('difficulty') ?? 2),
    question_count: Number(formData.get('question_count') ?? 10),
    max_players: Number(formData.get('max_players') ?? 8),
    per_question_seconds: Number(formData.get('per_question_seconds') ?? 20),
    mode: (formData.get('mode')?.toString() ?? 'sync'),
  }
  const parsed = createRoomSchema.safeParse(raw)
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as CreateRoomActionState['fieldErrors'] }
  }

  const result = await callRpc<{ id: string; code: string }>(
    auth.jwt,
    'create_room',
    parsed.data,
  )
  if (!result.ok) return { error: result.error.message }

  revalidatePath('/oda')
  redirect(`/oda/${result.data.code}`)
}
```

**Step 4: Test tekrar calistir, GREEN dogrula**

Run: `pnpm test src/lib/rooms/__tests__/actions.test.ts`
Expected: PASS — 12/12 (test 13/14 silinince) veya 14/14 (getAuthForAction explicit export edildiyse)

**Step 5: Commit**

```bash
git add src/lib/rooms/actions.ts src/lib/rooms/__tests__/actions.test.ts
git commit -m "feat(oda): PR4a-1 createRoomAction + 12 TDD GREEN

Server Action codebase'in ilk ornegi. getAuthForAction helper
api-helpers.ts'ten ayri (NextResponse yerine action shape).

- createRoomAction: auth + Zod + callRpc + revalidatePath + redirect
- 12 senaryo: 5 happy/error path + 4 boundary + 3 edge case
- Plan-deviation #56: actions.ts pattern Sprint 2 RFC adayi

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2 — `server-fetch.ts` + 10 test

**Files:**
- Create: `src/lib/rooms/server-fetch.ts`
- Test: `src/lib/rooms/__tests__/server-fetch.test.ts`

**Step 1: 10 test (RED)**

```typescript
// src/lib/rooms/__tests__/server-fetch.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { fetchMyRooms, fetchRoomByCode } from '../server-fetch'

const ORIGINAL_FETCH = globalThis.fetch
const mockFetch = vi.fn()
beforeEach(() => {
  globalThis.fetch = mockFetch
  mockFetch.mockReset()
})
afterAll(() => { globalThis.fetch = ORIGINAL_FETCH })

const ok = (body: any) => Promise.resolve({
  ok: true, status: 200, json: () => Promise.resolve(body),
})
const fail = (status: number) => Promise.resolve({
  ok: false, status, json: () => Promise.resolve({ message: 'err' }),
})

describe('fetchMyRooms', () => {
  test('1) authorized + 2 rows → array of 2', async () => {
    mockFetch.mockReturnValue(ok([
      { id: 'a', code: 'BIL2A', title: 'A', state: 'lobby', created_at: '2026-04-29', room_members: [{ count: 3 }] },
      { id: 'b', code: 'BIL2B', title: 'B', state: 'in_progress', created_at: '2026-04-29', room_members: [{ count: 6 }] },
    ]))
    const rooms = await fetchMyRooms('jwt')
    expect(rooms).toHaveLength(2)
    expect(rooms[0].code).toBe('BIL2A')
  })

  test('2) RLS empty → []', async () => {
    mockFetch.mockReturnValue(ok([]))
    expect(await fetchMyRooms('jwt')).toEqual([])
  })

  test('3) network reject → []', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await fetchMyRooms('jwt')).toEqual([])
  })

  test('4) URL params: state in lobby/in_progress + order desc', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchMyRooms('jwt')
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toMatch(/state=in\.\(lobby%2Cin_progress\)|state=in\.\(lobby,in_progress\)/)
    expect(url).toMatch(/order=created_at\.desc/)
  })

  test('5) Authorization Bearer header set', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchMyRooms('my-jwt')
    const init = mockFetch.mock.calls[0][1]
    expect(init.headers.Authorization).toBe('Bearer my-jwt')
  })

  test('6) cache: no-store set', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchMyRooms('jwt')
    expect(mockFetch.mock.calls[0][1].cache).toBe('no-store')
  })

  test('7) malformed JSON → []', async () => {
    mockFetch.mockReturnValue({
      ok: true, status: 200, json: () => Promise.reject(new Error('parse')),
    })
    expect(await fetchMyRooms('jwt')).toEqual([])
  })
})

describe('fetchRoomByCode', () => {
  test('8) found → first row', async () => {
    mockFetch.mockReturnValue(ok([{ id: 'a', code: 'BIL2A' }]))
    const r = await fetchRoomByCode('jwt', 'BIL2A')
    expect(r?.code).toBe('BIL2A')
  })

  test('9) not found / RLS → null', async () => {
    mockFetch.mockReturnValue(ok([]))
    expect(await fetchRoomByCode('jwt', 'NONE')).toBeNull()
  })

  test('10) special-char code "BIL/GE" → URL encoded once', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchRoomByCode('jwt', 'BIL/GE')
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toMatch(/code=eq\.BIL%2FGE/)
  })
})
```

**Step 2: Test calistir, RED dogrula**

Run: `pnpm test src/lib/rooms/__tests__/server-fetch.test.ts`
Expected: FAIL — module not found

**Step 3: server-fetch.ts implement**

```typescript
// src/lib/rooms/server-fetch.ts
import 'server-only'

const RPC_URL = process.env.BILGE_ARENA_RPC_URL ?? 'http://127.0.0.1:3001'

export type RoomListItem = {
  id: string
  code: string
  title: string
  state: 'lobby' | 'in_progress' | 'finished' | 'cancelled'
  created_at: string
  room_members: Array<{ count: number }>
}

export type RoomDetail = {
  id: string
  code: string
  title: string
  state: RoomListItem['state']
  category: string
  difficulty: number
  question_count: number
  max_players: number
  per_question_seconds: number
  mode: 'sync' | 'async'
  created_at: string
  host_id: string
}

export async function fetchMyRooms(jwt: string): Promise<RoomListItem[]> {
  const url = new URL(`${RPC_URL}/rooms`)
  url.searchParams.set('state', 'in.(lobby,in_progress)')
  url.searchParams.set('select', 'id,code,title,state,created_at,room_members(count)')
  url.searchParams.set('order', 'created_at.desc')
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    return (await res.json()) as RoomListItem[]
  } catch {
    return []
  }
}

export async function fetchRoomByCode(jwt: string, code: string): Promise<RoomDetail | null> {
  const url = new URL(`${RPC_URL}/rooms`)
  url.searchParams.set('code', `eq.${code}`)
  url.searchParams.set('select', '*')
  url.searchParams.set('limit', '1')
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const rows = (await res.json()) as RoomDetail[]
    return rows[0] ?? null
  } catch {
    return null
  }
}
```

**Step 4: Test calistir, GREEN dogrula**

Run: `pnpm test src/lib/rooms/__tests__/server-fetch.test.ts`
Expected: PASS — 10/10

**Step 5: Commit**

```bash
git add src/lib/rooms/server-fetch.ts src/lib/rooms/__tests__/server-fetch.test.ts
git commit -m "feat(oda): PR4a-2 fetchMyRooms + fetchRoomByCode + 10 TDD GREEN

server-only PostgREST helpers. RLS bypass yok, jwt header ile auth.
URL encode safe (URLSearchParams), cache no-store.

- fetchMyRooms: lobby+in_progress + room_members count
- fetchRoomByCode: limit 1, RLS empty → null

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3 — Atom Componentleri (5 dosya + 14 test)

**Files:**
- Create: `src/components/oda/Field.tsx` + `__tests__/Field.test.tsx`
- Create: `src/components/oda/NumField.tsx` + `__tests__/NumField.test.tsx`
- Create: `src/components/oda/EmptyState.tsx` + `__tests__/EmptyState.test.tsx`
- Create: `src/components/oda/StateBadge.tsx` + `__tests__/StateBadge.test.tsx`
- Create: `src/components/oda/RoomCard.tsx` + `__tests__/RoomCard.test.tsx`

### 3a) Field component (3 test)

```typescript
// src/components/oda/Field.tsx
import { cn } from '@/lib/utils/cn'

interface FieldProps {
  label: string
  name: string
  type?: string
  defaultValue?: string | number
  required?: boolean
  maxLength?: number
  error?: string
  children?: React.ReactNode  // select icin
  className?: string
}

export function Field({ label, name, type = 'text', defaultValue, required, maxLength, error, children, className }: FieldProps) {
  const id = `field-${name}`
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-bold text-[var(--text-sub)]">
        {label}
      </label>
      {children ?? (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={errorId}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--urgency)]">
          {error}
        </p>
      )}
    </div>
  )
}
```

```typescript
// src/components/oda/__tests__/Field.test.tsx
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from '../Field'

describe('Field', () => {
  test('1) label htmlFor matches input id', () => {
    render(<Field label="Baslik" name="title" />)
    const label = screen.getByText('Baslik')
    const input = screen.getByLabelText('Baslik')
    expect(label.getAttribute('for')).toBe(input.id)
  })

  test('2) error prop → role=alert', () => {
    render(<Field label="X" name="x" error="Cok kisa" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Cok kisa')
  })

  test('3) error yoksa alert render olmaz', () => {
    render(<Field label="X" name="x" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
```

### 3b) NumField (2 test)

```typescript
// src/components/oda/NumField.tsx
import { Field } from './Field'

interface NumFieldProps {
  label: string
  name: string
  min: number
  max: number
  defaultValue: number
  step?: number
  error?: string
}

export function NumField({ label, name, min, max, defaultValue, step = 1, error }: NumFieldProps) {
  const id = `field-${name}`
  return (
    <Field label={label} name={name} error={error}>
      <input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
      />
    </Field>
  )
}
```

```typescript
// src/components/oda/__tests__/NumField.test.tsx
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NumField } from '../NumField'

describe('NumField', () => {
  test('1) min/max/step attributes set', () => {
    render(<NumField label="N" name="n" min={1} max={5} defaultValue={2} step={1} />)
    const input = screen.getByLabelText('N') as HTMLInputElement
    expect(input.min).toBe('1')
    expect(input.max).toBe('5')
    expect(input.step).toBe('1')
  })

  test('2) default value set', () => {
    render(<NumField label="N" name="n" min={1} max={10} defaultValue={5} />)
    const input = screen.getByLabelText('N') as HTMLInputElement
    expect(input.defaultValue).toBe('5')
  })
})
```

### 3c) EmptyState (2 test)

```typescript
// src/components/oda/EmptyState.tsx
import Link from 'next/link'

export function EmptyState() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
      <p className="text-sm text-[var(--text-sub)]">
        Henuz aktif odan yok.
      </p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <Link
          href="/oda/yeni"
          className="btn-primary px-4 py-2 text-sm"
        >
          + Yeni Oda Kur
        </Link>
        <button
          disabled
          aria-disabled="true"
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-sub)] opacity-60"
          title="4b'de aktif olur"
        >
          Kod ile Katil <span className="ml-1 text-[10px]">(yakinda)</span>
        </button>
      </div>
    </div>
  )
}
```

```typescript
// src/components/oda/__tests__/EmptyState.test.tsx
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  test('1) Copy "Henuz aktif odan yok" render', () => {
    render(<EmptyState />)
    expect(screen.getByText(/Henuz aktif odan yok/)).toBeInTheDocument()
  })

  test('2) 2 CTA: Yeni Oda link + Kod disabled', () => {
    render(<EmptyState />)
    const newLink = screen.getByText(/Yeni Oda Kur/)
    expect(newLink.getAttribute('href')).toBe('/oda/yeni')
    const kodBtn = screen.getByText(/Kod ile Katil/)
    expect(kodBtn).toBeDisabled()
  })
})
```

### 3d) StateBadge (4 test)

```typescript
// src/components/oda/StateBadge.tsx
import { cn } from '@/lib/utils/cn'

type State = 'lobby' | 'in_progress' | 'finished' | 'cancelled'

const styles: Record<State, { label: string; className: string }> = {
  lobby:       { label: 'Bekliyor', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  in_progress: { label: 'Oyunda',   className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  finished:    { label: 'Bitti',    className: 'bg-gray-500/15 text-gray-700 dark:text-gray-300' },
  cancelled:   { label: 'Iptal',    className: 'bg-red-500/15 text-red-700 dark:text-red-300' },
}

export function StateBadge({ state }: { state: State }) {
  const s = styles[state]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', s.className)}>
      {s.label}
    </span>
  )
}
```

```typescript
// src/components/oda/__tests__/StateBadge.test.tsx
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StateBadge } from '../StateBadge'

describe('StateBadge', () => {
  test('1) lobby → Bekliyor', () => {
    render(<StateBadge state="lobby" />)
    expect(screen.getByText('Bekliyor')).toBeInTheDocument()
  })
  test('2) in_progress → Oyunda', () => {
    render(<StateBadge state="in_progress" />)
    expect(screen.getByText('Oyunda')).toBeInTheDocument()
  })
  test('3) finished → Bitti', () => {
    render(<StateBadge state="finished" />)
    expect(screen.getByText('Bitti')).toBeInTheDocument()
  })
  test('4) cancelled → Iptal', () => {
    render(<StateBadge state="cancelled" />)
    expect(screen.getByText('Iptal')).toBeInTheDocument()
  })
})
```

### 3e) RoomCard (3 test)

```typescript
// src/components/oda/RoomCard.tsx
import Link from 'next/link'
import { StateBadge } from './StateBadge'
import type { RoomListItem } from '@/lib/rooms/server-fetch'

export function RoomCard({ room }: { room: RoomListItem }) {
  const memberCount = room.room_members[0]?.count ?? 0
  return (
    <Link href={`/oda/${room.code}`}>
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--focus)]">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold">{room.title}</h3>
          <StateBadge state={room.state} />
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-sub)]">
          <code className="rounded bg-[var(--surface)] px-2 py-0.5 font-mono">{room.code}</code>
          <span>{memberCount} oyuncu</span>
        </div>
      </article>
    </Link>
  )
}
```

```typescript
// src/components/oda/__tests__/RoomCard.test.tsx
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoomCard } from '../RoomCard'

const room = {
  id: '1', code: 'BIL2GE', title: 'Test', state: 'lobby' as const,
  created_at: '2026-04-29', room_members: [{ count: 4 }],
}

describe('RoomCard', () => {
  test('1) Link href = /oda/${code}', () => {
    render(<RoomCard room={room} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/oda/BIL2GE')
  })
  test('2) Title + code + count render', () => {
    render(<RoomCard room={room} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('BIL2GE')).toBeInTheDocument()
    expect(screen.getByText('4 oyuncu')).toBeInTheDocument()
  })
  test('3) StateBadge with room.state passed', () => {
    render(<RoomCard room={room} />)
    expect(screen.getByText('Bekliyor')).toBeInTheDocument()
  })
})
```

**Step: 5 atom dosyasi + 5 test dosyasi yaz, RED → GREEN**

Run: `pnpm test src/components/oda/__tests__/`
Expected: 14/14 GREEN

**Step: Commit**

```bash
git add src/components/oda/
git commit -m "feat(oda): PR4a-3 atom componentleri + 14 TDD GREEN

5 yeni atom: Field, NumField, EmptyState, StateBadge, RoomCard.
Tum CSS variables (var(--border), var(--surface), var(--card), var(--focus)).

- Field: label + input + role=alert error slot
- NumField: number input wrapper
- EmptyState: 2 CTA, Kod disabled (4b'de aktif)
- StateBadge: 4 state mapping (Bekliyor/Oyunda/Bitti/Iptal)
- RoomCard: Link + StateBadge + member count

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4 — `CreateRoomForm.tsx` + 6 test

**Files:**
- Create: `src/components/oda/CreateRoomForm.tsx`
- Test: `src/components/oda/__tests__/CreateRoomForm.test.tsx`

**Step 1: 6 test (RED)**

```typescript
// src/components/oda/__tests__/CreateRoomForm.test.tsx
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// useActionState mock — initial state ile testler
const mockUseActionState = vi.fn()
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react')
  return { ...actual, useActionState: (action: any, init: any) => mockUseActionState(action, init) }
})

import { CreateRoomForm } from '../CreateRoomForm'

const formAction = vi.fn()

describe('CreateRoomForm', () => {
  test('1) initial: 7 input alani', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<CreateRoomForm />)
    expect(screen.getByLabelText(/Oda Adı|Oda Adi/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Kategori/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Zorluk/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Soru Sayısı|Soru Sayisi/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Maksimum Oyuncu/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Soru Süresi|Soru Suresi/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mod/)).toBeInTheDocument()
  })

  test('2) fieldErrors prop → title alti role=alert', () => {
    mockUseActionState.mockReturnValue([
      { fieldErrors: { title: ['Cok kisa'] } }, formAction, false,
    ])
    render(<CreateRoomForm />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts.some(a => a.textContent === 'Cok kisa')).toBe(true)
  })

  test('3) error prop → top banner role=alert', () => {
    mockUseActionState.mockReturnValue([{ error: 'Yetkisiz' }, formAction, false])
    render(<CreateRoomForm />)
    expect(screen.getByRole('alert')).toHaveTextContent('Yetkisiz')
  })

  test('4) Defaults: difficulty=2, max_players=8, mode=sync', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<CreateRoomForm />)
    expect((screen.getByLabelText(/Zorluk/) as HTMLInputElement).defaultValue).toBe('2')
    expect((screen.getByLabelText(/Maksimum Oyuncu/) as HTMLInputElement).defaultValue).toBe('8')
    expect((screen.getByLabelText(/Mod/) as HTMLSelectElement).value).toBe('sync')
  })

  test('5) isPending → button disabled + Olusturuluyor label', () => {
    mockUseActionState.mockReturnValue([{}, formAction, true])
    render(<CreateRoomForm />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent(/Oluşturuluyor|Olusturuluyor/)
  })

  test('6) Field name attribute set', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<CreateRoomForm />)
    const names = ['title', 'category', 'difficulty', 'question_count', 'max_players', 'per_question_seconds', 'mode']
    for (const n of names) {
      expect(container.querySelector(`[name="${n}"]`)).not.toBeNull()
    }
  })
})
```

**Step 2: Test calistir, RED dogrula**

Run: `pnpm test src/components/oda/__tests__/CreateRoomForm.test.tsx`
Expected: FAIL — module not found

**Step 3: CreateRoomForm.tsx implement et**

```typescript
// src/components/oda/CreateRoomForm.tsx
'use client'

import { useActionState } from 'react'
import { createRoomAction, type CreateRoomActionState } from '@/lib/rooms/actions'
import { Field } from './Field'
import { NumField } from './NumField'

const CATEGORIES = [
  { value: 'genel-kultur', label: 'Genel Kültür' },
  { value: 'tarih', label: 'Tarih' },
  { value: 'cografya', label: 'Coğrafya' },
  { value: 'edebiyat', label: 'Edebiyat' },
  { value: 'matematik', label: 'Matematik' },
  { value: 'fen', label: 'Fen Bilimleri' },
  { value: 'ingilizce', label: 'İngilizce' },
  { value: 'vatandaslik', label: 'Vatandaşlık' },
  { value: 'futbol', label: 'Futbol' },
  { value: 'sinema', label: 'Sinema' },
]

const initialState: CreateRoomActionState = {}

export function CreateRoomForm() {
  const [state, formAction, isPending] = useActionState(createRoomAction, initialState)

  return (
    <form action={formAction} className="space-y-4" noValidate aria-label="Yeni oda olusturma formu">
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
          defaultValue="genel-kultur"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
        >
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>

      <NumField label="Zorluk (1-5)" name="difficulty" min={1} max={5} defaultValue={2}
        error={state.fieldErrors?.difficulty?.[0]} />
      <NumField label="Soru Sayısı (5-30)" name="question_count" min={5} max={30} defaultValue={10}
        error={state.fieldErrors?.question_count?.[0]} />
      <NumField label="Maksimum Oyuncu (2-20)" name="max_players" min={2} max={20} defaultValue={8}
        error={state.fieldErrors?.max_players?.[0]} />
      <NumField label="Soru Süresi (10-60 sn)" name="per_question_seconds" min={10} max={60} defaultValue={20}
        error={state.fieldErrors?.per_question_seconds?.[0]} />

      <Field
        label="Mod"
        name="mode"
        error={state.fieldErrors?.mode?.[0]}
      >
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
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
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
```

**Step 4: Test calistir, GREEN dogrula**

Run: `pnpm test src/components/oda/__tests__/CreateRoomForm.test.tsx`
Expected: PASS — 6/6

**Step 5: Commit**

```bash
git add src/components/oda/CreateRoomForm.tsx src/components/oda/__tests__/CreateRoomForm.test.tsx
git commit -m "feat(oda): PR4a-4 CreateRoomForm + 6 TDD GREEN

useActionState (React 19) + Server Action createRoomAction.
7 alan: title, category (10 hard-coded), 4 NumField, mode select.
Turkce diakritik metin (TDK feedback memory).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5 — Pages + (player) Layout

**Files:**
- Create: `src/app/(player)/layout.tsx`
- Create: `src/app/(player)/oda/page.tsx`
- Create: `src/app/(player)/oda/yeni/page.tsx`
- Create: `src/app/(player)/oda/[code]/page.tsx`

**Step 1: layout.tsx (auth guard + outlet)**

```typescript
// src/app/(player)/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/giris?redirect=/oda')

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="mx-auto max-w-3xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
```

**Step 2: oda/page.tsx (list)**

```typescript
// src/app/(player)/oda/page.tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchMyRooms } from '@/lib/rooms/server-fetch'
import { RoomCard } from '@/components/oda/RoomCard'
import { EmptyState } from '@/components/oda/EmptyState'

export default async function Page() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) redirect('/giris?redirect=/oda')

  const rooms = await fetchMyRooms(session.access_token)

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Odalarım</h1>
        <div className="flex gap-2">
          <Link href="/oda/yeni" className="btn-primary px-4 py-2 text-sm">+ Yeni Oda</Link>
          <button
            disabled
            aria-disabled="true"
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-sub)] opacity-60"
            title="4b'de aktif olur"
          >
            Kod ile Katıl <span className="ml-1 text-[10px]">(yakında)</span>
          </button>
        </div>
      </header>

      {rooms.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {rooms.map(room => <RoomCard key={room.id} room={room} />)}
        </div>
      )}
    </>
  )
}
```

**Step 3: oda/yeni/page.tsx**

```typescript
// src/app/(player)/oda/yeni/page.tsx
import Link from 'next/link'
import { CreateRoomForm } from '@/components/oda/CreateRoomForm'

export default function Page() {
  return (
    <>
      <header className="mb-6">
        <Link href="/oda" className="text-sm text-[var(--text-sub)] hover:underline">
          ← Odalarım
        </Link>
        <h1 className="mt-2 text-xl font-bold">Yeni Oda</h1>
      </header>
      <CreateRoomForm />
    </>
  )
}
```

**Step 4: oda/[code]/page.tsx (placeholder)**

```typescript
// src/app/(player)/oda/[code]/page.tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchRoomByCode } from '@/lib/rooms/server-fetch'
import { StateBadge } from '@/components/oda/StateBadge'

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) redirect(`/giris?redirect=/oda/${code}`)

  const room = await fetchRoomByCode(session.access_token, code)
  if (!room) notFound()

  return (
    <>
      <header className="mb-6">
        <Link href="/oda" className="text-sm text-[var(--text-sub)] hover:underline">
          ← Odalarım
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-bold">{room.title}</h1>
          <StateBadge state={room.state} />
        </div>
      </header>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <p className="text-sm text-[var(--text-sub)]">
          Hosgeldin! Bu oda hazırlanıyor — yakında burada lobby olacak.
        </p>
        <code className="mt-3 inline-block rounded bg-[var(--surface)] px-3 py-1 font-mono text-sm">
          {room.code}
        </code>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--text-sub)]">
          <dt>Kategori:</dt><dd>{room.category}</dd>
          <dt>Zorluk:</dt><dd>{room.difficulty}/5</dd>
          <dt>Soru:</dt><dd>{room.question_count}</dd>
          <dt>Maksimum:</dt><dd>{room.max_players} oyuncu</dd>
          <dt>Süre:</dt><dd>{room.per_question_seconds}sn/soru</dd>
          <dt>Mod:</dt><dd>{room.mode === 'sync' ? 'Senkron' : 'Asenkron'}</dd>
        </dl>
      </div>
    </>
  )
}
```

**Step 5: Visual smoke (manual)**

Run: `pnpm dev` (background)
- http://localhost:3000/oda → list (empty veya rooms gosterir)
- http://localhost:3000/oda/yeni → form, submit dogru redirect
- http://localhost:3000/oda/BIL2GE → placeholder (mevcut oda)

**Step 6: Commit**

```bash
git add src/app/\(player\)/
git commit -m "feat(oda): PR4a-5 (player) route group + 3 sayfa

- (player)/layout.tsx: auth guard + max-w-3xl outlet
- /oda: list page (fetchMyRooms + RoomCard|EmptyState)
- /oda/yeni: form shell + breadcrumb
- /oda/[code]: placeholder, room detail + 'lobby hazirlaniyor' mesaji

Visual smoke: dev'de 3 sayfa aciliyor, anonim /giris redirect calisiyor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6 — Lint + Build + Full Test

**Step 1: pnpm test (full)**

Run: `pnpm test`
Expected: 42 yeni test GREEN, mevcut testler regresyon yok

**Step 2: pnpm lint**

Run: `pnpm lint`
Expected: 0 error, ideal 0 warning (mevcut warning'leri artirma)

**Step 3: pnpm build**

Run: `pnpm build`
Expected: Next.js prod build success, TypeScript 0 error

**Step 4: pnpm type-check (varsa)**

Run: `pnpm type-check`
Expected: 0 error

**Step 5: Commit (varsa minor fixes)**

```bash
# Eger lint warning'leri varsa veya type fixes
git add -A
git commit -m "chore(oda): PR4a-6 lint/build clean"
```

**Step 6: Final state dogrula**

Run: `git log --oneline -8`
Expected: 6-7 commit (PR4a-0 to PR4a-6)

---

## Task 7 — PR Open

**Step 1: Push branch**

Run: `git push -u origin feat/oda-pr4a-form-list`

**Step 2: PR ac**

```bash
gh pr create --title "feat(oda): Sprint 1 PR4a — Server Action form + my-rooms list + placeholder" --body "$(cat <<'EOF'
## Summary

PR4'un ilk sub-PR'i: `/oda/yeni` Server Action form + `/oda` "benim odalarim" listesi + `/oda/[code]` placeholder.

**Karar (brainstorming):** PR4 4 sub-PR'a bolundu (4a/4b/4c/4d). Bu PR4a kapsami.

**Codebase'in ilk Server Action ornegi.** `createRoomAction`:
- `'use server'` action `cookies()` + Panola Supabase auth
- `useActionState` (React 19) ile pending/error/fieldErrors UI
- Plan-deviation #56 (actions.ts pattern, Sprint 2 RFC adayi)

**Test:** 42 Vitest test GREEN
- actions.ts: 12 senaryo (auth, validation boundary, RPC error, redirect chain)
- server-fetch.ts: 10 senaryo (URL params, header, encoding, malformed JSON)
- 5 atom + form: 20 component test (smoke + invariant)

**Out-of-scope (4b/4c/4d):** Realtime hook, GET /state, host kontrolleri, Playwright e2e.

**Plan/Design:**
- Design: docs/plans/2026-04-29-oda-pr4-design.md
- Plan: docs/plans/2026-04-29-oda-pr4a-form-list-plan.md

## Test plan

- [x] pnpm test 42/42 GREEN
- [x] pnpm lint 0 error
- [x] pnpm build success (TypeScript 0 error)
- [x] Visual smoke: /oda, /oda/yeni, /oda/[code] dev'de aciliyor
- [x] Anonim /giris redirect (3 sayfada da)
- [x] Form submit → /oda/[code] placeholder
- [x] Memory POST: session + 1 feedback + 1 task

## Known limitations

- `/oda/kod` join page disabled (4b'de aktif)
- Host kontrolleri yok (4c)
- E2e multi-tab + reconnect testi 4d'de
- Public room discovery Faz 2 backlog'unda

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Codex P1 review bekle, follow-up'lari uygula**

Pattern: Sprint 0/1'de Codex P1 her PR icin bir review yapti, follow-up commitler ayri PR olarak mergelendi (P2 yok). Same here.

**Step 4: Memory POST (zorunlu)**

```bash
curl -s -X POST -H "X-Memory-Key: <MEMORY_KEY_REDACTED>" -H "Content-Type: application/json" \
  -d '{"device_name":"windows-masaustu","platform":"windows","summary":"Bilge Arena PR4a tamamlandi: createRoomAction Server Action + 42 TDD GREEN. Codebase ilk Server Action ornegi."}' \
  http://100.113.153.62:8420/api/v1/memory/sessions

curl -s -X POST -H "X-Memory-Key: <MEMORY_KEY_REDACTED>" -H "Content-Type: application/json" \
  -d '{"type":"feedback","name":"server_action_codebase_first","description":"Bilge Arena PR4a Server Action codebase ilk ornegi - useActionState + redirect","content":"Why: Next 16 + React 19 idiomi. How to apply: form action={formAction}, redirect server-side, no client-fetch JSON round-trip."}' \
  http://100.113.153.62:8420/api/v1/memory/memories

curl -s -X POST -H "X-Memory-Key: <MEMORY_KEY_REDACTED>" -H "Content-Type: application/json" \
  -d '{"project":"bilge-arena","task":"Sprint 1 PR4a - Server Action form + my-rooms list + placeholder + 42 TDD GREEN","status":"completed","description":"PR opened, Codex P1 review pending"}' \
  http://100.113.153.62:8420/api/v1/memory/tasks
```

---

## Acceptance Criteria (PR4a merge oncesi)

- [ ] 7 commit (PR4a-0 to PR4a-6) + 1 PR open commit
- [ ] 42 Vitest test GREEN
- [ ] pnpm lint 0 error
- [ ] pnpm build TypeScript 0 error
- [ ] Visual smoke 3 sayfa aciliyor (manual dogrulama)
- [ ] Form submit → /oda/[code] placeholder redirect
- [ ] Anonim user 3 sayfadan birinde /giris redirect
- [ ] PR description Server Action gerekce + plan-deviation #56
- [ ] Codex P1 review tamamlandi (1 round + follow-up)
- [ ] Memory POST: session + 1 feedback + 1 task

---

## Plan Verification Step

Implementation oncesi bu plan'in repo state'i ile uyumlu oldugunu **dogrula**:

- [ ] `master` HEAD `c6e11a2` (PR3bc dahil)
- [ ] Branch `feat/oda-pr4a-form-list` master'dan acildi
- [ ] `src/lib/rooms/{client,validations,api-helpers,errors,types}.ts` mevcut (PR3 patternleri)
- [ ] `src/components/ui/{button,card,skeleton,toast,badge}.tsx` mevcut
- [ ] `pnpm install` calisti, `pnpm test` mevcut testlerde GREEN
- [ ] `BILGE_ARENA_RPC_URL` dev environment'inda erisilebilir (Tailscale tunnel)

Tum kosullar saglandiysa Task 0 ile baslar.
