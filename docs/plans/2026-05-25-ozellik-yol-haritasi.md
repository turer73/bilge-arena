# Bilge Arena — Özellik Yol Haritası (2026-05-25)

> **TARİHSEL BELGE — güncel plan değildir.** Bu dosya 25 Mayıs 2026 durumunu korur; bazı “yok/eksik” işaretleri artık geçersizdir. Uygulama ve tamamlanma kararlarında kanonik kaynak: [`2026-08-08-research-roadmap-completion.md`](./2026-08-08-research-roadmap-completion.md). Eski maddeler doğrulanmadan backlog veya yayın durumu olarak raporlanmamalıdır.

**Kapsam:** Kullanıcı wishlist'i + reklam planı, mevcut kod durumuyla eşlenmiş. Güvenlik/ops backlog ayrı: `2026-05-25-yapilacaklar.md`.

**Mevcut durum özeti:** Next.js 15 + Supabase, 9 oyun modu (`wordquest/matematik/turkce/fen` + `duello/oda`), PWA hazır, 50+ rozet sistemi mevcut, adaptive difficulty + daily streak çalışıyor. **Eksik kritik altyapı:** coin ekonomisi yok, ödeme gateway yok (`premium-gate-modal.tsx:77,90` TODO), maskot/shop hiç başlamamış.

---

## Bölüm 1 — Mevcut Durum (Wishlist Eşleme)

| # | Özellik İsteği | Durum | Kanıt |
|---|---|---|---|
| 1 | Maskot sistemi | ❌ Yok | Component yok, tablo yok |
| 2 | Soru bg temaları + coin mağaza | 🟡 Sadece dark/light | `theme-toggle.tsx:8`; coin/mağaza yok |
| 3 | AI bot + maskot entegrasyon | 🟡 Chat var, maskot yok | `src/components/chat/*`, `api/chat/route.ts` (Gemini) |
| 4 | Bil ve Fethet modu | ❌ Yok | - |
| 5 | Profil çerçeveleri | ❌ Yok | `profiles.avatar_url` string, frame tablosu yok |
| 6 | Maskot varyasyonları | ❌ Yok | (1'e bağlı) |
| 7 | Soru zorluğu (adaptive) | ✅ Var | `api/profile/difficulty/route.ts:14-29`, `user_topic_progress` |
| 8 | İngilizce branşı (A1-B2/IELTS) | 🟡 Ayrı repo'da | `turer73/bilge-arena-en` aktif (sürer ile) |
| 9 | Kule (Tower) modu | ❌ Yok | - |
| 10 | Giriş serisi (streak) | ✅ Var | `profiles.current_streak/longest_streak`, `api/daily-login`, cron `daily-streak-reminder` |
| 11 | Trophy/rozet sistemi | ✅ Var | `user_achievements` (mig 042), `badges` (50+), `badge-showcase.tsx` |
| 12 | App versiyon (mobile) | 🟡 PWA hazır | `manifest.json`, `pwa-install-prompt.tsx`, `sw-register.tsx`; Capacitor/RN yok |

**Sonuç:** 3/12 ✅, 3/12 🟡, 6/12 ❌. Eksiklerin çoğu **ortak altyapıya** bağımlı (coin + shop).

---

## Bölüm 2 — Önkoşul Altyapı (Bunlar olmadan üst-listenin yarısı yapılamaz)

### A. Coin Ekonomisi
- [ ] `coins` kolonu `profiles`'a ekle (mevcut sadece `total_xp` var)
- [ ] `coin_transactions` tablosu (kazanç/harcama audit)
- [ ] Coin kazanma kuralları: quiz tamamlama, streak milestone, kule mod skoru, ilk-deneme bonusu
- [ ] `api/coins/balance`, `api/coins/award`, `api/coins/spend` (proxy pattern, server-only)
- [ ] Anti-cheat: coin işlemleri sadece server-side, client'a sadece bakiye okuma

### B. Mağaza (Shop) Modülü
- [ ] `shop_items` tablosu: `id, type ('theme'|'frame'|'mascot_variant'), name, coin_price, asset_url, rarity, is_free`
- [ ] `user_inventory` tablosu: `user_id, item_id, equipped, acquired_at` (UNIQUE pair)
- [ ] `api/shop/items` (listele), `api/shop/purchase` (atomik: coin spend + inventory insert), `api/shop/equip`
- [ ] `/magaza` sayfası: kategori sekmesi (Tema / Çerçeve / Maskot), nadirlik filtresi, owned/locked görünüm
- [ ] Equipped item'ları profile/quiz UI'ında render eden hook (`useEquippedItems()`)

### C. Ödeme Gateway (premium + coin paketleri)
- [ ] `premium-gate-modal.tsx:77,90` TODO kapansın — provider seç (iyzico TR-uyumlu, KVKK iz düşümü kolay)
- [ ] `coin_packages` tablosu: TL → coin dönüşüm tarifeleri
- [ ] Webhook handler + `purchase_orders` audit
- [ ] KVKK: ödeme verisi 3. parti vendör tarafında; sözleşme + aydınlatma metni güncelleme

---

## Bölüm 3 — Yeni Özellik Sprintleri

### Sprint F.1 — Maskot Sistemi (Foundation)
- [ ] Maskot karakter tasarımı tamamlansın (kullanıcı: "yapım aşamasında")
- [ ] `mascots` tablosu: `id, name, slug, base_asset_url, is_default`
- [ ] `mascot_frames` tablosu: `mascot_id, state ('idle'|'talk'|'happy'|'sad'|'thinking'), frame_index, asset_url, duration_ms`
- [ ] `<Mascot state="idle" />` component — sprite veya Lottie (framer-motion zaten dep)
- [ ] `profiles.equipped_mascot_id` FK + default seed
- [ ] Landing/quiz/profile sayfalarında konumlandırma

### Sprint F.2 — Maskot Varyasyonları (F.1 üstüne)
- [ ] Çoklu frame animasyon engine (state machine: idle→talk→idle)
- [ ] Konuşma balonu component (`<MascotSpeech text="..." />`)
- [ ] Skin varyantları shop'tan satın alınabilir (B modülü gerekli)
- [ ] Quiz "doğru/yanlış" geri bildiriminde maskot reaksiyon (happy/sad)

### Sprint F.3 — AI Bot + Maskot Entegrasyonu
- [ ] Mevcut `chat-widget.tsx` UI'ı maskot ile sar (chat açılınca maskot "talk" state)
- [ ] Yanıt geldikçe maskot dudak/göz animasyonu (frame tetikleme)
- [ ] Chat icon yerine maskot floating button

### Sprint F.4 — Tema/Arka Plan Mağazası
- [ ] `shop_items.type='theme'` seed: 5 free + 10 coin'li bg
- [ ] Quiz `QuestionCard` arka planını `equipped_theme` ile boyamayı destekle (CSS variable)
- [ ] Preview modal (satın almadan önce göster)
- [ ] Free temalar yeni kullanıcıya auto-grant (`user_inventory` insert on signup)

### Sprint F.5 — Profil Çerçeveleri
- [ ] `shop_items.type='frame'` seed: nadirlik 5 tier (common→legendary, MLBB modeli)
- [ ] `<AvatarWithFrame avatar={...} frameId={...} />` component
- [ ] Profile page + leaderboard + comments'ta render
- [ ] Rare frame'ler achievement bağlı (sadece coin değil, "X başarımı al" gate)

### Sprint F.6 — Bil ve Fethet Modu
- [ ] Tasarım dokümanı: harita? sıra-tabanlı bölge fethi? takım vs solo?
- [ ] Yeni route `/arena/fethet`, yeni `game='conquest'` enum
- [ ] `conquest_regions`, `conquest_progress` tabloları
- [ ] Mevcut `game_sessions` pattern'ı reuse et (status/score/xp_earned alanları)
- [ ] Sezon sistemi (haftalık/aylık reset)

### Sprint F.7 — Kule (Tower) Modu
- [ ] Yeni route `/arena/kule`, `game='tower'`
- [ ] 3 can hakkı state machine (`api/tower/start`, `api/tower/answer`, `api/tower/forfeit`)
- [ ] Zorluk progresyonu: kat sayısı arttıkça `difficulty++` (mevcut adaptive RPC'yi tersine kullan)
- [ ] Kategori seçimi: spesifik (matematik-only) veya karma
- [ ] Skor + coin ödülü tablosu (her 5 katta coin, milestones)
- [ ] Global ve haftalık Tower leaderboard

### Sprint F.8 — Streak Genişletme
- [ ] (Var olan üzerine) Streak rozeti `badges`'e ekle: 7/30/100/365 gün tier'ları
- [ ] Streak freeze item (mağazadan satın alınır, 1 gün giriş kaçırma affı)
- [ ] Profilde streak rozeti prominent göster
- [ ] Push notification: streak break uyarısı (mevcut `push_subscriptions` tablosu kullanılabilir)

### Sprint F.9 — Soru Zorluk Tutarlılığı
- [ ] (Mevcut adaptive var) — "tek bir sınav içinde sorular benzer zorlukta" gereksinimi
- [ ] `api/questions/random` çağrılarına `target_difficulty` band parametresi (±0.5)
- [ ] Yeni mod: "kolaydan zora ramp" (sırasıyla artan band)
- [ ] Admin'de zorluk dağılım görselleştirme (mevcut `admin/stats` üzerine)

### Sprint F.10 — İngilizce Branşı (Karar)
- [ ] **Karar gerekli:** `bilge-arena-en` ayrı app olarak kalacak mı, ana repo'ya merge mi?
- [ ] Ayrı kalırsa: ana siteden cross-link + SSO (Supabase shared)
- [ ] Merge ise: subdomain veya `/ingilizce/*` route grubu, ayrı `game` enum (`en_a1`, `en_b2`, `en_ielts`)
- [ ] Mevcut `wordquest` İngilizce sözcük modu — CEFR seviyeleri eklenebilir (sadece soru havuzu işi)

### Sprint F.11 — Mobile App
- [ ] **Karar:** Capacitor (mevcut Next.js'i wrap, en hızlı) vs React Native (yeniden yaz) vs PWA-only (zaten var)
- [ ] PWA zaten install edilebilir — Play Store/App Store için TWA (Android) + Capacitor wrapper (iOS) en kısa yol
- [ ] Push notification permission flow native'e taşı (web push zaten çalışıyor)

---

## Bölüm 4 — Reklam/Pazarlama Operasyonu

| Aktivite | Sıklık | Sorumlu | Takip |
|---|---|---|---|
| Shorts video | Haftada min. 2 | İçerik ekibi | YouTube/TikTok/Reels (3 platform aynı içerik) |
| Post paylaşımı | Günde 1 | İçerik ekibi | IG + X + LinkedIn (varsa) |
| Popüler YKS video yorumu (ana hesap) | Günde 3-5 | Topluluk yöneticisi | YouTube hedef liste |
| Çoklu-hesap yorum | Günde 5-10 | (Etik: organik görünüm; bot kullanma) | Aynı IP'den çoklu hesap risk — manuel + farklı cihaz |
| Tweet | Günde 1-3 | İçerik ekibi | X scheduler (Buffer/Hypefury) |
| Story | Günde 1 | İçerik ekibi | IG + X (Fleet kapandı) |
| Yorum/DM yanıtı | Günde 1 kontrol | Topluluk yöneticisi | Hedef <24h yanıt |

**Yapılacak operasyonel altyapı:**
- [ ] İçerik takvimi (Notion/Trello board) — 2 haftalık plan görünür olsun
- [ ] Brand kit kullanımı: `docs/brand.md` mevcut, paylaşımlarda referans
- [ ] Hedef YKS kanalları listesi (top 20)
- [ ] Yorum şablonları (5-10 varyant, sürekli aynı şey demesin)
- [ ] Analitik takibi: hangi içerik → kayıt dönüşümü (Plausible custom events)
- [ ] Etik sınır: çoklu-hesap yorumlar **manuel ve farklı kişiler** olmalı, bot/farm değil (yakalanırsa marka itibarı + platform ban riski)

---

## Bölüm 5 — Öncelik Önerisi (Quick-Win → Stratejik)

**Sprint 0 (1 hafta, blocker):** Güvenlik kapanışı — `2026-05-25-yapilacaklar.md` P0/P1.

**Sprint 1 (2-3 hafta):** Önkoşul altyapı A+B — Coin + Shop. **Bunlar olmadan tema/çerçeve/maskot wishlist'in yarısı yapılamaz.**

**Sprint 2 (1 hafta):** F.1 Maskot Foundation (tasarım dış bağımlılık — bekletmemek için paralel başlat).

**Sprint 3 (2 hafta):** F.4 Tema mağazası + F.5 Çerçeveler (Coin + Shop ve Maskot tamamlandıktan sonra hızlı win'ler).

**Sprint 4 (2-3 hafta):** F.7 Kule modu (yeni içerik, yüksek viral potansiyel, shorts içeriğine malzeme).

**Sprint 5 (1 hafta):** F.2 Maskot varyasyonlar + F.3 AI entegrasyonu (mağaza + maskot foundation üstüne).

**Sprint 6 (3-4 hafta):** F.6 Bil ve Fethet (en büyük yeni feature, tasarım dokümanı önce).

**Paralel sürekli:** Bölüm 4 pazarlama, Sprint 0'dan itibaren çalışır.

**Karar bekleyen:** F.10 İngilizce (merge vs ayrı), F.11 Mobile (Capacitor vs RN vs PWA-only), C ödeme provider (iyzico vs Stripe).

---

## İlgili dosyalar
- Güvenlik/ops backlog: `docs/plans/2026-05-25-yapilacaklar.md`
- Mevcut runbook: `docs/runbooks/2026-05-17-madde9-final-lockdown.md`
- Brand: `docs/brand.md`
- Strateji: `docs/strategy.md`
