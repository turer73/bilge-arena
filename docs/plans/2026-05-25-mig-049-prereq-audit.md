# Migration 049 Prereq Refactor — Etki Analizi

**Tarih:** 2026-05-25
**Amaç:** Apply öncesinde **kaç dosyada, hangi pattern'le** server-side refactor gerektiğini ölçmek.

## Kapsam

Mig 049 şu tabloları `authenticated` role'den REVOKE eder:
- `profiles`, `session_answers`, `game_sessions`, `user_topic_progress`, `user_question_history`, `comments`, `comment_likes`, `challenges`

**`user_roles` ve `role_permissions` mig 049'da yorum satırı** (admin.ts/proxy.ts refactor olmadan REVOKE = middleware ve admin paneli kırılır — bilinçli atlandı).

## Sayısal etki

| Tablo | Server-side `from()` çağrısı |
|---|---|
| profiles | 31 |
| game_sessions | 10 |
| session_answers | 9 |
| challenges | 9 |
| user_topic_progress | 6 |
| comments | 3 |
| comment_likes | 3 |
| user_question_history | 2 |
| **TOPLAM** | **73 call site** |

**30 dosya** etkilenir (tam liste aşağıda).

## Etkilenen dosyalar (30)

```
src/app/api/admin/logs/route.ts
src/app/api/admin/roles/assign/route.ts
src/app/api/admin/stats/route.ts
src/app/api/admin/users/route.ts
src/app/api/badges/route.ts
src/app/api/challenges/[id]/route.ts
src/app/api/challenges/[id]/submit/route.ts
src/app/api/challenges/route.ts
src/app/api/comments/[id]/like/route.ts
src/app/api/comments/[id]/route.ts
src/app/api/comments/route.ts
src/app/api/cron/daily-streak-reminder/route.ts
src/app/api/cron/weekly-digest/route.ts
src/app/api/daily-login/route.ts
src/app/api/leaderboard/full/route.ts
src/app/api/leaderboard/landing/route.ts
src/app/api/leaderboard/sidebar/route.ts
src/app/api/profile/avatar/route.ts
src/app/api/profile/difficulty/route.ts
src/app/api/profile/route.ts
src/app/api/profile/stats/route.ts
src/app/api/profile/sync/route.ts
src/app/api/profile/topic-strengths/route.ts
src/app/api/questions/random/route.ts
src/app/api/quests/claim/route.ts
src/app/api/quiz-limit/route.ts
src/app/api/referral/route.ts
src/app/api/sessions/route.ts
src/lib/supabase/adaptive-difficulty.ts
src/lib/supabase/profile-stats.ts
```

## Refactor pattern (her call site için)

```ts
// ÖNCE — authenticated cookie context (REVOKE sonrası 401 alır)
const supabase = await createClient()
const { data } = await supabase.from('profiles').select(...).eq('id', user.id)

// SONRA — auth doğrulamasını ayır, data erişimini service-role'a geçir
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

const svc = createServiceRoleClient()
const { data } = await svc.from('profiles').select(...).eq('id', user.id)
//                                                  ^^^^^^^^^^^^^^^^^^^^^^^
//                  RLS bypass — eq filtresi MANUEL eklenmek zorunda
```

**Kritik nüans:** Service-role RLS'i tamamen bypass eder. Daha önce RLS'in zorladığı "kullanıcı sadece kendi verisini görür" garantisi **kod seviyesinde** `.eq('user_id', user.id)` ile sağlanmak zorunda. Yanlış unutulursa = cross-user data leak (bu ironi mig 049'un amacının tersi olur).

## Kategori dağılımı (tahmini)

| Kategori | Dosya sayısı | Refactor karmaşıklığı |
|---|---|---|
| Self-data CRUD (profile/avatar/sync/stats/difficulty/topic-strengths, daily-login, quiz-limit, referral, sessions) | ~10 | Düşük — pattern doğrudan uygulanır |
| Admin (logs/roles/stats/users) | 4 | Orta — auth check + service-role + permission gate iç içe |
| Leaderboard (full/landing/sidebar) + badges | 4 | Düşük — public/aggregate okuma |
| Cron (daily-streak-reminder, weekly-digest) | 2 | Düşük — zaten user context'i yok, service-role natural fit |
| Multiplayer/social (challenges x3, comments x3) | 6 | Yüksek — RLS karmaşık (kendi vs arkadaş vs public), `.eq` filtreleri dikkatli |
| Quiz play (questions/random, quests/claim) | 2 | Orta — özel guard'lar |
| Helper lib (adaptive-difficulty, profile-stats) | 2 | Düşük ama 2 dosya birden çağrılır |

## Efor tahmini

- **Refactor:** 73 call site × ortalama 5 dk = ~6 saat
- **Per-route smoke test:** ~3 saat (auth + cross-user leak guard testleri)
- **Prod smoke test:** ~1 saat (login → quiz → leaderboard → profil → admin → duello → yorum)
- **Toplam: 10-12 saat dikkatli engineering**

Plus risk:
- RLS varsayımı kırılırsa cross-user leak (kötü senaryo: 049'un kendisi PII saldırı tarzı bir zafiyet açar)
- Cron job'ları zaten service-role kullanıyor olabilir (audit gerekir)
- Existing tests (1599) cookie-mocked; service-role pattern için yeni test fixture'lar lazım

## Önerim

**Tek oturumda kapatma.** Sebep:
1. Bu saatler, bir debt-closure session'ında yapılabilecek iş değil.
2. Hata olursa cross-user leak — ironi (049'un derdi tam buydu).
3. Mevcut test coverage'ı bu pattern'i doğrulamıyor.

**Doğru yaklaşım:**
- **Faz 1 (1-2 gün):** Self-data CRUD dosyaları (10 dosya, en düşük risk). Per-route `.eq('id', user.id)` guard testi ekle.
- **Faz 2 (1 gün):** Leaderboard + cron + badges (6 dosya, public/system context).
- **Faz 3 (1-2 gün):** Multiplayer + social (challenges + comments, 6 dosya, en yüksek RLS karmaşıklığı).
- **Faz 4 (1 gün):** Admin (4 dosya, permission gate + service-role pattern).
- **Faz 5 (1 gün):** Helper lib + audit + smoke test.
- **Apply mig 049:** Tüm faz green'den sonra, smoke test geçince.

**Toplam ~6-7 gün engineering** (1 kişi, dikkatli).

Alternatif: Mig 049 apply'ı bütünüyle ertele (kabul edilebilir teknik borç olarak işaretle), aktif zafiyet yok çünkü 156 pentest ile keşfedilen vector (service-role JWT) zaten rotate edildi + Madde 9 browser→API proxy refactor #146-150 ile authenticated dump vectoru zaten daraltıldı. Mig 049 "defense-in-depth" katmanı; yoksa kritik zafiyet yok.

## Karar

Bu doküman audit; karar kullanıcıda. Seçenekler:
- (A) Faz 1'i bu hafta başlat (10 dosya, en güvenli set, ~1-2 gün)
- (B) Tüm Faz 1-5'i schedule et (sprint planına al)
- (C) Mig 049'u defense-in-depth olarak ertele, defteri kapa
