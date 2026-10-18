# Runbook: Realtime token ve oda kanali (derin inceleme §4.1, disc #2611)

VPS: `vmi3591913` (Tailscale 100.124.138.27), `/opt/bilge-arena`. Her adim ayri
onayla. Yazmadan once yedek. Prova: `infra/test/realtime` (izole yigin, ayni
imajlar; before/after fazlari).

## Neden

Canli olcum (2026-10-18, salt okuma):

- `seeds.exs` her acilista `ws-dev` tenant'ini silip `jwt_secret = API_JWT_SECRET`
  ile yeniden kuruyor. `API_JWT_SECRET` ayni zamanda Realtime yonetim API'sinin
  sirri. `ws-dev.bilgearena.com` tum yollari disa acik. Kullanici token'i
  bicimindeki bir JWT ile `GET /api/tenants` -> **200**.
- `realtime.messages`: RLS acik, politika yok; tenant `private_only=false`.
  Istemci kanali public: oda kimligini bilen presence okur, sahte typing yollar.

## Sira

Adim 1, 2 ve 3 PR merge'unden once yapilabilir: Vercel'i ve calisan istemciyi
etkilemezler. Adim 2, adim 4'ten (deploy) once ZORUNLU; yoksa yeni istemcinin
private kanali kurulamaz (oda polling ile calismaya devam eder).

### 0. Yedek

```bash
ts=$(date -u +%Y%m%dT%H%M%SZ)
cd /opt/bilge-arena
cp -a secrets/realtime.env "secrets/realtime.env.bak-$ts-pre41"
cp -a scripts/generate-realtime-env.sh "scripts/generate-realtime-env.sh.bak-$ts-pre41"
docker exec bilge-arena-db pg_dump -U ba_admin -d bilge_arena_dev -n _realtime \
  > "secrets/_realtime-schema-backup-$ts.sql"
docker exec bilge-arena-db psql -U ba_admin -d bilge_arena_dev -Atc \
  "select policyname from pg_policies where schemaname='realtime'"   # bugun: bos
```

### 1. Edge: ws-dev yalniz /socket (sicak yuklenir, restart yok)

```bash
install -m 644 ws-dev-socket-only.yml /opt/edge/dynamic/ws-dev-socket-only.yml
curl -s -o /dev/null -w '%{http_code}\n' https://ws-dev.bilgearena.com/api/tenants        # 403
curl -s -o /dev/null -w '%{http_code}\n' https://ws-dev.bilgearena.com/socket/websocket   # 401 (Realtime'a ulasiyor)
```

Geri alma: dosyayi sil.

### 2. SQL 27: realtime.messages politikalari

```bash
docker exec -i bilge-arena-db psql -U ba_admin -d bilge_arena_dev -v ON_ERROR_STOP=on \
  -f - < sql/27_realtime_room_channel_auth.sql
docker exec -i bilge-arena-db psql -U ba_admin -d bilge_arena_dev -v ON_ERROR_STOP=on \
  -f - < sql/27_realtime_room_channel_auth_test.sql   # ROLLBACK eder; 5 x "OK Test"
```

Geri alma: dosya basligindaki iki `DROP POLICY`.

### 3. realtime.env: sirlari ayir, seed'i kapat, aud dogrulamasi

```bash
install -m 700 generate-realtime-env.sh scripts/generate-realtime-env.sh
bash scripts/generate-realtime-env.sh
#   INFO: Moved old API_JWT_SECRET to TENANT_JWT_SECRET  (Vercel degismez)
#   INFO: Generated new admin-only API_JWT_SECRET
docker compose -f docker-compose.rooms.yml up -d --force-recreate realtime
docker exec bilge-arena-db psql -U ba_admin -d bilge_arena_dev -Atc \
  "select external_id, inserted_at from _realtime.tenants"   # ws-dev, inserted_at DEGISMEMIS olmali
```

`JWT_CLAIM_VALIDATORS` yanlis `aud`'u reddeder; `aud`'u hic olmayan token'i
reddetmez (Realtime'in Joken dogrulayicisi yalniz mevcut claim'i kontrol eder).
Bu yuzden eski (aud'suz) istemci token'lari gecis boyunca calisir.

Geri alma: `.bak-...-pre41` dosyasini geri koy, `--force-recreate realtime`.
Seed kapali oldugu icin tenant kaydi korunur; eski dosyada `SEED_SELF_HOST=true`
oldugundan geri alma tenant'i eski sirla yeniden kurar (Vercel ile ayni deger).

### 4. PR merge + Vercel deploy

Yeni istemci: private kanal, `aud`'lu 10 dakikalik token, yenileme.

### 5. Uretim dogrulamasi

DB'ye yazmayan yoklama (`infra/test/realtime/dist/smoke.mjs prod-probe`):

```bash
# realtime.env source EDILMEZ (ERL_AFLAGS tirnaksiz bosluk iceriyor).
get() { grep -E "^$1=" secrets/realtime.env | head -1 | cut -d= -f2-; }
mkdir -p /tmp/ba-smoke && install -m 644 smoke.mjs /tmp/ba-smoke/smoke.mjs
docker run --rm --network bilge-arena-rooms -v /tmp/ba-smoke:/smoke:ro \
  -e SMOKE_TENANT_SECRET="$(get TENANT_JWT_SECRET)" -e SMOKE_ADMIN_SECRET="$(get API_JWT_SECRET)" \
  -e SMOKE_WS_URL=wss://ws-dev.bilgearena.com/socket \
  -e SMOKE_HTTP_URL=https://ws-dev.bilgearena.com \
  -e SMOKE_ADMIN_URL=http://bilge-arena-realtime:4000 \
  node:22-bookworm-slim node /smoke/smoke.mjs prod-probe
```

Beklenen: P1 edge 403, P2 ic ag kullanici token 403, P2b admin sirri 200,
P3 yanlis aud / suresi dolmus reddedilir, P4 uye olmayan private join Unauthorized.

Iki oyunculu kontrol (`prod-pair`) sentetik bir oda (sabit UUID'ler, gercek
kullanici degil) yazar ve sonunda siler; ayrica onay ister.

## Sonra (istege bagli)

- Eski sekmeler kapandiktan sonra tenant `private_only=true` (seed kapali oldugu
  icin kalici): public kanal tamamen reddedilir.
