# Bilge Arena soru kalitesi: küresel güvence çerçevesi

Bu belge “LLM birkaç soruyu doğru buldu” ile “hat yayıma hazır” arasındaki
farkı kapatır. Otomatik denetim bir editör yardımcısıdır; geçerlik, adalet ve
yüksek riskli yayın kararı için insan uzmanların yerini almaz.

## Karşılaştırılan sistemler ve Bilge Arena karşılığı

| Güvence alanı | Küresel uygulama | Bilge Arena durumu |
|---|---|---|
| İçerik geliştirme | ETS: kazanım, bilişsel düzey, doğruluk, erişilebilirlik ve adalet için uzman incelemesi | Kazanım kaydı, kaynak, iki bağımsız yayın onayı ve LLM kanıtı var |
| Saha denemesi | OECD/PISA: güçlük, ayırıcılık, çeldirici, eksik yanıt, süre, kodlayıcı güvenirliği, DIF | CTT v2; Wilson aralığı, seçenek dağılımı, süre ve ilk maruziyet filtresi var |
| LLM hakem kalibrasyonu | Google/OpenAI: insan-altın veri, confusion matrix, FPR/FNR, düzenli insan denetimi | `benchmark.ts` ve `audit:benchmark` ile ölçülür; etiketsiz hat terfi edemez |
| Birlikte çalışabilirlik | 1EdTech QTI 3: madde/test/sonuç ve madde-istatistiği değişimi | İç veri modeli var; QTI içe/dışa aktarma henüz ürün gereksinimi değil |
| Erişilebilirlik | WCAG 2.2 ve QTI erişilebilir içerik/uyarlama metadata'sı | Uygulama erişilebilirliği ayrı test edilir; soru-içi medya için yapılandırılmış metadata borcu var |
| Adalet | ETS: eğitimli fairness reviewer ve yeterli örneklemde DIF | İnsan onayı var; hukuka uygun grup verisi ve yeterli n olmadığı için DIF hesaplanmıyor |
| Sürekli izleme | PISA/modern psikometri: parametre sürüklenmesi, konum/süre etkisi, madde güvenliği | Pencere bazlı istatistik var; çok dönemli drift ve maruziyet alarmı sonraki olgunluk katmanı |
| LLM güvenliği | NIST: güvenilmeyen girdiyi yüksek güvenli prompttan ayırma, en az yetki | Soru/çözüm JSON veri zarfında; modelde araç/URL yetkisi yok; dar Zod şeması ve insan yayın kapısı var |

## Terfi tanımı

Bir model/prompt/politika sürümü yalnız aşağıdaki varsayılan kapıları aynı
tutulan (held-out) insan-altın kümede geçerse üretim adayıdır:

- En az 100 nihai etiket; en az 20 kusurlu ve 50 temiz soru.
- Her etiket içerik SHA-256'sına bağlı ve en az iki bağımsız uzmanca uzlaşılmış
  ya da üçüncü uzman tarafından adjudike edilmiş olmalı.
- Değerlendirilebilir kapsam en az `%95`, transport hata oranı en çok `%5`.
- Dengeli doğruluk en az `%80`.
- Yanlış-pozitif oranın %95 Wilson üst sınırı en çok `%10`.
- Yanlış-negatif oranın %95 Wilson üst sınırı en çok `%15`.
- Kusur kodlarının birebir eşleşmesi en az `%75`.

Bu eşikler `DEFAULT_PROMOTION_POLICY` içinde sürümlüdür. Eşiği gevşetmek bir
kod incelemesi gerektirir; model çıktısı eşiği değiştiremez.

## Altın küme üretim protokolü

1. Sorular ders, konu, zorluk, sınav ve kusur tipi bakımından tabakalı seçilir.
   Yalnız modelin itiraz ettiği soruları seçmek örneklem yanlılığı yaratır.
2. İki alan uzmanı model verdict'ini ve birbirinin kararını görmeden etiketler.
3. Aynı kusur kümesinde uzlaşırlarsa `consensus`; ayrışırlarsa üçüncü, bağımsız
   uzman nihai `adjudicated` etiketi üretir.
4. İçerik değişirse hash değişir ve eski etiket yeni revizyona bağlanamaz.
5. Prompt ayarı yapılan geliştirme kümesi ile nihai held-out küme ayrıdır.
6. Etiket dosyası soru metni içermez; yalnız kimlik, hash, kusur kodları ve
   adjudikasyon metadata'sını taşır.

Örnek:

```json
[
  {
    "questionId": "00000000-0000-0000-0000-000000000000",
    "contentSha256": "64-karakterli-sha256",
    "flawCodes": ["WRONG_KEY_SUSPECTED"],
    "reviewerCount": 3,
    "adjudication": "adjudicated"
  }
]
```

Çalıştırma:

```sh
npm run audit:calibrate -- --limit 100 --confirm --out database/calibration.json
npm run audit:benchmark -- --labels secure/gold-labels.json --report database/calibration.json --out database/benchmark.json
```

İkinci komut LLM veya veritabanı çağrısı yapmaz. Kapı başarısızsa çıkış kodu
`2` olur. Altın etiket dosyası erişim kontrollü tutulmalı; gerçek soru içeriği
ve öğrenci kişisel verisi bu dosyaya yazılmamalıdır.

## Bilerek otomatikleştirilmeyenler

- **DIF:** Demografik/erişilebilirlik grupları için açık amaç, hukuki temel,
  veri minimizasyonu ve yeterli örneklem yoksa hesaplanmaz. Eksik veriden “adil”
  sonucu çıkarılmaz.
- **IRT/CAT ve maruziyet kontrolü:** Bilge Arena'nın mevcut sabit soru akışına
  zorla eklenmez. Adaptif test veya yüksek riskli puan raporu devreye alınırsa
  kalibrasyon havuzu, item exposure ve ölçek sürüklenmesi birlikte tasarlanır.
- **QTI 3:** Dış LMS/madde bankası entegrasyonu talebi oluştuğunda conformance
  validator ile uygulanır; yalnız XML üretmek “QTI uyumlu” sayılmaz.
- **LLM ile adalet hükmü:** LLM önyargı sinyali üretebilir ama eğitimli fairness
  reviewer ve ampirik DIF kanıtı yerine geçmez.

## Resmî dayanaklar

- 1EdTech QTI: https://www.1edtech.org/standards/qti/index
- ETS kalite ve adalet standartları: https://www.ets.org/about/fairness/review-publications.html
- ETS DIF prosedürleri: https://www.ets.org/research/policy_research_reports/publications/report/2012/jevu.html
- OECD/PISA uygulama araçları: https://www.oecd.org/en/about/programmes/pisa/pisa-survey-implementation-tools.html
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- NIST prompt injection tanımı: https://csrc.nist.gov/glossary/term/prompt_injection
- Google judge model değerlendirme: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluate-judge-model
- OpenAI eval yaklaşımı: https://openai.com/index/evals-drive-next-chapter-of-ai/
