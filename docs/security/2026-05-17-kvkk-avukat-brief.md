# KVKK Avukat Brief — Bilge Arena Veri İhlali

**Hazırlanma:** 2026-05-17
**Veri Sorumlusu:** Turgut Ürer (turgut.urer@gmail.com), Bilge Arena (bilgearena.com)
**Bildirim deadline:** 2026-05-19 22:58 TR (72 saat — KVKK md. 12/5)

> **Not:** Bu brief avukata sunulmak üzere hazırlandı. Avukatın değerlendirmesi sonrası KVKK Kurumu'na bildirim yükümlülüğü belirlenecek.

## 1. OLAY ÖZETI

### Ne sızdı?
- **191 kullanıcı profili** (public.profiles tablosu)
- Sızan alanlar (PII):
  - `username` (kullanıcı adı, kişiyi tanımlayabilir)
  - `display_name` (Google adı)
  - `avatar_url` (Google avatar URL — e-posta tahminine yarayabilir)
  - `city` (şehir)
  - `grade` (sınıf seviyesi 9-13)
  - `role` (sistem rolü — 1 admin tespit edildi)
  - `is_premium`, `premium_until` (ödeme statüsü)
  - `total_xp`, `level`, `current_streak`, `last_played_at` (davranış profili)
  - `created_at`, `referral_code` (zaman + sosyal graf)

### Ne sızmadı (bilinen)?
- `auth.users` tablosu (e-posta + parola hash) — sızıntı kanıtı yok
- Ödeme bilgileri (Bilge Arena henüz ödeme almıyor)
- Kişisel mesajlar / yorumlar içerik bazlı

### Nasıl sızdı?
**Vektör kanıtlanmadı.** Log retention 7 gün; saldırı 14 gün keşif evresi sonrası gerçekleşti — ilk evre logları yok. En olası iki vektör:
1. **Service-role JWT sızıntısı** (en yüksek olasılık) — eski legacy JWT format servisrole key birden çok yerde tutuluyordu
2. Admin kullanıcı JWT/şifre kompromi (düşük — admin Google OAuth + 2FA korumalı, last_sign_in_at saldırı penceresi dışı)

## 2. ZAMAN ÇİZELGESİ

| Tarih/Saat (TR) | Olay |
|---|---|
| **2026-05-02** | Saldırgan keşif başlangıcı (tahmini, log retention dışı) |
| **2026-05-16 ~23:42** | Profil dump talep edildi (saldırgan rest-profiles.json dosyası elde etti) |
| **2026-05-17 00:11** | Ürün katkıcısı Ensar bildirim verdi (WhatsApp) — dump JSON paylaşıldı |
| **2026-05-17 02:00–03:30** | Acil müdahale Faz 1: 8 SECURITY DEFINER fonksiyon REVOKE, 26 bot hesap silindi |
| **2026-05-17 09:00–13:00** | Faz 2: Migration 040 (anon column REVOKE) prod, 8 PR proxy refactor |
| **2026-05-17 ~14:53** | Tüm Madde 9 PR'ları merge (8 PR, browser→API proxy migration) |
| **2026-05-17 ~17:30** | Service-role JWT rotate + legacy JWT disable, 4/4 verification PASS |

## 3. SALDIRGAN PROFIL

- Ensar bildirimi: "bizim gençlerden biri yine sızma testi yapmış"
- Insider/yakın tanıdık → responsible disclosure niyetli görünüyor
- Otomasyon scripti kullandı (70 saniyede 25 bot hesap kayıt)
- Genç (yaş bilinmiyor — yasal sorumluluk için önemli)
- Kapsamlı zarar yapmadı, kanıt göstermek için yapmış görünüyor

## 4. ALINAN TEKNİK ÖNLEMLER

### Faz 1: Acil müdahale (24 saat içinde)
- 8 SECURITY DEFINER fonksiyon anon EXECUTE REVOKE (Migration 047)
- soft_delete_user privilege escalation kapatıldı (Migration 047a)
- 26 bot hesap silindi (profiles + auth.users)
- Disposable email block (85 domain, Migration 048)
- hCaptcha enable (Supabase Auth Bot and Abuse Protection)
- Rate limit signup 5/5dk per IP

### Faz 2: Refactor (Madde 9 — pentest raporu)
- 8 PR ile tüm browser→Supabase direkt çağrıları `/api/*` proxy'lerine taşındı
- Migration 040: anon column-level GRANT (sadece public alanlar)
- Migration 041: anon questions tablosu REVOKE

### Faz 3: Credential rotation
- Yeni Supabase API key (sb_secret_) formatı üretildi
- Eski legacy service_role + anon JWT **disabled** (Supabase Dashboard)
- Vercel env güncellendi + redeploy
- 4 verification test PASS — saldırgan elindeki eski JWT artık 401 dönüyor

### Faz 4: Defense-in-depth (devam ediyor)
- CSRF Origin allowlist middleware (PR #154)
- likes_count race condition trigger (PR #154)
- Honeypot sentinel profile (PR #154)

### Yapılacak / değerlendirilen
- Postgres direct DB password rotate (V1) — envanter sonrası karar
- Tüm aktif kullanıcı session'larını invalidate (V2) — "Sign all users out"
- Migration 049 authenticated SELECT REVOKE — final lockdown

## 5. ETKİLENEN KİŞİ BİLDİRİMİ

### Yapılması düşünülen
KVKK md. 12/5 kapsamında etkilenen 191 kullanıcıya email bildirimi:

**Şablon (TR):**
```
Sayın [Kullanıcı Adı],

16 Mayıs 2026 tarihinde Bilge Arena hesap bilgilerinizin yer aldığı bir
veri tabanı kaydının üçüncü bir şahıs tarafından izinsiz okunduğu tespit
edildi. Yapılan inceleme sonucu:

ETKILENMEYEN BILGI:
- Şifreniz (Google OAuth ile giriş yaptıysanız, Google'da güvende)
- E-posta adresiniz (sızıntıda yer almıyor)
- Ödeme bilgileriniz

ETKILENEN BILGI:
- Kullanıcı adı, görünen ad
- Profil fotoğrafı bağlantısı (Google)
- Şehir, sınıf bilgisi
- Oyun istatistikleriniz (XP, seri, level)

ALDIĞIMIZ ÖNLEMLER:
- Sızıntı vektörü 17 Mayıs sabahı kapatıldı
- Saldırgan elindeki yetki belgeleri geçersiz kılındı
- 8 güvenlik iyileştirmesi production'a uygulandı
- Yeni saldırıyı tespit eden honeypot sistemi kuruldu

HAKLARINIZ (KVKK md. 11):
- İşlenip işlenmediğini öğrenme
- Silinmesini isteme (hesap silme: /arena/profil > Hesabı Sil)
- Bilgi talep etme: iletisim@bilgearena.com

Özür dileriz, güvenliğiniz öncelimiz.
Bilge Arena
```

### Bildirim yöntemi
- E-posta (Supabase Auth'taki email adresi kullanılır — Google OAuth ile geldiyse Google email)
- Resend API ile (mevcut altyapı)

## 6. KURUM BİLDİRİMİ (KVKK md. 12/5)

**72 saat içinde** (deadline: 2026-05-19 22:58 TR) Kurum'a bildirim gerekiyor MI?

**Avukat değerlendirmesi gereken kriterler:**
1. **Veri Sorumluları Sicili (VERBİS) kayıt durumu** — turgut.urer@gmail.com adına kayıt var mı?
2. Şahıs veri sorumlusu eşiği (50.000+ kayıt) — Bilge Arena 191 kayıt, eşik altı
3. Eşik altı olsa bile bildirim yükümlülüğü olabilir mi? (avukat değerlendirsin)

**Form:** https://www.kvkk.gov.tr → Veri İhlali Bildirim Formu
**Doldurulacak alanlar:**
- İhlal tarihi: 2026-05-16
- Tespit tarihi: 2026-05-17 00:11
- Kategori: PII (kişisel bilgiler)
- Etkilenen kişi sayısı: 191
- Alınan önlemler: yukarıdaki Faz 1-4 özeti
- Etkilenen kişi bildirimi planlandı mı: Evet, hazır

## 7. EK KANIT ZİNCİRİ

Avukata sunulacaklar:
- `rest-profiles.json` (174KB, 191 satır) — saldırgan tarafından paylaşılan dump dosyası
- Ensar WhatsApp screenshot (2026-05-17 00:11 TR bildirim)
- Discovery memory kayıtları #446, #447, #448, #449, #450, #451, #453 (Klipper merkezi hafıza)
- PR listesi: #146-#154 (GitHub görüntülenebilir)
- Service-role rotation verification: T1-T4 curl test sonuçları (T4: eski JWT 401)

## 8. ÇÖZÜMSÜZ KALAN

Dürüstlük gereği avukatla paylaşılmalı:
- **Saldırı vektörü kanıtlanmadı** (log retention 7 gün, 14 gün keşif evresi kayıp)
- **Saldırı süresinin tam başlangıcı belirlenemedi** (Klipper analizi)
- 191 kullanıcının PII bilgisi saldırganın elinde **geri çekilemez** — KVKK ihlali statüsü değişmez

## 9. EYLEM

| # | İş | Sorumlu | Tarih |
|---|---|---|---|
| 1 | Bu brief'i avukata gönder | Kullanıcı | 2026-05-17 (bugün/yarın) |
| 2 | VERBIS kayıt durumu kontrol | Avukat | 2026-05-18 |
| 3 | Kurum bildirim gerekli mi karar | Avukat | 2026-05-18 |
| 4 | (Gerekiyorsa) Kurum bildirim formu doldur | Kullanıcı + avukat | 2026-05-19 22:58'e kadar |
| 5 | 191 kullanıcıya email bildirimi | Kullanıcı | Avukat onayından sonra |
| 6 | V2 Sign all users out | Kullanıcı | Mümkünse bu hafta |

---

*Bu brief teknik kanıtlara dayanır. Hukuki yorum ve sonuç avukatın takdirindedir.*
