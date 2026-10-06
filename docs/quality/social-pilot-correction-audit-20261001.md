# Sosyal düzeltmeleri: iki modelle yeni metin denetimi

## Tamamlanan kontrol

1 Ekim 2026'da 17 yerel düzeltme preview'ı **Gemini `gemini-2.5-pro`** ve
**DeepSeek `deepseek-v4-pro`** ile mevcut üç geçişli denetim altyapısından geçirildi.
İki modelin erişimi önce salt okunur model listeleriyle kontrol edildi.

| Ölçüm | Gemini Pro | DeepSeek V4 Pro | Toplam |
|---|---:|---:|---:|
| İncelenen yeni metin | 17 | 17 | Aynı 17 |
| Kör çözüm örneği | 51 | 51 | 102 |
| Anahtarla eşleşen kör örnek | 51 | 51 | 102 |
| Çözümden çıkarılan indeks eşleşmesi | 17 | 17 | 34 |
| Mantıksal ajan çağrısı | 85 | 85 | 170 |
| Gerçek HTTP çağrısı, probe dahil | 85 | 85 | 170 |
| Başarısız ajan sonucu | 0 | 0 | 0 |
| `APPROVED` model kararı | 17 | 17 | 34 |
| `NEEDS_REVIEW` / `REJECTED` / `INCONCLUSIVE` | 0 | 0 | 0 |

Dağılım: tarih 4, coğrafya 4, felsefe 4, sosyoloji 5. Bu tur kalan yedi
değiştirilmemiş adayı tekrar LLM'den geçirmedi ve bütün bankayı taramadı.

Her modelde soru başına üç permütasyonlu kör çözüm, bir karşıt inceleme ve bir
çözüm denetimi çalıştı. Kör çözücü ve karşıt incelemeye anahtar/çözüm gönderilmedi.
17 gerçek yeni girdi üzerinde anahtar ve çözüm değiştirildiğinde kör prompt'ların
bayt düzeyinde aynı kaldığı da koşu öncesinde kontrol edildi.

`APPROVED`, burada `question-quality@2` politikasının **AI karar etiketidir**;
DB yayın durumu, kaynak kabulü veya psikometrik kalibrasyon değildir. Aynı modelin
üç örneği üç bağımsız uzman değildir. İki modelin mutabakatı da iki bağımsız
belgesel kaynağın veya hatasızlığın kanıtı değildir.

## Kimlik ve çalışma sınırı

- Girdiler yayınlanmış eski revizyon değil, önerinin **yeni tam içeriğidir**.
- Her koşu `local-preview:<ref>:<fingerprint>` ile tanımlandı. Bu yerel referans
  gerçek DB revizyon UUID'si değildir; eski revizyona yeni içerik kararı yapıştırılmadı.
- Hash, sıralı kompakt JSON SHA-256'dır; PostgreSQL `jsonb::text` hash'i olarak
  sunulmadı. Yeni kök, seçenekler, anahtar ve çözüm ham snapshot'la eşleştirildi.
- Prompt sürümleri ve model/ayar kimliği her ham koşuda saklandı. Mevcut
  `question-audit` orkestratörü, Zod şemaları ve karar türetmesi kullanıldı;
  paralel bir üretim karar sistemi kurulmadı.
- Denetim bağlamı dört alanlı **genel Sosyal keşif / lise düzeyi** idi. DB'deki
  `exam_ref` metadata'sı değiştirilmedi; resmî TYT kapsam onayı iddia edilmedi.
- Ayarlar: 3 kör örnek; mevcut sıcaklıklar; rol başına 8.192 çıktı token sınırı;
  60 saniye timeout; en çok 2 deneme; 2 eşzamanlı soru. Ayar hash'i kaydedildi.
- Tek soruluk bağlantı/şema probe'u iki modelde geçti. Sonraki 17'lik koşu ilk
  soruyu birebir model/prompt/ayar/girdi eşleşmesiyle cache'den aldı: her modelde
  5 probe + 80 yeni HTTP çağrısı. Tekrar deneme gerekmedi.
- Ham sonuçlar append-only koşu geçmişinde ve soru/hash dosyalarında saklandı;
  hata olsaydı içerik kusuru uydurulmayacaktı. DB client/karar upsert/promotion yok.

Raporun token alanları sağlayıcı adaptörünün raporladığı değerlerdir; ayrıca
raporlanmayan düşünme tokenlarını veya fiyat/faturayı ölçtüğü iddia edilmez.

## Kaynak spot kontrolü

Değişen çekirdek iddiaların 13'ü bu turda yeniden ilgili kaynak bölümleriyle
karşılaştırıldı. Dört coğrafya önerisinin dayanakları önceki aynı gün incelemesine
bağlı kaldı; bu tur yeniden erişilmiş gibi gösterilmedi. Bu, 17 sorunun bütün
seçenek/lisans/müfredat kapılarını tamamlayan yeni `source-comparison@1` kabulü değildir.

- Nizâmiye'de vezir/sultan ayrımı:
  [TDV](https://islamansiklopedisi.org.tr/nizamiye-medresesi) ve
  [Iranica](https://www.iranicaonline.org/articles/nezam-al-molk/).
- Rönesansın coğrafi bağlamı:
  [Open University, New ideas](https://www.open.edu/openlearn/history-the-arts/early-modern-europe-introduction/content-section-6.5).
- Islahat'ın ilan/kongre/antlaşma sırası:
  [TDV Islahat Fermanı](https://islamansiklopedisi.org.tr/islahat-fermani).
- Münster'deki koşullu ittifak hakkı ve değişen seçenekler:
  [Yale Avalon LXV](https://avalon.law.yale.edu/17th_century/westphal.asp).
- Kategorik dört biçim:
  [SEP karşıtlık karesi §1](https://plato.stanford.edu/entries/square/).
- Heykel örneğinin dört nedenle açıklanması:
  [SEP](https://plato.stanford.edu/entries/aristotle-causality/) ve
  [MIT, Physics II Part 3](https://classics.mit.edu/Aristotle/physics.2.ii.html).
- Hobbes aktarımı:
  [Leviathan XIII](https://www.gutenberg.org/files/3207/3207-h/3207-h.htm).
- Epoché'de inkâr/askıya alma ayrımı:
  [SEP Husserl](https://plato.stanford.edu/entries/husserl/).
- Sosyolojinin beş değişen çözümündeki kapsam, hareketlilik ve koşullu süreçler:
  [OpenStax 1.1](https://openstax.org/books/introduction-sociology-3e/pages/1-1-what-is-sociology),
  [5.3](https://openstax.org/books/introduction-sociology-3e/pages/5-3-agents-of-socialization),
  [7.2](https://openstax.org/books/introduction-sociology-3e/pages/7-2-theoretical-perspectives-on-deviance-and-crime),
  [9.1](https://openstax.org/books/introduction-sociology-3e/pages/9-1-what-is-social-stratification),
  [11.4](https://openstax.org/books/introduction-sociology-3e/pages/11-4-intergroup-relationships).
  Beş bölüm aynı kitaptır, beş bağımsız kaynak sayılmadı.

OpenStax'ın incelenen kitabındaki güncel kullanım bölümü **CC-BY-NC-SA** etiketi
ve ticari kullanım/LLM-GAI içine alma için ayrı izin açıklaması gösteriyor.
Ücretsiz erişim, ticari kaynak korpusu veya yeniden yayınlama izni sayılmadı.
Bu tur dış denetçilere erişilen kitap/PDF bölümleri değil, özgün soru önerileri
gönderildi. Kaynak kullanım izni veya hukuki uygunluk onayı üretilmedi.
[İncelenen kullanım koşulları](https://openstax.org/books/introduction-sociology-3e/pages/11-4-intergroup-relationships).

## Yerel teslim ve sonraki adım

Özel dosyalar `secure/social-correction-audit-20261001/` altında:
`manifest.json`, sağlayıcı başına `report.json`, `probe-report.json`,
`run-history.ndjson`, 34 ham soru/hash koşusu ve `cross-model-summary.json`.
17 öneriye bağlı kaynak spot notları:
`secure/social-correction-source-spot-checks-20261001.json`.
Soru metinleri ve anahtarlar Git'e eklenmedi.

Yalnız plan: `node secure/run-social-correction-audit-20261001.mjs`.
Ücretli çağrı ayrıca `--confirm` ister. Birleşik kontrol:
`node secure/summarize-social-correction-audit-20261001.mjs`.
Kör görünüm/orkestratör/karar/kaynak sözleşmesi testleri: **4 dosyada 77 test geçti**.
Bu tur yeni build, PostgreSQL veya canlı öğrenci testi koşulmadı.

**Tamamlanan:** yeni metinlerin iki-model AI kalite kontrolü ve değişen çekirdek
iddiaların kaynak spot karşılaştırması. **Kalan:** gerçek kaynak/kazanım ve kapsam
bağlarını tamamlayıp yetkili yeni DB revizyonlarına taşıma; yeni UUID/PostgreSQL
hash'leri için yayın kanıtını yeniden bağlama ve ayrı pilot yayın işlemi.
AI sonuçları kaynak kabulü veya canlı karar tablosuna yazılmadı. Canlı DB yazımı,
yeni revizyon, eski cevap değişikliği, publish, migration, push, merge ve deploy: **0**.
