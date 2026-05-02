# Sprint 3A — Public Oda Discovery (PR1)

> **STATUS: SUPERSEDED (2026-05-02).** Bu plan dokumani Sprint 3 baslikli olsa
> da icerik Sprint 2'de PR #61 (`feat(oda): Sprint 2A Task 3 - public discovery`)
> ve PR #64 (Codex follow-up) ile uygulandi. `infra/vps/bilge-arena/sql/11_rooms_public_discovery.sql`
> migration mergeli, server-fetch + UI tab + CreateRoomForm checkbox tamamlandi.
> Tarihsel referans icin saklaniyor — gelecekte "Sprint 3" arandiginda yanlis
> izlenim verir, baslik gercek Sprint 2 idi.


> **Kaynak:** Sprint 2 plan Task 3 (`docs/plans/2026-05-01-sprint2-dwell-time-improvements.md`) + Sprint 3 funnel-once stratejisi
> **Tarih:** 2026-05-01
> **Sprint:** 3A — Funnel acquisition fix
> **Hedef:** Lobby drop %30 → %15, "bos site" izlenimi gider, public room discovery
> **Effort:** 3 gun (effort buffer: 4 gun)
> **Memory referanslari:** id=413 (dwell research), id=411 (server action kalibi), id=410 (stack PR trap — halledildi)

---

## Sprint Context

Sprint 1 + 2D bitti (PR #44-57). Sprint 3 backlog kullanici onayli:

```
Sirali plan (funnel-once):
  #0 Repo auto-delete merged branches  ✅ (2026-05-01)
  #1 Public oda discovery               ← BU PR (3 gun)
  #2 Solo mode (bot rakipler)           — Sprint 3A devami
  #3 Reveal auto-advance                — Sprint 3A devami
  #4 Lobby auto-question widget         — Sprint 3A devami
  #5 Daily streak + push                — Sprint 3B
  #6 Leaderboard + profil               — Sprint 3C
  #7 Replay & Share                     — Sprint 3C
  #8 Realtime broadcast (Ready)         — Sprint 3D (polish)
  #9 Playwright multi-tab e2e           — Sprint 3D (polish)
```

---

## Sorun Tanimi

`/oda` sayfasi su anda sadece **kullanicinin kendi odalarini** gosteriyor (`my-rooms`). Yeni gelen kullanici:

- Bos liste gorur ("Henuz oda yok")
- Bilen biri yoksa oda kodu giremez
- "Site bos" izlenimi → lobby drop %30

Cozum: `/oda` sayfasinda 2 tab — "Odalarim" + "Aktif Odalar" (public). Public odalar host opt-in checkbox ile isaretlenir.

---

## Kapsam

**Bu PR'da var:**
- DB migration (rooms.is_public + RLS + constraint + index)
- Server Action: createRoom Zod genisletme + RLS uyumu
- Server fetch: fetchPublicRooms
- UI: CreateRoomForm checkbox + /oda 2-tab + PublicRoomList component
- Test: 3 vitest unit + 1 SQL test + 1 e2e smoke

**Bu PR'da YOK (ayri PR):**
- Spam moderation MVP (Sprint 3A.5 — report button + auto-cancel idle): ayri 3 gun is
- Kategori filter UX gelisimi (sub-category, search): MVP'den sonra
- Public room sort options (yakin baslayan, az kalan vs): polish

---

## DB Schema Degisiklikleri

### Migration: `infra/vps/bilge-arena/sql/9_rooms_public_discovery.sql`

```sql
\set ON_ERROR_STOP on

BEGIN;

-- 1) is_public kolonu (default FALSE — opt-in)
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Constraint: public oda sadece lobby state'inde discoverable
-- Aktif/reveal/completed/archived odalar listede gozukmez
ALTER TABLE rooms
  ADD CONSTRAINT chk_rooms_public_lobby_only
    CHECK (
      is_public = FALSE
      OR (is_public = TRUE AND state IN ('lobby', 'active'))
    );
-- NOT: 'active' eklendi cunku public oda baslayinca anlik silinmemeli (race),
-- listede gosterilmez (fetchPublicRooms WHERE state='lobby' filter zaten var)
-- ama state transition surasinda constraint patlamasin.

-- 3) Public oda max_players cap (anti-spam: max 10 oyunculu public oda)
ALTER TABLE rooms
  ADD CONSTRAINT chk_rooms_public_max_players
    CHECK (
      is_public = FALSE
      OR (is_public = TRUE AND max_players <= 10)
    );

-- 4) Partial index (public + lobby = sik query)
CREATE INDEX IF NOT EXISTS idx_rooms_public_lobby
  ON rooms (created_at DESC, category)
  WHERE is_public = TRUE AND state = 'lobby';

-- 5) RLS policy: public + lobby odalar anonim+authenticated SELECT
-- Mevcut policy: rooms_select_member (sadece member gorebilir)
-- Yeni policy: rooms_select_public_lobby (herkes gorebilir, sadece lobby state)
DROP POLICY IF EXISTS rooms_select_public_lobby ON rooms;
CREATE POLICY rooms_select_public_lobby
  ON rooms
  FOR SELECT
  TO anon, authenticated
  USING (is_public = TRUE AND state = 'lobby');

COMMIT;
```

### Test: `infra/vps/bilge-arena/sql/9_rooms_public_discovery_test.sql`

```sql
\set ON_ERROR_STOP on

BEGIN;

-- T1: is_public default FALSE
DO $$
DECLARE v_default BOOLEAN;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_name='rooms' AND column_name='is_public';
  IF v_default IS NULL OR v_default !~ 'false' THEN
    RAISE EXCEPTION 'T1 FAIL: is_public default not FALSE: %', v_default;
  END IF;
  RAISE NOTICE 'T1 OK: is_public DEFAULT FALSE';
END $$;

-- T2: chk_rooms_public_max_players reddeder is_public=true + max_players=15
DO $$
BEGIN
  BEGIN
    INSERT INTO rooms (
      code, title, host_id, category, difficulty, question_count,
      max_players, per_question_seconds, is_public
    ) VALUES (
      'TEST01', 'Test', gen_random_uuid(), 'matematik', 2, 5,
      15, 30, TRUE
    );
    RAISE EXCEPTION 'T2 FAIL: 15 max_players ile public oda kabul edildi';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'T2 OK: chk_rooms_public_max_players reddetti';
  END;
END $$;

-- T3: RLS public + lobby anonim SELECT
-- (Detayli RLS test ayri pgTAP-style harness gerek; smoke test)
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename='rooms' AND policyname='rooms_select_public_lobby';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'T3 FAIL: rooms_select_public_lobby policy yok';
  END IF;
  RAISE NOTICE 'T3 OK: rooms_select_public_lobby policy var';
END $$;

ROLLBACK;  -- DDL test cleanup
```

---

## Server Layer

### `src/lib/rooms/validations.ts` — createRoomSchema genisletme

```typescript
export const createRoomSchema = z.object({
  title: z.string().min(3).max(80),
  category: z.enum(GAME_CATEGORIES),
  difficulty: z.number().int().min(1).max(5),
  question_count: z.number().int().min(5).max(30),
  max_players: z.number().int().min(2).max(20),
  per_question_seconds: z.number().int().min(10).max(60),
  mode: z.enum(ROOM_MODES).default('sync'),
  is_public: z.boolean().default(false),  // YENI
}).refine(
  (data) => !data.is_public || data.max_players <= 10,
  { message: 'Herkese acik odalarda en fazla 10 oyunculu olabilir', path: ['max_players'] }
)
```

### `src/lib/rooms/types.ts` — Room interface

```typescript
export interface Room {
  // ... mevcut alanlar
  is_public: boolean  // YENI
}
```

### `src/lib/rooms/server-fetch.ts` — fetchPublicRooms

```typescript
export async function fetchPublicRooms(opts?: {
  category?: string
  limit?: number
}): Promise<PublicRoomCard[]> {
  const supabase = await createServerClient()
  let query = supabase
    .from('rooms')
    .select('id, code, title, category, difficulty, max_players, question_count, created_at')
    .eq('is_public', true)
    .eq('state', 'lobby')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 20)

  if (opts?.category) {
    query = query.eq('category', opts.category)
  }

  const { data, error } = await query
  if (error) {
    // Anonim kullanicilar icin hata yutulmali (RLS ile zaten bos liste doner)
    return []
  }
  return data ?? []
}

export type PublicRoomCard = Pick<
  Room,
  'id' | 'code' | 'title' | 'category' | 'difficulty' | 'max_players' | 'question_count' | 'created_at'
>
```

### `src/lib/rooms/actions.ts` — createRoom Action

Mevcut Server Action'a `is_public` parametresi eklenir. Validation Zod'da yapilir, RPC parametresine gecirilir. RPC tarafinda `8_rooms_functions_create.sql` icindeki `create_room()` fonksiyonu da is_public BOOLEAN parametresi alacak.

---

## UI Katmani

### `src/components/rooms/CreateRoomForm.tsx` — Public checkbox

```tsx
<label className="flex items-center gap-2 mt-4">
  <input
    type="checkbox"
    name="is_public"
    onChange={(e) => setIsPublic(e.target.checked)}
  />
  <span>Herkese acik</span>
  <Tooltip>
    Herkes "Aktif Odalar" listesinde odani gorebilir ve katilabilir.
    Maks 10 oyuncu sinirli.
  </Tooltip>
</label>

{isPublic && (
  <div className="text-amber-600 text-sm mt-2">
    Acik oda: kufurlu/spam icerik raporlanabilir. Lutfen kategoriye uygun baslik yazin.
  </div>
)}
```

### `src/app/(player)/oda/page.tsx` — 2-tab

```tsx
import { fetchMyRooms, fetchPublicRooms } from '@/lib/rooms/server-fetch'
import { TabNav } from './_components/TabNav'

export default async function OdaPage({ searchParams }: { searchParams: Promise<{ tab?: string; cat?: string }> }) {
  const params = await searchParams
  const tab = params.tab ?? 'mine'
  const myRooms = tab === 'mine' ? await fetchMyRooms() : []
  const publicRooms = tab === 'public' ? await fetchPublicRooms({ category: params.cat }) : []

  return (
    <main>
      <TabNav active={tab} />
      {tab === 'mine' && <MyRoomList rooms={myRooms} />}
      {tab === 'public' && <PublicRoomList rooms={publicRooms} />}
    </main>
  )
}
```

### `src/app/(player)/oda/_components/PublicRoomList.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GAME_CATEGORIES } from '@/lib/rooms/types'
import type { PublicRoomCard } from '@/lib/rooms/server-fetch'

export function PublicRoomList({ rooms }: { rooms: PublicRoomCard[] }) {
  const router = useRouter()
  const [category, setCategory] = useState<string>('')

  return (
    <div>
      <select value={category} onChange={(e) => {
        setCategory(e.target.value)
        router.push(`/oda?tab=public${e.target.value ? `&cat=${e.target.value}` : ''}`)
      }}>
        <option value="">Tum kategoriler</option>
        {GAME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {rooms.length === 0 ? (
        <p>Su anda aktif acik oda yok. Sen yeni bir tane olustur!</p>
      ) : (
        <ul>
          {rooms.map(r => (
            <li key={r.id}>
              <Link href={`/oda/${r.code}`}>
                <h3>{r.title}</h3>
                <span>{r.category} · L{r.difficulty} · {r.question_count} soru · max {r.max_players}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

---

## Test Plani

### Vitest Unit (3 test)

**`src/lib/rooms/__tests__/validations.test.ts` — yeni 2 test:**

1. `createRoomSchema is_public default false` — input olmadiginda is_public=false
2. `createRoomSchema is_public + max_players=15 reddeder` — refine kuralina takilir

**`src/lib/rooms/__tests__/server-fetch.test.ts` — yeni 1 test:**

3. `fetchPublicRooms category filter` — Supabase mock + filter dogrulama

### SQL Test (1 dosya)

`infra/vps/bilge-arena/sql/9_rooms_public_discovery_test.sql` — 3 DO block (yukarida)

### E2E Smoke (1 test)

`e2e/oda-public-discovery.spec.ts`:
1. Login → /oda?tab=public → "Aktif Odalar" tab gorulur
2. Public oda olusturulu → list'te gorulur
3. Kategori filter calisir

---

## Plan-Deviation Kalemleri (Beklenen)

Implementation sirasinda olasi sapmalar:

1. **RLS policy yan etkisi** — rooms_select_member policy ile public_lobby policy OR'lanir, yeni policy daha permissive. Test: member olmayan public oda sadece lobby state'inde gorur, active state'inde gormez (chk constraint allow eder ama RLS lobby'ye kilitler).

2. **chk_rooms_public_max_players** — mevcut public=false odalar etkilenmez (CHECK is_public=FALSE OR ... yapisi guvenli). Migration backwards-compatible.

3. **fetchPublicRooms anonim erisim** — anon kullanici createServerClient ile auth.uid()=null olur. RLS policy `TO anon, authenticated` ile her ikisini de kapsar. Cookie/session yoksa public list yine doner.

4. **Server Action createRoom RPC parametre** — `8_rooms_functions_create.sql` icinde `create_room` RPC'sine `p_is_public BOOLEAN DEFAULT FALSE` parametresi eklenir. Bu **2. migration** gerektirebilir (RPC degistirme). Plan-deviation: tek migration'da hem ALTER TABLE hem CREATE OR REPLACE FUNCTION yapilabilir.

---

## Implementation Sirasi (3 gun)

**Gun 1:**
- Migration `9_rooms_public_discovery.sql` yaz + apply (panola-postgres)
- Migration test `9_rooms_public_discovery_test.sql` yaz + assert
- `create_room` RPC `p_is_public` parametre eklenmesi (8_rooms_functions_create.sql guncelle veya 9'a inline)
- Type update: `Room.is_public`, `PublicRoomCard`

**Gun 2:**
- `validations.ts` Zod schema genisletme + 2 test (TDD)
- `server-fetch.ts` fetchPublicRooms + 1 test
- `actions.ts` createRoom is_public passthrough
- CreateRoomForm checkbox + uyari

**Gun 3:**
- `/oda` 2-tab refactor (TabNav component)
- PublicRoomList component (kategori filter)
- E2E smoke spec
- PR, CI yesil, review

---

## Ölçüm

PostHog event eklenecek (Sprint 3 oncesi/sonrasi karsilastirmali):

```typescript
posthog.capture('public_room_discovered', {
  source: 'oda_tab',
  category: room.category,
  rooms_visible: rooms.length,
})

posthog.capture('public_room_joined', {
  category: room.category,
  member_count_at_join: room.member_count,
})
```

**KPI:** 14 gun sonra "Aktif Odalar" tab'a girip katilan kullanicilar / toplam /oda gorulen → conversion %

---

## Risk Listesi

| Risk | Olasilik | Etki | Mitigasyon |
|---|---|---|---|
| Public oda spam (kufurlu baslik) | Orta | Yuksek | Sprint 3A.5'a bagli (report button + moderation) — bu PR scope'unda yok |
| RLS policy yanlis OR'lama | Dusuk | Yuksek | SQL test (T3) + e2e auth-guard test (anonim user public oda gorur, private gormez) |
| chk_rooms_public_max_players migration mevcut data etkiler | Cok dusuk | Orta | Mevcut tum oda is_public=false default, CHECK rahat gecer |
| Anon SELECT performans (her sayfa yuklenmesi) | Dusuk | Dusuk | Partial index (idx_rooms_public_lobby) + LIMIT 20 |
| Public oda list stale (real-time degil) | Dusuk | Dusuk | MVP polling 30sn yeterli, realtime postgres_changes Sprint 3D'de |

---

## Acceptance Criteria

- [ ] `9_rooms_public_discovery.sql` apply edilir, exit 0
- [ ] `9_rooms_public_discovery_test.sql` 3 test pass
- [ ] CreateRoomForm "Herkese acik" checkbox calisir, max_players uyarisi gosterir
- [ ] `/oda?tab=public` 20 acik lobby odasini listeler
- [ ] Kategori filter URL state'i ile sync (refresh sonrasi korur)
- [ ] Anonim kullanici (logout) public odalari gorebilir, private odalari goremez
- [ ] Vitest 3 yeni test pass
- [ ] E2E smoke pass
- [ ] PR CI yesil, Vercel preview deploy ok
- [ ] Plausible/PostHog event capture verify

---

## Bagimliliklar

- ✅ Server Action pattern (memory id=411) — createRoom buradan reuse
- ✅ create_room RPC (8_rooms_functions_create.sql) — p_is_public param ekleme
- ✅ Auto-delete merged branches (2026-05-01) — stack PR trap onlemi aktif
- 🔜 Sprint 3A.5 — public oda spam moderation MVP (sonraki PR)
- 🔜 Sprint 3D — realtime public room list update (broadcast)

---

**Toplam:** 1 migration + RPC update, 3 vitest unit, 1 SQL test, 1 e2e smoke, 4 file degisikligi (validations.ts, server-fetch.ts, CreateRoomForm.tsx, oda/page.tsx), 2 yeni component (TabNav, PublicRoomList).
