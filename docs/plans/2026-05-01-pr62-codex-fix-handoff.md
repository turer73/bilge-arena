# Bilge Arena PR #62 Codex Fix — Yeni Oturum Devralma Promptu

> **STATUS: COMPLETED (2026-05-01).** PR #65 (`fix(oda): Codex review followup
> — PR #62 + #63 fixes (push timing miss)`) ile mergeli. Tarihsel handoff
> referans + codex fix paterni icin saklaniyor.

> Bu prompt'u yeni Claude Code oturumuna kopyala-yapistir. Self-contained: sifir baglam ile devam edilebilir.
>
> **Diger oturumda (Kol A) farkli is yapiliyor** — feat/oda-pr5g-og-image-result branch (T8 OG image route). Cakismayacak dosyalar.

---

## Gorev

PR #62 (Sprint 2B Task 4 — Solo mode skeleton) Codex review tarafindan taranmis, hatalar var. Hatalari duzelt + regression test ekle + push.

**PR URL:** https://github.com/turer73/bilge-arena/pull/62
**Branch:** `feat/oda-pr5d-solo-mode-skeleton`
**Codex hatalari:** Kullanici PR yorumlarinda paylasacak (PR sayfasinda gorulebilir)

---

## Calisma Dizini

```bash
cd F:/projelerim/bilge-arena
git checkout feat/oda-pr5d-solo-mode-skeleton
git pull origin feat/oda-pr5d-solo-mode-skeleton
```

**Yasak dosya:** Asagidaki dosyalara DOKUNMA — Kol A (diger oturum) onlara yazacak:
- `src/app/api/og/**/*` (yeni OG image route)
- `infra/vps/bilge-arena/sql/14_*.sql` (eger varsa)

**Senin scope (PR #62 Codex fix):**
- `infra/vps/bilge-arena/sql/12_solo_mode.sql` (RPC fix)
- `infra/vps/bilge-arena/sql/12_solo_mode_test.sql` (regression test)
- `src/lib/rooms/actions.ts` (quickPlayRoomAction)
- `src/lib/rooms/validations.ts` (quickPlayRoomActionSchema)
- `src/lib/rooms/__tests__/actions.test.ts` (regression test)
- `src/lib/rooms/__tests__/validations.test.ts` (regression test)
- `src/components/oda/QuickPlayPanel.tsx` + test
- `src/components/oda/MemberRow.tsx` (bot rozet)

---

## PR #62 Ne Yapiyor

Tek tikla solo oda olusturma — kullanici 3 bot rakiple oynar.

### DB
- `12_solo_mode.sql`:
  - `room_members.is_bot BOOLEAN NOT NULL DEFAULT FALSE`
  - `quick_play_room(p_category, p_difficulty, p_question_count)` RPC
    - `SECURITY DEFINER`, `auth.uid()` host
    - 1 host (real user) + 3 bot (gen_random_uuid + is_bot=TRUE)
    - `max_players=4`, `is_public=FALSE`
    - Audit log `quick_play_created`
  - `REVOKE PUBLIC` + `GRANT authenticated`
- `12_solo_mode_test.sql`: 6 TDD test

### Server
- `types.ts`: `RoomMember.is_bot`
- `room-state-reducer.ts`: `Member.is_bot?`
- `validations.ts`: `quickPlayRoomActionSchema`
- `actions.ts`: `quickPlayRoomAction` Server Action

### UI
- `QuickPlayPanel.tsx`: kategori dropdown + "Hızlı Oyun" butonu
- `(player)/oda/page.tsx`: mine tab QuickPlayPanel render
- `MemberRow.tsx`: bot için 🤖 emoji + "BOT" rozet

---

## Onceki Codex Bulgu Paterni (Manuel Review Checklist)

Codex limit asildi — manuel review yapiyoruz. Onceki PR'larda Codex'in yakaladigi paterne dikkat et:

| PR | Codex P1 | Cozum |
|---|---|---|
| #58 | Client `Date.now()` clock drift | `serverOffsetMs` prop |
| #58 | `Number('') === 0` empty input | `undefined` → Zod default |
| #60 | RPC `SECURITY INVOKER` + REVOKE'lu tablo | `SECURITY DEFINER` |
| #61 | `room_members(count)` embed anon RLS | `rooms.member_count` denormalized + trigger |

**PR #62'de muhtemel sorunlar (manuel taranacak):**

1. **Bot user_id RLS:** `quick_play_room` SECURITY DEFINER ama `room_members INSERT` policy `WITH CHECK (user_id = auth.uid())`. Bot user_id `gen_random_uuid()` — auth.uid() degil. RPC OWNER FORCE RLS'i devre disi mi? `room_members FORCE RLS YOK` (3_rooms_rls.sql:88 plan-deviation #33), owner bypass aktif. Bu yuzden calisir. **Test ekle:** RPC ile 3 bot insert basarili.

2. **`auth.uid() = host_id` constraint:** rooms tablosunda check yok ama RLS `rooms_insert_self_host (auth.uid() = host_id)` policy var. SECURITY DEFINER + FORCE RLS aktif — owner policy'e tabi mi? **Test ile dogrula.**

3. **Bot member kick edilebilir mi:** `kick_member` RPC bot'u kick ederse member_count azalir, oyun bozulmamasi gerekir. Edge case test.

4. **Bot leaderboard exclusion:** `leaderboard_weekly_ranked` view bot'u dahil ediyor mu? Eger ediyor, leaderboard kirilir. Bu PR2'ye baglidir ama Codex P1 olarak yakalayabilir.

5. **`is_bot` column REFERENCES yok:** `room_members.user_id` Panola GoTrue user UUID bekliyor (FK YOK). Bot rastgele UUID, FK uyari vermez. OK.

6. **`UNIQUE (room_id, user_id)`:** Bot UUID'leri her INSERT'te yeni. Ama 3 bot ardisik INSERT — `gen_random_uuid()` cakisma olasi mi? Astronomik dusuk (UUID v4 entropi). MVP guvenli.

---

## Kalip / Memory

### Kritik Memory IDs (`http://100.113.153.62:8420/api/v1/memory/memories/{id}`)
- **id=410** Stack PR base trap (auto-delete merged branches AC, master base'den ac)
- **id=411** Server Action kalibi (6 bilesen: getAuthForAction, useActionState mock, Zod, callRpc, RoomLifecycleState, TDD fixture)
- **id=336** Realtime mimari (postgres_changes + presence)
- **id=155** useCallback stale closure (setState-in-effect anti-pattern)
- **id=416** Migration/deploy timing pencere (DROP FUNCTION)
- **id=417** Codex usage limit asildi 2026-05-01 (manuel review)

### Lokal Memory Dosyalari
- `C:\Users\sevdi\.claude\projects\F--projelerim\memory\feedback_plan_vs_repo_verification.md` — plan yazmadan once Grep+Read
- `C:\Users\sevdi\.claude\projects\F--projelerim\memory\feedback_rls_admin_bypass_match.md` — RLS bypass permission match
- `C:\Users\sevdi\.claude\projects\F--projelerim\memory\feedback_zod4_uuid_strict.md` — UUID v4 RFC 4122 nibble strict

### Test Fixture
- `validUuid = '11111111-1111-4111-8111-111111111111'` (RFC 4122 nibble strict, group3=4xxx, group4=8xxx)
- `validCode = 'BLZGE2'` (Crockford-32, I/O/0/1 yasak)

---

## Komutlar

```bash
# Calisma
cd F:/projelerim/bilge-arena
git checkout feat/oda-pr5d-solo-mode-skeleton
git pull

# Edit -> Test -> Commit -> Push
pnpm type-check
pnpm test --run
pnpm lint
pnpm build

git add <files>
git commit -m "fix(oda): Codex Pn fix - <kisa aciklama> (PR #62)"
rm -f .next/lock
git push  # force-with-lease gerekirse: git push --force-with-lease

# Memory POST (zorunlu kayit, JSON file ile)
echo '{"device_name":"surer","project":"bilge-arena","task":"...","status":"completed","details":"..."}' > .tmp.json
curl -s -X POST -H "X-Memory-Key: <MEMORY_KEY_REDACTED>" \
  -H "Content-Type: application/json" -d @.tmp.json \
  http://100.113.153.62:8420/api/v1/memory/tasks
rm .tmp.json
```

---

## Onemli Kurallar

- **Turkce konus** — TR cevap ver
- **Co-Authored-By satiri EKLEME** — Vercel hobby plan engelliyor (CLAUDE.md kural)
- **Pre-push hook:** Tum testleri + build'i calistirir, gerekirse `rm -f .next/lock`
- **Yasak dosyalar (Kol A scope):** `src/app/api/og/**/*`, `infra/vps/bilge-arena/sql/14_*.sql`
- **Her commit/PR/decision sonrasi memory POST** zorunlu
- **JSON sadece ASCII** — Turkce karakterler i ı c ç gibi parse hatasi yapar; tirelersiz yaz

---

## Cakismayan Dosya Sinirlari

**Bu oturum (Kol B) DOKUNUR:**
- `infra/vps/bilge-arena/sql/12_*.sql` ✅
- `src/lib/rooms/actions.ts` ✅ (quickPlayRoomAction kismi)
- `src/lib/rooms/validations.ts` ✅ (quickPlayRoomActionSchema kismi)
- `src/lib/rooms/__tests__/actions.test.ts` ✅ (quickPlayRoomAction describe)
- `src/lib/rooms/__tests__/validations.test.ts` ✅ (quickPlayRoomActionSchema describe)
- `src/components/oda/QuickPlayPanel.tsx` + test ✅
- `src/components/oda/MemberRow.tsx` ✅
- `src/lib/rooms/types.ts` ✅ (RoomMember.is_bot)
- `src/lib/rooms/room-state-reducer.ts` ✅ (Member.is_bot)
- `src/app/(player)/oda/page.tsx` ✅

**Diger oturum (Kol A) DOKUNUR — sen DOKUNMA:**
- `src/app/api/og/**/*` ❌ (yeni OG image route)
- `infra/vps/bilge-arena/sql/14_*.sql` ❌ (eger varsa)

**Eger validations.ts/actions.ts'de degisiklik gerekirse:** Ortak dosya, push timing'inde dikkat. Kol A bu dosyalara dokunmiyor (yasak listesinde) — guvenli.

---

## Beklenen Akis

1. PR #62 Codex yorumlarini kullanicidan al
2. Sorunlari `12_solo_mode.sql` veya TS dosyalarinda duzelt
3. Regression test ekle (her sorunun pozitif test'i)
4. type-check + test + lint + build
5. Commit + push
6. Memory POST
7. Kullaniciya rapor: "PR #62 Codex fix push edildi, X commit, Y/Y test pass"

---

## Onerilen Baslangic Mesaji

```
PR #62 Codex review hatalari soyle:

[Kullanici buraya Codex yorumlarini yapistirir]

Branch'a gec ve duzelt.
```

Iyi sprintler.
