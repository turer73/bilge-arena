# Bilge Arena — Şablonlu Avatar Üretimi (İP-6)

**Tarih:** 2026-08-21
**Durum:** Plan taslağı — onay bekliyor. Kod yazılmadı, production'a dokunulmadı.
**Bağlam:** [Kozmetik ekonomi yol haritası](2026-08-16-kozmetik-ekonomi-yol-haritasi.md) İP-6.

> Yol haritası bu paketi "ayrı plan dokümanı hak ediyor" diye işaretlemişti.
> Sebebi burada somutlaşıyor: asıl mesele üretim değil, **güvenlik ve maliyet modeli**.

---

## 1. Bu paketin çekirdek kısıtı

`src/app/api/profile/avatar/route.ts` içinde repo'nun kendi yazdığı karar:

> *"Serbest foto YÜKLEME (eski POST) **bilinçli olarak KALDIRILDI**. Reşit-olmayan
> kullanıcı tabanında denetimsiz görsel yükleme **cinsel-içerik / CSAM riski**
> taşıyordu (içerik moderasyonu yoktu; magic-bytes yalnız 'görsel mi' der, içeriğe
> bakmaz). Avatar artık Google fotoğrafından gelir veya küratörlü hazır-avatar
> setinden seçilir; kullanıcı serbest görsel yükleyemez."*

Buna `avatarPath()` sunucu guard'ı eşlik ediyor: `avatar_url` yalnız whitelist'teki
bir preset'e çözülebiliyor, keyfi URL yazılamıyor.

**Bu karar bu planın sınırıdır.** Serbest prompt ile AI üretimi onu tersine çevirir
ve daha geniş bir kapı açar: yüklemede en azından kullanıcının elindeki bir görsel
vardır, serbest promptta çıktı uzayı sınırsızdır.

---

## 2. Mevcut durum

| | |
|---|---|
| Maskot avatar (Bilge Chan seti) | 30 |
| DiceBear preset (CC0/MIT) | 40 |
| **Toplam seçenek** | **70** |
| Seviye kilidi | `AVATAR_MIN_LEVEL` — bazı avatarlar Lv2+ ile açılır |
| Sunucu guard | `avatarPath()` whitelist |
| Seçim | `profiles.avatar_url` (DB) |
| `avatars` bucket | mevcut, 1 MB dosya sınırı |

### Repo'da zaten kurulu olan desen

`scripts/gen-preset-avatars.mjs` başlığı şunu söylüyor:

> *"Hazır-avatar seti üretici (tek seferlik / yeniden-çalıştırılabilir). DiceBear
> HTTP API'sinden SVG çeker → public/avatars/preset/ altına yazar + tipli manifest
> + lisans NOTICE üretir. **Runtime'da DiceBear bağımlılığı YOK** — üretilen SVG'ler
> statik servis edilir."*

**İP-6'nın izlemesi gereken desen tam olarak bu.** Dış üretim derleme zamanında,
runtime saf statik.

---

## 3. Üç seçenek ve karar

### Seçenek A — Önceden üretilmiş kombinasyon havuzu ✅ ÖNERİLEN

Renderhane ile **derleme zamanı** N kombinasyon × M varyant üretilir, her görsel
**insan tarafından incelenir**, `public/avatars/generated/` altına konur, manifest
üretilir. Kullanıcı karakter/tema seçerek filtreler.

| | |
|---|---|
| CSAM / uygunsuz içerik riski | **sıfır** — her görsel yayına girmeden insan onaylı |
| Runtime maliyeti | **sıfır** — AI çağrısı yok |
| Gecikme | yok |
| `avatarPath()` guard'ı | **korunur** — yeni preset'ler whitelist'e girer |
| Moderasyon kuyruğu | gerekmez |
| Benzersizlik | sınırlı (havuzdan seçim) |

### Seçenek B — Runtime üretim + admin onay kuyruğu

Kullanıcı şablon seçer, AI üretir, avatar **admin onaylayana kadar aktif olmaz**.
Riski yönetir ama insan emeği gerektirir, dakikalar–saatler gecikme yaratır,
kredi maliyeti kullanıcı sayısıyla lineer artar.

### Seçenek C — Runtime üretim, onaysız

**Önerilmiyor.** §1'deki kararı doğrudan çiğner.

### Karar

**Seçenek A.** §1'deki güvenlik kararını korur, repo'nun kendi `gen-preset-avatars.mjs`
desenini tekrarlar, runtime maliyeti ve gecikme getirmez.

---

## 4. Tasarım

### 4.1 Kombinasyon uzayı

```
Karakter: astronot · kaşif · bilim insanı · sporcu   (4)
Tema:     uzay · doğa · siber · retro                (4)
```

16 kombinasyon × **4 varyant** = **64 yeni avatar**. Mevcut 70 ile toplam 134.

Renk şeması temadan türetilir (ayrı eksen değil) — kombinasyon patlamasını önler,
görsel tutarlılığı korur.

### 4.2 Üretim hattı

`scripts/gen-avatar-variants.mjs` — `gen-preset-avatars.mjs` deseninde:

1. Kombinasyon listesini gezer, her biri için **sunucu-tarafı prompt** kurar
2. Renderhane `POST /api/v1/jobs` (`sync: true`) ile üretir
3. İndirir → **256×256 webp** (rozet deneyimi: ~4 KB/adet)
4. `public/avatars/generated/` altına yazar
5. Tipli manifest üretir: `src/lib/constants/generated-avatars.ts`
6. **İnceleme adımı:** bütün çıktıları tek sayfada gösteren contact-sheet HTML
   üretir; onaylanmayanlar silinir ve o kombinasyon yeniden üretilir

Kullanıcı prompt yazmaz — prompt script içinde, sürüm kontrolünde.

### 4.3 Katalog entegrasyonu

`ALL_AVATARS = [...MASCOT_AVATARS, ...PRESET_AVATARS, ...GENERATED_AVATARS]`

`avatarPath()` değişmeden çalışır (yeni id'ler haritaya girer). Seçim akışı,
`/api/profile/avatar/preset` ucu ve seviye kilidi aynen korunur.

### 4.4 Ekonomiye bağlanması

| Model | Nasıl | Not |
|---|---|---|
| **Ücretsiz + seviye kilidi** | `AVATAR_MIN_LEVEL` ile Lv3+ | Mevcut desen; ekonomiye dokunmaz |
| Altın karşılığı | 200–400 altın | Avatar için satın alma akışı henüz yok |

**Önerilen: seviye kilidi.** Avatar bugün ücretsiz bir kategori; para modeline
çevirmek İP-3b hook'unu avatar'a genişletmeyi gerektirir. Ayrıca İP-7 fiyat kararı
verilmeden yeni bir altın gideri eklemek Faz 4 ölçümünü bulandırır.

---

## 5. Maliyet

| | `logo` (recraft-v4) | `text-to-image` (flux-pro) |
|---|---|---|
| Kredi / görsel | 8 | 4 |
| 64 görsel | **512 kredi** | **256 kredi** |

Bugünkü Renderhane bakiyesi: **550 kredi**.

**Ölçülen not:** 9 rozet üretiminde bakiye 550 → 550 kaldı; hesap sahibi muafiyeti
görünüyor. Doğruysa maliyet fiilen sıfır — ama **plan buna güvenmemeli**, üretim
öncesi denemeyle doğrulanmalı.

Tool seçimi denemeyle belirlenir: rozetlerde `logo` (vektör/ikon tarzı) iyi sonuç
verdi; avatar bir karakter portresi olduğu için `text-to-image` daha uygun olabilir.
**Önce 2 kombinasyon × 2 tool = 4 deneme**, sonra karar.

---

## 6. Fazlar

**Faz A — Deneme ve tool seçimi** *(4 görsel)*
2 kombinasyon, iki tool ile. Tarz ve maliyet doğrulanır. Çıktı: hangi tool, hangi
prompt iskeleti.

**Faz B — Üretim hattı**
`scripts/gen-avatar-variants.mjs` + contact-sheet inceleme sayfası. 64 görsel
üretilir, insan inceler, onaylanmayanlar yeniden üretilir.

**Faz C — Katalog entegrasyonu**
`generated-avatars.ts` manifesti, `ALL_AVATARS` birleşimi, `AVATAR_GROUPS`'a yeni
grup, seviye kilidi ataması. Testler: `avatarPath()` yeni id'leri çözüyor, seviye
kilidi uygulanıyor, whitelist dışı id reddediliyor.

**Faz D — UI**
Kişiselleştirme stüdyosunun avatar alanına karakter/tema filtresi. Mevcut galeri
bileşeni yeniden kullanılır.

---

## 7. Riskler ve sınırlar

- **§1 kararı mutlak.** Bu plan serbest prompt içermiyor. İleride "kullanıcı kendi
  prompt'unu yazsın" istenirse bu doküman değil, o güvenlik kararı yeniden açılmalı.
- **Üretilen görselin lisansı.** DiceBear seti CC0 seçilerek kurulmuştu
  (`gen-preset-avatars.mjs` atıf-gerektiren stilleri bilinçli hariç tutuyor). AI
  çıktısının lisans durumu Renderhane sağlayıcı sözleşmesine bağlı — **üretim öncesi
  doğrulanmalı**, aksi halde aynı titizlik bozulur.
- **Görsel tutarlılık.** 64 görsel aynı tarzda durmazsa katalog dağınık görünür.
  Contact-sheet incelemesi bunu yakalamalı; tek tek bakmak yetmez.
- **Benzersizlik beklentisi.** "Kendi avatarını yarat" ifadesi tek-ve-özel beklentisi
  yaratır; havuzdan seçim bunu tam karşılamaz. UI dili **"kendine uygun olanı bul"**
  olmalı, "yarat" denmemeli.
- **Bakiye varsayımı.** Muafiyet doğrulanmazsa 64 görsel 256–512 kredi tüketir;
  bugünkü 550 tek seferlik yeter, tekrar üretime yetmez.
- **Kapsam kayması.** Faz D'de "renk de seçilsin", "yüz ifadesi de" gibi eklemeler
  kombinasyon sayısını katlar. Eksen sayısı iki (karakter × tema) kalmalı.
