# Bilge Arena T4 PR2 — Bot Answer Logic — Yeni Oturum Devralma Promptu

> Bu prompt'u yeni Claude Code oturumuna kopyala-yapistir. Self-contained.
>
> **Tarih:** 2026-05-02
> **Branch:** `feat/oda-pr5i-bot-answer-logic` (remote pushed)
> **Master HEAD:** `e1f73d0` (Sprint 2 12 PR mergeli)

---

## Gorev

Sprint 2B Task 4 PR2: Solo mode bot rakipleri AKTIF cevap versin. PR1 (#62)
mergeli — bot members lobby'de var ama PASIF (auto_relay reveal sonrasi 0
puan). Bu PR bot AI ekler.

**Beklenen etki:** yeni user dwell 0:45 → 4:30 (Sprint 2 plan Task 4 ana hedef).

## Su an branch state

```bash
cd F:/projelerim/bilge-arena
git checkout feat/oda-pr5i-bot-answer-logic
git pull
git log --oneline master..HEAD  # 1 commit: 8fa718c WIP migration draft
```

**Yazilmis dosyalar:**
- `infra/vps/bilge-arena/sql/14_bot_answers.sql` (202 satir, 3 bilesen)
  - RLS policy `room_answers_insert_bot`
  - Helper `_submit_bot_answers_for_round(p_room_id, p_round_index)`
  - Trigger `trg_bot_answers_on_round_start AFTER UPDATE OF started_at`

**Eksikler (yapilacaklar):**
1. **Migration validate** — psql'de test et:
   - bilge_arena_dev'de syntax ok mu
   - FORCE RLS room_answers ile bot insert policy calisir mi
   - Trigger advance_round sonrasi tetiklenir mi (auth.uid() context propagation)
2. **`14_bot_answers_test.sql`** — TDD test (4-5 senaryo):
   - T1: room_answers_insert_bot policy var
   - T2: _submit_bot_answers_for_round helper imzasi
   - T3: trg_bot_answers_on_round_start trigger var
   - T4: Trigger integration: oda + bot member + round update + bot answers insert
   - T5: Difficulty-based accuracy (smoke — 100 random run %60-80 dogruluk)
   - T6: revealed_at NOT NULL ise trigger atla (idempotent guard)
3. **TS layer test** (eger gerekirse):
   - actions.test.ts advance_round/start_room sonrasi bot answers count
4. **type-check + vitest + lint + build** (master baseline 1278 vitest pass)
5. **Commit + push + PR** (PR #69 olur)

---

## Critical: Codex Pattern (Manual Review Beklenir)

Codex usage limit asildi (memory id=417, 2026-05-01). Bu PR'da Codex tarama
gelmeyebilir, MANUEL inceleme yapilacak. Onceki 33 fix patterni:

| Pattern | Fix |
|---|---|
| **Prototype pollution** (`slug in obj`) | `Object.hasOwn` |
| **SECURITY INVOKER + REVOKE'lu tablo** | SECURITY DEFINER |
| **RLS embed anonim** | Denormalized + trigger |
| **Client clock drift** | `serverOffsetMs` prop |
| **Empty input `Number('')==0`** | `undefined` → Zod default |
| **Hidrasyon mismatch** | `process.env.NEXT_PUBLIC_SITE_URL` |
| **Auth-gated OG metadata** | Public route `/p/[code]` |
| **Twitter intent** | `twitter.com/intent/tweet` (NOT x.com) |
| **room_id UUID FK regression** | `pg_constraint count = 0` test |
| **Title overflow** | Idempotent marker + 80 char cap |
| **chk_rooms_public_lobby_only** | EKLENMEDI (state transition CHECK violation engeli) |

**Bu PR icin manuel scan checklist:**
- [ ] FORCE RLS + SECURITY DEFINER + bot user_id auth.uid() degil — RLS test
- [ ] Trigger function security definer ama row_security check edilir mi (test gerek)
- [ ] Bot accuracy random() distribution (test 1000 run, %70 ortalamasi mi)
- [ ] Edge: options array null veya 1 elemanli — function early return
- [ ] Edge: bot member yoksa — LOOP bos, no-op
- [ ] Edge: revealed_at zaten NOT NULL — guard
- [ ] Edge: round restart (stop + start) — UNIQUE constraint room_answers (round_id, user_id)
- [ ] Memory id=feedback_zod4_uuid_strict — test fixture validUuid format
- [ ] Memory id=feedback_definer_search_path_hardening — search_path SET dogru
- [ ] response_ms 5000-15000 random — `floor(random() * 10001)::INT` 0-10000 doner, 5000+0..10000 = 5000-15000 ✓

---

## Memory API + Komutlar

**Endpoint:** `http://100.113.153.62:8420/api/v1/memory`
**Header:** `X-Memory-Key: n7lfjr7aqpe_wWm7VqihgI_fafGNK9ltEYmnBGUPsvg`
**Cihaz:** `surer`

```bash
# Migration apply (psql panola-postgres docker)
docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
  -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/14_bot_answers.sql

# Test
pnpm type-check && pnpm test --run && pnpm lint && pnpm build

# Memory POST (zorunlu kayit, JSON file ile - inline curl Turkce karakterde fail eder)
echo '{"device_name":"surer","project":"bilge-arena","task":"...","status":"completed","details":"..."}' > .tmp.json
curl -s -X POST -H "X-Memory-Key: n7lfjr7aqpe_wWm7VqihgI_fafGNK9ltEYmnBGUPsvg" \
  -H "Content-Type: application/json" -d @.tmp.json \
  http://100.113.153.62:8420/api/v1/memory/tasks
rm .tmp.json
```

---

## Sprint 2 Status (kontekst)

12 PR mergeli, master 1278 vitest pass:

| PR | Konu |
|---|---|
| #58 + #59 | T1 Auto-advance |
| #60 | T2 Lobby preview |
| #61 + #64 | T3 Public discovery (kategori slug helper) |
| #62 + #65 | T4 Solo skeleton + Codex follow-up |
| #63 + #65 | T8 Replay & Share + Codex follow-up |
| #66 | T8 PR2 OG image route |
| #67 | Twitter intent fix |
| #68 | T8 PR3 OG metadata + public /p/[code] |

**Bu PR (T4 PR2):** #69 olur. Sprint 2 final feature (Solo mode AKTIF).

---

## Onemli Kurallar

- **Turkce konus** — TR cevap ver
- **Co-Authored-By satiri EKLEME** — Vercel hobby plan engelliyor
- **Pre-push hook** tum testleri + build calistirir, gerekirse `rm -f .next/lock`
- **JSON memory POST sadece ASCII** — Turkce karakter (ı, ç, ş) parse hatasi
- **Plan-vs-repo dogrulama** (memory id=feedback_plan_vs_repo_verification):
  Plan/design yazmadan once Grep+Read ile DB schema + types check et
- **MVP > Big-Bang** (memory id=feedback_mvp_over_bigbang): 1.5h MVP > 4h tam build

---

## Onerilen Baslangic Mesaji

```
T4 PR2 bot answer logic devam et. Branch state:
- 14_bot_answers.sql draft yazili (8fa718c)
- Test + validate eksik

Plan:
1. Migration psql ile test et (panola-postgres docker)
2. 14_bot_answers_test.sql yaz (4-6 senaryo)
3. TS test gerekirse (advance_round sonrasi bot answers count)
4. type-check + vitest + lint + build
5. Commit + push + PR

Onceki oturum yorgunluk nedeniyle bu PR'i baslattim ve handoff verdi.
Migration mantigi durust kontrol et — RLS interaction tehlikeli olabilir.
```

Iyi sprintler.
