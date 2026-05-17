# Madde 9 Final Lockdown Runbook

**Migration:** `database/migrations/049_authenticated_lockdown_DRAFT.sql`
**Tarih:** 2026-05-17 hazırlandı; apply tarihi: TBD
**Risk:** 🔴 Yüksek — yanlış zamanda apply prod kırar

## Önkoşullar

Aşağıdaki PR'lar **merge VE prod'da deploy edilmiş olmalı**:

- [x] [#74](https://github.com/turer73/bilge-arena/pull/74) Madde 9 #1 — landing leaderboard
- [x] [#75](https://github.com/turer73/bilge-arena/pull/75) Madde 9 #2 — sidebar leaderboard
- [x] [#81](https://github.com/turer73/bilge-arena/pull/81) Madde 9 #3 — sıralama
- [x] [#86](https://github.com/turer73/bilge-arena/pull/86) Madde 9 #4 — topic-strengths
- [ ] [#146](https://github.com/turer73/bilge-arena/pull/146) Madde 9 #5 — use-auth
- [ ] [#147](https://github.com/turer73/bilge-arena/pull/147) Madde 9 #6 — questions/random
- [ ] [#148](https://github.com/turer73/bilge-arena/pull/148) Madde 9 #7 — profile-stats + difficulty
- [ ] [#149](https://github.com/turer73/bilge-arena/pull/149) Madde 9 #8 — comments
- [ ] [#150](https://github.com/turer73/bilge-arena/pull/150) Madde 9 #9 — duello

Ek olarak: Vercel deploy'ları "Ready" durumunda, hiçbir build hatası yok.

## Aşamalı Apply Stratejisi

Migration'ı **tek seferde değil**, **faz faz** uygula. Her fazdan sonra smoke test koştur. Hata varsa o faz REVOKE'unu rollback et (GRANT geri ver) ve nedeni araştır.

### Adım 0: Audit (5 dk)

Önce mevcut grant tablosunu çıkar:

```sql
SELECT table_name, string_agg(privilege_type, ',') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'SELECT'
GROUP BY table_name ORDER BY table_name;
```

Sonucu bu runbook'a not düş — rollback için referans.

### Adım 1: Faz 1 — `profiles` REVOKE (en kritik)

**Bu fazın amacı:** 2026-05-16 saldırı vektörünü tamamen kapatmak. Authenticated kullanıcı `.from('profiles').select('*')` çağırırsa artık satır görmemeli.

```sql
BEGIN;
REVOKE SELECT ON public.profiles FROM authenticated;
COMMIT;
```

**Smoke test (zorunlu, 10 dk):**

| # | Test | Beklenen |
|---|---|---|
| 1 | `bilgearena.com` aç → "Giriş Yap" → Google OAuth → callback | `/arena` yüklenir, navbar'da kullanıcı adı + avatar görünür |
| 2 | Soru çöz (matematik 5 soru) → bitir | XP artar, level değişimi varsa görünür |
| 3 | `/arena/profil` aç | İstatistikler, son oyunlar, rozetler yüklenir |
| 4 | Profil düzenle → display_name değiştir → kaydet | Yeni isim navbar + profile'da görünür |
| 5 | `/arena/siralama` aç | Top 10 listesi görünür, kendi sıran görünür |
| 6 | Admin user ile `/admin` aç (eğer varsa) | Admin paneli yüklenir |

Herhangi biri başarısız olursa → **ROLLBACK**:
```sql
GRANT SELECT ON public.profiles TO authenticated;
```

### Adım 2: Faz 2 — User-spesifik tablolar (5 dk + 10 dk test)

```sql
BEGIN;
REVOKE SELECT ON public.session_answers          FROM authenticated;
REVOKE SELECT ON public.game_sessions            FROM authenticated;
REVOKE SELECT ON public.user_topic_progress      FROM authenticated;
REVOKE SELECT ON public.user_question_history    FROM authenticated;
COMMIT;
```

**Smoke test:**

| # | Test | Beklenen |
|---|---|---|
| 1 | `/arena/profil` reload | gameStats, recentGames görünüyor |
| 2 | Yeni quiz başlat | Adaptive difficulty hâlâ çalışıyor (api/profile/difficulty 200) |
| 3 | Aynı seansta tekrar oyna | Cooldown çalışıyor — tekrar eden soru yok |
| 4 | Bilerek yanlış cevapla → 1+ saat sonra tekrar oyna | Spaced repetition: yanlış cevap tekrar geliyor |

### Adım 3: Faz 3 — Social tablolar (5 dk + 5 dk test)

```sql
BEGIN;
REVOKE SELECT ON public.comments       FROM authenticated;
REVOKE SELECT ON public.comment_likes  FROM authenticated;
COMMIT;
```

**Smoke test:**

| # | Test | Beklenen |
|---|---|---|
| 1 | Soru sayfasında yorumları aç | Eski yorumlar yükleniyor |
| 2 | Yorum yaz | Optimistic appear + refresh sonrası kalıcı |
| 3 | Beğen / kaldır | Sayaç güncelliyor |

### Adım 4: Faz 4 — Multiplayer (5 dk + 5 dk test)

```sql
BEGIN;
REVOKE SELECT ON public.challenges FROM authenticated;
COMMIT;
```

**Smoke test:**

| # | Test | Beklenen |
|---|---|---|
| 1 | Yeni duello davet et | Davet listede görünüyor |
| 2 | İki tab — karşı tarafta kabul et | "Hazır" durumu |
| 3 | Soruları cevapla → sonuç | Skor + kazanan doğru |

### Adım 5: Bekleyen audit'ler (henüz REVOKE yok)

Aşağıdakiler için **ek refactor** gerekli. Migration 049'da yorum satırı olarak duruyorlar:

#### `questions` authenticated REVOKE

`src/app/page.tsx` landing ISR sayfasında authenticated context'te (cookie varsa) çağrı yapıyor. Önce service-role'a geçiş:

```diff
- const supabase = await createClient()
+ const supabase = createServiceRoleClient()
  supabase.from('questions').select('*', { count: 'exact', head: true })...
```

Bu refactor sonrası:
```sql
REVOKE SELECT ON public.questions FROM authenticated;
```

#### `user_roles` + `role_permissions` REVOKE

`src/lib/supabase/admin.ts` ve `src/proxy.ts` authenticated context'te user_roles okuyor. Ya service-role'a geçir, ya da RBAC kontrolünü kendi SECURITY DEFINER fonksiyonuna çevir.

**Önerim:** `has_permission(uuid, text)` fonksiyonu zaten var (migration 016b, 047'de REVOKE PUBLIC + GRANT authenticated). Bu fonksiyon kullanılıyorsa user_roles SELECT gerekmeyebilir. Mevcut admin.ts'i bu fonksiyona refactor et, sonra REVOKE.

## Beklenen Sonuç

Tüm REVOKE'lar uygulandıktan sonra:

1. **Anon publishable key + REST API ile dump = imkansız** (zaten Migration 040 + 041 + 049 ile kapalı)
2. **Authenticated user `.from()` ile dump = imkansız** (sadece API proxy üzerinden, RBAC + rate limit + sahip kontrolü)
3. **Service-role key sızıntısı = TEK kalan vektör** — bu da `sb_secret_` rotation + key rotation ile yönetilir

## Rollback Planı

Her REVOKE atomik. Yanlış davranış görürsen ilgili tablo için:
```sql
GRANT SELECT ON public.<tablename> TO authenticated;
```

Tam rollback (tüm migration 049):
```sql
BEGIN;
GRANT SELECT ON public.profiles                  TO authenticated;
GRANT SELECT ON public.session_answers           TO authenticated;
GRANT SELECT ON public.game_sessions             TO authenticated;
GRANT SELECT ON public.user_topic_progress       TO authenticated;
GRANT SELECT ON public.user_question_history     TO authenticated;
GRANT SELECT ON public.comments                  TO authenticated;
GRANT SELECT ON public.comment_likes             TO authenticated;
GRANT SELECT ON public.challenges                TO authenticated;
COMMIT;
```

## İletişim

Apply sırasında:
- Kullanıcı bildirimi: gerek yok (downtime YOK, REVOKE atomik)
- Eğer rollback gerekirse: Sentry alert + Telegram bildirim
- Audit log: migration 049 apply session id'yi merkezi memory'ye task olarak kaydet
