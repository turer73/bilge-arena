# KVKK Avukat Brief — Bilge Arena Veri İhlali

**Hazırlanma:** 2026-05-17
**Veri Sorumlusu:** Turgut Ürer (turgut.urer@gmail.com), Bilge Arena (bilgearena.com)
**Bildirim deadline:** 2026-05-19 22:58 TR (72 saat — KVKK md. 12/5)

## ⚠️ ETKİLENEN KİŞİ SAYISI HAKKINDA

Dump dosyasında **191 satır profil** vardır. Bu satırların bir kısmı saldırganın aynı gün yarattığı bot hesaplardır; geri kalan gerçek kullanıcılar KVKK kapsamında "etkilenen kişi" sayılır.

- **Toplam dump satırı:** 191 (distinct profile ID)
- **Bot hesap (doğrulanmış pattern):** 26 satır, `lunix_NNNN` deseni (disposable email, hepsi aynı saat aralığında, hepsi sonradan silindi — Klipper Discovery #453)
- **Gerçek (legit) kullanıcı etkilenen (alt sınır):** **165** (191 − 26 bot)

> **Teknik kanıt (revize):** rest-profiles.json dump dosyasında 191 distinct `id` UUID, bunların 26 tanesi `^lunix_\d+$` pattern eşleşmesi. Geri kalan 165 kayıt gerçek kullanıcı profili (Google OAuth display_name + avatar URL bulunan kayıtlar dahil). Sayım dump'taki distinct profile ID kümesinden türetilmiştir.
>
> **Not — daha önceki yanlış metodoloji:** Brief'in önceki sürümünde "156 = `SELECT count(DISTINCT user_id) FROM auth.refresh_tokens`" iddiası vardı. Bu metodoloji yanlıştır çünkü:
> 1. `auth.refresh_tokens` audit zamanındaki canlı oturum sahiplerini sayar, dump zamanındaki profilleri değil.
> 2. Dump'taki bir kullanıcının refresh token'ı süresi dolmuş veya hesap silinmiş olabilir; o kullanıcı yine de etkilenir.
> 3. Audit zamanından sonra kayıt olan bir kullanıcının token'ı vardır ama dump'ta yoktur — etkilenmemiştir.
>
> refresh_tokens sayısı (156) yalnızca **dolaylı kanıt** (corroborating evidence) olarak kalır; otoriter sayım dump'ın distinct profile ID kümesinden gelir.

Avukat bildirim formunda **etkilenen kişi sayısı: 165** (191 dump − 26 doğrulanmış bot). Eğer ek bot pattern doğrulanırsa bu sayı aşağı çekilebilir; aksi halde 165 koruyucu (konservatif) bildirimdir.

> **Not:** Bu brief avukata sunulmak üzere hazırlandı. Avukatın değerlendirmesi sonrası KVKK Kurumu'na bildirim yükümlülüğü belirlenecek.

## 1. OLAY ÖZETI

### Ne sızdı?
- **165 gerçek kullanıcı profili (dump'ta 191 satır, 26'sı doğrulanmış `lunix_NNNN` deseninde bot hesap; bot hesaplar sonradan silindi)** (public.profiles tablosu)
- Sızan alanlar (PII) — dump'taki kolon doluluk oranlarıyla birlikte:
  - `username` (kullanıcı adı, kişiyi tanımlayabilir) — 191/191 dolu
  - `display_name` (Google hesabından alınan gerçek ad) — 191/191 dolu
  - `avatar_url` (Google avatar URL — e-posta tahminine yarayabilir) — 156/191 dolu
  - `role` (sistem rolü) — 191/191 dolu, **1 admin tespit edildi** (Turer)
  - `notifications` (kullanıcı bildirim tercihi JSON) — 191/191 dolu
  - `referral_code` (sosyal graf bağı) — 191/191 dolu
  - `created_at`, `updated_at` (kayıt + son güncelleme zamanı) — 191/191 dolu
  - `last_played_at` (son oyun zaman damgası) — 79/191 dolu
  - `total_xp`, `level`, `current_streak`, `total_questions`, `correct_answers`, `total_sessions` (davranış profili) — kısmi dolu (74-79/191)
  - `city` (şehir) — **yalnızca 2/191 dolu**
  - `grade` (sınıf seviyesi 9-13) — **0/191 dolu** (şemada var ama hiç kayıt yok)
  - `is_premium`, `premium_until` (ödeme statüsü) — **0/191 dolu** (henüz ödeme alınmıyor)

> **Not (doluluk kaynak):** rest-profiles.json (191 satır) üzerinde 2026-05-18 sabahı PowerShell ile çalıştırılmış kolon-bazlı null sayımı. Şehir/sınıf/premium alanları şemada mevcut olsa da sızan verinin pratik içeriği bu alanlarda boştur. Bu bilgi KVKK bildiriminde "hangi veri kategorileri etkilendi" değerlendirmesinde sade-tutum (overstatement önleme) için sunulur — alan şemada olduğu için olasılık olarak listede yer alır.

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
| **2026-05-17 ~18:00** | Migration 050+051+052 prod apply (likes trigger + honeypot + integrity fix, drift=0) |
| **2026-05-17 ~18:00** | L2-TR audit: auth.refresh_tokens.distinct_users = 156 (dolaylı kanıt; otoriter etkilenen sayım dump'ın distinct profile ID kümesi — 191 satır − 26 bot = **165**) |
| **2026-05-17 ~18:00** | V2 sign all users out: 564/564 refresh_tokens revoked (active=0). Access JWT residual max 1 saat |

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

### Faz 5: Session invalidation (2026-05-17 ~18:00 TR)
- **V2 sign all users out TAMAMLANDI:** `UPDATE auth.refresh_tokens SET revoked=true WHERE revoked=false` → 183 active token revoke, toplam 564/564 revoked
- Access JWT residual pencere: max **1 saat** (sonra zorunlu re-auth; JWT secret rotate yapılmadı, anon-key kırılma riski + Vercel redeploy zamanlama riski → yumuşak sign-out tercih edildi)
- **Etki:** Saldırgan elinde refresh token kaldıysa hızla geçersiz; legitimate kullanıcılar 1 saat içinde Google OAuth ile re-auth (consent saklı, tek tık)

### Yapılacak / değerlendirilen
- Postgres direct DB password rotate (V1) — envanter sonrası karar (Klipper deep audit Note #111)
- Migration 049 authenticated SELECT REVOKE — final lockdown (admin.ts/proxy.ts refactor sonrası)
- Edge access logging (Traefik + Caddy) — saldırı forensic kapasite (Klipper Discovery #126 + KVKK uyum: 14g retention + IP SHA256 pseudonymize + privacy policy update)
- CF proxy bilgearena.com — şu an DNS-only, edge WAF/rate-limit/bot-protection yok; karar data-driven (edge log topladıktan sonra)

## 5. ETKİLENEN KİŞİ BİLDİRİMİ

### Yapılması düşünülen
KVKK md. 12/5 kapsamında etkilenen **165 gerçek kullanıcıya** email bildirimi (26 doğrulanmış bot hesaba bildirim YOK — saldırganın kendi yarattıkları):

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
- Tüm aktif kullanıcı oturumları 17 Mayıs 18:00 TR'de geçersiz kılındı — bir sonraki ziyarette tekrar giriş yapmanız gerekecek

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
- Etkilenen kişi sayısı: 165 gerçek kullanıcı (dump'ta 191 satır, 26'sı doğrulanmış `lunix_NNNN` deseninde bot hesap — silindi, KVKK kapsamında etkilenen sayılmaz)
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
- 165 gerçek kullanıcının PII bilgisi saldırganın elinde **geri çekilemez** — KVKK ihlali statüsü değişmez (26 bot saldırganın kendi yarattıkları, geri çekme anlamsız)

## 9. EYLEM

| # | İş | Sorumlu | Tarih |
|---|---|---|---|
| 1 | Bu brief'i avukata gönder | Kullanıcı | 2026-05-17 (bugün/yarın) |
| 2 | VERBIS kayıt durumu kontrol | Avukat | 2026-05-18 |
| 3 | Kurum bildirim gerekli mi karar | Avukat | 2026-05-18 |
| 4 | (Gerekiyorsa) Kurum bildirim formu doldur | Kullanıcı + avukat | 2026-05-19 22:58'e kadar |
| 5 | 165 gerçek kullanıcıya email bildirimi (bot hesaplar hariç) | Kullanıcı | Avukat onayından sonra |
| 6 | ~~V2 Sign all users out~~ ✅ TAMAMLANDI (2026-05-17 18:00 TR, 564/564 refresh_tokens revoked) | — | — |
| 7 | V1 Postgres direct DB password rotate (envanter sonrası) | Kullanıcı + Klipper | Bu hafta |
| 8 | Edge access logging (Traefik+Caddy) + KVKK 14g pseudonymize | Klipper sprint | Bu hafta |

---

*Bu brief teknik kanıtlara dayanır. Hukuki yorum ve sonuç avukatın takdirindedir.*
