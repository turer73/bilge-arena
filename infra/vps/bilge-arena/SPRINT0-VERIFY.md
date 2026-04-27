# Sprint 0 Verification + Rollback

**Tarih:** 2026-04-27 22:55 TR
**Branch:** `feat/oda-sistemi-sprint0`
**Plan referansi:** `docs/plans/2026-04-27-oda-sistemi-implementation.md` (Tasks 0.1-0.6)
**Hedef:** Mevcut Supabase'e DDL/data muhdahale etmeden VPS uzerinde
`bilge_arena_dev` DB + PostgREST + Realtime + public TLS routing'i kurmak.
Sprint 1 PR3 (API routes) bu altyapiyi tuketir; o zamana kadar production
impact = sifir.

---

## 1. Smoke Test Sonuclari (2026-04-27 22:53 TR'de toplandi)

### 1.1 DB role login (Task 0.1)

```bash
ssh klipperos@100.113.153.62 \
  "ssh root@194.163.134.239 \
    'docker exec panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
      -c \"SELECT 1 AS db_ok, current_user, current_database()\"'"
```

**Sonuc:**

```
 db_ok |  current_user   | current_database
-------+-----------------+------------------
     1 | bilge_arena_app | bilge_arena_dev
(1 row)
```

OK — non-superuser app rolu kendi DB'sine baglanabiliyor.

### 1.2 PostgREST public reachability (Task 0.2 + 0.4)

```bash
curl -sS -m 15 https://api-dev.bilgearena.com/
```

**Sonuc:**

- HTTP 200 (t=0.42s)
- TLS verify OK (Let's Encrypt R12, valid `2026-04-27 18:44 UTC` → `2026-07-26 18:44 UTC`)
- Body: OpenAPI 12.2.3 swagger JSON (`{"swagger":"2.0","info":{"title":"standard public schema","version":"12.2.3"},...}`)
- Schemas: bos (PR1 migration'a kadar normal — anon role icin sadece public + game_room + auth bos)

### 1.3 Realtime public reachability (Task 0.3 + 0.4)

```bash
curl -sS -m 15 https://ws-dev.bilgearena.com/
```

**Sonuc:**

- HTTP 200 (t=0.30s)
- TLS verify OK (Let's Encrypt R13, valid `2026-04-27 18:17 UTC` → `2026-07-26 18:17 UTC`)
- Body: Phoenix landing HTML
- WebSocket upgrade: Traefik v3 native handle eder (Sprint 1 PR4'te wscat ile dogrulanacak)

> **Plan-deviation #16:** Plan `/api/health` ister, ancak Realtime v2.30.34
> imajinda boyle bir route YOK. Healthcheck `/` uzerinden yapildi (Phoenix
> landing 200). Tenant-scoped sagliik kontrolu (`/api/tenants/:id/health`) JWT
> gerektirir, healthcheck'e dahil edilmedi.

### 1.4 Container status

```bash
docker ps --filter name=bilge-arena --format "{{.Names}} | {{.Status}} | {{.Image}}"
```

**Sonuc:**

```
bilge-arena-postgrest | Up 9 minutes           | postgrest/postgrest:v12.2.3
bilge-arena-realtime  | Up 36 minutes (healthy) | supabase/realtime:v2.30.34
```

> **Plan-deviation #18:** PostgREST 12.2.3 distroless imaji `/bin/sh` ve `wget`
> ICERMEZ. CMD-SHELL healthcheck kalici `unhealthy` raporlar; bu da Traefik v3
> docker provider `pkg/provider/docker/config.go:199` filtresine yakalanip
> router'larin asla register edilmemesine sebep oluyordu (Apr 27 17:30-19:45
> arasinda 502 BadGateway debug edildi). Cozum: postgrest healthcheck `disable:
> true`. Realtime imaji `curl` iceriyor, healthcheck calisiyor.

### 1.5 questions-sync hazirligi (Task 0.5)

VPS scripts:

```
/opt/bilge-arena/scripts/
  generate-postgrest-env.sh
  generate-realtime-env.sh
  install-cron.sh           # 02:30 TR daily entry kurar (PR1 sonrasi calistir)
  questions-sync.sh         # idempotent: TRUNCATE+restore public.questions
```

**Cron durumu:** `crontab -l` — questions-sync entry **YOK** (kasitli; PR1
mergelendikten sonra `bash install-cron.sh` ile aktive edilir).

**Mevcut master backup cron** (degistirilmedi):

```
0 2 * * * /opt/backup/bilge-arena/bilge-arena-backup.sh >> /opt/backup/logs/bilge-arena-cron.log 2>&1
```

> **Plan-deviation #19 (RETRACTED):** Onceki oturumda tarihsel mtime'lardan
> (03:03-07 TR) master backup'in 03:00 TR'de calistigi cikarsanmis ve
> questions-sync 03:30 TR'ye konumlanmisti. Yeniden dogrulamada VPS timezone
> `Europe/Istanbul (+03)`, crontab `0 2 * * *` ve script header `02:00 TR'de
> calisir` diyor. 03:03-07 mtime'lar eski cron'un izi. **Plan ile hizali
> kalmak icin questions-sync 02:30 TR'ye cekildi (`30 2 * * *`).** 23-27 dk
> buffer (gozlemlenen pg_dump suresi 3-7 dk).

> **Plan-deviation #20:** Mevcut Supabase schema'sinda `categories`,
> `game_categories`, `games` tablolari **YOK**. `zcat latest.sql.gz | grep '^COPY public\.'`
> sadece `profiles`, `questions`, `challenges`, `game_sessions` vb. listeliyor.
> Sync sadece `public.questions` icin yapilir; schema normalize edildiginde
> (Sprint 1+) tablolar `questions-sync.sh` icindeki `for table in ...` listesine
> eklenir.

---

## 2. Plan-Deviations Index (Sprint 0 cumulative)

| #   | Konu | Plan | Reality | Karar |
|-----|------|------|---------|-------|
| 1-7 | (Sprint 0 oncesi - design / brainstorm dokumanlarinda) | — | — | — |
| 8   | Docker network adi | `panola` | `panola-network` | `external: true name: panola-network` |
| 9   | PostgREST schema env | `PGRST_DB_SCHEMA` | PostgREST 12+ standart `PGRST_DB_SCHEMAS` (cogul) | Cogul env kullanildi |
| 10  | JWT algoritmasi | HS256 | Supabase 2024+ JWT signing keys -> ES256 JWKS | `PGRST_JWT_SECRET={"jwks_url":"..."}` |
| 11  | GUC modu | (belirtilmemis) | PG14+ modern `current_setting()` | `PGRST_DB_USE_LEGACY_GUCS=false` |
| 12  | wal_level | `logical` (postgres_changes icin) | Sprint 0'da degisiklik koordineli Panola restart penceresi gerektirir | Sprint 0 Broadcast+Presence ile ship; postgres_changes ertelendi |
| 13  | Realtime JWT secret | (Supabase JWT ile ortak) | Realtime v2.30.34 JWKS desteklemiyor | `API_JWT_SECRET = bilge-arena-internal HS256`; channel-auth Next.js `/api/realtime/token` ile imzalanir |
| 14  | ECTO_IPV6 | (default) | Realtime imaji `true` default; `panola-network` IPv4-only | `ECTO_IPV6=false` override |
| 15  | DB_ENC_KEY format | (belirtilmemis) | Realtime aes_128_ecb env'i RAW key olarak kullanir, hex decode YOK | 16 byte ASCII (`openssl rand -base64 12` -> 16 char base64). 32 hex char crash sebebi |
| 16  | Realtime healthcheck path | `/api/health` | route mevcut degil | `/` (Phoenix landing 200) |
| 17  | Public TLS edge | `panola-caddy` | Dokploy-Traefik (panola-caddy internal :8080 backend); panola-caddy public TLS terminate ETMIYOR | Traefik label-based discovery + `dokploy-network` membership |
| 18  | PostgREST healthcheck | (default CMD-SHELL) | distroless imajda `/bin/sh` yok -> permanent unhealthy -> Traefik filtreliyor | Healthcheck `disable: true`; Traefik LB-level passive health |
| 19  | Master backup zamanlamasi (RETRACTED) | 02:00 TR | Crontab gercekten 02:00 TR (eski mtime verisi yanilticiydi) | questions-sync 02:30 TR; plan ile hizali |
| 20  | Sync edilecek tablolar | `categories, game_categories, games, questions` | Mevcut schema'da sadece `questions` var | Sadece `public.questions`; schema normalize'a kadar |

---

## 3. Rollback Runbook

### Senaryo A: bilge-arena-dev veriler/servisler bozuldu, **dev** ortami sifirla

```bash
ssh klipperos@100.113.153.62 \
  "ssh root@194.163.134.239 'cd /opt/bilge-arena && docker compose down -v'"
```

`docker compose down -v` ile:

- `bilge-arena-postgrest` ve `bilge-arena-realtime` containerlari silinir
- Volume'lar silinir (Sprint 0'da dis volume yok, _realtime schema iceride)
- **Traefik label'lari container ile birlikte yok olur** (plan-deviation #17:
  panola-caddy edit gerekmiyor, Traefik docker provider tarafindan dinamik
  discover ediliyordu, container yok = label yok = router yok)

### Senaryo B: DB tamamen sifirlanacak (**dev rolleri ve schema dahil**)

```bash
ssh klipperos@100.113.153.62 \
  "ssh root@194.163.134.239 \
    'docker exec panola-postgres psql -U panola -d postgres <<SQL
BEGIN;
DROP DATABASE IF EXISTS bilge_arena_dev;
DROP ROLE IF EXISTS bilge_arena_app;
DROP ROLE IF EXISTS bilge_arena_authenticator;
DROP ROLE IF EXISTS authenticated;
DROP ROLE IF EXISTS anon;
DROP ROLE IF EXISTS service_role;
COMMIT;
SQL'"
```

> **Dikkat:** `panola_user` veya `panola` rolune dokunma — Panola production
> bunlari kullanir.

### Senaryo C: questions-sync cron'u devre disi birak

```bash
ssh klipperos@100.113.153.62 \
  "ssh root@194.163.134.239 \
    'crontab -l | grep -v questions-sync | crontab -'"
```

Idempotent: tekrar etkinlestirmek icin `bash /opt/bilge-arena/scripts/install-cron.sh`.

### Senaryo D: Traefik label'lari/SSL sertifikalari kalintisi temizle

Sprint 0 sertifikalari `dokploy-traefik` icindeki ACME store'da. Container
silindikten sonra sertifika store'da kalir (90 gun valid). Manuel temizlik
**gerekli degil**; ihtiyac olursa:

```bash
ssh klipperos@100.113.153.62 \
  "ssh root@194.163.134.239 \
    'docker exec dokploy-traefik sh -c \"rm /letsencrypt/acme-*.json\" \
     && docker restart dokploy-traefik'"
```

> Bu komut **TUM Dokploy/Traefik sertifikalarini siler**. Sadece Sprint 0
> sertifikalarini izole etmek mumkun degil; en yakin kotumser durum 90 gunluk
> kalintidir, Let's Encrypt rate-limit'inde sorun yok.

---

## 4. Production Etkisi

**Sifir.** Mevcut `https://www.bilgearena.com` (Next.js) hala Supabase'e
bagli. Sprint 0'da:

- Supabase'e DDL/data muhdahale **yok** (sadece Auth JWKS public endpoint
  read-only consume edildi)
- Supabase tablo izinleri degismedi
- Master backup cron'u (`0 2 * * *`) korundu, bilge-arena production etkisi yok
- Sprint 0 servisler **dev-only** subdomain'lerde (`api-dev.bilgearena.com`,
  `ws-dev.bilgearena.com`); prod app bunlara cagri yapmiyor

Sprint 1 PR3 (API routes) `bilge-arena/src/app/api/realtime/*` ve `/api/rooms/*`
icin geliyor; o PR mergelendiginde iki sistem konusmaya baslar.

---

## 5. Sprint 1 Prereqleri

PR1 acilmadan once tamamlanmasi gereken **dis isler**:

- [ ] **Bilge Baykus illustrator brief** — 4 emote SVG (heyecanli, dusunceli,
      uzgun, mutlu) + 4 reaction sticker. Brief: `docs/design/bilge-baykus-brief.md`
      (Sprint 1 PR7 ile entegre edilecek).
- [ ] **NetGSM SMS-OTP API key** — phone-based oda davet sistemi. Sprint 1 PR3
      `/api/rooms/invite` route'u kullanir.
- [ ] **PR1 merge** — questions-sync cron'unu aktive etmek icin:
      ```bash
      ssh root@194.163.134.239 'bash /opt/bilge-arena/scripts/install-cron.sh'
      ```

---

## 6. Sprint 0 Kapanis

- 5 commit: `608781e` (DB init) → `be6b15b` (deviation header) → `c651807`
  (PostgREST) → `949eb58` (Realtime) → `f172eee` (Traefik) → `9676648`
  (questions-sync)
- Tum dort smoke test green (DB / PostgREST / Realtime / containers)
- 12 plan-deviation dokumanli (tablonun #8-#20 araligi; #19 retracted)
- Sprint 1 PR1 hazir; bu PR mergelendiginde questions-sync cron etkinlesir

**Onay:** `infra/vps/bilge-arena/docker-compose.yml` ve script'ler reproducible.
Yeni bir VPS'te ayni dosyalar + `secrets/` ile bootstrap edilebilir (init SQL +
generate-*-env.sh + docker compose up -d).
