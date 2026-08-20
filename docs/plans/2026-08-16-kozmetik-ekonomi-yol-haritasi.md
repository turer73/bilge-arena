# Bilge Arena — Kozmetik Sistem ve Ekonomi Yol Haritası

**Tarih:** 2026-08-16
**Durum:** Plan taslağı — onay bekliyor. Kod yazılmadı, production'a dokunulmadı.
**Kapsadığı:** [2026-08-15 Mağaza Ekonomisi](2026-08-15-magaza-ekonomisi.md) planının devamı ve düzeltmesi.

Bu doküman, 2026-08-15/16 oturumunda ölçülen gerçek veriye dayanır. Önceki planın üç
temel ölçümü yanlış çıktı (bkz. §1.6); bu yüzden yalnız "devam" değil, **teşhisin
yeniden kurulması** niteliğinde.

---

## 1. Ölçülen durum

Bütün sayılar 2026-08-16'da production veritabanından ve koddan okundu.

### 1.1 Katalog envanteri

| Kategori | Adet | Fiyat aralığı | Tanım yeri | Mağazada |
|---|---|---|---|---|
| Video arka plan | 26 | 1200–2000 | DB (`background_assets`) | ✅ |
| CSS arka plan | 10 | 400–1500 | `profile-backgrounds.ts` | ✅ |
| Nameplate | 8 | 250–1500 | `profile-nameplates.ts` | ✅ |
| Avatar süsü | 8 | 120–600 | `avatar-decorations.ts` | ✅ |
| Çerçeve | 5 | **30–300** | `profile-frames.ts` | ❌ **yok** |
| Kozmetik rozet | **0** | — | DB (`cosmetic_badges`, boş) | ✅ (boş) |

**Toplam ~57 ürün, en ucuzu 30 altın.**

### 1.2 Ekonomi

| Ölçüm | Değer |
|---|---|
| Dolaşımdaki altın | 1591 |
| Altını olan kullanıcı | 105 / 396 |
| Medyan bakiye (altını olanlar) | 6 |
| Ortalama bakiye (altını olanlar) | 15.15 |
| En yüksek bakiye | **284** |
| **Toplam satın alma (tüm zamanlar)** | **1** |

Bakiye eşikleri — kimin ne alabildiği:

| Eşik | Kullanıcı | Karşılığı |
|---|---|---|
| ≥ 30 | **10** | en ucuz çerçeve |
| ≥ 120 | 3 | avatar süsü |
| ≥ 250 | 1 | nameplate / üst çerçeve |
| ≥ 400 | **0** | CSS arka plan |
| ≥ 1200 | 0 | video arka plan |

**10 kullanıcı bugün bir ürün alabilir durumda ve almamış.**

### 1.3 Kozmetik kullanımı fiilen sıfıra yakın

| Ölçüm | Değer |
|---|---|
| Nameplate seçen | **4** / 396 |
| Avatar süsü seçen | **4** / 396 |
| Satın alma yapan | **1** / 396 |

### 1.4 Aktivite ve mevsimsellik

| Ay | Oturum | Aktif kullanıcı | Kişi başı | Yeni kayıt |
|---|---|---|---|---|
| 2026-03 | 2 | 2 | 1.00 | 3 |
| 2026-04 | 135 | 20 | 6.75 | 43 |
| **2026-05** | **500** | **87** | 5.75 | 175 |
| 2026-06 | 351 | 74 | 4.74 | 127 |
| 2026-07 | **26** | **9** | 2.89 | 20 |
| 2026-08 | **39** | **15** | 2.60 | 28 |

**Temmuz–Ağustos, Mayıs'ın %5–8'i.** Platform YKS/LGS odaklı; yaz tatili dip sezon.
Ağustos verisiyle yapılan her hesap yanıltıcıdır.

Kazanım hızı (migration 129 sonrası, oturum başı ~40 altın):

| Senaryo | Haftalık altın | 1200 için | 250 için |
|---|---|---|---|
| Ağustos (dip) | 25 | 47 hafta | 10 hafta |
| **Mayıs (okul dönemi)** | **53** | **23 hafta** | **4.7 hafta** |
| En yoğun kullanıcı (11 oturum/ay) | ~100 | 12 hafta | 2.5 hafta |

### 1.5 Akış haritası — sorumluluk üç sayfaya dağılmış

| Kişiselleştir alanı | Mağaza sekmesi | Satın alma nerede | Seçim nerede saklanıyor |
|---|---|---|---|
| Avatar | — | ücretsiz (preset, seviye kilidi) | DB `avatar_url` |
| Zemin | Arka Plan | mağaza | localStorage |
| Profil Kartı | Arka Plan | mağaza | localStorage |
| İsim Paneli | İsim Paneli | mağaza | DB `selected_nameplate` |
| **Çerçeve** | — | **profil sayfası** | localStorage |
| Süs | Avatar Süsü | mağaza | DB `selected_avatar_decorations` |
| Rozet | Rozet | mağaza (katalog boş) | — |

Kişiselleştirmede **7 alan**, mağazada **4 sekme**.

Kritik kod satırı (`kisisellestir-client.tsx`):

```ts
ownedFrames = PROFILE_FRAMES.filter(f => f.coinCost === undefined || frameOwnedIds.includes(f.id))
```

Kişiselleştirme ekranı **yalnız sahip olunanları** gösteriyor. Alınabilir ürünler,
fiyatlar, "ne kadar kaldı" bilgisi hiçbir ekranda yok.

### 1.6 Önceki planın yanlış ölçümleri

| İddia | Gerçek | Sebep |
|---|---|---|
| "Toplam satın alma 0" | **1** | Sahiplik `text[]` dizisi açılmadan sorulmuş, varsayılanlarla gerçek alım ayırt edilememiş |
| "26 ürün" | **~57** | Yalnız `background_assets` tablosuna bakılmış, koddaki 4 katalog görülmemiş |
| "En ucuz ürün 1200" | **30** | Aynı sebep — çerçeve katalogu kodda |
| "`rewards.ts` tek dosya, ayar tek yerden" | 3 ayrı yer | Dosya `src/lib/constants/rewards.ts`; oturum ölçeği SQL'de, fiyatlar hem TS hem DB'de |
| "Haftada üç oturum ≈ 120–150 altın" | ~0.64 oturum (yaz), ~1.34 (okul) | Varsayım ölçülmemiş |

Kök neden hepsinde aynı: **satın almanın kendi kaydı tutulmuyor** ve katalog beş ayrı
yere dağılmış.

### 1.7 Altyapı — ne hazır, ne değil

| Bileşen | Durum |
|---|---|
| 5 satın alma RPC'si (atomik, service-role-only) | ✅ hazır, testli |
| 5 satın alma API ucu | ✅ hazır |
| `cosmetic_badges` tablosu + RLS + `badge-assets` bucket | ✅ hazır, **içerik yok** |
| Mağaza 4 sekme + kişiselleştir 7 alan | ✅ hazır, **kopuk** |
| `purchase_ledger` (migration 130) | ⏳ PR #376, production'a uygulanmadı |
| Premium altyapısı | ⚠️ var ama **0 premium kullanıcı**, `PREMIUM_UPSELL: false` |
| Avatar whitelist guard (`avatarPath()`) | ✅ keyfi `avatar_url` enjeksiyonunu engelliyor |

---

## 2. Teşhis

Beş kusur üst üste binmiş. Sıralama **etki büyüklüğüne** göre, önceki planın sırasından farklı:

1. **Keşfedilebilirlik (en büyük).** En ucuz kademe (30–120 altın) mağazada hiç
   listelenmiyor. 10 kullanıcı alım yapabilecekken 1 alım var. Fiyatla açıklanamaz.
2. **Hedef görünmezliği.** Kullanıcı bir ürüne ne kadar uzakta olduğunu göremiyor.
   Kazanç anı (oturum sonu) ile harcama anı arasında bağ yok.
3. **Vitrin çeşitliliği.** Rozet katalogu tamamen boş; kolay kademede yalnız 4 ürün var.
4. **Fiyat–kazanım uyumsuzluğu.** Üst kademe (1200–2000) okul dönemi hızıyla bile
   23 hafta. Ulaşılamaz katman, vitrinin yarısını ölü tutuyor.
5. **Ölçüm körlüğü.** Satın alma defteri yok; hangi müdahalenin işe yaradığı ölçülemez.

Önceki plan 4'ü birinci sıraya koymuştu. Veri 1'in daha büyük olduğunu söylüyor:
**fiyat inmeden de alım yapabilecek 10 kişi var ve yapmıyorlar.**

---

## 3. Hedefler ve ölçütler

**Ana hedef:** öğrenci kişiselleştirme ekranında üç şeyi aynı anda görsün — neye sahip,
şimdi ne alabilir, neye ne kadar kaldı.

Ölçülebilir kabul ölçütleri:

| # | Ölçüt | Bugün | Hedef |
|---|---|---|---|
| Ö1 | Bakiyesi yeten kullanıcıların alım oranı | 1/10 | ≥ 5/10 |
| Ö2 | Toplam satın alma | 1 | ≥ 10 |
| Ö3 | Kozmetik seçen kullanıcı (nameplate/süs) | 4 | ≥ 20 |
| Ö4 | Kolay kademe (≤150 altın) ürün sayısı | 4 | ≥ 10 |
| Ö5 | İkinci ürününü alan kullanıcı | 0 | ≥ 1 |

Ö1 kritik: fiyattan bağımsız, doğrudan keşfedilebilirliği ölçer.

---

## 4. İş paketleri

Her paket bağımsız değer üretir ve tek başına merge edilebilir.

### İP-1 — Satın alma defteri ✅ *(kod hazır, PR #376)*

**Neden:** ölçüm körlüğünü kaldırır; §1.6'daki hataların kök nedeni.

| | |
|---|---|
| Dosyalar | `database/migrations/130_purchase_ledger.sql` |
| Veri modeli | `purchase_ledger(user_id, category, item_id, cost, purchased_at, recorded_at)` + `UNIQUE(user_id,category,item_id)` |
| Teknik | 5 RPC data-modifying CTE'ye çevrildi; defter kaydı borçlandırmayla aynı atomik işlemde |
| Geriye dönük | Mevcut sahiplikler `cost=NULL, purchased_at=NULL` ile geçirilir (uydurulmaz) |
| Test | 20 statik + 11 PostgreSQL ✅ |
| Kalan | **production'a uygulama** |

**Kabul:** `SELECT count(*) FROM purchase_ledger` ≥ 1 (backfill) ve yeni alımda satır oluşur.

---

### İP-2 — Çerçeveyi görünür yap *(küçük, yüksek etki)*

**Neden:** en ucuz kademe (30 altın) mağazada hiç yok; 10 kullanıcının bakiyesi yetiyor.

| | |
|---|---|
| Dosyalar | `magaza/store-tabs.tsx` (5. sekme), yeni `frame-store-client.tsx`, `profil-client.tsx` (satın alma çıkar) |
| API | `POST /api/profile/frames/purchase` — **mevcut, değişmiyor** |
| DB | değişiklik yok |
| Test | mevcut mağaza istemci testleri deseninde yeni test dosyası |
| Boyut | ~250 satır (mevcut `nameplate-store-client.tsx` şablonu) |
| Bağımlılık | yok |

**Kabul:** Mağazada Çerçeve sekmesi; 30 altınlık çerçeve listeleniyor; profil sayfasında satın alma yok.

---

### İP-3 — Üç durum ızgarası *(çekirdek)*

**Neden:** hedef görünmezliği; "142 altın daha" bilgisi hiçbir yerde yok.

Her kozmetik alanında tek ızgara:

| Durum | Görünüm | Eylem |
|---|---|---|
| Sahip | normal | tıkla → uygula |
| Alınabilir | fiyat etiketi, canlı | "Al" → satın al → **otomatik uygula** |
| Yetmiyor | soluk + kilit | **"142 altın daha"** |

| | |
|---|---|
| Yeni | `useCosmeticPurchase` hook + `CosmeticGrid` bileşeni |
| Değişen | `kisisellestir-client.tsx` (662 satır — **küçülmeli**), 5 mağaza istemcisi (~1150 satır → ortak bileşene) |
| API | mevcut 5 uç, değişiklik yok |
| Test | üç durum dalı, satın alma sonrası otomatik uygulama, yetersiz bakiye dalı |
| Boyut | orta-büyük; net satır **azalmalı** |
| Bağımlılık | İP-2 (çerçeve önce sisteme girsin) |

**Kabul:** Yedi alanın hepsinde üç durum görünüyor; `kisisellestir-client.tsx` satır sayısı azalmış; Ö1 ölçülebilir.

---

### İP-4 — Mağaza vitrine dönüşür

**Neden:** mağaza tek satın alma yolu olmaktan çıkıp keşif yolu olsun.

| | |
|---|---|
| Dosyalar | `magaza/page.tsx`, `store-tabs.tsx` |
| İçerik | Yeni eklenenler · kademe kademe gezinme · öne çıkanlar |
| Kategori sekmeleri | korunur (satın alma buradan da yapılabilir) |
| Bağımlılık | İP-3 (ortak ızgara bileşeni) |

**Kabul:** Mağaza girişinde kademe/yenilik vitrini; kişiselleştirmeden satın alma mümkün olduğu için mağaza zorunlu durak değil.

---

### İP-5 — Rozet katalogu *(içerik üretimi)*

**Neden:** kolay kademede yalnız 4 ürün var; rozet tablosu boş ama altyapı hazır.

| | |
|---|---|
| Üretim | Renderhane API — `POST /api/v1/jobs`, tool `logo` (recraft-v4), **8 kredi/adet** |
| Hedef set | 9 rozet: kolay (50–100) ×4, orta (150–250) ×3, yüksek (400+) ×2 |
| Maliyet | **72 kredi** (önce 2 deneme = 16 kredi) |
| Depolama | `badge-assets` bucket (PNG/JPEG/WebP, 2 MB sınır) |
| DB | `cosmetic_badges` satırları: `slug, name, description, category, rarity, coin_cost, icon_url, is_published` |
| Ön koşul | `RENDERHANE_API_KEY` ortam değişkeni (değeri hiçbir yere yazılmaz) |
| Bağımlılık | yok (İP-2/3'e paralel gidebilir) |

**Kabul:** Ö4 — kolay kademe ürün sayısı ≥ 10.

**Sınır:** görsel kalitesini ve marka uyumunu insan değerlendirmeli; DB'ye yazma ayrı onay ister.

---

### İP-6 — Şablonlu avatar üretimi *(ayrı plan gerektirir)*

**Neden:** güçlü altın gideri (sink) + benzersizlik; "kazandım, karşılığı var" algısının en güçlü hali.

**Serbest prompt ÖNERİLMİYOR.** Gerekçe:

1. **İçerik güvenliği.** Kitle 14–18 yaş; üretilen avatar profilde herkese görünür
   (sıralama, düello, lobi). Serbest metin → moderasyon kuyruğu zorunlu → insan emeği.
2. **Gerçek para asimetrisi.** Öğrenci altın harcar (bedava üretilir), platform kredi
   öder (gerçek para). Kullanıcı arttıkça maliyet lineer artar, karşılık gelmez.
3. **Mevcut mimari karara aykırı.** `avatarPath()` guard'ı keyfi `avatar_url`'i bilerek
   engelliyor; `feat/remove-avatar-upload` branch'i yükleme özelliğinin kaldırıldığını gösteriyor.

**Önerilen biçim — şablonlu seçim (kullanıcı metin yazmaz):**

```
Karakter: astronot / kaşif / bilim insanı / sporcu
Tema:     uzay / doğa / siber / retro
Renk:     mavi / mor / turuncu / yeşil
```

Sunucu prompt'u kendisi kurar → 64 kombinasyon + AI varyasyonu. Uygunsuz çıktı
**yapısal olarak imkânsız**, moderasyon kuyruğu gerekmez, whitelist guard'ı korunur.

**Maliyet kontrolü — premium'a bağlamak bugün işe yaramaz:** premium kullanıcı sayısı
**0** ve `PREMIUM_UPSELL: false`. Bu yüzden ilk sürümde:

- yüksek altın fiyatı (500–800) → doğal seyreklik
- kullanıcı başına **ömür boyu 1–2 üretim** limiti
- üretim öncesi platform kredi bakiyesi kontrolü, yetersizse özellik kapanır

**Bu paket ayrı bir plan dokümanı hak ediyor** — asenkron akış (jobId, 3–30 sn bekleme),
hata/iade politikası, depolama, limit takibi kendi başına bir tasarım.

---

### İP-7 — Fiyat ayarı *(ekonomi — en sona)*

**Neden:** üst kademe okul dönemi hızıyla bile 23 hafta; ulaşılamaz katman.

| | |
|---|---|
| Dosyalar | `profile-backgrounds.ts` (CSS) **ve** `background_assets.coin_cost` (DB) — **ikisi birden** |
| Yöntem | Eski değerler yedeklenir, tek transaction, sonra doğrulama |
| Hedef | Giriş 250–350 · orta 400–550 · üst 700 · efsanevi 1000 (önceki plan §4.2) |
| Bağımlılık | **İP-1 + İP-2 + İP-3 canlıda ve ölçülmüş olmalı** |

**Neden en sonda:** İP-2/3 sonrası alım gelirse fiyat sorunu olmadığını öğreniriz.
Gelmezse fiyatı indiririz ve bu kez **sebebini biliyor oluruz**. İkisi aynı anda
değişirse hangisinin işe yaradığı ölçülemez.

---

### İP-8 — Ölçüm

| | |
|---|---|
| Kaynak | `purchase_ledger` (İP-1) |
| Ölçülecek | Ö1–Ö5 + kademe dağılımı + günlük tavana takılan kullanıcı |
| Araç | 14 Eylül'e kurulu cloud routine (`trig_01GDx11ULr8JAosgjKEKhnXA`) |
| **Takvim uyarısı** | 14 Eylül'de okullar **yeni açılmış** olur; veri 1–2 haftalık ve karışık olur. Asıl karar ölçümü **Ekim ortası** olmalı. |

---

## 5. Sıra ve bağımlılıklar

```
İP-1 (defter, PR #376) ──┐
                          ├──> İP-3 (üç durum) ──> İP-4 (vitrin) ──> İP-8 (ölçüm) ──> İP-7 (fiyat)
İP-2 (çerçeve) ───────────┘
İP-5 (rozet) ── paralel, bağımsız
İP-6 (avatar) ── ayrı plan, en son
```

**Önerilen uygulama sırası:** İP-1 → İP-2 → İP-5 (paralel) → İP-3 → İP-4 → İP-8 → İP-7 → İP-6

Gerekçe: İP-1 ve İP-2 küçük, bağımsız ve hemen değer üretir. İP-5 içerik işi, kod işinden
bağımsız ilerler. İP-3 çekirdek. İP-7 en sona kalır ki etkisi ölçülebilsin.

---

## 6. Riskler ve sınırlar

- **Seçim saklama tutarsız.** Zemin/kart/çerçeve `localStorage`, isim paneli ve süs DB.
  Kasıtlı ayrım (başkalarına görünenler DB'de) ama cihaz değişince localStorage seçimleri
  kayboluyor. **Bu plan çözmüyor**, kayda geçiriyor.
- **`avatar-decorations.ts` içinde hem `AVATAR_DECORATION_STORAGE_KEY` hem DB kolonu var** —
  geçişten kalma artık olabilir; İP-3'te dokunulacağı için orada netleşmeli.
- **Dosya büyüklüğü.** `kisisellestir-client.tsx` 662 satır. İP-3 onu küçültmeli;
  büyütürse tasarım yanlış demektir.
- **Mevsimsellik.** Eylül ortasına kadar her ölçüm dip sezon verisidir. Ö1 dışındaki
  ölçütler okul dönemi başlamadan güvenilir değil (Ö1 bakiyesi yetenler üzerinden
  hesaplandığı için mevsimden bağımsız).
- **Renderhane kredisi gerçek para.** İP-5 sabit maliyet (72 kredi), İP-6 **değişken** —
  kullanıcı sayısıyla artar. İP-6'ya limit olmadan girilmemeli.
- **Premium fiilen yok.** 0 premium kullanıcı, upsell kapalı. Premium'a dayanan hiçbir
  tasarım bugün işlemez.
- **Video arka planların lisans riski.** Migration 066'nın kendi notu: Drive'daki derleme
  MP4'ler üçüncü şahıs eseri olabilir, "krediyle satmadan önce kaynak/lisans şart".
  26 ürünün tamamı bu riski taşıyor. **Bu planın kapsamı değil**, ayrı ele alınmalı.
- **Test yükü.** İP-3'te beş mağaza istemcisinin mevcut testleri ortak bileşene taşınacak.

---

## 7. Açık kararlar

| # | Karar | Durum |
|---|---|---|
| K1 | PR #375 (plan düzeltmesi) ve PR #376 (defter) merge | bekliyor |
| K2 | Migration 130 production'a uygulansın mı | bekliyor |
| K3 | `RENDERHANE_API_KEY` ortama konsun mu (İP-5 ön koşulu) | bekliyor |
| K4 | Rozet seti 9 adet / 72 kredi onayı (önce 2 deneme) | bekliyor |
| K5 | Faz 4 ölçüm tarihi 14 Eylül → Ekim ortası çekilsin mi | bekliyor |
| K6 | İP-6 için ayrı plan yazılsın mı | bekliyor |
