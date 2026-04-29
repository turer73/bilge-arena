# Oda Sistemi PR4 — Lobby UI + Realtime Design Doc

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` to create the implementation plan from this design (`docs/plans/2026-04-29-oda-pr4a-form-list-plan.md`).

**Goal:** Sprint 1'in son PR'i — Bilge Arena oda sisteminin client/server component katmanini kurmak. PR3bc (#43) ile mergelenen 8 RPC endpoint + create_room icin Next.js 16 + React 19 UI.

**Scope ozet:** PR4 tek monolithic yerine **4 sub-PR**'a bolunuyor (4a/4b/4c/4d). 4a = create form + my-rooms list + lobby placeholder; 4b = lobby + Realtime + GET /state; 4c = host kontrolleri; 4d = e2e + reconnect testi.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19 (`useActionState`), Zod 4, Tailwind 3.4 + CSS variables (`var(--border)`, `var(--surface)`, `var(--card)`, `var(--focus)`), Vitest + @testing-library/react.

---

## Bolum 1 — Sub-PR Map

PR4 tek branch yerine 4 atomik sub-PR halinde mergelenir. Squash-merge sirasi katidir; her sub-PR onceki sub-PR'in placeholder'ini gercek bilesenle doldurur.

| Sub-PR | Branch | Scope | Cikti | LOC |
|---|---|---|---|---|
| **4a** | `feat/oda-pr4a-form-list` | `/oda/yeni` Server Action form, `/oda` "benim odalarim" listesi, `/oda/[code]` placeholder, atom componentleri | Kullanici oda kurabilir, member oldugu odalari listede gorur | ~870 |
| **4b** | `feat/oda-pr4b-lobby-realtime` | `/oda/[code]` gercek lobby (member roster + state), `useRoomChannel` hook, `GET /api/rooms/[id]/state` endpoint, `/oda/kod` join page | Iki sekme ayni odada gercek-zamanli member roster goruyor | ~600 |
| **4c** | `feat/oda-pr4c-host-controls` | Lobby icinde host-only butonlar (start, cancel, kick), state-machine UI sync | Host quiz'i baslatir/iptal eder/uye atar | ~300 |
| **4d** | `feat/oda-pr4d-e2e` | Playwright multi-tab test (plan Task 4.5) + reconnect resync test (memory id=335 sigortasi) | CI'da iki sekme + ag-kesinti senaryosu yesil | ~200 |

**Bu doc 4a'yi detayli kapsiyor.** 4b/4c/4d kendi design doc'larina sahip olabilir, ama mimari ortaktir (Server Action + RLS + CSS variables).

---

## Bolum 2 — Mimari Kararlar (5 Q&A)

Brainstorming oturumunda kullanici 5 ana karar uzerinde onay verdi:

| # | Konu | Karar | Sebep |
|---|---|---|---|
| Q1 | PR3bc prerequisite | PR #43 mergelendi (squash, master `c6e11a2`), 4a master'dan acilir | PR4 RPC bagimliligi karsilanmali |
| Q2 | PR4 split | 4-sub-PR (modular C) — list `/oda` 4a'da, GET `/state` endpoint 4b'de | Atomik review, Realtime risk izolasyonu |
| Q3 | Form approach | **Server Action** (`'use server'`) | Next 16 + React 19 idiomi, `redirect()` server-side, progressive enhancement, codebase'in **ilk Server Action'i** |
| Q4 | `/oda` semantik | "Benim odalarim" (host/member, lobby+in_progress) | RLS hazir, yeni SQL gerekmez, BilgiArena modeli kod-paylas akisi |
| Q5 | TDD discipline | **Pragmatic** — Vitest action+validation, RTL component smoke, Playwright e2e 4d'ye | UI strict TDD flaky, business logic critical path |

---

## Bolum 3 — PR4a Mimari (Server Action + Server Component + Placeholder)

### Component topolojisi

```
src/app/(player)/                              [yeni route group]
├── layout.tsx                  [Server]       auth guard, redirect anon, navbar slot
└── oda/
    ├── page.tsx                [Server]       "Benim odalarim" listesi (fetchMyRooms)
    ├── yeni/
    │   └── page.tsx            [Server]       Form sayfasi (auth shell + <CreateRoomForm/>)
    └── [code]/
        └── page.tsx            [Server]       Placeholder (4b'ye kadar minimal lobby)

src/lib/rooms/
├── actions.ts                  ['use server'] createRoomAction + getAuthForAction
├── server-fetch.ts             [server-only]  fetchMyRooms + fetchRoomByCode
└── __tests__/
    ├── actions.test.ts                        14 Vitest senaryo
    └── server-fetch.test.ts                   10 Vitest senaryo

src/components/oda/
├── CreateRoomForm.tsx          ['use client'] Form UI + useActionState (~140 LOC)
├── Field.tsx                   [server compat] Label + input + error slot
├── NumField.tsx                [server compat] Number input wrapper
├── EmptyState.tsx              [server]       List empty UI
├── StateBadge.tsx              [server]       lobby/in_progress/finished/cancelled rozetleri
└── RoomCard.tsx                [server]       Tek oda karti listede
```

**Toplam:** 11 yeni dosya (5 sayfa + 6 component) + 2 test dosyasi + tests-per-component (5 atom × kucuk test). ~870 LOC prod + ~620 LOC test.

### Visual styling karari

**CSS variables paterni** kullanilir (`var(--border)`, `var(--surface)`, `var(--card)`, `var(--focus)`, `var(--text-sub)`, `var(--urgency)`). Sebep: codebase'in ana akimi (Card, Button, EditProfileModal hep boyle), dark mode otomatik calisir, Tailwind 3.4 ile uyumlu. WaitlistForm'daki semantic token paterni (`bg-background`) **kullanilmaz** — codebase'de azinlik. `<Button>` ve `<Card>` mevcut, reuse edilir.

### Form layout

Tek-sutun, `space-y-4`, accordion **yok**. 7 alan: title, category (10 hard-coded option), difficulty (1-5 number), question_count (5-30), max_players (2-20), per_question_seconds (10-60), mode (sync/async select). `category` dropdown 4a'da hard-coded; dinamik fetch (`games.categories`) 4b/Sprint 2'de.

### PR3 helper reuse

| Helper | Reuse? | Aciklama |
|---|---|---|
| `getAuthAndJwt()` (api-helpers.ts) | **Hayir** | `NextResponse` doner, action `{error}` shape lazim. Ayrı `getAuthForAction()` actions.ts'te |
| `parseBody()` (api-helpers.ts) | **Hayir** | `Request.json()` parse, FormData degil |
| `callRpc()` (client.ts) | **Evet** | Pure function, JWT alir, `RpcResult<T>` doner |
| `normalizeRoomError()` (errors.ts) | **Evet** | Pure function |
| `createRoomSchema` (validations.ts) | **Evet** | FormData → object → safeParse, ayni schema |

**Plan-deviation #56:** `actions.ts` yeni dosya, plan'da yok ama Server Action karari sonrasi gerekli. Pattern Sprint 2'de tum action'lar icin RFC adayi.

---

## Bolum 4 — Veri Akisi + Hata Matrisi

### Akis 1 — `/oda/yeni` form submit (happy path)

```
[1] User /oda/yeni acar (Server Component shell)
    auth check inline → user yoksa redirect('/giris?redirect=/oda/yeni')
    Render: <CreateRoomForm /> (form action={createRoomAction})

[2] User submit (progressive enhancement, JS off da calisir)
    Browser → POST encrypted action ID → Next.js handler

[3] createRoomAction(prevState, formData) [server]
    a. getAuthForAction() → {ok:true, userId, jwt}
    b. FormData → raw object
    c. createRoomSchema.safeParse(raw) → success
    d. callRpc<{id, code}>(jwt, 'create_room', validatedBody)
       → fetch ${BILGE_ARENA_RPC_URL}/rpc/create_room (server-side, no CORS)
       → 201 + {id, code:"BIL2GE"}
    e. revalidatePath('/oda')
    f. redirect('/oda/BIL2GE')  // 303

[4] Browser /oda/BIL2GE GET → placeholder render
```

### Akis 2 — Hata path matrisi

| Asama | Hata | Action donusu | Form UI |
|---|---|---|---|
| `getAuthForAction` | user `null` | `{error: 'Giris yapmalisin.'}` | Banner role=alert + Giris linki |
| `getAuthForAction` | session expired | `{error: 'Oturum suresi doldu, ...'}` | Banner + Giris linki |
| `safeParse` | title 2 char | `{fieldErrors: {title: [...]}}` | `<Field>` altinda role=alert per field |
| `callRpc` | `P0001 Yetki yok` | `{error: 'Yetki yok'}` | Banner |
| `callRpc` | `P0002 Profil eksik` | `{error: 'Profil olusturulmali'}` | Banner + Profil linki |
| `callRpc` | network fail | `{error: 'Network error: ...'}` | Banner + retry hint |
| `callRpc` | 5xx | normalize → `{error: 'Beklenmeyen hata'}` | Banner |
| `redirect` exception | (Next yakaliyor, throw NEXT_REDIRECT) | propagate | UI'a hic donmez |

**Onemli:** `redirect()` Next.js 16'da `throw`-based — `try/catch` icine **alinamaz** (yutarsa redirect calismaz). Action'da `redirect` cagrisi en sona, try/catch dis.

### Akis 3 — `/oda` list page (SSR)

```
Server Component:
  createClient() → getUser() → user yoksa redirect('/giris?redirect=/oda')
  getSession() → jwt
  fetchMyRooms(jwt):
    GET ${RPC_URL}/rooms?state=in.(lobby,in_progress)
        &select=id,code,title,state,created_at,room_members(count)
        &order=created_at.desc
    Headers: Authorization: Bearer ${jwt}
    → RLS otomatik filtreler (rooms_select_host_or_member)
  rooms.length === 0 ? <EmptyState/> : rooms.map(<RoomCard/>)
```

### Akis 4 — `/oda/[code]` placeholder (SSR, 4b'de yenibastan yazilacak)

```
Server Component:
  const { code } = await params  // Next 16 async params
  auth check + jwt extract
  fetchRoomByCode(jwt, code):
    GET ${RPC_URL}/rooms?code=eq.${encodeURIComponent(code)}&select=*&limit=1
    → []  ⇒ notFound() (404)
    → [room] ⇒ render placeholder
  <PlaceholderLobby room={room} />:
    "Hosgeldin! Bu oda hazirlaniyor — yakinda burada lobby olacak."
    + title, code, state, member count
```

### Guvenlik garantileri

1. **No JWT leakage:** JWT yalnizca server-side; client component'lara prop ile gecmez.
2. **No RPC URL leakage:** `BILGE_ARENA_RPC_URL` `'use server'` + `'server-only'` modullerinde, client bundle'a girmez.
3. **CSRF:** Next.js Server Action built-in (encrypted action ID + Origin check), ek middleware **gerekmez**.
4. **RLS double-defense:** PostgREST RLS policy + Action-level auth check.
5. **revalidatePath('/oda'):** Action sonrasi list cache invalidate, kullanici geri donerse yeni odayi gorur.

---

## Bolum 5 — Test Plani (42 test, ~620 LOC)

### Action layer — `actions.test.ts` (14 test)

```
1)  anon user → {error: 'Giris yapmalisin.'}
2)  expired session → {error: 'Oturum suresi doldu, ...'}
3)  invalid title (2 char) → {fieldErrors: {title: [...]}}
4)  RPC P0002 → {error: 'Profil olusturulmali'}
5)  success → callRpc + revalidatePath + redirect chain
6)  max_players boundary: 1 reject, 2 accept, 20 accept, 21 reject
7)  per_question_seconds boundary: 9 reject, 10 accept, 60 accept, 61 reject
8)  FormData eksik field → Zod default uygulanir (difficulty=2)
9)  mode "invalid" → fieldErrors.mode
10) callRpc network exception → {error: 'Network error: ...'}
11) success: revalidatePath ONCE redirect ONCE order ile cagrilir
12) FormData fazladan field → Zod strip, RPC body temiz

getAuthForAction:
13) auth + session var → {ok:true, userId, jwt}
14) auth var session yok → {ok:false}
```

### Server-fetch — `server-fetch.test.ts` (10 test)

```
fetchMyRooms:
1) authorized + 2 rows → array of 2
2) RLS empty → []
3) network reject → []
4) URL params: state=in.(lobby,in_progress) + order=created_at.desc
5) Authorization: Bearer ${jwt} header set
6) cache: 'no-store' set
7) malformed JSON → [] (silent)

fetchRoomByCode:
8) found → first row
9) not found / RLS reject → null
10) special-char code "BIL2-GE" → URL encoded once
```

### Component — `CreateRoomForm.test.tsx` (6 test)

```
1) initial: 7 input alani
2) fieldErrors prop → title alti role=alert
3) error prop → top banner role=alert
4) Defaults: difficulty=2, max_players=8, mode=sync
5) isPending=true → button disabled + label "Olusturuluyor..."
6) Field name'leri: title, category, difficulty, question_count, max_players, per_question_seconds, mode
```

### Atom componentleri (12 test toplam)

```
Field.test.tsx (3): label htmlFor / role=alert error / no error → no alert
NumField.test.tsx (2): min/max/step / default value
EmptyState.test.tsx (2): copy / 2 CTA (yeni link, kod disabled)
StateBadge.test.tsx (4): lobby Bekliyor / in_progress Oyunda / finished Bitti / cancelled Iptal
RoomCard.test.tsx (3): href, title+code+count, StateBadge passed
```

### Mock stratejisi

- `vi.mock('@/lib/supabase/server')` — auth/session controllable
- `vi.mock('./client')` — `callRpc` stubbed, `RpcResult<T>` returns customizable
- `vi.mock('next/navigation')` — `redirect`, `notFound` assertable
- `vi.mock('next/cache')` — `revalidatePath` assertable
- `globalThis.fetch = vi.fn()` — server-fetch testlerinde

### Coverage hedefi

- `actions.ts` %100 line/branch
- `server-fetch.ts` %100 line
- `CreateRoomForm.tsx` smoke + invariant (3 critical state)
- Atom'lar %100 line (kucuk yuzey)

### Build/lint guarantees (merge oncesi 5 kosul)

1. `pnpm test` — 42/42 GREEN
2. `pnpm lint` — 0 error, 0 warning
3. `pnpm build` — Next.js prod build success
4. `pnpm typecheck` — 0 error
5. `pnpm test:e2e` smoke — uygulama acilir (derin e2e 4d'de)

---

## Bolum 6 — Implementation Order (TDD step sequence)

```
Adim 0: Server Action smoke test (validation step)
        Minimal echo Server Action deploy → dev'de cagrir → JWT extract dogrula
        → getSession() deprecate riskini elimine et
        Commit: "chore(oda): PR4a-0 Server Action smoke (JWT validation)"

Adim 1: actions.test.ts RED (14) → actions.ts iskelet → GREEN
        Commit: "feat(oda): PR4a-1 createRoomAction + 14 TDD GREEN"

Adim 2: server-fetch.test.ts RED (10) → server-fetch.ts → GREEN
        Commit: "feat(oda): PR4a-2 fetchMyRooms + fetchRoomByCode + 10 TDD GREEN"

Adim 3: Atom componentleri (Field/NumField/EmptyState/StateBadge/RoomCard) + 14 test
        Commit: "feat(oda): PR4a-3 atom componentleri + 14 TDD GREEN"

Adim 4: CreateRoomForm.test.tsx RED (6) → CreateRoomForm.tsx → GREEN
        Commit: "feat(oda): PR4a-4 CreateRoomForm + 6 TDD GREEN"

Adim 5: (player)/layout.tsx + 3 page.tsx (oda, yeni, [code])
        Visual smoke: pnpm dev → /oda, /oda/yeni, /oda/<code>
        Commit: "feat(oda): PR4a-5 (player) route group + 3 sayfa"

Adim 6: pnpm lint + pnpm build + pnpm test full GREEN
        Commit: "chore(oda): PR4a-6 lint/build clean"

Adim 7: gh pr create + Codex P1 review
```

**Toplam:** 7 commit, 1 PR, 4-6 saat efektif calisma.

---

## Bolum 7 — Out-of-scope (deferred)

| Sey | Neden 4a'da yok | Hangi sub-PR |
|---|---|---|
| `useRoomChannel` Realtime hook | Lobby'de gerek | 4b |
| `GET /api/rooms/[id]/state` | Reconnect resync icin | 4b |
| `/oda/kod` join page (gercek) | Realtime ile birlikte | 4b |
| Host start/cancel/kick UI | Lobby state'i okuyacak | 4c |
| Multi-tab e2e + reconnect | Tum zincir hazir olunca | 4d |
| Public room discovery | MVP scope disi (BilgiArena modeli kod-paylas) | Faz 2 backlog ayri kart |
| `category` dynamic fetch | Hard-coded 10 yeterli | 4b veya Sprint 2 |
| Question pool seleksiyonu | Plan PR4 mention etmiyor | Sprint 2 |

---

## Bolum 8 — Risk + Mitigasyon

| Risk | Olasilik | Etki | Mitigasyon |
|---|---|---|---|
| `getSession()` deprecate / `null` | Dusuk | Yuksek (action calismaz) | **Adim 0** smoke test ile elimine |
| Server Action codebase ilk → review delay | Yuksek | Dusuk | PR description'da "neden Server Action" gerekce |
| `(player)` route group layout cakismasi | Dusuk | Orta | Layout minimal (auth + outlet), navbar PR sonrasi |
| Tailwind CSS variables server component'te eksik render | Cok dusuk | Orta | Card/Button zaten bu pattern, regression yok |
| TDK diakritik violations (24 baseline) | Orta | Dusuk-orta | UI metni: Turkce diakritik (`oluşturuluyor`, `henüz`); ASCII sadece email/SEO |

---

## Bolum 9 — Acceptance Criteria

PR4a `feat/oda-pr4a-form-list` mergelenmek icin **hepsi** karsilanmali:

- [ ] `/oda/yeni` form gorunur, 7 alan dolduruldugunda submit redirect ediyor
- [ ] `/oda` listede kullanicinin uye oldugu odalar (lobby+in_progress) gorunur
- [ ] `/oda/[code]` placeholder roomu gosterir, RLS yoksa 404
- [ ] Anonim kullanici 3 sayfadan birine gidince `/giris?redirect=...` 303
- [ ] 42 Vitest test GREEN
- [ ] `pnpm lint` 0 warning
- [ ] `pnpm build` success (TypeScript 0 error)
- [ ] PR description'da Server Action gerekce + plan-deviation #56 belirtilmis
- [ ] Codex P1 review icin 1 round + follow-up'lar uygulanmis
- [ ] Memory POST: session + 1 feedback + 1 task (zorunlu kayit kurali)

---

## Referanslar

**Plan:** `docs/plans/2026-04-27-oda-sistemi-implementation.md` PR4 section (lines 1295-1352). Plan-deviation #56 (Server Action) bu doc'la ozetlenmis.

**Memory:**
- id=143 — Bilge Arena Oda feature roadmap (senkron 2-6 kisi yarismasi)
- id=324 — Anatolia360 BilgiArena referans modeli (kod-paylas akisi)
- id=335 — `realtime_reconnect_replay_yok` (4b'de kritik, 4a'da informational)
- id=336 — `bilge_arena_oda_bolum3_realtime` (4b mimarisi)
- id=361 — `auth_schema_grant_gap` (Sprint 0 grant pattern)
- id=400 — `postgrest_204_void_rpc` (PR3 callRpc 204 fix)

**PR3 patternleri:** `src/lib/rooms/{client,errors,validations,api-helpers,types}.ts`. PR4a `client.ts` ve `validations.ts` reuse, `api-helpers.ts` paralel `actions.ts` ile.

**External:** Next.js 16 Server Action docs (https://nextjs.org/docs/app/api-reference/functions/server-actions), React 19 `useActionState` (https://react.dev/reference/react/useActionState).
