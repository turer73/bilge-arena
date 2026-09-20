# Klipper isolated academy test environment

Not a production deployment or complete application database clone.

## Gameplay available (2026-09-20)

Use http://localhost:3137/__test/login and choose a synthetic account. Entry now
opens **Mathematics / TYT**. Pick Classic, Practice, Exam, Blitz, Marathon or
Boss and start. Questions, server grading, explanations, result saving, XP,
coins and replay protection use the real application pipeline.

- 1,200 synthetic Mathematics questions: 200 each for Sayılar, Problemler,
  Geometri, Denklemler, Fonksiyonlar and Olasılık; five difficulty values.
- 100 each for Turkish/Paragraf, Science/Fizik, Social/Tarih and English/Vocabulary.
- Every fixture says `Test sorusu`; difficulty values exercise the UI, not a
  calibrated difficulty scale. This is NOT a reviewed curriculum/exam bank.
- TYT only for the four Turkish-language subjects. English is YDT vocabulary.
  Other exam/category filters are not seeded; no claim of all-site readiness.

`academy_game_test` is a database clone of the original isolated Auth fixture,
not production. Auth identities and sessions were retained. The minimal public
schema is archived as `academy_fixture_v0`, denied to API roles. The original
`academy_auth_test` database and independent room DB/data remain present.

### Reproducible upgrade

Run `bash game-bootstrap.sh` from the dedicated Compose directory. It refuses
another path/project/database, records source SHA-256 hashes, and applies each
file with a transactional ledger. Failed files roll back. It does not switch
services. After successful bootstrap:

```sh
docker compose -f compose.yaml -f compose.game.yaml up -d auth auth-rest
docker compose exec -T app node infra/test/klipper/auth-smoke.mjs --game-schema
docker compose exec -T app node infra/test/klipper/game-smoke.mjs
```

Use **both Compose files for future `up` operations**, or Auth/REST would revert
to the minimal database. `start`, `stop`, `exec` preserve existing configuration.
Rollback requires explicit review of Auth session divergence and migration 204's
cluster-level `authenticator` pre-request setting; don't blindly revert services.

The gameplay manifest uses baseline + migrations 001–178, 185–186, 203–204.
Families 179–184, 187–202, 205–211 remain explicitly deferred, not marked applied:
their curriculum/institution release evidence is not supplied by synthetic rows.
All curriculum release flags are draft and diagnostic disabled in this fixture.
An attempted 179 release correctly failed coverage and rolled back. Institution,
discovery diagnosis and the feature-flagged TYT Social V2 branch are not certified.

Historical clean-install compatibility is explicit, test-only, and does not
change product SQL files: 004 before 003; 017 homepage before 016b; remove 044's
superseded five-argument random RPC before 046; rename the actual disposable-email
trigger function to the name required by 090; provide pgcrypto in `extensions`;
seed a banned, passwordless quality-control identity for 148. The baseline's
legacy apostrophe escaping and concurrent-index wrappers are normalized only for
transactional application in the isolated empty schema. Storage has catalog-only
compatibility tables, not a working Storage service. Security migrations remain
active: answer keys and privileged DML are not opened to browser roles.

### Observed gameplay evidence

- Real auth for three accounts; route-only own profile access, direct profile
  SELECT denied, XP/admin PATCH denied, anonymous profile SELECT denied.
- Six API-completed modes: 10 + 5 + 20 + 5 + 10 + 40 = **90 persisted answers**.
  One deliberately wrong answer in each; exact server counts matched.
- Three identical completion replays: same session and XP, no new XP/coins/stats.
- Another user's attempt could not be graded; public question payloads contained
  no answer/solution; four other subject pools issued real verified attempts.
- Real desktop browser: Practice 10/10, result `İlerlemen kaydedildi`, 560 saved XP
  and 6 coins (daily cap had been partly consumed by smoke tests).
- Browser Exam start displayed `1 / 40` and the running 45-minute countdown.
  Test entry redirected into Mathematics/TYT. Existing room RPC lifecycle also
  passed again: three members, 15 answers, completed, 14,985 awarded points.
- A browser-observed inherited-scroll bug was fixed: new questions/results start
  at the top, answer feedback does not jump. 35 targeted tests, TypeScript and
  targeted lint passed. No production push/deployment was made.

Run counts/rewards change across repeated smoke runs. This is not proof of
multiplayer WebSocket, production Redis, OAuth, institution pilots or question quality.

## Access

Source: `95d41a0f` plus the local create-room RPC parameter fix and this directory.
Remote checkout: `/home/klipperos/bilge-arena-academy-test/source`.
Compose project: `bilge-arena-academy-test`.

On Windows, keep this SSH tunnel open (the current session started it hidden):

```powershell
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:3137:127.0.0.1:3137 klipperos@100.84.251.49
```

Open **http://localhost:3137/__test/login** (use `localhost`, not the IP).
Choose host, player1 or player2. These are synthetic, non-admin users using
real GoTrue sessions, not mock tokens. Separate browser profiles are needed
for simultaneous users. The entry is a test-only service, not a Next route.

The room fixture has 10 synthetic **Denklemler / Kolay (2)** questions.
Choose Hızlı Düello or customize to 5–10 questions and difficulty 2.
Other categories, 15-question presets and async mode are not seeded/tested.

## Isolation and limits

- Eight dedicated containers, a dedicated bridge and two dedicated volumes.
- Gateway only binds host `127.0.0.1:3137`; Mailpit UI only `127.0.0.1:55325`.
- Databases, GoTrue admin and room REST have no host/public ports.
- No production secrets, database rows, Google OAuth or SMTP relay are used.
- New credentials live only in server-side `.env` (0600); session fixture is
  `test-sessions.json` (0600). Never print, commit or distribute either.
- Signup is disabled; account entry is restricted to three pre-created users,
  exact localhost origin and a same-site CSRF-protected POST.
- The original Auth fixture is minimal; the current gameplay upgrade described
  above adds the real gameplay chain, but not every curriculum/institution release.
- Next runs in development; rate limits use single-process in-memory fallback.
  The test gateway's self-only CSP blocks production analytics/room WebSocket
  connections; related blocked-resource warnings are expected here.
  Production Redis behavior, WebSocket Realtime/presence, async rooms and
  Google/legal-consent callback flow remain unverified.
- Tailscale HTTPS was unavailable for this account; the attempted Serve config
  was removed. SSH provides the encrypted transport and localhost secure context.

## Recreate on a new, empty dedicated directory

Upload a reviewed `git archive` of the source plus these files. Never upload
local `.env`, `.git`, production backups or `node_modules`.
In `source/infra/test/klipper`:

```sh
node setup-env.mjs  # refuses existing env and other directories
docker compose config --quiet
docker compose up -d auth-db rooms-db auth auth-rest mailpit gateway
# Wait for GET http://127.0.0.1:3137/auth/v1/health to return 200.
docker compose exec -T auth-db psql -U postgres -d academy_auth_test -v ON_ERROR_STOP=1 < auth-fixture.sql
docker compose restart auth-rest
set -a; . ./.env; set +a
ROOM_COMPOSE_PROJECT=bilge-arena-academy-test bash room-bootstrap.sh
docker compose up -d rooms-rest app
# Wait for dependency install and Next readiness.
docker compose exec -T app node infra/test/klipper/auth-smoke.mjs
docker compose exec -T app node infra/test/klipper/room-smoke.mjs
```

`room-bootstrap.sh` refuses an unmarked existing database. It does not erase or
silently continue after a partial migration. Resolve failures in this isolated
cluster only. Ordinary reruns preserve initialized data.

## Operations

From the exact test Compose directory:

```sh
docker compose ps
docker compose stop       # preserves both test volumes
docker compose start
```

Do not run global Docker prune, alter other projects, or use production SQL
deployment helpers here. No `down -v` or destructive reset is provided.
After dependency changes run `docker compose exec -T app npm ci --ignore-scripts`
then restart app. API keys expire after 90 days; regenerate in a new isolated
environment rather than silently mixing credentials across environments.

## Evidence (2026-09-19)

- Four repository SQL test suites passed during room bootstrap.
- Three real GoTrue sign-ins; own-profile RLS; XP/admin update denied;
  anonymous profile access denied.
- Two real room RPC runs: 3 members × 5 rounds = 15 answers each, completed
  state, non-host start/reveal denied, answer hidden before reveal, scored.
- Desktop new arena rendered at 1240px; real test entry and `/api/profile` 200.
- Browser create-room uncovered the missing `p_` argument mapping in the
  Server Action; fix is isolated to the payload, not DB/statistics/institution.
- After the fix, a browser-created room reached the real host lobby successfully.
- Node 22 targeted regression: 2 files / 56 tests passed.

Do not equate these checks with full three-browser multiplayer, all app pages,
institution pilot, production readiness, CI or a public deployment.
