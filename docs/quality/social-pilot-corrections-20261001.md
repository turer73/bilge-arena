# Sosyal pilot: kaynak destekli düzeltme taslakları

## Durum ve sınır

1 Ekim 2026'da mevcut 24 adayın 10'u için somut içerik düzeltmesi hazırlandı.
Bu dosyalar **yerel offline-preview** çıktılarıdır; veritabanında yeni revizyon
açılmadı, eski soru/revizyon değiştirilmedi ve pilot yayımlanmadı.

10/10 öneri mevcut revizyon UUID'sine ve tam içeriğin sıralı JSON SHA-256
fingerprint'ine bağlıdır. Bu fingerprint, PostgreSQL `jsonb::text` üzerinden
hesaplanan yayın `content_sha256` değeriyle aynı algoritma değildir. İki karma
birbirinin yerine kullanılmaz. Revizyon veya tam içerik değişirse taslak aracı
öneriyi bloklar; son RPC'nin taban revizyon kontrolü de korunur.

İncelenen eski kaynak raporları değişmedi. Yeni metnin kaynak kapısını geçtiği
iddia edilmez; eski raporlar veya kabul hash'i yeni içeriğe taşınamaz.
İşaretli cevap indeksleri, kategori ve zorluk etiketleri korunmuştur. Zorluk
etiketinin korunması, yeniden yazılan sorunun güçlüğünün aynı olduğunun kanıtı
değildir. Özellikle belgeye dayalı yeniden yazım yeniden pedagoji incelemesi ister.

## Hazırlanan düzeltmeler

Soru metinleri, seçenekler ve cevap anahtarları Git'e eklenmez. Tam önce/sonra
diff'leri ignored `secure/` klasöründeki inceleme sayfasındadır.

| İnceleme başlığı | Yapılan değişiklik | Yeniden kontrol sınırı |
|---|---|---|
| Selçuklu medreseleri | Kimliği belirsiz çeldirici değiştirildi; vezir/sultan rolleri ayrıldı | Yeni çeldirici dahil beş seçenek |
| Rönesans | Tarihsel coğrafya belirtildi; gereksiz kesin başlangıç yüzyılı çıkarıldı | Yeni kök ve çözüm |
| Islahat | İlan ve barış antlaşması sırası netleştirildi; tarihsiz çeldiriciye yıl verildi | Kronoloji ve beş seçenek |
| Vestfalya | Evrensel doğuş iddiası yerine somut antlaşma maddesi soruldu; çeldiriciler aynı maddeye bağlandı | Yeni hedef beceri, okuma yükü, seçenek dengesi |
| Kategorik önermeler | Dört biçimin kapsamı daraltıldı | Çözümdeki sınıflama |
| Aristoteles | Örnekteki madde ve amaç kökte açıklandı | Kök/şık/çözüm tutarlılığı; uzun doğru şık uyarısı |
| Hobbes | Bozuk aktarım düzeltildi; hayat nitelemeleri ve savaş kavramı ayrıldı | Çeviri, seçenek ve çözüm |
| Kültürleşme | Asimilasyonun koşulsuz tam yok oluş sayılması kaldırıldı | Kavram ayrımı ve ayrı kapsam kararı |
| Birincil sosyalleşme | Gerekli olmayan, doğrulanmamış kişi atfı çıkarıldı | Erken aile sosyalleşmesi ve ayrı kapsam kararı |
| Etiketleme | Etiketi benimseme kaçınılmaz değil koşullu süreç olarak yazıldı | Kuramsal soy bağımsızlığı ve ayrı kapsam kararı |

Başlıca bu turda yeniden okunan dayanaklar:

- [TDV Islahat Fermanı](https://islamansiklopedisi.org.tr/islahat-fermani): ilan/kongre/antlaşma sıralaması;
  [TDV Tesalya](https://islamansiklopedisi.org.tr/tesalya): yeni çeldiricinin tarih bağlamı.
- [Yale Avalon antlaşma metni](https://avalon.law.yale.edu/17th_century/westphal.asp),
  LXIV–LXV: ittifak hakkı ve sınırları. Tüm Vestfalya uzlaşmasının tek metni olduğu ileri sürülmez.
- [Leviathan XIII](https://www.gutenberg.org/files/3207/3207-h/3207-h.htm):
  hayatın nitelemeleri; [MEB metin analizi](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/felsefe/11/unite3/files/basic-html/page16.html): ortak otorite ve savaş bağlamı.
- [SEP kategorik biçimler](https://plato.stanford.edu/entries/square/) ve
  [Aristoteles'in dört nedeni](https://plato.stanford.edu/entries/aristotle-causality/): açıklamaların kapsamı.
- [OpenStax gruplar arası ilişkiler](https://openstax.org/books/introduction-sociology-3e/pages/11-4-intergroup-relationships),
  [etiketleme](https://openstax.org/books/introduction-sociology-3e/pages/7-2-theoretical-perspectives-on-deviance-and-crime) ve
  [sosyalleşme etkenleri](https://openstax.org/books/introduction-sociology-3e/pages/5-3-agents-of-socialization): koşulsuz genellemelerden kaçınma.

Kaynak URL sayısı bağımsız tanık sayısı değildir. Önceki raporlardaki ikinci
zincirler, lisans belirsizlikleri ve müfredat eksikleri aynen açık kalır.
Kaynaklar referans olarak kullanıldı; kitap bölümleri veya görseller kopyalanmadı.

## Ayrı açıklar

- Kömür adayına bu pakette düzeltme uygulanmadı: rezerv/kaynak, kömür türü ve
  ölçüm yılı aynı temelde doğrulanmalı. Anahtar yanlış diye ilan edilmedi.
- Diğer 14 aday **değiştirilmedi**. Bu sayı 14 onaylı soru demek değildir;
  coğrafi ölçüt/dönem ayrımları, bazı çözüm nüansları ve kapsam kanıtları açık kalır.
- Sosyolojinin resmî TYT alanı olmadığı bulgusu, altı yanlış anahtar bulgusu
  değildir. Dört alanlı pilotun genel keşif kapsamı ile resmî TYT kapsamı ayrı tutulur.
- Yeni revizyonlar oluştuğunda kaynak raporu, bağımsız kör çözüm ve pilot pinleri
  yeni UUID/hash ile yenilenmeli. Eski 12/12 kaynak sayımı bu taslakların sonucu değildir.

## Yeniden üretim

```powershell
node database/prepare-question-revision-drafts.mjs --offline `
  --rows secure/social-current-20260929.json `
  --proposals secure/social-correction-proposals-20261001.json `
  --out-dir secure/social-correction-drafts-20261001
```

`--offline`, ortamda DB anahtarı bulunsa bile çevrimiçi moda geçmez.
`--apply` ile birlikte kullanılamaz. Önerilerin `ready` değeri dosya sözleşmesidir;
araç bunları `preview` olarak raporlar, yayın yetkisi üretmez. Kazanım ve asıl
kaynak kaydı export'ta bulunmadığından üretim payload'ı tamamlanmış sayılmaz;
offline `INTERNAL` fallback'i özgün kaynağın doğrulanması değildir.

Özel çıktılar: `report.json`, `payloads.json`, `review-sheet.md`.
Bu turda 10 preview, 0 blocked; cevap indeksleri ve kaynak export dosyası korundu.
Altı ilgili test dosyasında **87 test geçti**; bunların 32'si taslak aracı testidir.
Bu testler olgusal doğruluk, insan kabulü veya canlı yayın testi değildir.
