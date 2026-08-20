# Bilge Arena — Mağaza Ekonomisi Yeniden Kurulumu

**Tarih:** 2026-08-15
**Durum:** Plan taslağı — onay bekliyor. Kod yazılmadı, production'a dokunulmadı.

## 1. Ölçülen durum

Aşağıdaki sayıların tamamı 2026-08-15'te production veritabanından okundu.

### Ekonomi

| Ölçüm | Değer |
|---|---|
| Dolaşımdaki **toplam** altın | **1332** |
| Altını olan kullanıcı | 104 / 394 |
| Medyan bakiye | **5.5** |
| En yüksek bakiye | **209** |
| Mağazadaki en ucuz ürün | **1200** |
| **Toplam satın alma** | **1** |

Platformdaki bütün altın toplansa bir tek ürün alınabiliyor.

> **Düzeltme (2026-08-16).** Bu satır ilk yazımda **0** idi ve planın "sıfır satış"
> anlatısı ona dayanıyordu. Yanlıştı: 396 kullanıcıdan biri `gunes-patlamasi` arka
> planını satın almış. Ölçüm hatasının sebebi, satın almanın kendi kaydının
> **hiç tutulmaması** — sahiplik `profiles.owned_backgrounds` gibi `text[]`
> dizilerinde duruyor, zaman damgası yok, bu yüzden alımın ne zaman yapıldığı da
> bilinemiyor. Doğru sorgu, varsayılanları dışlayarak diziyi açmak:
>
> ```sql
> SELECT count(*) FROM (SELECT unnest(owned_backgrounds) i FROM profiles) x
> WHERE i NOT IN ('none','gece-mavisi');
> ```
>
> Teşhis değişmiyor — 26 ürünlük mağazada tek alım da ölü demektir — ama
> **Faz 4'ün başarı kriteri değişiyor** (bkz. bölüm 3).

### Kazanım kaynakları

| Kaynak | Miktar | Nerede |
|---|---|---|
| Doğrulanmış oturum | **doğru cevap başına 1 altın** | migration 093, `reward_ledger` (`source_type='session'`, `reward_key='correct_answers'`) |
| Günlük giriş | `min(streak × 2, 20)` — günde en fazla 20 | `increment_coins` |
| Onaylanan UGC sorusu | 50 | `increment_coins` |

**Ana döngü altın üretiyor, ama ölçek iki büyüklük mertebesi küçük.** Ölçüm:

| | |
|---|---|
| Oturumdan gelen toplam altın | **169** (19 kayıt, 1–34 arası) |
| Ortalama oturum kazancı | **~9 altın** |
| Kazanımın başladığı tarih | **2026-08-09** (migration 093) |
| En ucuz ürün için gereken oturum | **~133** |

Kişi başı ortalama oturum 5.5 iken 133 oturum ulaşılamaz. Fiyatlar, oturum kazanımı devreye girmeden önceki varsayımlarla konmuş görünüyor ve yeni kazanımla hiç uyumlanmamış.

### Vitrin

| Kategori | Durum |
|---|---|
| Profil arka planı | 26 ürün, 1200–2000 altın (lofi/manzara/cyberpunk/pixel/çizgi-roman/kozmik) — **tek satılan kategori: 1 alım** |
| Kozmetik rozet | tablo **boş** |
| Avatar süsü | sahip olan **0** kullanıcı |
| Nameplate / çerçeve | varsayılanlar dışında satın alınan yok (0 / 0) |

Fiilen tek kategori var — ve o kategoride de 396 kullanıcıdan yalnız biri alım yapmış.

### Aktivite

| Ölçüm | Değer |
|---|---|
| Toplam oturum / oynayan kişi | 1051 / 191 (kişi başı 5.5) |
| Son 30 gün | 50 oturum, **18 aktif kullanıcı** |
| Son 7 gün | **9 aktif kullanıcı** |
| Ortalama oturum XP | 145 (10–1070) |

## 2. Teşhis

Sorun teknik değil. Satın alma altyapısı sağlam: dört ayrı uç (`backgrounds`, `avatar-decorations`, `cosmetic-badges`, `frames`), her biri atomik RPC (`purchase_background` vb.), rate limit'li ve testli.

Üç ayrı kusur üst üste binmiş:

1. **Kazanım ölçeği yanlış.** Ana döngü altın üretiyor (doğru başına 1) ama ortalama oturum ~9 altın veriyor. En ucuz ürün için ~133 oturum gerekiyor; kişi başı ortalama 5.5 oturum.
2. **Fiyatlar kazanımdan bağımsız konmuş.** Oturum kazanımı 9 Ağustos'ta (migration 093) geldi; fiyatlar ondan öncesine ait ve hiç güncellenmedi.
3. **Vitrin tek kategoriye düşmüş.** Rozet tablosu boş, avatar süsü sahibi yok. Hedef çeşitliliği yok.

Sonuç: 26 ürünlük mağaza 396 kullanıcıya karşılık **tek bir satış** görmüş ve altın oyunda pratikte hiçbir anlam taşımıyor.

## 3. Hedef

Düzenli çalışan bir öğrenci **iki-dört hafta içinde** ilk ürününü alabilmeli. Bu, hem ulaşılabilir hem de değerini koruyan bir aralık: bir haftada alınırsa ödül anlamsızlaşır, üç ayda alınırsa kimse denemez.

Bunun ölçülebilir karşılığı — 2026-08-16'da düzeltildi, çünkü ilk satın alma zaten
gerçekleşmişti (bkz. bölüm 1):

1. **Faz 1 sonrası en az bir yeni alım.** Baseline: tüm zamanlarda 1 alım, tek kullanıcı.
2. **En az bir kullanıcının ikinci ürünü alması.** Bugün hiçbir kullanıcının birden
   fazla ürünü yok.

**Ölçüm sınırı:** satın almanın kendi kaydı tutulmuyor (sahiplik zaman damgasız `text[]`),
bu yüzden "30 gün içinde" ifadesi ancak ölçüm anları arasındaki farkla yaklaşık
değerlendirilebilir. Kalıcı çözüm bir satın alma defteri (`reward_ledger` deseninde);
bu planın kapsamı değil ama Faz 3 ile birlikte düşünülmeli.

## 4. Tasarım

### 4.1 Kazanım — mevcut mekanizmanın ölçeğini büyüt

Mekanizma zaten doğru yerde: migration 093, doğrulanmış oturum tamamlanınca `reward_ledger`'a altın yazıyor ve `UNIQUE(source_type, source_id, reward_type, reward_key)` sayesinde aynı oturum iki kez ödeme yapamıyor. **Yeni bir kazanım yolu açmaya gerek yok**; yalnız miktar yetersiz.

Önerilen değişiklik:

- Doğru cevap başına **1 → 3 altın**
- Oturum tamamlama primi: **+10** (yarım bırakılan oturum prim almaz)
- Günlük ilk oturum: **+15**, günde bir kez
- Günlük tavan: **80 altın**

15 soruluk oturumda ~10 doğru → 30 + 10 = 40 altın. Haftada üç oturum ≈ 120–150 altın.

**Suistimal koruması mevcut altyapıdan geliyor:** altın yalnız `verified_attempts` üzerinden sunucu tarafından notlanmış oturumda yazılıyor; idempotency `reward_ledger` tekilliğinden. Eklenecek tek yeni koruma günlük tavan.

### 4.2 Fiyat — kazanıma göre yeniden ölçekle

Yukarıdaki kazanımla (haftada ~120–150) hedef aralık:

| Kademe | Mevcut | Yeni fiyat | Erişim süresi |
|---|---|---|---|
| Giriş (lofi, manzara) | 1200–1300 | **250–350** | ~2 hafta |
| Orta (pixel, cyberpunk) | 1300–1500 | **400–550** | ~3–4 hafta |
| Üst (çizgi-roman) | 1600 | **700** | ~5 hafta |
| Efsanevi (kozmik) | 2000 | **1000** | uzak hedef |

Kazanım 3 kat artıp fiyat ~4 kat düşünce en ucuz ürün ~133 oturumdan ~9 oturuma iniyor. Kozmik, bilinçli olarak ulaşılması zor katman kalıyor.

### 4.3 Vitrin — çeşitlilik

Tek kategori yeterli değil. Öncelik sırası:

1. **Kozmetik rozet tablosunu doldur** — altyapı ve satın alma ucu hazır, sadece içerik yok. Düşük fiyatlı (100–250) giriş ürünleri buraya konur.
2. **Nameplate/çerçeve** — mevcut alanlar kullanılıyor ama mağazada karşılığı yok.
3. Avatar süsü — en düşük öncelik; sahiplik sıfır ve UI tarafı zaten zayıf.

## 5. Fazlar

**Faz 1 — Kazanım ölçeği (bu planın çekirdeği)**
Migration 093'teki `amount = v_correct_count` hesabını katsayı + prim ile değiştir, günlük tavanı ekle. Gerçek PostgreSQL testi: aynı oturum iki kez altın üretemez (mevcut tekillik korunur), günlük tavan aşılamaz, doğrulanmamış oturum altın üretmez, yarım oturum prim almaz.

**Faz 2 — Fiyat**
`background_assets.coin_cost` toplu güncellemesi. Eski değerler yedeklenir (`_backup_` deseni), tek transaction, sonra doğrulama. Mevcut sahiplikler etkilenmez.

**Faz 3 — Vitrin**
Kozmetik rozet içeriği + düşük fiyatlı giriş ürünleri.

**Faz 4 — Ölçüm ve ayar**
30 gün sonra: Faz 1 sonrası yeni alım oldu mu, medyan bakiye nereye geldi, hangi kademe satılıyor, günlük tavana takılan var mı. Buna göre kazanım veya fiyat ayarlanır.

Ayarın nerede olduğu konusunda dikkat — **tek bir dosya değil, üç ayrı yer**:

| Ayar | Yeri | Değiştirmek için |
|---|---|---|
| Oturum altın ölçeği (3 / 10 / 15 / tavan 80) | migration 129 içindeki SQL sabitleri (`c_coin_per_correct` vb.) | **yeni migration** |
| UGC ve hata raporu ödülü (50 / 250) | `src/lib/constants/rewards.ts` | TS değişikliği |
| Ürün fiyatları | CSS arka planlar `src/lib/constants/profile-backgrounds.ts`, video arka planlar `background_assets.coin_cost` | ikisi birden |

(Planın ilk yazımı "`rewards.ts` tek dosya olduğu için ayar tek yerden yapılır" diyordu;
bu yalnız ödül sabitleri için doğru, oturum ölçeği ve fiyatlar için değil.)

## 6. Bu planın etkilediği mevcut kararlar

**Hata raporu ödülü (250 altın, PR #373).** Bugünkü kazanımla (ortalama oturum ~9 altın) 250 altın ~28 oturuma bedel; bu fazla yüksek. Faz 1 sonrası (oturum ~40 altın) ise ~6 oturuma denk gelir ve makul bir yere oturur. Faz 2'de fiyatlar da düşünce 250, giriş kademesinin (250–350) neredeyse tamamını karşılar — yani **tek bir kabul edilen bildirim bir arka plan** eder. Bu fazla cömert olabilir; Faz 2 sonrası **100–150** aralığı yeniden değerlendirilmeli.

## 7. Riskler ve sınırlar

- **Enflasyon.** Altın üretimi artınca mevcut bakiyeler değersizleşmez (zaten çok düşük), ama fiyatlar düşerken kazanım da artıyor; ikisi birden yapılırsa hedef aralık kaçabilir. Bu yüzden Faz 1 ile Faz 2 arasında ölçüm yapılmalı, ikisi aynı anda canlıya alınmamalı.
- **Farmlama.** Kısa/kolay oturumları arka arkaya açarak altın toplama. Günlük üst sınır ve `verified_attempts` şartı bunu sınırlar, ama tamamen kapatmaz; Faz 4'te oturum başına ortalama altın izlenmeli.
- **Düşük aktivite.** Haftada 9 aktif kullanıcıyla ekonomi verisi az olacak; Faz 4 ölçümü istatistiksel olarak zayıf kalabilir. Karar verirken mutlak sayılar değil yön izlenmeli.
- **Ölçüm sınırı.** Buradaki "erişim süresi" tahminleri mevcut oturum davranışından türetildi; gerçek kazanım hızı Faz 1 canlıya çıkmadan bilinemez.
