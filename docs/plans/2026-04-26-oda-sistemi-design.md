# Oda Sistemi Design Doc

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Bilge Arena icin senkron+yari-senkron cok-oyunculu oda sistemi (join code, real-time sync, scoreboard, KVKK uyumlu, TR Gen Z UX). P0 launch hedefi: 4 hafta.

**Architecture:** Postgres = single source of truth (server-authoritative state machine via `SECURITY DEFINER` functions). Realtime = broadcast bus + presence + postgres_changes. Next.js 16 client = thin renderer + input forwarder. Score card = server-side `@vercel/og` PNG (1200x630, social-media first).

**Tech Stack:** Postgres 16, Supabase Realtime (Elixir/Phoenix Docker), PostgREST 12, GoTrue (SMS-OTP via NetGSM), Next.js 16 App Router, `@vercel/og` (Satori), pg_cron, Caddy 2 (TLS+SNI), Vitest+Playwright+pgTAP+k6.

---

## Backend Hosting Decision: VPS-First (Karar B)

Bilge Arena halen Supabase Free tier'da (NANO compute, 8GB DB, no backups, auto-pause). Pro tier $25/ay = $300/yil. VPS Contabo'da Panola icin Postgres 16 + PostgREST + GoTrue zaten calisiyor (4 ay stable, `project_vps_phase3_status.md`).

**Karar:** Oda sistemi VPS'te self-host olarak ayaga kalkar. Mevcut bilge-arena managed Supabase'i staging/preview olarak kalir; production trafik 3-5 hafta sonra VPS'e tasinir.

**Sebepler:**
- Maliyet: $0/yil (var olan VPS amortismani) vs $300/yil
- KVKK: full data ownership, Contabo Almanya/AB hukuku
- Stack uyumu: Postgres + PostgREST + GoTrue Panola'da kanitli pattern
- Realtime: `supabase/realtime` Docker image self-host edilebilir (Apache 2.0)

**Riskler ve azaltma:**
- Realtime maintenance: pin'li versiyon (`v2.30.x`), Uptime Kuma alarmi, weekly Grafana review
- Backup: pg_dump cron (gunluk + haftalik tam yedek `/opt/backup/bilge-arena/`)
- TLS/SNI: Caddy 2 mevcut konfige `ws.bilgearena.com` + `api.bilgearena.com` route eklenir

**Acil yara bandi (bu gece):** Mevcut Free tier `bilge-arena` projesi pg_dump ile VPS'e yedeklenir (KVKK no-backup risk gideri, 15 dk).

---

## Bolum 1 — Mimari

### 3-katmanli ayrim

```
[Postgres VPS]                      [Realtime VPS]                [Next.js client]
   |                                     |                              |
   | 1. RPC: next_question(room,host)    |                              |
   |<--------------------------------------------- RPC call -------------|
   |                                     |                              |
   | 2. INSERT room_rounds, UPDATE rooms |                              |
   |    + INSERT room_audit_log          |                              |
   |                                     |                              |
   | 3. WAL -> Realtime publication      |                              |
   |------------------------------------>|                              |
   |                                     | 4. Broadcast postgres_changes|
   |                                     |----------------------------->|
   |                                     |                              | 5. Re-render
   |                                     | 6. Presence sync (heartbeat) |
   |                                     |<---------------------------->|
```

### Mod sistemi

| Mod | Aciklama | Use case |
|---|---|---|
| `sync` | Host her round'i manuel "Sonraki Soru" tiklar | Sinif/kuiz organizatoru |
| `auto_relay` | Server (pg_cron) deadline+all-answered'da otomatik ileri | Arkadas grubu, "moderator yok" |
| `async` | Sirayla cevap, P1 kapsami | HQ Trivia tarzi, ileride |

### State machine (room.state)

```
draft -> waiting -> in_progress <-> paused
                         |
                         v
                     finished -> archived -> [DELETE 30 days]
                         ^
                         |
                  host_canceled
```

### Yon B karari: Bilge Baykus mascot

- 8 sticker pack (illustrator brief asagida)
- P0: 256x256 transparent PNG (CDN'den serve, Cloudflare R2)
- P1: Lottie animasyon upgrade (etkilesim arttirma)
- Score card 1200x630 server-side `@vercel/og`, Twitter/Instagram dostu

---

## Bolum 2 — Data Model

### Migration 040 — temel tablolar

```sql
-- rooms: ana oda kaydi
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                   -- 6 char A-Z2-9 (kafa karistirici 0/O/1/I yok)
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  game_slug TEXT NOT NULL,                     -- bilge-arena, lgs, tyt
  category TEXT,
  difficulty INT CHECK (difficulty BETWEEN 1 AND 5),
  question_count INT NOT NULL CHECK (question_count BETWEEN 3 AND 20),
  mode TEXT NOT NULL DEFAULT 'sync' CHECK (mode IN ('sync','async','auto_relay')),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN
    ('draft','waiting','in_progress','paused','finished','archived','host_canceled')),
  max_players INT NOT NULL DEFAULT 8 CHECK (max_players BETWEEN 2 AND 12),
  per_question_seconds INT NOT NULL DEFAULT 20 CHECK (per_question_seconds BETWEEN 10 AND 60),
  current_round INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  archive_after TIMESTAMPTZ,                   -- finished_at + 30 days, pg_cron daily DELETE
  metadata JSONB DEFAULT '{}'::jsonb           -- question_pool, theme, vb.
);
CREATE INDEX rooms_host_idx ON rooms(host_id) WHERE state IN ('waiting','in_progress','paused');
CREATE INDEX rooms_archive_idx ON rooms(archive_after) WHERE state = 'archived';

-- room_members: katilimcilar
CREATE TABLE room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active','left','kicked','banned')),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 24),
  emoji TEXT,                                  -- onceden secilmis 1 emoji (avatar)
  score INT NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX room_members_user_idx ON room_members(user_id) WHERE state = 'active';

-- room_rounds: round bazli soru kaydi
CREATE TABLE room_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  question_id UUID NOT NULL REFERENCES questions(id),
  deadline_at TIMESTAMPTZ NOT NULL,
  correct_revealed BOOLEAN NOT NULL DEFAULT FALSE,
  revealed_at TIMESTAMPTZ,
  UNIQUE (room_id, round_number)
);

-- room_answers: oyuncu cevaplari
CREATE TABLE room_answers (
  round_id UUID NOT NULL REFERENCES room_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice_index INT NOT NULL CHECK (choice_index BETWEEN 0 AND 4),
  response_ms INT NOT NULL CHECK (response_ms BETWEEN 0 AND 120000),
  is_correct BOOLEAN NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (round_id, user_id)             -- idempotency: 1 cevap/round/oyuncu
);

-- room_reactions: Bilge Baykus sticker'lari
CREATE TABLE room_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_id INT NOT NULL CHECK (sticker_id BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX room_reactions_recent_idx ON room_reactions(room_id, created_at DESC);

-- room_audit_log: KVKK + abuse audit (1 yil retention, FK YOK; user_id ham UUID)
CREATE TABLE room_audit_log (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID NOT NULL,                       -- FK yok, room silinse de log kalir
  actor_id UUID,                               -- nullable: pg_cron audit'leri
  action TEXT NOT NULL,                        -- room_created, round_advanced, ...
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_log_room_idx ON room_audit_log(room_id, created_at);
CREATE INDEX audit_log_retention_idx ON room_audit_log(created_at);
```

### Anti-cheat view (correct_revealed pattern)

```sql
CREATE VIEW room_round_question_view AS
SELECT
  rr.id AS round_id,
  rr.room_id,
  rr.round_number,
  rr.deadline_at,
  rr.correct_revealed,
  q.id AS question_id,
  q.body,
  q.choices,
  CASE WHEN rr.correct_revealed THEN q.correct_index ELSE NULL END AS correct_index,
  CASE WHEN rr.correct_revealed THEN q.explanation ELSE NULL END AS explanation
FROM room_rounds rr
JOIN questions q ON q.id = rr.question_id;

GRANT SELECT ON room_round_question_view TO authenticated;
REVOKE SELECT ON questions FROM authenticated;  -- direkt erisim engellendi
```

### RLS matrix

| Tablo | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `rooms` | host or member | authenticated (own host_id) | host (own) | host (own) |
| `room_members` | active members | service_role only (via join_room RPC) | service_role | service_role |
| `room_rounds` | active members | service_role only (via next_question RPC) | service_role | service_role |
| `room_answers` | active members of same round | service_role only (via submit_answer RPC) | NEVER | NEVER |
| `room_reactions` | active members | active members (5/dk rate-limit) | NEVER | service_role |
| `room_audit_log` | service_role only | service_role only | NEVER | service_role (1y retention cron) |

### KVKK retention (pg_cron)

```sql
-- Daily 03:00 TR: archive finished rooms older than 30 days
SELECT cron.schedule('rooms-archive-purge', '0 3 * * *',
  $$DELETE FROM rooms WHERE state = 'archived' AND archive_after < NOW()$$);

-- Daily 03:15 TR: archive transition (finished -> archived)
SELECT cron.schedule('rooms-archive-transition', '15 3 * * *',
  $$UPDATE rooms SET state = 'archived'
    WHERE state = 'finished' AND finished_at < NOW() - INTERVAL '7 days'$$);

-- Weekly 03:30 TR Sun: audit log 1y retention
SELECT cron.schedule('audit-retention', '30 3 * * 0',
  $$DELETE FROM room_audit_log WHERE created_at < NOW() - INTERVAL '1 year'$$);
```

---

## Bolum 3 — Realtime

### Client hook: `useRoomChannel`

```typescript
// src/lib/rooms/use-room-channel.ts
const channel = supabase
  .channel(`room:${roomId}`, {
    config: {
      private: true,                            // RLS gate uygulanir
      presence: { key: userId },                // online/offline tracking
      broadcast: { ack: false, self: false },   // sticker reaction firehose
    },
  })
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'room_rounds', filter: `room_id=eq.${roomId}` },
    (payload) => setLatestRound(payload.new as RoomRound)
  )
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'room_rounds', filter: `room_id=eq.${roomId}` },
    (payload) => {
      // correct_revealed=true geldiginde server-side reveal yapilmis demek
      if (payload.new.correct_revealed) refetchRoundDetails()
    }
  )
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
    (payload) => setRoom(payload.new as Room)
  )
  .on('broadcast', { event: 'reaction' }, (payload) => addReaction(payload.payload))
  .on('presence', { event: 'sync' }, () => setPresence(channel.presenceState()))
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        user_id: userId,
        display_name,
        online_at: new Date().toISOString(),
      })
    }
  })
```

### Realtime RLS (channel auth)

```sql
CREATE POLICY "room_channel_member_only"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'room:%'
    AND EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = (substring(realtime.topic() FROM 'room:(.*)'))::uuid
        AND user_id = auth.uid()
        AND state = 'active'
    )
  );
```

### Mesaj turleri (envelope semantik)

| Olay | Mekanizma | Payload |
|---|---|---|
| Round basladi | `postgres_changes` INSERT room_rounds | round_id, question_id, deadline_at |
| Cevap reveal | `postgres_changes` UPDATE room_rounds (correct_revealed=true) | round_id |
| Oyuncu cevapladi | `presence` track guncelleme | user_id, answered=true (correct_index YOK) |
| Sticker reaction | `broadcast` self=false | user_id, sticker_id, ts |
| Host pause | `postgres_changes` UPDATE rooms (state=paused) | room.state |
| Host kicked | `postgres_changes` UPDATE room_members (state=kicked) | user_id |

---

## Bolum 4 — Server State Machine

### `next_question(p_room_id, p_caller_id)`

Yukarida tam SQL var. Ozellikler:
- `FOR UPDATE` ile row-level lock — 2 paralel call serialize
- `UNIQUE(room_id, round_number)` + idempotency check — double-click safe
- Question pool prebuilt at `start_room` time — round'lar arasi RNG drift yok
- Audit log her transition icin

### `submit_answer(p_round_id, p_user_id, p_choice_index, p_response_ms)`

Yukarida tam SQL var. Ozellikler:
- `UNIQUE(round_id, user_id)` ile double-submit 23505 → API 409
- Deadline check 1s clock skew toleransi
- Server-side `correct_index` karsilastirma — client'a sizdirma yok
- All-answered check → `correct_revealed=true` UPDATE → Realtime'a WAL → reveal broadcast

### `auto_relay_tick()` pg_cron her saniye

```sql
-- mode='auto_relay' rooms: deadline expired or all_answered ise next_question'i tetikle
SELECT cron.schedule('rooms-auto-relay', '* * * * * *',
  'SELECT public.auto_relay_tick()');
```

### Diger fonksiyonlar (PR2 kapsami)

- `start_room(p_room_id, p_host_id)` — draft → waiting, question_pool secimi
- `join_room(p_code, p_user_id, p_display_name, p_emoji)` — code lookup + members INSERT
- `leave_room(p_room_id, p_user_id)` — soft delete (state=left), audit
- `kick_member(p_room_id, p_host_id, p_target_id)` — host yetkisi
- `pause_room(p_room_id, p_host_id)` / `resume_room(...)` / `cancel_room(...)`
- `finish_room(p_room_id)` — sondaj fonksiyonu (auto_relay tarafindan da cagrilir)
- `report_member(p_room_id, p_reporter_id, p_target_id, p_reason)` — audit + 3-strike ban

---

## Bolum 5 — Auth + KVKK + Audit + Abuse

### Auth: SMS-OTP

| Karar | Detay |
|---|---|
| Provider | NetGSM (TR yerel, ~$0.04/SMS) |
| Kanal | GoTrue self-host (VPS Panola GoTrue ile ayni instance, multi-tenant config) |
| Format | E.164 +90XXXXXXXXXX, normalize on input |
| TC Kimlik | YOK (HQ Trivia TR fail pattern) |
| Rate-limit | 3 OTP/saat/telefon, 5 OTP/saat/IP |
| JWT TTL | 1h access + 30d refresh |

### KVKK retention matrix

| Veri | Saklama | Silme |
|---|---|---|
| `auth.users.phone` | Hesap silinene kadar | DELETE /api/account → cascade |
| `rooms` | 30 gun arsiv sonrasi DELETE | `archive_after < NOW()` pg_cron |
| `room_members` | rooms cascade | rooms DELETE |
| `room_rounds` | rooms cascade | rooms DELETE |
| `room_answers` | rooms cascade | rooms DELETE |
| `room_reactions` | rooms cascade | rooms DELETE |
| `room_audit_log` | 1 yil (regulatory) | `created_at < NOW() - 1 year` weekly cron |

### Abuse moderation

```typescript
// Display name profanity filter (TR)
import { TR_PROFANITY } from '@/lib/moderation/tr-profanity'  // ~150 kelime
import { trLower } from '@/lib/utils/tr-locale'

export function isCleanName(name: string): boolean {
  const lower = trLower(name.trim())
  return !TR_PROFANITY.some((w) => lower.includes(w))
}

// Reaction rate-limit: postgres trigger
CREATE TRIGGER room_reactions_rate_limit
  BEFORE INSERT ON room_reactions
  FOR EACH ROW EXECUTE FUNCTION enforce_reaction_rate();
-- enforce_reaction_rate(): son 60s'de bu user_id+room_id'den >= 5 reaction varsa RAISE
```

3-strike ban: `room_audit_log`'da `report_member` actionu olan target_id, son 24h'de 3+ rapor → `room_members.state='banned'`.

---

## Bolum 6 — Test + Deploy

### Test piramidi

| Katman | Tool | Adet | Calisma suresi |
|---|---|---|---|
| PL/pgSQL | pgTAP | ~30 test | <2s |
| API route | Vitest + Supabase test client | ~50 test | <10s |
| Realtime sync | Playwright multi-tab | ~10 test | ~30s |
| E2E TR Gen Z | Playwright mobile | ~5 test | ~60s |
| Load | k6 | 1 senaryo | manual |
| Security | curl + anon key | ~15 test | <5s |

### Onemli test senaryolari

1. **Race-safety**: 50 paralel `next_question(room, host)` call → tek round oluşmali (pgTAP)
2. **Anti-cheat**: anon key ile `/rest/v1/questions?select=correct_index` → 401 (RLS REVOKE)
3. **View leak**: `correct_revealed=false` iken view'dan SELECT → `correct_index = NULL`
4. **Idempotency**: ayni `submit_answer` 2 kere → 23505 → API 409 graceful
5. **Realtime sync**: tab A round basladi → tab B 500ms icinde gormeli
6. **Auto-relay**: deadline+1s sonra round otomatik ilerlemeli (pg_cron)
7. **KVKK retention**: archive_after < NOW() → daily cron DELETE
8. **WhatsApp share**: score card URL paylasilinca 1200x630 OG image rendering

### Deploy plani

**Sprint 0 — VPS dev env (3 gun)**

```yaml
# /opt/bilge-arena/docker-compose.yml
services:
  postgres-bilge-arena:
    image: postgres:16
    environment:
      POSTGRES_DB: bilge_arena_dev
    volumes:
      - bilge-arena-pg:/var/lib/postgresql/data
  postgrest-bilge-arena:
    image: postgrest/postgrest:v12.2.0
    environment:
      PGRST_DB_URI: postgres://...
      PGRST_JWT_SECRET: ${BILGE_ARENA_JWT_SECRET}
    ports: ["3001:3000"]
  realtime-bilge-arena:
    image: supabase/realtime:v2.30.34
    environment:
      DATABASE_URL: postgres://...
      JWT_SECRET: ${BILGE_ARENA_JWT_SECRET}
      ENABLE_TAILSCALE_INTEGRATION: false
    ports: ["4000:4000"]
```

Caddy config: `ws-dev.bilgearena.com` → realtime:4000, `api-dev.bilgearena.com` → postgrest:3001.

**Sprint 1 — MVP build (1 hafta, 7 PR)**
- PR1: Migration 040 (tablolar + RLS + view + cron)
- PR2: PL/pgSQL fonksiyonlar (next_question, submit_answer, auto_relay_tick) + pgTAP
- PR3: API routes (`/api/rooms/*`)
- PR4: Lobby UI (oda olustur, kod gir, oda listesi)
- PR5: Oda ici UI (soru ekrani, geri sayim, scoreboard)
- PR6: Score card endpoint + WhatsApp share button
- PR7: Bilge Baykus 8 sticker + abuse moderation + KVKK cron

**Sprint 2 — Production rollout (1 hafta)**
- Migration 040 prod schema
- Feature flag `ROOMS_ENABLED` env-driven, %0 → %5 → %25 → %100 (4 gun)
- Beta: 50 kisi (premium waitlist)
- Grafana dashboard: oda count, p99 reveal latency, hata orani
- 7 gun stable → public launch

### Score card endpoint

```typescript
// src/app/api/rooms/[id]/score-card/route.ts
import { ImageResponse } from 'next/og'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data } = await fetchScoreboard(params.id)
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, /* Bilge Arena brand bg */ }}>
        {/* Title, scoreboard top 3 with mascot, date, code */}
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

### Bilge Baykus illustrator brief

| # | Sticker | Tetikleyici |
|---|---|---|
| 1 | Bilge (gozluklu-kitap) | Dogru cevap |
| 2 | Sip (yildirim-takla) | Hizli cevap (<3s) |
| 3 | Tam Isabet (nisanci) | 5/5 perfect |
| 4 | Galaksi Beyin (kafa-galaksi) | Zor sorularda dogru |
| 5 | Catlattin (alev-yelken) | 3+ ust uste dogru |
| 6 | Erimis (dramatic) | 0/5 |
| 7 | Kral/Kralice (tac) | 1. olma |
| 8 | Helal (saygi) | Iyi oyun (rakip skoruna tepki) |

- Format: 256x256 PNG transparent + Lottie JSON (P1)
- Butce: $700-1000 TR freelance
- Deadline: P0 launch -2 hafta (Sprint 1 baslangiciyla paralel ise alinmali)

---

## Risk Register

| Risk | Olasilik | Etki | Azaltma |
|---|---|---|---|
| VPS Realtime down | Orta | Yuksek | Uptime Kuma alarm + auto-restart docker |
| pg_dump cron sessiz fail | Dusuk | Yuksek | Healthcheck endpoint, weekly manual restore drill |
| SMS provider quota exceeded | Dusuk | Orta | NetGSM fallback Twilio, $50/ay budget cap |
| Realtime msg burst (DDoS) | Orta | Orta | Cloudflare proxy + rate-limit (200 msg/s/room) |
| KVKK audit eksik | Dusuk | Cok yuksek | room_audit_log her transition + weekly review query |
| Bilge Baykus deadline kaymasi | Orta | Orta | P0 placeholder emoji set hazir, Lottie P1'e ertelenebilir |
| Migration drift VPS<>managed | Orta | Yuksek | Supabase CLI `db diff` weekly + pre-deploy check |

---

## Open Decisions (Implementation phase)

1. Question pool secim algoritmasi: `(category, difficulty)` filter + `ORDER BY random()` mi yoksa weighted (kullanici daha az gorduklerine oncelik) mi?
2. Score formula: `is_correct ? max(0, 1000 - response_ms) : 0` mi yoksa difficulty multiplier'li mi?
3. Display name policy: tek kelime mi, max 24 char emoji-allowed mi, profanity reject mi sansurle (`***`) mi?
4. Empty-room cleanup: host disconnect + 5 dk presence yok → otomatik `host_canceled` mi yoksa "yeni host secimi" mi?
5. Score card share: WhatsApp Web Share API only mi yoksa Twitter/Instagram intent ekle mi?

Bu kararlar writing-plans asamasinda her PR'in basinda netlestirilecek.

---

## Sequence Diagrams

### Happy path: Sync mode 5-question round

```
Host                Postgres          Realtime         Player
 |                     |                 |                |
 | POST /api/rooms     |                 |                |
 |-------------------->|                 |                |
 | (rooms INSERT)      |                 |                |
 |<--code: ABCD23------|                 |                |
 |                     |                 |                |
 | (share via WhatsApp)|                 |                |
 |                     |                 |                |
 |                     |                 |                | POST /api/rooms/join
 |                     |<-------------------------------- |
 |                     |  RPC join_room  |                |
 |                     | (members INSERT)|                |
 |                     |---WAL---------> | postgres_changes
 |                     |                 |--------------->| (member joined)
 |                     |                 |                |
 | "Basla" tikla       |                 |                |
 | RPC start_room      |                 |                |
 |-------------------->|                 |                |
 | RPC next_question   |                 |                |
 |-------------------->|                 |                |
 | (rounds INSERT)     |                 |                |
 |---WAL-------------->|---postgres_changes-------------->| (Round 1 baslar)
 |                     |                 |                |
 |                     |                 |                | RPC submit_answer
 |                     |<-------------------------------- |
 |                     | (answers INSERT,|                |
 |                     |  all-answered?  |                |
 |                     |  -> rounds UPDATE correct_revealed)
 |                     |---WAL---------> | postgres_changes
 |                     |                 |--------------->| (reveal: correct_index gosteriliyor)
 |                     |                 |--------------->| (host: scoreboard update)
 |                     |                 |                |
 | (Loop 5 kez)        |                 |                |
 |                     |                 |                |
 | RPC next_question   |                 |                |
 | (round 6 = sondan)  |                 |                |
 | -> rooms UPDATE     |                 |                |
 |    state=finished   |                 |                |
 |---WAL-------------->|---postgres_changes-------------->| (Score card sayfasi)
 |                     |                 |                |
 | GET /api/rooms/{id}/score-card        |                |
 | (1200x630 PNG)      |                 |                |
 |                     |                 |                | (WhatsApp share)
```

---

## Acceptance Criteria (P0 launch)

- [ ] 8 oyuncuya kadar oda olusturulabilir, kod paylasimi calisir
- [ ] 5/8/12 round'luk sync ve auto_relay modlari calisir
- [ ] Round timer client+server senkron (1s tolerans)
- [ ] correct_index reveal'dan once asla client'a gitmemeli (security test gecmeli)
- [ ] Score card 1200x630 PNG WhatsApp/Twitter'da preview'lanmali
- [ ] 8 Bilge Baykus sticker calisir (P0 PNG)
- [ ] KVKK retention pg_cron her gun calisir, log var
- [ ] Display name profanity filter (TR_PROFANITY) calisir
- [ ] Host pause/resume/cancel calisir, audit kanitli
- [ ] Realtime channel RLS gate (uye olmayan dinleyemez) calisir
- [ ] Load test: 100 paralel oda x 8 oyuncu, p99 reveal latency < 2s
