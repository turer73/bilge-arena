# Oda Sistemi Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Each task is bite-sized (2-5 dakika). Atla, sirayla calistir.

**Goal:** Bilge Arena icin senkron+yari-senkron cok-oyunculu oda sistemini VPS'te self-host olarak ayaga kaldir, mevcut managed Supabase'e DDL/data yazma yapmadan. P0 launch = 4 hafta.

**Architecture:** VPS Postgres (panola-postgres icinde yeni `bilge_arena_dev` DB) = single source of truth. Realtime Docker (`supabase/realtime`) = broadcast bus + presence + postgres_changes. PostgREST = JWT-validated REST endpoint. JWT secret mevcut Supabase secret'iyle uyumlu (read-only kopyalama). Soru bankasi nightly cron ile Supabase backup'tan sync edilir (Secenek A).

**Tech Stack:** Postgres 16, supabase/realtime v2.30.34, postgrest/postgrest:v12.2.3, GoTrue v2.188.1 (NetGSM SMS-OTP, mevcut Panola GoTrue ile multi-tenant), Next.js 16 App Router, `@vercel/og` (Satori), pg_cron, Caddy 2 SNI, Vitest+Playwright+pgTAP+k6.

**Design referansi:** `docs/plans/2026-04-26-oda-sistemi-design.md` (584 satir, mimari ve karar gerekceleri orada).

**Branch stratejisi:** Sprint 0 = `feat/oda-sistemi-sprint0` (foundation), her PR ayri feature branch (`feat/oda-pr1-migration-040`, `feat/oda-pr2-rpc`, ...). Hepsi `feat/oda-sistemi-design` rebase tabanli.

---

## Pre-Sprint 0 Onko-list

Baslamadan once VPS'te ve secrets store'da hazir olmasi gerekenler:

### P.1 — Secrets toplama (kullanici aksiyonu, 5 dk)

Sen yapacaksin, ben VPS'e koymak icin bekliyorum:

| Secret | Nereden | Yapistir |
|---|---|---|
| `SUPABASE_JWT_SECRET` | https://supabase.com/dashboard/project/lvnmzdowhfzmpkueurih/settings/api → "JWT Settings" → "JWT Secret" | "Reveal" tikla, kopyala. ~64 char base64 string. |
| `BILGE_ARENA_DB_PASSWORD` | Sen olustur (32 char random) | `openssl rand -base64 24` ile uretebiliriz. |

**Not:** Supabase JWT secret'i kopyalamak Supabase'e yazma degil, sadece Dashboard okuma. Tasarimin "Supabase'e dokunmama" sartini ihlal etmez.

### P.2 — Domain DNS (kullanici aksiyonu, 5 dk)

Cloudflare 3d-labx@3d-labx.com hesabinda `bilgearena.com` zone'una 2 yeni A kaydi:

| Subdomain | Tip | Deger | Proxy |
|---|---|---|---|
| `api-dev.bilgearena.com` | A | 194.163.134.239 | DNS only (Caddy TLS uretir) |
| `ws-dev.bilgearena.com` | A | 194.163.134.239 | DNS only |

Production domain'ler (`api.bilgearena.com`, `ws.bilgearena.com`) Sprint 2'de eklenir.

### P.3 — VPS pre-flight check (otomatik dogrulama, 1 dk)

```bash
ssh root@100.126.113.23 "
  echo '=== panola-postgres up ==='
  docker inspect -f '{{.State.Status}}' panola-postgres
  echo '=== panola-caddy up ==='
  docker inspect -f '{{.State.Status}}' panola-caddy
  echo '=== free disk ==='
  df -h / | awk 'NR==2{print \$4}'
  echo '=== free RAM ==='
  free -h | awk 'NR==2{print \$7}'
"
```

Beklenen: panola-postgres=running, panola-caddy=running, disk >100GB free, RAM >5GB free. Bilge Arena Realtime container ~200MB RAM kullanir.

---

## Sprint 0: VPS Foundation (3 gun)

Sprint hedefi: Sprint 1'in ilk PR'ini calistirabilecek dev environment hazir.

### Task 0.1: bilge_arena_dev Postgres DB + role olustur

**Files:**
- Create on VPS: `/opt/bilge-arena/sql/0_init_db.sql`

**Step 1: SQL dosyasini hazirla**

```bash
ssh root@100.126.113.23 "mkdir -p /opt/bilge-arena/sql /opt/bilge-arena/secrets"

cat > /tmp/0_init_db.sql << 'SQLEOF'
-- bilge_arena_dev DB + role olusturma (Panola DB'sinden tamamen ayri)
CREATE ROLE bilge_arena_app LOGIN PASSWORD :'app_password';
CREATE ROLE bilge_arena_authenticator LOGIN PASSWORD :'auth_password';
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

GRANT authenticated, anon, service_role TO bilge_arena_authenticator;

CREATE DATABASE bilge_arena_dev OWNER bilge_arena_app
  ENCODING 'UTF8' LC_COLLATE 'tr_TR.UTF-8' LC_CTYPE 'tr_TR.UTF-8' TEMPLATE template0;

\c bilge_arena_dev

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 'auth' schema (Supabase JWT aud=authenticated icin gerekli)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    coalesce(current_setting('request.jwt.claim.sub', TRUE),
             current_setting('request.jwt.claims', TRUE)::jsonb->>'sub'),
    ''
  )::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
SQLEOF

scp /tmp/0_init_db.sql root@100.126.113.23:/opt/bilge-arena/sql/0_init_db.sql
```

**Step 2: Random password uret + secret store**

```bash
ssh root@100.126.113.23 "
  APP_PWD=\$(openssl rand -base64 24)
  AUTH_PWD=\$(openssl rand -base64 24)
  cat > /opt/bilge-arena/secrets/db.env << EOF
BILGE_ARENA_APP_PASSWORD=\${APP_PWD}
BILGE_ARENA_AUTH_PASSWORD=\${AUTH_PWD}
EOF
  chmod 600 /opt/bilge-arena/secrets/db.env
  echo 'Saved /opt/bilge-arena/secrets/db.env'
"
```

**Step 3: Init SQL'i panola-postgres'te calistir**

```bash
ssh root@100.126.113.23 "
  source /opt/bilge-arena/secrets/db.env
  docker exec -i \
    -e APP_PWD=\${BILGE_ARENA_APP_PASSWORD} \
    -e AUTH_PWD=\${BILGE_ARENA_AUTH_PASSWORD} \
    panola-postgres \
    psql -U panola -d postgres \
    -v app_password=\"\${BILGE_ARENA_APP_PASSWORD}\" \
    -v auth_password=\"\${BILGE_ARENA_AUTH_PASSWORD}\" \
    < /opt/bilge-arena/sql/0_init_db.sql
"
```

Expected: 5 NOTICE/CREATE bildirimi, 0 ERROR.

**Step 4: Smoke test — DB erisimi**

```bash
ssh root@100.126.113.23 "
  source /opt/bilge-arena/secrets/db.env
  docker exec -i panola-postgres \
    psql -U bilge_arena_app -d bilge_arena_dev -c 'SELECT current_database(), current_user;'
"
```

Expected: `bilge_arena_dev | bilge_arena_app`. Hata varsa Step 3'e don.

**Step 5: Commit (sadece SQL dosyasi, secrets degil)**

```bash
cd F:/projelerim/bilge-arena
git checkout -b feat/oda-sistemi-sprint0
mkdir -p infra/vps/bilge-arena/sql
# (SQL'in lokal kopyasini commit et, secrets icermez)
scp root@100.126.113.23:/opt/bilge-arena/sql/0_init_db.sql infra/vps/bilge-arena/sql/0_init_db.sql
git add infra/vps/bilge-arena/sql/0_init_db.sql
git commit -m "feat(infra): VPS bilge_arena_dev DB + role init SQL"
```

---

### Task 0.2: PostgREST container + Supabase JWT secret

**Files:**
- Create on VPS: `/opt/bilge-arena/docker-compose.yml`
- Create on VPS: `/opt/bilge-arena/secrets/postgrest.env`

**Step 1: PostgREST environment hazirla**

Kullanici sana Supabase JWT secret verdiginde:

```bash
read -rsp "Supabase JWT Secret yapistir: " JWT_SECRET
echo
ssh root@100.126.113.23 "cat > /opt/bilge-arena/secrets/postgrest.env << EOF
PGRST_DB_URI=postgres://bilge_arena_authenticator:\${BILGE_ARENA_AUTH_PASSWORD}@panola-postgres:5432/bilge_arena_dev
PGRST_DB_SCHEMA=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=${JWT_SECRET}
PGRST_JWT_AUD=authenticated
PGRST_OPENAPI_MODE=disabled
PGRST_LOG_LEVEL=info
EOF
chmod 600 /opt/bilge-arena/secrets/postgrest.env"
```

**Step 2: docker-compose.yml yaz**

```bash
ssh root@100.126.113.23 "cat > /opt/bilge-arena/docker-compose.yml << 'YAMLEOF'
version: '3.8'

networks:
  default:
    name: bilge-arena-net
  panola:
    external: true
    name: panola

services:
  postgrest:
    image: postgrest/postgrest:v12.2.3
    container_name: bilge-arena-postgrest
    restart: unless-stopped
    env_file:
      - ./secrets/postgrest.env
    networks:
      - default
      - panola
    ports:
      - '127.0.0.1:3001:3000'
    healthcheck:
      test: ['CMD-SHELL', 'wget -q --spider http://localhost:3000/ || exit 1']
      interval: 30s
      timeout: 5s
      retries: 3

  realtime:
    image: supabase/realtime:v2.30.34
    container_name: bilge-arena-realtime
    restart: unless-stopped
    env_file:
      - ./secrets/realtime.env
    networks:
      - default
      - panola
    ports:
      - '127.0.0.1:4000:4000'
    healthcheck:
      test: ['CMD-SHELL', 'curl -fsS http://localhost:4000/api/health || exit 1']
      interval: 30s
      timeout: 5s
      retries: 3
YAMLEOF"
```

**Step 3: PostgREST container ayaga kaldir**

```bash
ssh root@100.126.113.23 "cd /opt/bilge-arena && docker compose up -d postgrest"
```

**Step 4: Health check**

```bash
ssh root@100.126.113.23 "
  sleep 5
  docker logs bilge-arena-postgrest --tail 20
  echo '--- HEALTH ---'
  docker inspect -f '{{.State.Health.Status}}' bilge-arena-postgrest
  echo '--- CONNECTIVITY ---'
  curl -sS http://127.0.0.1:3001/ | head
"
```

Expected: `Listening on port 3000`, `OpenAPI` JSON response (disabled olsa da root endpoint cevap verir).

**Step 5: Commit**

```bash
git add infra/vps/bilge-arena/docker-compose.yml
git commit -m "feat(infra): PostgREST container with Supabase JWT validation"
```

---

### Task 0.3: Realtime container

**Files:**
- Modify on VPS: `/opt/bilge-arena/docker-compose.yml` (Step 0.2'de zaten ekledik)
- Create on VPS: `/opt/bilge-arena/secrets/realtime.env`

**Step 1: Realtime env hazirla**

```bash
ssh root@100.126.113.23 "
  source /opt/bilge-arena/secrets/db.env
  cat > /opt/bilge-arena/secrets/realtime.env << EOF
DB_HOST=panola-postgres
DB_PORT=5432
DB_NAME=bilge_arena_dev
DB_USER=bilge_arena_authenticator
DB_PASSWORD=\${BILGE_ARENA_AUTH_PASSWORD}
DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime
DB_ENC_KEY=$(openssl rand -hex 16)
API_JWT_SECRET=$(grep PGRST_JWT_SECRET /opt/bilge-arena/secrets/postgrest.env | cut -d= -f2)
SECRET_KEY_BASE=$(openssl rand -hex 32)
ERL_AFLAGS='-proto_dist inet_tcp'
DNS_NODES=''
RLIMIT_NOFILE=10000
APP_NAME=bilge-arena-realtime
SEED_SELF_HOST=true
RUN_JANITOR=true
EOF
chmod 600 /opt/bilge-arena/secrets/realtime.env"
```

**Step 2: _realtime schema migration**

Realtime ilk kez ayaga kalkmadan once `_realtime` schema'sini olusturmak gerek:

```bash
ssh root@100.126.113.23 "
  source /opt/bilge-arena/secrets/db.env
  docker exec -i panola-postgres psql -U panola -d bilge_arena_dev << 'SQLEOF'
CREATE SCHEMA IF NOT EXISTS _realtime;
CREATE SCHEMA IF NOT EXISTS realtime;
GRANT USAGE ON SCHEMA _realtime, realtime TO bilge_arena_authenticator;
GRANT ALL ON ALL TABLES IN SCHEMA _realtime TO bilge_arena_authenticator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA _realtime TO bilge_arena_authenticator;
SQLEOF
"
```

**Step 3: Realtime ayaga kaldir + ilk seed'i bekle**

```bash
ssh root@100.126.113.23 "cd /opt/bilge-arena && docker compose up -d realtime"
sleep 30
ssh root@100.126.113.23 "docker logs bilge-arena-realtime --tail 50"
```

Expected log lines (Phoenix slow boot 30-60s normal):
- `[info] Running RealtimeWeb.Endpoint with Bandit ... at 0.0.0.0:4000`
- `[info] Tenant onboarded: bilge-arena`
- Hata varsa `RUN_JANITOR=true` ve `SEED_SELF_HOST=true` ile Postgres'e schema yazma yapildigini dogrula.

**Step 4: Health check**

```bash
ssh root@100.126.113.23 "
  curl -sS http://127.0.0.1:4000/api/health
  echo
  docker inspect -f '{{.State.Health.Status}}' bilge-arena-realtime
"
```

Expected: `{\"healthy\":true,...}` ve `healthy`.

**Step 5: Realtime publication setup**

```bash
ssh root@100.126.113.23 "
  docker exec -i panola-postgres psql -U panola -d bilge_arena_dev << 'SQLEOF'
-- WAL replication slot icin publication
CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
ALTER PUBLICATION supabase_realtime SET (publish = 'insert,update,delete');
SQLEOF
"
```

**Step 6: Commit**

```bash
# (Realtime config zaten Step 0.2'de docker-compose.yml'e eklendi)
mkdir -p infra/vps/bilge-arena/sql
cat > infra/vps/bilge-arena/sql/1_realtime_schemas.sql << 'EOF'
-- Bilge Arena realtime schemas + publication setup
CREATE SCHEMA IF NOT EXISTS _realtime;
CREATE SCHEMA IF NOT EXISTS realtime;
GRANT USAGE ON SCHEMA _realtime, realtime TO bilge_arena_authenticator;
CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
ALTER PUBLICATION supabase_realtime SET (publish = 'insert,update,delete');
EOF
git add infra/vps/bilge-arena/sql/1_realtime_schemas.sql
git commit -m "feat(infra): Realtime container + WAL publication"
```

---

### Task 0.4: Caddy SNI routing

**Files:**
- Modify on VPS: `panola-caddy` config (Caddyfile inside container volume)

**Step 1: Mevcut Caddyfile yedekle**

```bash
ssh root@100.126.113.23 "
  docker exec panola-caddy cat /etc/caddy/Caddyfile > /opt/backup/caddyfile-$(date +%Y%m%d-%H%M%S).bak
  echo 'Backup yazildi'
"
```

**Step 2: Yeni route'lari ekle**

```bash
ssh root@100.126.113.23 "
  docker exec -i panola-caddy sh -c 'cat >> /etc/caddy/Caddyfile << CADDYEOF

# Bilge Arena Sprint 0 dev endpoints
api-dev.bilgearena.com {
    reverse_proxy host.docker.internal:3001
    encode gzip
    log {
        output file /var/log/caddy/bilge-arena-api.log
        format json
    }
}

ws-dev.bilgearena.com {
    reverse_proxy host.docker.internal:4000
    encode gzip
    log {
        output file /var/log/caddy/bilge-arena-ws.log
        format json
    }
    # WebSocket upgrade
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket host.docker.internal:4000 {
        flush_interval -1
    }
}
CADDYEOF'
"
```

**Step 3: Caddy reload + cert acquisition**

```bash
ssh root@100.126.113.23 "docker exec panola-caddy caddy reload --config /etc/caddy/Caddyfile"
sleep 10
# Cert acquisition logu
ssh root@100.126.113.23 "docker logs panola-caddy --tail 30 | grep -E 'bilgearena|certificate'"
```

Expected: `obtained certificate for api-dev.bilgearena.com`, `obtained certificate for ws-dev.bilgearena.com`. ZeroSSL/LetsEncrypt 30-60s alir.

**Step 4: Public reachability test**

```bash
# F:/projelerim/bilge-arena lokal makineden
curl -sS https://api-dev.bilgearena.com/ | head
curl -sS https://ws-dev.bilgearena.com/api/health
```

Expected: PostgREST root response + Realtime healthy JSON.

**Step 5: Commit (Caddyfile snippet'i lokal repo'ya)**

```bash
mkdir -p infra/vps/caddy
cat > infra/vps/caddy/bilge-arena.Caddyfile << 'EOF'
# Bilge Arena dev endpoints (Sprint 0)
api-dev.bilgearena.com {
    reverse_proxy host.docker.internal:3001
    encode gzip
    log {
        output file /var/log/caddy/bilge-arena-api.log
        format json
    }
}

ws-dev.bilgearena.com {
    reverse_proxy host.docker.internal:4000
    encode gzip
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket host.docker.internal:4000 {
        flush_interval -1
    }
    log {
        output file /var/log/caddy/bilge-arena-ws.log
        format json
    }
}
EOF
git add infra/vps/caddy/bilge-arena.Caddyfile
git commit -m "feat(infra): Caddy SNI routes for api-dev + ws-dev"
```

---

### Task 0.5: Question pool sync script + cron (Secenek A)

**Files:**
- Create on VPS: `/opt/bilge-arena/scripts/questions-sync.sh`
- Modify on VPS: crontab

**Step 1: Sync script yaz**

```bash
ssh root@100.126.113.23 "mkdir -p /opt/bilge-arena/scripts /opt/bilge-arena/logs

cat > /opt/bilge-arena/scripts/questions-sync.sh << 'BASHEOF'
#!/usr/bin/env bash
# ============================================================
# Bilge Arena questions snapshot sync (Secenek A)
# ============================================================
# Mevcut Supabase pg_dump (02:00) icinden questions+categories
# tablolarini SELECT-only restore eder.
# Calisir: 02:30 TR (backup'tan 30 dk sonra)
# ============================================================
set -euo pipefail

DUMP=/opt/backup/bilge-arena/latest.sql.gz
DATE=\$(date +%Y-%m-%d)
LOG_FILE=/opt/bilge-arena/logs/questions-sync_\${DATE}.log
mkdir -p /opt/bilge-arena/logs

# Telegram notify (master backup.sh ile ayni)
ENV_FILE=/opt/backup/bilge-arena/.env
[ -f \"\$ENV_FILE\" ] && . \"\$ENV_FILE\"

log() { printf '[%s] %s\n' \"\$(date +%H:%M:%S)\" \"\$*\" | tee -a \"\$LOG_FILE\"; }

send_telegram() {
  local message=\"\$1\"
  if [ -n \"\${TELEGRAM_BOT_TOKEN:-}\" ] && [ -n \"\${TELEGRAM_CHAT_ID:-}\" ]; then
    curl -fsS -m 15 -X POST \"https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage\" \
      -H 'Content-Type: application/json' \
      -d \"{\\\"chat_id\\\":\${TELEGRAM_CHAT_ID},\\\"text\\\":\\\"\${message}\\\"}\" \
      > /dev/null 2>&1 || true
  fi
}

fail() { log \"ERROR: \$1\"; send_telegram \"Bilge Arena questions-sync HATASI\nTarih: \${DATE}\nHata: \$1\"; exit 1; }

if [ ! -f \"\$DUMP\" ]; then
  fail \"Dump yok: \$DUMP (gece backup'i kontrol et)\"
fi

START=\$SECONDS
log \"questions-sync basliyor, kaynak: \$DUMP\"

# 1) questions+categories+game_categories'i extract et
TMP_SQL=\$(mktemp)
trap \"rm -f \$TMP_SQL\" EXIT

zcat \"\$DUMP\" | grep -E '^(COPY public\\.(questions|categories|game_categories|games)|--)' -A 100000 \\
  | awk '/^COPY public\\.(questions|categories|game_categories|games)/{capture=1} /^\\\\.\$/{print; capture=0} capture' \\
  > \"\$TMP_SQL\"

LINES=\$(wc -l < \"\$TMP_SQL\")
[ \"\$LINES\" -lt 100 ] && fail \"Extracted SQL cok kucuk (\$LINES satir)\"

# 2) bilge_arena_dev'de TRUNCATE + restore
. /opt/bilge-arena/secrets/db.env
docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev << SQLEOF >> \"\$LOG_FILE\" 2>&1
BEGIN;
TRUNCATE public.questions, public.categories, public.game_categories, public.games CASCADE;
SQLEOF

docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev < \"\$TMP_SQL\" >> \"\$LOG_FILE\" 2>&1

docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -c \"COMMIT;\" >> \"\$LOG_FILE\" 2>&1

QC=\$(docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -t -c 'SELECT COUNT(*) FROM public.questions' | tr -d ' ')
DURATION=\$((SECONDS - START))

log \"OK: \$QC soru, \$LINES satir, \${DURATION}sn\"
send_telegram \"Bilge Arena questions-sync OK\nTarih: \${DATE}\nSoru: \${QC}\nSure: \${DURATION}sn\"
exit 0
BASHEOF

chmod +x /opt/bilge-arena/scripts/questions-sync.sh
echo 'Script kuruldu'"
```

**Step 2: TRUNCATE'in calisabilmesi icin once tablolar olusturulmali**

Bu task'in SQL prereq'i Sprint 1 PR1'in migration 040'inda olusur. Sprint 0'da TEST EDEMEYIZ — sadece scripti hazir tutariz. PR1 mergelendiginde elle bir kere calistir, sonra cron'a ekle.

**Step 3: Cron entry hazirla (PR1 sonrasi aktive edilecek)**

```bash
ssh root@100.126.113.23 "cat > /opt/bilge-arena/scripts/install-cron.sh << 'EOF'
#!/usr/bin/env bash
# PR1 mergelendikten sonra calistir
( crontab -l 2>/dev/null | grep -v 'questions-sync.sh' ; echo '30 2 * * * /opt/bilge-arena/scripts/questions-sync.sh >> /opt/bilge-arena/logs/cron.log 2>&1' ) | crontab -
echo 'Cron kuruldu: 02:30 TR daily'
EOF
chmod +x /opt/bilge-arena/scripts/install-cron.sh"
```

**Step 4: Commit**

```bash
mkdir -p infra/vps/bilge-arena/scripts
scp root@100.126.113.23:/opt/bilge-arena/scripts/questions-sync.sh infra/vps/bilge-arena/scripts/questions-sync.sh
scp root@100.126.113.23:/opt/bilge-arena/scripts/install-cron.sh infra/vps/bilge-arena/scripts/install-cron.sh
git add infra/vps/bilge-arena/scripts/
git commit -m "feat(infra): questions-sync.sh nightly snapshot script (Option A)"
```

---

### Task 0.6: Sprint 0 smoke test + rollback dokumani

**Files:**
- Create: `infra/vps/bilge-arena/SPRINT0-VERIFY.md`

**Step 1: End-to-end smoke test**

```bash
# 1. PostgREST authenticated request
curl -sS https://api-dev.bilgearena.com/ \
  -H 'Authorization: Bearer DUMMY_JWT' \
  | head -3

# 2. Realtime channel handshake (websocat or wscat)
# (Manual: tarayicidan ws-dev.bilgearena.com/socket aciliyor mu?)

# 3. DB row count baseline
ssh root@100.126.113.23 "docker exec panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -c '\\dt'"
```

Expected:
- PostgREST: `OpenAPI` JSON (anon-only, schema bos)
- Realtime: `426 Upgrade Required` icin GET (normal, websocat ile gercek upgrade test edilir)
- DB tables: bos liste (PR1 yapilana kadar)

**Step 2: Rollback dokumani**

```bash
cat > F:/projelerim/bilge-arena/infra/vps/bilge-arena/SPRINT0-VERIFY.md << 'MDEOF'
# Sprint 0 Verification + Rollback

## Smoke Test
1. `curl https://api-dev.bilgearena.com/` → JSON OpenAPI cevabi
2. `curl https://ws-dev.bilgearena.com/api/health` → `{"healthy":true}`
3. `psql -U bilge_arena_app -d bilge_arena_dev -c '\dt'` → 0 satir (PR1'e kadar normal)
4. Telegram bot: master backup OK + questions-sync TBD (PR1 sonrasi)

## Rollback
Acil durum (DB corrupt, Realtime crashed loop):

```bash
ssh root@100.126.113.23 "
  cd /opt/bilge-arena
  docker compose down -v
  docker exec panola-postgres psql -U panola -c 'DROP DATABASE bilge_arena_dev;'
  docker exec panola-postgres psql -U panola -c 'DROP ROLE bilge_arena_app, bilge_arena_authenticator, authenticated, anon, service_role;'
  docker exec panola-caddy sh -c 'sed -i \"/bilgearena/,/^}/d\" /etc/caddy/Caddyfile && caddy reload'
"
```

Production etkisi: SIFIR. bilge-arena Next.js app halen Supabase'e bagli, oda sistemi sadece dev environment'da.

MDEOF
```

**Step 3: PR aci ve mergele**

```bash
cd F:/projelerim/bilge-arena
git add infra/vps/bilge-arena/SPRINT0-VERIFY.md
git commit -m "docs(infra): Sprint 0 smoke test + rollback runbook"
git push -u origin feat/oda-sistemi-sprint0
gh pr create --title "feat(infra): Sprint 0 — VPS oda-sistemi foundation" --body "$(cat <<'EOF'
## Summary

Sprint 0 foundation: VPS bilge_arena_dev DB + PostgREST + Realtime + Caddy SNI routing. Supabase'e DDL/data muhdahale yok, JWT secret read-only kopyalanmis.

## Test plan

- [x] DB role login: `psql -U bilge_arena_app -d bilge_arena_dev -c 'SELECT 1'`
- [x] PostgREST root: `curl https://api-dev.bilgearena.com/`
- [x] Realtime health: `curl https://ws-dev.bilgearena.com/api/health` → `healthy:true`
- [ ] questions-sync.sh dry-run (PR1 sonrasi aktive olur)

## Production impact

Sifir. Mevcut bilge-arena Next.js app halen Supabase'e bagli. Sprint 1 PR3 (API routes) ile iki sistem konusmaya baslar.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Sprint 1: MVP Build (1 hafta, 7 PR)

### PR1 — Migration 040: Tablolar + RLS + View + Cron

Branch: `feat/oda-pr1-migration-040`

**Files:**
- Create: `database/migrations/040_rooms.sql`
- Create: `database/migrations/040_rooms_test.sql` (pgTAP)
- Modify: `infra/vps/bilge-arena/scripts/install-cron.sh` (PR1 sonrasi questions-sync aktive)

#### Task 1.1: Tablo DDL (rooms, room_members, room_rounds, room_answers, room_reactions, room_audit_log)

**Step 1: Test once — pgTAP file**

```bash
cat > database/migrations/040_rooms_test.sql << 'EOF'
BEGIN;
SELECT plan(12);

-- Tablolar
SELECT has_table('public', 'rooms', 'rooms tablosu var');
SELECT has_table('public', 'room_members', 'room_members tablosu var');
SELECT has_table('public', 'room_rounds', 'room_rounds tablosu var');
SELECT has_table('public', 'room_answers', 'room_answers tablosu var');
SELECT has_table('public', 'room_reactions', 'room_reactions tablosu var');
SELECT has_table('public', 'room_audit_log', 'room_audit_log tablosu var');

-- Constraint
SELECT col_has_check('public', 'rooms', 'mode', 'mode CHECK var');
SELECT col_has_check('public', 'rooms', 'state', 'state CHECK var');

-- Index
SELECT has_index('public', 'rooms', 'rooms_host_idx', 'host_id partial idx');
SELECT has_index('public', 'rooms', 'rooms_archive_idx', 'archive partial idx');

-- View
SELECT has_view('public', 'room_round_question_view', 'anti-cheat view var');

-- RLS enabled
SELECT is(row_security_active('public.rooms'::regclass), TRUE, 'RLS rooms aktif');

SELECT * FROM finish();
ROLLBACK;
EOF
```

**Step 2: Test calistir, FAIL gor**

```bash
ssh root@100.126.113.23 "docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -f -" \
  < database/migrations/040_rooms_test.sql
```

Expected: 12 fail (`Table public.rooms does not exist` vb.). Test "feature missing" diye fail ediyor.

**Step 3: Migration 040 yaz**

Design doc Bolum 2'deki SQL'i tam kopyala. Tek farklar:
- `auth.users(id)` FK'leri kaldir (`user_id UUID NOT NULL` yap, FK yok)
- `host_id UUID NOT NULL` (FK yok)
- `actor_id UUID` (zaten FK'siz)

```sql
-- database/migrations/040_rooms.sql
-- Bilge Arena Oda Sistemi: tablolar + RLS + view + cron
-- VPS-first deployment (auth.users FK YOK; user_id integrity app-level)

BEGIN;

CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL CHECK (char_length(code) = 6 AND code ~ '^[A-Z2-9]+$'),
  host_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  game_slug TEXT NOT NULL,
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
  archive_after TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX rooms_host_idx ON rooms(host_id) WHERE state IN ('waiting','in_progress','paused');
CREATE INDEX rooms_archive_idx ON rooms(archive_after) WHERE state = 'archived';
CREATE INDEX rooms_code_idx ON rooms(code) WHERE state IN ('waiting','in_progress');

CREATE TABLE room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','left','kicked','banned')),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 24),
  emoji TEXT,
  score INT NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX room_members_user_idx ON room_members(user_id) WHERE state = 'active';

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

CREATE TABLE room_answers (
  round_id UUID NOT NULL REFERENCES room_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  choice_index INT NOT NULL CHECK (choice_index BETWEEN 0 AND 4),
  response_ms INT NOT NULL CHECK (response_ms BETWEEN 0 AND 120000),
  is_correct BOOLEAN NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (round_id, user_id)
);

CREATE TABLE room_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sticker_id INT NOT NULL CHECK (sticker_id BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX room_reactions_recent_idx ON room_reactions(room_id, created_at DESC);

CREATE TABLE room_audit_log (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_log_room_idx ON room_audit_log(room_id, created_at);
CREATE INDEX audit_log_retention_idx ON room_audit_log(created_at);

-- Anti-cheat view
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

-- Permissions
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_audit_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON room_round_question_view TO authenticated;
REVOKE SELECT ON questions FROM authenticated, anon;

COMMIT;
```

**Step 4: Test calistir, PASS bekle**

```bash
# Once 040.sql apply
ssh root@100.126.113.23 "docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -f -" \
  < database/migrations/040_rooms.sql

# Sonra test
ssh root@100.126.113.23 "docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -f -" \
  < database/migrations/040_rooms_test.sql
```

Expected: `12/12 PASS`. Hata varsa migration'i duzelt.

**Step 5: Commit**

```bash
git add database/migrations/040_rooms.sql database/migrations/040_rooms_test.sql
git commit -m "feat(db): migration 040 oda sistemi tablolar + view + RLS"
```

#### Task 1.2: RLS policies (6 tablo, ~12 policy)

**Step 1: Test (pgTAP) — RLS smoke**

```bash
cat >> database/migrations/040_rooms_test.sql << 'EOF'
-- RLS: anon disinda
SELECT throws_ok(
  $$SET LOCAL ROLE anon; SELECT * FROM rooms LIMIT 1$$,
  '42501',
  'permission denied for table rooms',
  'anon rooms select banned'
);
EOF
```

**Step 2: Yaz — Migration 041 olur**

Tasarim Bolum 2'deki RLS matrix'i `CREATE POLICY` SQL'lerine ac. Her tablo icin SELECT/INSERT/UPDATE/DELETE policy. Service_role bypass otomatik (BYPASSRLS role).

```sql
-- database/migrations/041_rooms_rls.sql
BEGIN;

-- rooms: host or active member SELECT, authenticated INSERT (kendi host_id)
CREATE POLICY rooms_select_member ON rooms FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR EXISTS (
    SELECT 1 FROM room_members rm
    WHERE rm.room_id = id AND rm.user_id = auth.uid() AND rm.state = 'active'
  ));

CREATE POLICY rooms_insert_self ON rooms FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY rooms_update_host ON rooms FOR UPDATE TO authenticated
  USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());

-- room_members: only via RPC (service_role); SELECT for active members
CREATE POLICY room_members_select_member ON room_members FOR SELECT TO authenticated
  USING (state = 'active' AND EXISTS (
    SELECT 1 FROM room_members rm
    WHERE rm.room_id = room_members.room_id AND rm.user_id = auth.uid() AND rm.state = 'active'
  ));

-- (devami: room_rounds, room_answers, room_reactions, room_audit_log)
-- Detay icin design doc Bolum 2 RLS matrix tablosu.

COMMIT;
```

**Step 3: Test calistir, PASS bekle, commit**

```bash
ssh root@100.126.113.23 "docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -f -" \
  < database/migrations/041_rooms_rls.sql

git add database/migrations/041_rooms_rls.sql
git commit -m "feat(db): RLS policies oda sistemi tablolari"
```

#### Task 1.3: pg_cron schedules (3 schedule)

**Step 1: Yaz — Migration 042**

```sql
-- database/migrations/042_rooms_cron.sql
SELECT cron.schedule('rooms-archive-purge', '0 3 * * *',
  $$DELETE FROM rooms WHERE state = 'archived' AND archive_after < NOW()$$);

SELECT cron.schedule('rooms-archive-transition', '15 3 * * *',
  $$UPDATE rooms SET state = 'archived'
    WHERE state = 'finished' AND finished_at < NOW() - INTERVAL '7 days'$$);

SELECT cron.schedule('audit-retention', '30 3 * * 0',
  $$DELETE FROM room_audit_log WHERE created_at < NOW() - INTERVAL '1 year'$$);

-- Verify
SELECT * FROM cron.job WHERE jobname LIKE 'rooms-%' OR jobname = 'audit-retention';
```

**Step 2: Apply + verify + commit**

```bash
ssh root@100.126.113.23 "docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -f -" \
  < database/migrations/042_rooms_cron.sql

git add database/migrations/042_rooms_cron.sql
git commit -m "feat(db): pg_cron retention schedules (KVKK)"
```

#### Task 1.4: questions-sync activation

**Step 1: Cron'u aktive et**

```bash
ssh root@100.126.113.23 "/opt/bilge-arena/scripts/install-cron.sh"
ssh root@100.126.113.23 "crontab -l | grep questions-sync"
```

Expected: `30 2 * * * /opt/bilge-arena/scripts/questions-sync.sh ...`

**Step 2: Manuel ilk sync (verification)**

```bash
ssh root@100.126.113.23 "/opt/bilge-arena/scripts/questions-sync.sh"
```

Expected: `OK: NNNN soru, ... Telegram mesaji geldi`. Hata varsa Task 0.5 scriptini debug et.

**Step 3: PR aci**

```bash
git push -u origin feat/oda-pr1-migration-040
gh pr create --title "feat(db): PR1 — Migration 040+041+042 oda sistemi tablolari"
```

---

### PR2 — PL/pgSQL Server Functions

Branch: `feat/oda-pr2-rpc`

**Files:**
- Create: `database/migrations/043_rooms_rpc.sql`
- Create: `database/migrations/043_rooms_rpc_test.sql` (pgTAP race tests)

#### Task 2.1: `start_room(p_room_id, p_host_id)` — draft → waiting + question_pool secimi

**Step 1: pgTAP test — yetki + state transition**

```sql
-- 043_rooms_rpc_test.sql
BEGIN;
SELECT plan(8);

-- Setup
INSERT INTO rooms (id, code, host_id, title, game_slug, question_count)
  VALUES ('11111111-1111-1111-1111-111111111111', 'TEST01',
          '22222222-2222-2222-2222-222222222222', 'Test', 'bilge-arena', 5);

-- Test
SELECT lives_ok(
  $$SELECT start_room('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid)$$,
  'Host start eder'
);

SELECT is(
  (SELECT state FROM rooms WHERE id = '11111111-1111-1111-1111-111111111111'),
  'waiting',
  'state waiting oldu'
);

SELECT throws_ok(
  $$SELECT start_room('11111111-1111-1111-1111-111111111111'::uuid, '99999999-9999-9999-9999-999999999999'::uuid)$$,
  'P0001',
  'sadece host start edebilir',
  'host disinda yetkisiz'
);

-- (devami: idempotency, question_pool boyutu, audit log entry, ...)

SELECT * FROM finish();
ROLLBACK;
```

**Step 2: Verify test FAIL**

```bash
ssh root@100.126.113.23 "docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -f -" < database/migrations/043_rooms_rpc_test.sql
```

Expected: `function start_room does not exist`.

**Step 3: Function yaz**

```sql
-- 043_rooms_rpc.sql (parca)
CREATE OR REPLACE FUNCTION public.start_room(p_room_id UUID, p_host_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room rooms%ROWTYPE;
  v_pool UUID[];
BEGIN
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi' USING ERRCODE = 'P0002';
  END IF;
  IF v_room.host_id <> p_host_id THEN
    RAISE EXCEPTION 'sadece host start edebilir' USING ERRCODE = 'P0001';
  END IF;
  IF v_room.state <> 'draft' THEN
    RAISE EXCEPTION 'Oda zaten % durumunda', v_room.state USING ERRCODE = 'P0003';
  END IF;

  -- Question pool secimi
  SELECT array_agg(id) INTO v_pool FROM (
    SELECT id FROM questions
    WHERE game = v_room.game_slug
      AND (v_room.category IS NULL OR category = v_room.category)
      AND (v_room.difficulty IS NULL OR difficulty = v_room.difficulty)
    ORDER BY random()
    LIMIT v_room.question_count
  ) t;

  IF array_length(v_pool, 1) < v_room.question_count THEN
    RAISE EXCEPTION 'Yeterli soru yok (% bulundu, % gerek)', array_length(v_pool, 1), v_room.question_count
      USING ERRCODE = 'P0004';
  END IF;

  UPDATE rooms
    SET state = 'waiting', metadata = metadata || jsonb_build_object('question_pool', v_pool), started_at = NOW()
    WHERE id = p_room_id;

  INSERT INTO room_audit_log (room_id, actor_id, action, details)
    VALUES (p_room_id, p_host_id, 'room_started', jsonb_build_object('pool_size', v_room.question_count));
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_room(UUID, UUID) TO authenticated;
```

**Step 4: Test PASS, commit**

```bash
git add database/migrations/043_rooms_rpc.sql database/migrations/043_rooms_rpc_test.sql
git commit -m "feat(db): start_room RPC + pgTAP host yetki + state transition"
```

#### Task 2.2: `join_room(p_code, p_user_id, p_display_name, p_emoji)`

Yapi Task 2.1 ile ayni. Test once (max_players check, state must be `waiting`, display_name unique-per-room), sonra implementation, sonra pass + commit.

#### Task 2.3: `next_question(p_room_id, p_caller_id)` — race-safety + idempotency

**Step 1: Race test (pgTAP + pg_dbench paralel)**

```sql
-- 50 paralel start_room call → tek round
DO $$
BEGIN
  PERFORM pg_background_launch('SELECT next_question(...)') FROM generate_series(1, 50);
END $$;

SELECT is((SELECT COUNT(*) FROM room_rounds WHERE room_id = '11111111...'), 1::bigint, 'sadece 1 round');
```

**Step 2: Function yaz** — `FOR UPDATE` lock, `UNIQUE(room_id, round_number)` idempotency, audit.

**Step 3: PASS, commit.**

#### Task 2.4: `submit_answer` — anti-cheat + double-submit

Test once (deadline, correct_revealed=false iken correct_index leak, double submit 23505). Sonra impl + pass + commit.

#### Task 2.5: `auto_relay_tick()` pg_cron her saniye

```sql
SELECT cron.schedule('rooms-auto-relay', '* * * * * *', 'SELECT public.auto_relay_tick()');
```

Test: mock room mode=auto_relay deadline+2s sonra otomatik next round. Sonra impl + pass + commit.

#### Task 2.6: leave_room/kick_member/pause/resume/cancel/finish/report_member

7 fonksiyon, her biri minimal pgTAP (yetki + state + audit). Toplam ~150 LOC SQL.

#### Task 2.7: PR aci

```bash
git push -u origin feat/oda-pr2-rpc
gh pr create --title "feat(db): PR2 — PL/pgSQL server functions + race-safety pgTAP"
```

---

### PR3 — API Routes

Branch: `feat/oda-pr3-api`

**Files:**
- Create: `src/lib/rooms/client.ts` (PostgREST client factory)
- Create: `src/lib/rooms/types.ts` (TS types)
- Create: `src/app/api/rooms/route.ts` (POST = create room)
- Create: `src/app/api/rooms/join/route.ts` (POST = join by code)
- Create: `src/app/api/rooms/[id]/start/route.ts`
- Create: `src/app/api/rooms/[id]/answer/route.ts`
- Create: `src/app/api/rooms/[id]/next/route.ts`
- Create: `src/app/api/rooms/[id]/route.ts` (GET = state)
- Create: `src/lib/rooms/__tests__/client.test.ts`
- Create: `src/app/api/rooms/__tests__/*.test.ts`
- Modify: `.env.example`, `.env.local`

#### Task 3.1: PostgREST client factory

**Step 1: Vitest test**

```typescript
// src/lib/rooms/__tests__/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRoomsClient } from '../client';

describe('createRoomsClient', () => {
  it('Authorization header eklenmeli', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]'));
    global.fetch = fetchMock;

    const client = createRoomsClient({ jwt: 'TOKEN', baseUrl: 'https://x' });
    await client.from('rooms').select();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://x/rooms'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer TOKEN' }),
      })
    );
  });
});
```

**Step 2: Run, FAIL**

```bash
npm test src/lib/rooms/__tests__/client.test.ts
```

**Step 3: Implement minimal**

```typescript
// src/lib/rooms/client.ts
export function createRoomsClient({ jwt, baseUrl }: { jwt: string; baseUrl: string }) {
  return {
    from(table: string) {
      return {
        async select() {
          const res = await fetch(`${baseUrl}/${table}`, {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
          });
          return res.json();
        },
        async insert(rows: Record<string, unknown>[]) {
          const res = await fetch(`${baseUrl}/${table}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify(rows),
          });
          return res.json();
        },
        async rpc(fn: string, args: Record<string, unknown>) {
          const res = await fetch(`${baseUrl}/rpc/${fn}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(args),
          });
          if (!res.ok) throw new Error(`RPC ${fn} ${res.status}`);
          return res.json();
        },
      };
    },
  };
}
```

**Step 4: PASS, commit.**

#### Task 3.2: POST /api/rooms (create)

**Step 1: Vitest test** — happy path + Zod validation + 401 unauth.

**Step 2: Route yaz** — `createClient()` ile Supabase user al → `createRoomsClient()` ile VPS'e POST `rooms` → RPC `start_room` cagir.

**Step 3: PASS, commit.**

#### Task 3.3-3.7: Diger route'lar

Her biri ayni pattern: Zod schema → auth check → VPS RPC call → response. Test once, FAIL, implement, PASS, commit.

#### Task 3.8: Env hardening

```bash
# .env.example yeni satir
NEXT_PUBLIC_BILGE_ROOMS_URL=https://api-dev.bilgearena.com
NEXT_PUBLIC_BILGE_REALTIME_URL=wss://ws-dev.bilgearena.com

git add .env.example .env.local
git commit -m "chore(env): VPS rooms endpoints"
```

#### Task 3.9: PR aci

```bash
git push -u origin feat/oda-pr3-api
gh pr create --title "feat(api): PR3 — /api/rooms/* routes + PostgREST client"
```

---

### PR4 — Lobby UI

Branch: `feat/oda-pr4-lobby`

**Files:**
- Create: `src/app/(player)/oda/page.tsx` (active rooms list)
- Create: `src/app/(player)/oda/yeni/page.tsx` (create form)
- Create: `src/app/(player)/oda/kod/page.tsx` (join by code)
- Create: `src/lib/rooms/use-room-channel.ts` (Realtime hook)
- Create: `src/lib/rooms/use-rooms-list.ts` (SWR-style)
- Create: `e2e/oda-lobby.spec.ts` (Playwright multi-tab)

#### Task 4.1: useRoomChannel hook

**Step 1: Test (mock channel)** — 3 events trigger setLatestRound, setReaction, setPresence.

**Step 2: Implement** — design doc Bolum 3 SQL ile uyumlu (`postgres_changes` + `broadcast` + `presence`).

**Step 3: PASS, commit.**

#### Task 4.2: /oda page

Mevcut `dashboard/page.tsx` patternini takip et. SSR data fetch + Suspense + Skeleton.

#### Task 4.3: /oda/yeni — create form

Form fields: title, game_slug, category, difficulty, question_count, mode, max_players, per_question_seconds. Zod schema'yi PR3'tekiyle paylaslar (`src/lib/rooms/schemas.ts` extracted).

#### Task 4.4: /oda/kod — join by code

6-char A-Z2-9 input + display_name + emoji picker.

#### Task 4.5: Playwright multi-tab test

```typescript
// e2e/oda-lobby.spec.ts
test('iki tab ayni oda goruyor', async ({ context }) => {
  const tabA = await context.newPage();
  const tabB = await context.newPage();

  await tabA.goto('/oda/yeni');
  await tabA.fill('[name="title"]', 'Test Odasi');
  await tabA.click('button[type="submit"]');
  const url = tabA.url();
  const code = await tabA.locator('[data-testid="room-code"]').textContent();

  await tabB.goto('/oda/kod');
  await tabB.fill('[name="code"]', code!);
  await tabB.fill('[name="display_name"]', 'Player2');
  await tabB.click('button[type="submit"]');

  await expect(tabA.locator('[data-testid="member-count"]')).toHaveText('2', { timeout: 5000 });
});
```

#### Task 4.6: PR aci

---

### PR5 — Game UI

Branch: `feat/oda-pr5-game`

**Files:**
- Create: `src/app/(player)/oda/[id]/page.tsx`
- Create: `src/components/oda/QuestionDisplay.tsx`
- Create: `src/components/oda/Countdown.tsx`
- Create: `src/components/oda/Scoreboard.tsx`
- Create: `src/components/oda/PauseModal.tsx`
- Create: `e2e/oda-sync.spec.ts`

#### Task 5.1-5.4: Komponentler

Her biri Vitest snapshot + Playwright sync test (round basladi → diger tab 500ms icinde gormeli).

#### Task 5.5: PR aci

---

### PR6 — Score Card + Share

Branch: `feat/oda-pr6-share`

**Files:**
- Create: `src/app/api/rooms/[id]/score-card/route.ts` (`@vercel/og`)
- Create: `src/components/oda/ShareSheet.tsx`
- Create: `e2e/oda-share.spec.ts` (visual regression)

#### Task 6.1: ImageResponse template

Design doc Bolum 6'daki TSX kopyalanir. 1200x630, top 3 oyuncu + Bilge Baykus + oda kodu + tarih. Brand renkleri kosulu (mevcut `tailwind.config.ts`'ten primary/accent).

#### Task 6.2: Share button

WhatsApp Web Share API (`navigator.share`), Twitter intent fallback (`https://twitter.com/intent/tweet?text=...&url=...`).

#### Task 6.3: Visual regression test

Playwright `expect(page).toHaveScreenshot('score-card.png', { maxDiffPixels: 100 })`.

#### Task 6.4: PR aci

---

### PR7 — Stickers + Abuse + KVKK Cron

Branch: `feat/oda-pr7-finalize`

**Files:**
- Create: `public/stickers/bilge-1-bilge.png` ... `bilge-8-helal.png` (placeholder emoji until illustrator)
- Create: `src/lib/moderation/tr-profanity.ts` (~150 word)
- Create: `src/components/oda/StickerPicker.tsx`
- Create: `database/migrations/044_reaction_rate_limit.sql`
- Create: `e2e/oda-abuse.spec.ts`

#### Task 7.1: Sticker assets (placeholder)

8 sticker icin placeholder (256x256 emoji-rendered PNG). Illustrator brief bekliyor — placeholder ile launch'a hazir oluyoruz, sonra gercek asset'lerle replace ederiz.

```bash
# Placeholder generate (Pillow ile)
python3 scripts/generate-sticker-placeholders.py
```

#### Task 7.2: Sticker picker + broadcast

Bottom sheet, 8 sticker, tap → realtime channel `broadcast({ event: 'reaction', payload: { sticker_id, user_id } })`.

#### Task 7.3: TR_PROFANITY filter + display name validation

Mevcut `src/lib/utils/tr-locale.ts` (trLower) kullan. Reject + suggest alternative.

#### Task 7.4: Reaction rate-limit trigger

```sql
-- 044_reaction_rate_limit.sql
CREATE OR REPLACE FUNCTION enforce_reaction_rate() RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM room_reactions
  WHERE room_id = NEW.room_id
    AND user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '60 seconds';
  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Cok hizli reaction (60s icinde 5+)' USING ERRCODE = 'P0010';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER room_reactions_rate_limit
  BEFORE INSERT ON room_reactions
  FOR EACH ROW EXECUTE FUNCTION enforce_reaction_rate();
```

#### Task 7.5: KVKK cron verification

```bash
# Manuel run + verify
ssh root@100.126.113.23 "docker exec panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -c \"
  SELECT public.archive_old_rooms();
  SELECT COUNT(*) AS archived FROM rooms WHERE state='archived';
\""
```

#### Task 7.6: PR aci

---

## Sprint 1 Done Definition

| Acceptance | Test |
|---|---|
| 8 oyuncu max, kod paylasimi calisir | E2E `oda-lobby.spec.ts` |
| 5/8/12 round sync mode | E2E `oda-sync.spec.ts` |
| Round timer client+server <1s drift | Playwright + log |
| correct_index reveal'dan once asla client | Security curl + RLS test |
| Score card 1200x630 PNG | Playwright visual |
| 8 sticker calisir (placeholder OK) | Manual + E2E |
| KVKK cron her gun | Manual run + log |
| TR_PROFANITY filter | Vitest |
| Realtime channel RLS gate | Manual: anon ile join → fail |

---

## Execution Discipline

### TDD per task

1. Test yaz (RED)
2. Run, FAIL gor
3. Minimal kod (GREEN)
4. Run, PASS gor
5. Refactor
6. Commit

Sapma yapmadan bu siklikla devam et. `superpowers:test-driven-development` skill'i.

### Commit pattern

`<type>(<scope>): <imperative summary>` — type: feat/fix/docs/refactor/test/chore. Scope: db/api/ui/infra/oda. Bilge Arena conventions.

### Bug discovery during implementation

Yeni bug bulursan: stop, RED test yaz, fix, GREEN, commit. Asla "while I'm here" ekleme.

### Sprint 0 sonu — production etki kontrol

Sprint 0 mergelendiginde hemen verify:

```bash
# Mevcut bilge-arena Next.js app SOL kalmali
curl -sS https://bilgearena.com | grep -i 'oda' || echo 'OK: ana app etkilenmedi'

# Dev endpoints calismali
curl -sS https://api-dev.bilgearena.com/ | jq -r '.swagger // "OK"'
curl -sS https://ws-dev.bilgearena.com/api/health | jq '.healthy'
```

### Sprint 2 — Production rollout (PR8+, ayri plan)

PR1-7 tamamlandiktan sonra:
- Migration 040+041+042+044 prod (managed Supabase) schema
- Feature flag `ROOMS_ENABLED` env-driven, %0 → %5 → %25 → %100 (4 gun)
- Beta: 50 kisi (premium waitlist)
- Grafana dashboard: oda count, p99 reveal latency, hata orani
- 7 gun stable → public launch

Production rollout plani Sprint 1 done sonrasi yazilir (writing-plans tekrar).

---

## Open Questions Resolved (PR baslarken sabitlenecek)

Design doc'taki "Open Decisions" listesi:

1. **Question pool secim algoritmasi**: PR2 Task 2.1'de — `ORDER BY random()` LIMIT N (basic), weighted P1.
2. **Score formula**: PR2 Task 2.4'te — `is_correct ? max(0, 1000 - response_ms) : 0` (basic, difficulty multiplier P1).
3. **Display name policy**: PR4 Task 4.4 + PR7 Task 7.3 — max 24 char, emoji allowed, profanity reject (sansurleme degil).
4. **Empty-room cleanup**: PR2 Task 2.6 (cancel_room) — host disconnect 5dk presence yok → `host_canceled`.
5. **Score card share**: PR6 Task 6.2 — Web Share API primary, Twitter intent fallback.

Bunlar PR'in basinda netlestirilir, gerek olursa tasarim guncellenir.

---

## Toplam Effort Estimate

| Sprint | Suresi | Effort |
|---|---|---|
| Sprint 0 | 3 gun | ~12 saat (paralel insan + Claude assist) |
| PR1 | 1 gun | ~6 saat |
| PR2 | 1.5 gun | ~10 saat |
| PR3 | 1 gun | ~6 saat |
| PR4 | 1 gun | ~5 saat |
| PR5 | 1 gun | ~6 saat |
| PR6 | 0.5 gun | ~3 saat |
| PR7 | 1 gun | ~5 saat |
| **Toplam** | **10 gun (2 hafta calisma)** | **~53 saat** |

P0 launch 4 hafta hedefi rahat tutturulur: Sprint 0 + Sprint 1 = 2 hafta, Sprint 2 = 1 hafta, buffer 1 hafta (illustrator + NetGSM + beta).
