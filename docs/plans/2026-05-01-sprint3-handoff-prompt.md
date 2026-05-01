# Bilge Arena Sprint 3 — Yeni Oturum Devralma Promptu

> Bu prompt'u yeni Claude oturumuna kopyala-yapistir. Self-contained: sifir baglam ile devam edilebilir.

---

## Proje: Bilge Arena (turkce quiz/yarisma)

**Repo:** F:/projelerim/bilge-arena (GitHub: turer73/bilge-arena, master)
**Master HEAD:** `1c39a52` (PR #57 mergeli, 2026-05-01)
**Stack:** Next.js 16 + React 19 + Supabase Auth + bilge-arena PostgREST (VPS) + Tailwind + Vitest + Playwright
**Test:** 1158 Vitest + 4 Playwright GREEN
**Auth:** Panola Supabase JWT (lvnmzdowhfzmpkueurih.supabase.co), bilge-arena PostgREST JWKS ile dogrular

## Sprint 1 + 2D Tamamlandi (12 PR)

✅ **Lobby + Realtime:** PR4a form/list, PR4b real lobby + Realtime (postgres_changes + presence)
✅ **Host actions:** PR4c start/cancel, PR4d kick member, PR4e-3 advance/reveal
✅ **Game UI:** PR4e-2 GameView select-then-submit, PR4e-4 SonucView, PR4e-5 answers_count
✅ **Player UX:** PR4f my_answer + selected highlight + auto-submit
✅ **Polish:** PR4g full scoreboard medal UI 🥇🥈🥉, PR4h typing broadcast
✅ **e2e:** PR4i auth-guard route smoke (multi-tab game flow Sprint 3 TODO)

**Game flow playable end-to-end:** lobby → active (Ilk Soru → round loop → reveal → advance) → completed

## Tech Stack Detay

- **app/ (Next.js 16):** App Router + Server Components + Server Actions
- **src/lib/rooms/:** actions.ts (Server Actions), client.ts (callRpc), server-fetch.ts, room-state-reducer.ts (pure FSM), setup-room-channel.ts, use-room-channel.ts
- **src/components/oda/:** Lobby* / Member* / Game* / Sonuc* / HostActions* (15 component)
- **DB:** infra/vps/bilge-arena/sql/ (rooms, room_members, room_rounds, room_answers, room_round_question_view anti-cheat)

## Kalip (Memory id=411 `bilge_arena_oda_server_action_kalibi`)

6 reusable bilesen:

1. **Server Action:** `getAuthForAction()` (auth+JWT) → `safeParse(Zod)` → `callRpc()` → `revalidatePath()`/`redirect()`. State `{error?, fieldErrors?}`. PR4a-PR4h hep ayni
2. **useActionState mock:** `vi.hoisted({mockUseActionState})` + `vi.mock('react', ...)` + `vi.mock('@/lib/rooms/actions', ...)`. `mockReturnValue([state, formAction, isPending])`
3. **Zod schemas:** `src/lib/rooms/validations.ts`. UUID v4 strict (`z.string().uuid()`), Crockford-32 regex `/^[A-HJ-NP-Z2-9]{6}$/`. **Crockford alphabet I/O/0/1 yasak** (test fixturelarinda `BLZGE2` gibi valid kod kullan)
4. **callRpc<null>:** 204 No Content (VOID RPC), 200+JSON (data), 200+empty body REJECT (Codex P2 PR #42 fix)
5. **DB state enum:** `RoomLifecycleState = 'lobby'|'active'|'reveal'|'completed'|'archived'` (chk_rooms_state 2_rooms.sql:133). PR4a yanlislikla 'in_progress'/'finished'/'cancelled' kullanmis, PR4b-5 hot-fix
6. **TDD fixture:** `validUuid = '11111111-1111-4111-8111-111111111111'` (RFC 4122 nibble strict), `validCode = 'BLZGE2'`

## Onemli Kurallar (memory'den)

- **TDK diakritik (id=feedback_tdk_diacritic_rule):** UI/email/SEO metninde Turkce karakter ASCII ile yazilamaz. `Ingilizce`→`İngilizce`, `cikar`→`çıkar`, `Dogru`→`Doğru`. Test (`tdk-compliance.test.ts`) yakaliyor
- **Plan-vs-repo dogrulama (id=feedback_plan_vs_repo_verification):** Plan/design yazmadan once `Grep`+`Read` ile DB schema + types check et. Memory id=410 db_enum_plan_drift bu kuralin ders kitap ornegi
- **Stack PR base trap (id=410):** Stack PR (base != master) parent merge oldugunda lingering branch'a merge oluyor. **Onlem:** parent merge anin SUYAH `gh pr edit --base master` veya repo settings auto-delete merged branches AC. **Rescue:** lokal branch koru + `git rebase --onto master <last-merged>` + yeni PR
- **MVP > Big-Bang (id=feedback_mvp_over_bigbang):** "Sana birakiyorum" derse 1.5h MVP > 4h tam build, supervisor riski
- **Zorunlu hafiza kaydi:** Her commit, PR, deploy, config degisikligi, karar, bug tespiti/cozumu icin sessiz ve durust kayit (memory_session_start.sh, /api/v1/memory/{sessions,memories,tasks,discoveries})

## Memory API

- **Endpoint:** `http://100.113.153.62:8420/api/v1/memory`
- **Header:** `X-Memory-Key: n7lfjr7aqpe_wWm7VqihgI_fafGNK9ltEYmnBGUPsvg`
- **Cihaz:** `windows-masaustu`
- **Onemli ID'ler:**
  - `id=411` Server Action kalibi (6 bilesen)
  - `id=413` Dwell time research (Sprint 2 plan referansi)
  - `id=410` Stack PR base trap + rescue cookbook
  - `id=336` Realtime mimari blueprint
  - `id=335` Reconnect REST resync (CRITIKAL — Realtime missed event'leri replay etmez)

## Sprint 3 Backlog (oncelikli)

### A) Repo Hijyeni (15 dk, ilk is)
- GitHub repo settings → "Automatically delete head branches" AC (stack PR base trap onlemi)

### B) Dwell Time Quick Wins (Sprint 2A — `docs/plans/2026-05-01-sprint2-dwell-time-improvements.md`)
1. **Reveal auto-advance** (3 gun): server relay + auto_advance_seconds setting + countdown UI. PR2c'de relay function var, sadece UI bagla. Beklenen +90sn/session
2. **Lobby auto-question widget** (1 hafta): sample soru gosterici, `questions` table'dan random `category=room.category`, host beklerken engagement. Beklenen lobby drop %30→%15
3. **Public oda discovery** (3 gun): `is_public BOOLEAN` migration + RLS policy + `/oda` sekmesi "Aktif Odalar" tab + kategori filter. Beklenen yeni user +60sn

### C) Engagement Loop (Sprint 2B)
4. **Solo mode** (2 hafta): `users.is_bot` + `quick_play_room()` RPC + 3 bot rakip + bot answer logic 60-80% accuracy. Beklenen yeni user 0:45→4:30
5. **Daily streak + push notification** (1 hafta): `user_streaks` table + cron + push opt-in. Beklenen DAU 2x

### D) Retention (Sprint 2C)
6. **Leaderboard** (1 hafta): materialized view weekly/all-time + kategori filter
7. **Profil derinligi** (1 hafta): win/loss + favori kategori + son 10 oyun + rozet (10/100/1000)
8. **Replay & Share** (4 gun): OG image dynamic + share buttons + replay clone

### E) e2e Genişletme (Sprint 2D devamı)
9. **Multi-tab game flow Playwright** (skeleton spec'te TODO): host + 2 player + start + answer + reveal + advance + completed. Mock layer: Supabase auth callback + bilge-arena PostgREST + Realtime WebSocket. Skeleton: `e2e/oda-routes.spec.ts` icindeki commented out blok

## Komutlar

```bash
# Calisma dizini
cd /f/projelerim/bilge-arena

# Test
pnpm test --run                 # Vitest 1158 test
pnpm exec playwright test --project=chromium  # Playwright 4 test
pnpm type-check                 # TS strict
pnpm lint                       # ESLint (25 warning pre-existing kabul, 0 error)
pnpm build                      # Next.js production build

# Git workflow (her PR icin)
git checkout master && git pull
git checkout -b feat/oda-prX-feature-name
# ... edit, test, commit
git push -u origin feat/oda-prX-feature-name
gh pr create --base master --title "..." --body "..."
# Codex auto-review birkac dakika sonra

# Memory POST (zorunlu kayit, JSON file ile - inline curl Turkce karakterde fail eder)
echo '{"project":"bilge-arena","task":"...","status":"completed","description":"..."}' > .tmp-mem.json
curl -s -X POST -H "X-Memory-Key: ..." -H "Content-Type: application/json" \
  -d @.tmp-mem.json http://100.113.153.62:8420/api/v1/memory/tasks
rm .tmp-mem.json
```

## Bilinen Pre-existing Issue'lar

- **Lint warnings 25-27** (admin/* setState-in-effect, hooks dependency) — pre-existing, PR4*'larla alakasiz
- **`pnpm-lock.yaml` PR #56'da master'a eklendi** — onceden tracked degildi, simdi tracked
- **`docs/plans/2026-04-23-middleware-to-proxy-rename.md`** — eski draft, untracked, alakasiz, dokunma

## Onerilen Baslangic Adimi

```
Sprint 3 baslat. 
Once: GitHub repo settings "Automatically delete head branches" ac (memory id=410).
Sonra: Sprint 2A Quick Wins ilk task — "Reveal auto-advance" (3 gun, +90sn/session quick win).

Plan: 
1. Brainstorming skill kullan (mandatory creative work)
2. docs/plans/2026-05-01-sprint2-dwell-time-improvements.md Task 1 oku
3. Branch feat/oda-pr5a-reveal-auto-advance master'dan
4. DB migration: rooms.auto_advance_seconds INT DEFAULT 5
5. CreateRoomForm slider, SonucView countdown, server-side trigger karari (cron vs client)
6. 3 e2e test (auto trigger, host override, 0=disable)
7. Memory POST + PR

Devam et.
```

## Onemli Hatirlatma

- Kullanici **TURKCE konusur** — TR cevap ver
- Kullanici delegasyon yapinca ("sen karar ver", "sen devam et", "sana birakiyorum") **MVP > full scope** sec
- Her commit/PR/decision sonrasi **memory POST** zorunlu
- **Co-Authored-By satiri commit'lere ekle:** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- **Pre-push hook** tum testleri + build'i calistirir, gerekirse `rm -f .next/lock` clear
- Stack PR'lar tehlikeli (3 kez yasandi) — mumkunse master base'den ac, parent merge anin base degistir veya rescue rebase

---

İyi sprintler.
