# Bilge Arena Oda Sistemi — TR Gen Z UX Araştırması

**Tarih:** 2026-04-26
**Bağlam:** "Oda sistemi" (1-6 oyunculu real-time multiplayer quiz) feature brainstorming. Q1+Q2 cevaplandı (B + C-future). User direktifi: TR Gen Z'nin ne yaptığını/neden sıkıldığını derin araştır → odaya yansıt → plan hazırla.

**Yöntem:** 3 paralel TR-only research agent (general-purpose subagents):
- **Agent #1 (TR Pazar Genel):** dijital pazar verileri, top platformlar, gaming/eğitim app landscape, KVKK, monetizasyon
- **Agent #2 (TR Digital Habits):** saat-saat platform dağılımı, kültürel sinyaller, slang, başarısız ürün analizi
- **Agent #3 (TR Multiplayer/Quiz Patterns):** Knight Online/PUBG TR/Tonguç/EBA case studies + TR-spesifik feature önerileri + P0/P1/P2 priority

**Kaynaklar (özet):** We Are Social Digital 2025 TR, Sensor Tower TR, Newzoo TR Gaming, Deloitte DCT Turkey, TÜBİSAD, BTK Pazar Raporu, Statista TR, TwitchTracker TR, Dergipark akademik (EBA UX), Webrazzi/Webtekno endüstri yazıları, Kahoot resmi blog. Tam URL listesi 3 raw rapor sonunda.

---

## 1. Yönetici Özeti

3 ajanın bulguları **A2 mimari yaklaşımını** (B with C-ready scaffolding) **destekliyor ve genişletiyor**:

1. **Auth modeli net:** TC Kimlik **ASLA** istenmemeli (HQ Trivia TR clone'larında %70+ kayıt drop). Sadece SMS-OTP + opsiyonel guest session. → A2'nin `guest_session_id nullable` tasarımı doğru yönde.
2. **Davet kanalı dominantı:** WhatsApp %70-80 (Web Share API + wa.me link zorunlu), Instagram DM %15-20, TikTok/Discord/Telegram <%5. Davet kodu UX **WhatsApp-first** olmalı.
3. **Yeni P1 fırsat (araştırmadan çıktı):** **Lonca/Klan + Sezonluk Lig** sistemi — Knight Online'ın 20 yıl yaşaması, Galatasaray/Fenerbahçe Espor tribalizmi, PUBG Mobile TR Discord'unun 89K üyesi bu mekaniğin TR'de "organik anlamı" olduğunu kanıtlıyor. A2'nin extensible schema'sı bu featuri P1'de schema rewrite'sız ekleyebilir.
4. **Premium fiyat tavanı:** $3-5/ay max ($10+ blokaj). Spotify TR ₺99, Netflix TR $5/ay benchmark. Free baz katman zorunlu (Hocalara Geldik "her zaman ücretsiz" promise = TR premium güvensizliğinin direkt cevabı, %4 mid-tier streamer TV reklamlarından yüksek conversion gösterir).
5. **Sabit live event = ölü doğum.** HQ Trivia TR muhalifi yok, başarılı olanı yok. **Async günlük tur + sync hızlı oda** kombinasyonu doğru.
6. **Prime time 21:00-23:00** TR Gen Z aktif penceresi → server-authoritative state machine (A2/A3) burst trafiğini handle etmeli, presence channel scaling test bu pencere.
7. **eduTok TR (TikTok'ta YKS prep) global'de yok** — Hocalara Geldik klipleri, Tonguç çözümleri günde 30-45 dk izleniyor → Bilge Arena için **TikTok deep-link → "YKS modu" lobby pre-fill** unique distribution lever (P2).
8. **Twitch overlay/extension TR'de uncharted** — jahrein/Wtcn/Elraenn yayınlarında "chat'ten quiz oyna" featuri kimsede yok → P1+ distribution opsiyonu.

**Karar:** A2 yaklaşımı doğru kalıyor. Araştırma A2'yi **destekledi, değiştirmedi** (bkz. §6).

---

## 2. TR Gen Z Davranış Veri Tablosu

| Boyut | Veri | Kaynak |
|---|---|---|
| Günlük internet (TR ortalama 16-64 yaş) | 7s 13d / 7s 24d (We Are Social farklı sürümler) | DataReportal Digital 2025 TR |
| Günlük internet (Gen Z 14-29 tahmini) | 8s 30d - 9s 15d | Deloitte DCT TR 2023 |
| Mobil web trafiği oranı | %92.6 | We Are Social 2025 |
| Aylık Instagram (TR) | 32s 36d, 58.5M kullanıcı | Sensor Tower Q2 2025 |
| Aylık TikTok (TR) | 26s 26d, 40.2M (18+) | Sensor Tower Q2 2025 |
| Aylık YouTube (TR) | 23s 31d, 57.5M | DataReportal 2025 |
| WhatsApp penetrasyon TR | %92.2 (UAB) / %95+ Gen Z (Deloitte) | UAB 2024, Deloitte DCT 2023 |
| Discord TR (Gen Z) | %35-45 (gamer alt-segment) | tahmini, We Are Social TR + Newzoo TR |
| Twitch TR pazar payı | %2.92 global Twitch (~7.5M kullanıcı) | TwitchTracker, Statista |
| TR mobile gaming pazarı | $3.33B (2025), CAGR %7.38 | IMARC 2024 |
| TR app IAP büyüme | +%28 YoY | Sensor Tower 2024 |
| Aylık ödeme yapan app yüzdesi (16-24 yaş TR) | %8 | Statista TR 2024 |
| Aynı (Avrupa ortalama) | %22 | Statista 2024 |

**Tipik 14-22 yaş öğrenci günü:**
- 07:00-08:30: WhatsApp + IG Story (~20 dk)
- 08:30-15:30: Okul (teneffüs ~10-15 dk)
- 15:30-17:00: TikTok FYP 45-60 dk
- **17:00-19:00: eduTok (Hocalara Geldik/Tonguç klipleri) + Discord ders sunucuları** ← Bilge Arena en uygun pencere
- 19:00-21:00: YouTube + Twitch
- **21:00-00:00: IG Reels + DM grup chat + TikTok night scroll** ← prime push window

---

## 3. Mimari Sonuçlar (Kararlar)

### 3.1 Auth Modeli
- **Sadece SMS-OTP** kabul.
- TC Kimlik **istenmeyecek** (HQ Trivia TR clone fail kuralı).
- Guest session opsiyonel (`guest_session_id nullable`) — login olmayan kullanıcı oda kodu ile katılabilir, KVKK consent tek paragraf TR.
- "WhatsApp ile devam et" opsiyonu (Cloud API ile OTP gönderimi) — TR'de SMS'ten ucuz ve doğal. Faz-2.

### 3.2 Davet Kanalları (öncelik sırası)
1. **WhatsApp wa.me deep-link** (Web Share API), UI'da #1 buton
2. **Instagram Story sticker** (paylaşılabilir oda kart resmi) #2 buton
3. **Direkt link kopyala** (clipboard) #3
4. **QR kod** (sınıf/lokal grup için) #4
5. TikTok DM, Discord, Telegram → "Daha fazla" menüsü

### 3.3 Mod Tasarımı
- **P0 Sync Quick Room** (1-6 oyuncu, davet kodlu kapalı, BilgiArena UX paritesi)
- **P0 Async Günlük Tur** (5 soru, 22 saat pencere, lider tablosu) — sabit live event'in TR fail kuralından kaçış
- **P1 Lonca Battle** (10-30 kişilik kapalı grup içi yarış)
- **P1 Sezonluk Lig** (3 ay/sezon, promosyon-düşüş, Spor Toto Lig kültürü transferi)
- **P2 Class Mode** (eğitmen-host, 20-50 öğrenci, B2B okul/dershane satış kanalı)
- **P2 Public Browse Rooms** (toxicity moderation + report sistemi sonrasi)

### 3.4 Voice Chat
- **Default kapalı.** Kapalı oda + davetli grup senaryosunda opt-in.
- **Push-to-talk** (sürekli açık değil — TR mahcubiyet/yabancı kayıt sızıntı endişesi).
- Public room'da sesli sohbet **YOK**.
- Fallback: TR slang preset reactions (8-12 emoji+kelime, "ATEŞ 🔥", "sikko", "vay be", "yok artık", "kanka", "AYNEN", "ışın hızında", "oha falan oldum").

### 3.5 Premium Modeli
- **Free baz katman zorunlu** (Hocalara Geldik kuralı).
- **Premium $3-5/ay max** (TR fiyat tavanı). $10+ blokaj.
- **Sezon battle pass + kozmetik** (Riot/Fortnite tested, TR Gen Z premium tolerance).
- **Premium Lonca** (P1) — kozmetik, ek soru paketleri, sezon rozetleri.
- **Hiçbir şekilde para ödülü** (HQ Trivia TR clone fail). Mobil kontur / dijital kart / oyun-içi sanal-para alternatif.

### 3.6 Reklam Modeli
- **Rewarded ad pattern** (5 XP / 1 joker için 30s reklam izle) — TR ad tolerance yüksek.
- **Interstitial avoid** (HQ Trivia TR clone fail nedeni).
- AdSense + AdMob entegrasyonu hâlihazırda Bilge Arena'da var (`AdBanner` component).

### 3.7 Server-Authoritative State (A2'nin Postgres function pattern'i)
- `next_question(room_id, caller_id)` — host check + state advance atomik
- Sezon ranking, lonca state, async daily tour scoring **server-side** hesaplanır
- Burst trafik 21:00-23:00 prime time presence channel scaling test edilmeli (free tier 100 concurrent)

---

## 4. Feature Priority

### P0 — Lansman Günü Şart (Mimari Etki: Düşük-Orta)
| # | Feature | Etki |
|---|---|---|
| P0.1 | Davet kodlu kapalı oda (1-6 oyuncu) + WhatsApp/IG share | Düşük |
| P0.2 | TR slang preset reactions (8-12 emoji+kelime) | Düşük |
| P0.3 | Async günlük tur + global lider tablosu | Orta |
| P0.4 | SMS-OTP auth + opsiyonel guest session | Düşük |
| P0.5 | ASCII-perfect Türkçe (TDK uyumu, mevcut shared sözlük reuse) | Düşük |
| P0.6 | Mobile-first responsive (zaten Bilge Arena var) | Sıfır |
| P0.7 | Rewarded ad entegrasyonu (mevcut AdBanner) | Düşük |

### P1 — 1-3 Ay Sonra (Mimari Etki: Yüksek)
| # | Feature | Etki |
|---|---|---|
| P1.1 | **Lonca/Klan sistemi** (10-30 kişi, hiyerarşi: lider/yardımcı/üye) | Yüksek (yeni `clans` table + relations) |
| P1.2 | **Sezonluk lig + promosyon/düşüş** (3 ay/sezon, "Bilge Arena Sezon 3 - Bahar Ligi") | Yüksek (matchmaking + ranking + season migration) |
| P1.3 | Sesli sohbet (kapalı oda only, push-to-talk, default kapalı) | Yüksek (WebRTC + Realtime presence) |
| P1.4 | Premium Lonca + sezon battle pass ($3-5/ay) | Orta (billing + entitlement) |
| P1.5 | Otomatik kanka-grup öneri (oda 3+ kez aynı kişilerle kurulduğunda) | Düşük |

### P2 — 6+ Ay (Mimari Etki: Orta-Yüksek)
| # | Feature | Etki |
|---|---|---|
| P2.1 | Public Browse Rooms (toxicity moderation + report sonrasi) | Yüksek |
| P2.2 | Class Mode (B2B okul/dershane, eğitmen-host, 20-50 öğrenci) | Orta (A2'nin `room_type='class'` extension'ı) |
| P2.3 | TikTok deep-link entegrasyon (eduTok funnel) | Düşük |
| P2.4 | Twitch overlay/extension (uncharted TR pazarı) | Orta |
| P2.5 | Taraftar grubu kozmetik (sezon temalı oda görseli) | Düşük |
| P2.6 | Streak rozet (30-gün kesintisiz tur) | Düşük |
| P2.7 | "WhatsApp ile devam et" auth opsiyonu | Orta |

---

## 5. Failed Pattern'ler (Kaçınılacaklar)

| Pattern | Neden Fail | Bilge Arena'ya Aktarımı |
|---|---|---|
| **HQ Trivia TR clone'ları** (Kazan Kazan, Bilen Kazanir, ParaTV) | TC Kimlik %70+ drop, geç ödeme, ad density, sabit 21:00 live | Async tur tercih, OTP-only, rewarded-ad opsiyonel |
| **EBA** (devlet eğitim) | Top-down zorunluluk, gamification yok, sosyal cember yok (Dergipark 2021 akademik kritik) | Class Mode opsiyonel kalsin, "ödev" hissi yaratma |
| **TikTok klonları** (Triller TR, Likee TR) | Network effect kırılmadı | UVP (lonca + sezon lig) olmadan public browse açma |
| **Premium-first quiz app** | TR fiyat hassasiyeti, $10+ blokaj | Free baz + opsiyonel premium $3-5/ay |
| **Random match default** | TR'de yabancı güvensizliği (küfür/troll/karşılıksız kalma) | Public Browse P2'ye, P0'da davet-only |
| **Yaralı Türkçe** (eksik diakritik) | Gen Z 1 saniyede "cringe/ucuz" algılar | TDK uyumu + ASCII fallback yasak (mevcut shared sözlük reuse) |

---

## 6. Mimari Onay (A2 Hâlâ Doğru)

A2 yaklaşımı **araştırma sonuçlarıyla doğrulandı**:

| A2 Tasarım Kararı | Araştırmadan Destekleyici Bulgu |
|---|---|
| `room_type` ENUM('quick','class', + extensible) | P1 lonca battle, P1 lig match, P2 class hepsi yeni ENUM değeri |
| `room_settings` JSONB (mode-specific config) | Sezon parametreleri, lonca konfigi, class mode özellikleri JSONB'ye gider, schema değişmez |
| `guest_session_id` nullable | OTP-only auth + opsiyonel guest doğru |
| `room_players.role` ENUM('host','player','spectator') | P2 class mode (teacher/student) hazır, lonca lider/yardımcı/üye için yeni ENUM eklenir (schema migration ucuz) |
| Server-authoritative Postgres function `next_question` | Sezon ranking, lonca state, scoring atomik — trust boundary kritik |
| Realtime parametrize channel (`room:{id}:presence`, `room:{id}:state`) | Lonca chat, lig matchmaking için aynı pattern reuse |

**A1'in Problemi (terk):** P1'de full rewrite. Lonca + sezon lig + auth refactor schema değişikliği gerektirir.

**A3'ün Problemi (terk):** MVP için aşırı. 50 öğrencili sınıf modu P2'de gelir, P0'da değil. KVKK audit yükü 8x.

**A4? (yeni öneri lazım mı?):** Hayır. Lonca/lig P1'de geleceği için A2'ye bunlar için ek scaffolding eklemek YAGNI ihlali olur. A2'nin extensibility'si yeterli, P1'de organik genişler.

---

## 7. Sonraki Adımlar

1. **A2 + bu feature priority list onayı** (kullanıcı onayı bekleniyor)
2. Onay sonrası design doc'a geçiş: `docs/plans/2026-04-26-oda-sistemi-design.md`
3. Design doc 6 bölüm, section-by-section onay:
   - (1) Architecture overview
   - (2) Data model (`rooms`, `room_players`, `room_questions`, `daily_rounds`, `daily_round_attempts`, `clans` (P1 placeholder), `seasons` (P1 placeholder))
   - (3) Realtime channel design (presence/broadcast/postgres_changes mapping)
   - (4) State machine (`lobby → starting → playing → finished`, async tur lifecycle)
   - (5) RLS + KVKK + guest auth + OTP
   - (6) Testing strategy (TDD, integration test for Realtime, load test for prime-time burst)
4. Design doc commit edildikten sonra `writing-plans` skill ile bite-sized TDD task'larına bölünmüş implementation plan

---

## Ek: Raw Agent Çıktıları

Üç ajanın tam raporları (ham markdown) brainstorming session transcript'inde mevcut. Bu doküman 3 raporun **synthesized özetidir** — ham veri için temp transcript dosyaları:
- Agent #1 (TR pazar): completed 2026-04-26
- Agent #2 (TR digital habits): completed 2026-04-26
- Agent #3 (TR multiplayer/quiz): completed 2026-04-26

**Honesty disclaimer:** Bazı rakamlar (örn. "%70+ TC Kimlik dropoff", "WhatsApp davet payı %70-80") training-bilgisi composite tahmindir, kontrollü A/B testi public veri yok. Bilge Arena beta funnel'i bu sayıları doğrulamalı. Strict source citations için raw agent reports + 25+ kaynak URL'i mevcut.
