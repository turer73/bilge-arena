# 2026-05-17 — Bilge Arena Güvenlik Olayı Takip Planı

**Bağlam:** 2026-05-16/17 saldırısı (191 profil PII dump + 26 bot kayıt). Migration 040 aynı gün uygulandı + 047 commit edildi. Bu doküman **kalan üç açığı** kapatır.

---

## Phase 2 — Bot vektörü (1-2 saat)

### Bulgu

Frontend (`src/app/giris/giris-client.tsx`) sadece **Google OAuth** gösteriyor. Email/password signup form yok. Ama 26 bot kayıt oldu — saldırgan **doğrudan Supabase REST endpoint'ini** çağırdı:

```bash
POST https://lvnmzdowhfzmpkueurih.supabase.co/auth/v1/signup
apikey: sb_publishable_sAwJj...
body: {"email":"jilij18426@itquoted.com","password":"..."}
```

Bu endpoint dünyaya açık (Supabase tasarımı). Korumalar Supabase Auth ayarları + DB trigger ile yapılır, **frontend ile değil**.

### Aksiyon listesi

**1. Supabase Dashboard → Auth → Bot and Abuse Protection (5 dk)**
- Captcha Protection: **Enable**
- Provider: **Cloudflare Turnstile** (ücretsiz, sınırsız)
- Cloudflare Dashboard → Turnstile → site key + secret key oluştur (bilgearena.com domain)
- Supabase'e secret key gir, "Save"
- Bu sonra Google OAuth dışı tüm signup/login endpoint'lerinde captcha zorunluluğu getirir

**2. Disposable email blocklist (30 dk, migration 048)**

```sql
-- 048_disposable_email_block.sql
CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
  domain TEXT PRIMARY KEY
);

INSERT INTO public.disposable_email_domains (domain) VALUES
  ('itquoted.com'),       -- Bilinen saldırı domaini
  ('mailinator.com'),
  ('guerrillamail.com'),
  ('tempmail.com'),
  ('10minutemail.com'),
  ('throwaway.email'),
  ('yopmail.com'),
  ('dispostable.com'),
  ('sharklasers.com'),
  ('trashmail.com')
ON CONFLICT (domain) DO NOTHING;

CREATE OR REPLACE FUNCTION public.block_disposable_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_domain TEXT;
BEGIN
  v_domain := lower(split_part(NEW.email, '@', 2));
  IF EXISTS (SELECT 1 FROM disposable_email_domains WHERE domain = v_domain) THEN
    RAISE EXCEPTION 'Geçici e-posta adresleri kabul edilmiyor.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_disposable_email_trg ON auth.users;
CREATE TRIGGER block_disposable_email_trg
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.block_disposable_email();

REVOKE EXECUTE ON FUNCTION public.block_disposable_email() FROM PUBLIC, anon, authenticated;
```

**Genişletme kaynağı:** github.com/disposable-email-domains/disposable-email-domains (3000+ domain). Üretimde ya bu listeyi import et ya da Cloudflare Worker ile API çağrısıyla validate et.

**3. Supabase Auth rate limit (Dashboard, 2 dk)**
- Dashboard → Auth → Rate Limits
- `Token verifications`: 30/hr/IP (default 360, çok yüksek)
- `Sign ups and sign ins`: 30/hr/IP (default 60)
- `Email sends`: zaten low

---

## Phase 3 — Madde 9: Browser → Supabase Proxy Refactor (3-5 gün)

### Bağlam ve gerekçe

**Sorun:** Frontend hâlâ doğrudan Supabase'e `.from('profiles').select('*')` benzeri çağrılar atıyor. Authenticated bir kullanıcı (saldırgan kayıt olduktan sonra) `/rest/v1/profiles?select=*` ile yine tüm profiles tablosunu çekebilir. Migration 040'ın kapsamı sadece **anon** role — authenticated tam erişimde.

**Çözüm:** Tüm `.from()` ve `.rpc()` çağrılarını `/api/<resource>` proxy endpoint'lerine taşı. API route'larda:
- Auth check (JWT verify)
- Authorization (RBAC, kendi verisi mi?)
- Rate limit (user-id + IP dual layer — memory feedback'i pattern)
- Service-role client ile DB'ye dokun
- Edge cache (uygun yerlerde)

Sonra anon ve authenticated role'lerden `profiles`, `questions`, `user_roles` vb. üzerinde tüm `SELECT` GRANT'lerini REVOKE et. Supabase REST sadece auth/signup için kalsın.

### Etki haritası (mevcut `.from()` kullanımları)

`use-auth.ts:22, 81, 124, 140` — profiles SELECT + UPDATE  
`use-auth.ts:29, 148, 163` — user_roles SELECT  
`refreshProfile` — profiles SELECT  
**diğer yerler için:** `grep -rE "\.from\(['\"](profiles|user_roles|questions|sessions|comments|friendships|leaderboard_weekly_ranked|leaderboard_weekly|xp_log|user_achievements|user_daily_quests|user_topic_progress|user_question_history|referrals|challenges|push_subscriptions|game_sessions|session_answers|error_reports|notifications|topics|chat_messages|comment_likes|question_bookmarks|premium_waitlist|onboarding|client_logs)" src/`

### Aşamalı plan (5 sprint)

| Sprint | Kapsam | Süre | Risk |
|---|---|---|---|
| **S.9.1** | Profile API proxy: `/api/profile` (GET self, PATCH self) + use-auth.ts refactor | 1 gün | Düşük — sadece auth user kendi profilini görür |
| **S.9.2** | Leaderboard API proxy: `/api/leaderboard/weekly` + sidebar-data.ts + siralama-client.tsx refactor | 0.5 gün | Düşük — zaten public okuma |
| **S.9.3** | User-roles API proxy: `/api/me/roles` + 3 yer kullanımı | 0.5 gün | Orta — admin check kritik path |
| **S.9.4** | Diğer tablolar audit + proxy migration: comments, friendships, achievements, vs. | 2 gün | Yüksek — çok yer kullanımı |
| **S.9.5** | Final REVOKE migration: anon + authenticated `.from()` erişimini tamamen kapat | 0.5 gün | Yüksek — geride kalmış kullanım site kırar |

### S.9.5 hedef migration (önizleme)

```sql
-- 050_final_anon_lockdown.sql (tahmini)
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.user_roles FROM authenticated, anon;
REVOKE SELECT ON public.questions FROM authenticated;
-- Sadece RPC'ler ve service_role kalır
```

Önce **S.9.5 öncesi koşulda smoke test** zorunlu (e2e + manuel critical path):
- giriş → arena dashboard yüklenmesi
- soru çözme → XP artması
- liderlik tablosu
- profil görüntüleme + edit
- arkadaş ekleme
- admin paneli

### Tradeoff

- **Avantaj:** Authenticated dump vektörü kapanır. Rate limit kontrolü merkezi. RBAC tek noktada. Edge cache kullanılabilir. Browser bundle küçülür.
- **Dezavantaj:** 5 günlük iş. Realtime kullanımı varsa (oda sistemi) Supabase Realtime hâlâ direkt bağlantı gerektirir — onun için ayrı strateji.
- **Memory feedback uyumu:** `browser_supabase_api_proxy` zaten dokümante edilmiş pattern, sadece uygulanmamış.

---

## Kalan açıklar (bu plan dışı)

### Service-role JWT rotation (orta vade, 1 hafta)

- `src/lib/supabase/service-role.ts:4` ve `src/proxy.ts:56` hâlâ eski JWT format `SUPABASE_SERVICE_ROLE_KEY` okuyor
- Yeni `sb_secret_` format `.env.local`'da duruyor ama kullanılmıyor (`SUPABASE_SERVICE_KEY`)
- Refactor: kodu `SUPABASE_SERVICE_KEY`'e geçir (her iki dosyada `process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY` fallback)
- Sonra Supabase Dashboard → Settings → API → JWT secret rotate. Tüm aktif session düşer (kullanıcı yeniden login olur, kabul edilebilir).

### KVKK (avukat danışı, 72 saat sayacı)

- 2026-05-16 ~21:00'de sızıntı tespit edildi → 2026-05-19 ~21:00 son tarih
- Veri Sorumluları Sicili (VERBİS) kayıt durumunu kontrol et
- Kayıtlıysa Kurum'a ihlal bildirimi (KVKK md. 12/5) zorunlu olabilir
- 191 kullanıcıya e-posta bildirimi şablonu hazır olsun (sızan alanlar, alınan önlemler, başvuru hakkı)

### Honeypot kayıt (uzun vade)

- 1 sentinel profile satırı oluştur: özel marker (username `__honeypot_sentinel_001__`)
- Her saatlik cron: bu profil dış IP'den çekilirse Sentry alert (Supabase Logs query API kullanılarak)

---

## Önerilen yürütme sırası

1. **Bugün** — Migration 047 commit + push (yapıldı, push bekliyor)
2. **Bugün** — Phase 2: Turnstile + 048 disposable block + rate limit (3-4 saat)
3. **Pazartesi** — KVKK avukat danışı (paralel)
4. **Bu hafta** — Service-role rotation (2 saat refactor + rotation pencere)
5. **Önümüzdeki sprint** — Phase 3 Madde 9 refactor (5 gün)
