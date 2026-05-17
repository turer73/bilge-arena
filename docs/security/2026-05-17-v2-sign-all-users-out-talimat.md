# V2: Sign All Users Out — Talimat

**Tarih:** 2026-05-17 hazırlandı
**Klipper deep audit kaynak:** Note #111 V2 vector

## Neden gerekli?

JWT secret rotate **yapmadık** (kullanıcı session'larını düşürmemek için). Bu kararın yan etkisi:

- Service-role rotation tek başına refresh token'ları geçersiz kılmaz
- Saldırgan eğer bir kullanıcının refresh token'ını ele geçirdiyse, **rotate sonrası bile session valid**
- "Sign all users out" Supabase Auth Dashboard butonu tüm aktif sessionları geçersiz kılar

> ⚠️ **Önemli — sign-out anlık JWT invalidation değildir:** Supabase sign-out **refresh token'ları** revoke eder (yeni access token üretilemez), ancak **halihazırda dağıtılmış access token JWT'leri** kendi expire süresi (varsayılan 1 saat) kadar geçerli kalır. Saldırgan elindeki access JWT ile API çağrılarına token expire olana kadar devam edebilir. **Anlık (immediate) invalidation gerekiyorsa JWT secret rotate** (Bölüm "Adım 2 alternatif" — Dashboard → Settings → API → JWT Secret → Generate new secret). Bu seçenek tüm mevcut access JWT'leri **anında 401** yapar. KVKK için "tüm session invalidate" iddiası ediliyorsa JWT secret rotate önerilir; sadece sign-out yapıldıysa "refresh revoke + access window ≤1 saat" daha doğru ifade.

## Etki

- 156 Google OAuth kullanıcı + diğer magic link kullanıcılar **logged out** olur
- Bir sonraki ziyarette Google OAuth → tek tık (consent zaten verilmiş)
- Premium hesap yok, paid feature kesintisi yok
- **KVKK için altın:** "tüm aktif session invalidate edildi" diyebilmen

## Adımlar

### Adım 1 — Supabase Dashboard
1. https://supabase.com/dashboard/project/lvnmzdowhfzmpkueurih
2. Sol menü → **Authentication** → **Users**
3. Sağ üstte 3 nokta `...` veya **Bulk actions** menüsü
4. **"Sign all users out"** veya **"Logout all users"** butonu
5. Onay diyaloğu → onayla

### Adım 2 alternatif A — JWT secret rotate (anlık invalidation)
Saldırgan access JWT elindeyse veya KVKK "tüm session invalidate" iddiası gerekirse:
1. Supabase Dashboard → Settings → API → **JWT Secret**
2. **"Generate new secret"** → onayla
3. Tüm mevcut access JWT'ler anında 401 döner — kullanıcı yeniden login
4. Vercel env'deki `SUPABASE_JWT_SECRET` varsa güncelle + redeploy
5. **Uyarı:** Bu işlem geri alınamaz, kullanıcılar refresh + redirect ile yeniden yetkilenir

### Adım 2 alternatif B — SQL (eğer Dashboard button yoksa, refresh revoke yeterli)
SQL Editor:
```sql
-- Tüm refresh tokenları revoke et
UPDATE auth.refresh_tokens
SET revoked = true, updated_at = NOW()
WHERE revoked = false;

-- Kontrol
SELECT count(*) AS total, count(*) FILTER (WHERE revoked = true) AS revoked
FROM auth.refresh_tokens;
```

### Adım 3 — Doğrulama
1. Inkognito tab → bilgearena.com aç
2. Normal browser'da login durumunda olmalıydın → logout edilmiş olmalı
3. Yeni login → Google OAuth seç → callback sonrası /arena yüklenmeli

### Adım 4 — Active session sayısı kontrol
SQL:
```sql
SELECT
  count(*) FILTER (WHERE created_at >= NOW() - INTERVAL '5 minutes') AS new_logins_5min,
  count(*) FILTER (WHERE revoked = false) AS active_unrevoked
FROM auth.refresh_tokens;
```

Beklenti:
- `active_unrevoked` → 0 (Sign all out sonrası) veya az sayıda yeni login
- 5-30 dk sonra `new_logins_5min` artar (kullanıcılar geri gelir)

## Risk

| Risk | Olasılık | Etki | Önlem |
|---|---|---|---|
| Kullanıcı şikayet (neden logout?) | Düşük | Düşük | İçeride banner veya modal "güvenlik güncellemesi nedeniyle yeniden giriş" |
| Google OAuth re-consent | Yok | — | Consent saklı |
| Magic link user'lar email gönderim limit'i | Düşük | Orta | Supabase email rate 30/h yeterli |

## Yapılmazsa ne kaybedersin?

- Saldırgan refresh token elindeyse session devam eder
- Yeni endpoint'ler (Madde 9 sonrası) saldırgan tarafından kullanılabilir
- KVKK için "session'lar invalidate" diyemezsin

## Yapılırsa ne kazanırsın?

- Refresh token sızıntısı vektörü tamamen kapanır
- KVKK avukat brief'ine eklenecek somut adım
- "Belt and suspenders" — service-role + session rotate kombinasyonu
