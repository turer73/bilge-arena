# Sosyal pilot: kalibrasyon hazırlığı ve veri sınırı

11 Ekim 2026. Bu belge bir kalibrasyon veya yayın kararı değildir.

## Mevcut durum

2027 hazırlık havuzu 25 değişmez revizyondur; her aday ortak 15 ve seçtiği
beş soruyu çözer. Canlı başlangıç kontrolünde güncel revizyonlarda cevap ve
pilot oturumu yoktur. Eski revizyon cevapları yeni soruya aktarılmaz.

Mevcut `materialize_question_revision_psychometrics` (migration 143), Wilson
aralığı, madde-kalan test korelasyonu ve şık istatistikleri üretir. Bu CTT
betimlemesidir; IRT yetenek tahmini değildir. `audit:calibrate` ise LLM kalite
denetçisinin kalibrasyonudur; öğrenci/soru psikometrisiyle karıştırılmamalıdır.

## Tekrar çalıştırılabilir başlangıç kontrolü

```text
node database/social-calibration-readiness.mjs sql <pool-uuid>
node database/social-calibration-readiness.mjs report <snapshot.json> <pool-uuid>
```

İlk komut ağ erişimi yapmaz; yetkili SQL aracında çalıştırılacak salt-okuma
işlemini üretir. Tek `snapshot` JSON nesnesi ikinci komuta verilir. Sorgu
repeatable-read/read-only ve 30 saniye sınırıyla çalışır. Sonuç yalnız toplu
sayılar ve soru/revizyon pinleri içerir; öğrenci kimliği ve cevap matrisi dışarı
çıkarılmaz. Ham makbuz özel `secure/` dizininde korunur.

Sorgu mevcut v3 yaklaşımını izler: aynı kullanıcıya bağlı tamamlanmış verified
oturum, tamamlanmış game session, sabit revizyon; önceki revizyonlar dahil
kayıtlı ilk cevap; diagnostic geçmişi ve ipucu dışlanır. Ek olarak snapshot
hash'i ve beş seçenek aralığı denetlenir. Tüm modların betimsel sayısı ile
bu pilotun sayısı ayrı tutulur. İstatistik tablosuna veya puanlara yazılmaz.

Bu araç n eşiğinden kalibrasyon kararı çıkarmaz; 200 veya 5000 cevapta da
`calibrated=false` kalır. JSON doğrulaması kaynak özgünlüğünü kanıtlamaz.

## Veri toplama protokolü — ortak altyapı, canlıda henüz kapalı

Matematik/LGS için ortak kapalı ölçüm altyapısı
[`controlled-measurement.md`](controlled-measurement.md) belgesinde tanımlandı.
Sosyal hazırlık bu moda çevrilmedi; din/alternatif felsefe form eşlemesi ayrı
inceleme gerektirir. Aşağıdaki maddeler Sosyal için hâlâ yayın ön koşuludur.

Hazırlık turunda doğru cevap/çözüm her sorudan sonra gösterilir. Bu eğitim
koşulunda alınan cevaplar, geri bildirim verilmeyen kapalı ölçmeyle aynı
kalibrasyon verisi gibi birleştirilmez. Hazırlık uygulaması açık kalır.

Kalibrasyona girecek yeni ölçme oturumları için mevcut verified-attempt ve
immutable snapshot altyapısı üzerinde ayrıca şu sözleşme uygulanmalıdır:

- Ölçüm amacı ve protokol sürümü sunucu tarafında oturuma sabitlenir;
  istemcinin `calibration=true` demesi yeterli değildir.
- İlk cevaplar kilitlenir; doğru cevap, çözüm ve ipuçları tur bitene kadar
  **sunucudan da gönderilmez**. Yalnız ekranı gizlemek yeterli değildir.
- Soru gösterim/onay olayları, pozisyon, form/hash ve render sürümü kaydedilir.
  Gösterim bildirimi istemci beyanıdır; fiziksel olarak okunduğunu kanıtlamaz.
- İpucu/asistan kullanımı mevcut kanallarda izlenir. Harici yardımın
  engellendiği iddia edilmez; öğrenci gözetimi veya hassas veri eklenmez.
- Tamamlanmamış, tekrar edilmiş, yardımlı ve teknik hata bildirilmiş
  cevaplar nedenleriyle ayrılır. Mevcut eksik telemetri geriye dönük uydurulmaz.
- Süre istemciden geldiğinde güvenilir süre diye sunulmaz. Sunucu olay farkı
  da ağ/sekme beklemesini içerir; saf düşünme süresi değildir.

## Örneklem ve inceleme kapıları

İlk operasyon izleme eşikleri (bilimsel yeterlilik garantisi değil):

| Revizyon başına uygun ilk cevap | Kullanım |
| --- | --- |
| 0 | Veri bekleniyor |
| 1–29 | Erken sinyal |
| 30–99 | Geçici gözlem |
| 100–199 | CTT incelemesi için aday |
| 200+ | Daha büyük örneklemle inceleme; otomatik terfi yok |

Hedef gruptan gönüllü katılım ve yeterli başarı çeşitliliği gerekir. Kendi
hesabımızla tekrarlar veya AI/sentetik çözümler öğrenci örneklemi değildir.
İki düzenin son beş sorusu farklıdır; toplam katılımcı sayısı, bütün 25 sorunun
aynı n değerine sahip olduğunu göstermez. Düzen tercihi inanç etiketi değildir.
Ortak sorular başlangıçta yalnız bağlantı adayıdır; geçerli anchor oldukları
model uyumu/kararlılığı incelenmeden söylenemez.

Yeterli veri geldiğinde mevcut CTT raporları yenilenir. Sonraki kapılar:
temsil/eksik veri analizi, madde ve şık davranışları, boyutluluk ve yerel
bağımsızlık, uygun model seçimi, parametre belirsizliği, ayrı doğrulama
örneklemi/çapraz doğrulama, ölçek bağlantısı ve seviye kesme noktalarının
gerekçesi. Birbirinden farklı dersleri sırf toplam puan var diye tek boyutlu
ölçek saymayız. Kalibrasyon modelinin yeterliliği örneklem ve model için
simülasyonla değerlendirilir; yayın uyarısı bunlar bitmeden kaldırılmaz.

## Birincil dayanaklar

- [ETS RR-24-03](https://www.ets.org/research/policy_research_reports/publications/report/2024/kgvw.html):
  küçük örneklemde model, veri toplama ve mevcut kalibrasyon bağlamı önemlidir;
  evrensel bir küçük-n kestirmesi yoktur.
- [OECD, PISA ölçek oluşturma](https://www.oecd.org/en/publications/pisa-2022-results-volume-i_53f23881-en/full-report/the-construction-of-reporting-scales-and-of-indices-from-the-student-context-questionnaire_92d898ed.html):
  field trial, madde model uyumu ve ölçek eşdeğerliği kontrolleri.

Bu kaynaklar Bilge Arena'yı onaylamaz; yukarıdaki ürün protokolü mühendislik
önerisidir. Bu değişiklik hazırlık akışını, kaynak/kalite kabulünü veya canlı
yayın durumunu değiştirmez.
