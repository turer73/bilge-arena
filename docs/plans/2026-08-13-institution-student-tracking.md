# Bilge Arena Kurumsal — Öğrenci Durum Tespiti ve Takip Pilotu

**Tarih:** 2026-08-13
**Hedef kullanıcı:** 50–100 öğrencili küçük dershaneler
**Durum:** Plan onaylandı. İlk saf istatistik sözleşmeleri, ürün sağlığı hesaplayıcıları ve birim test fixture'ları çalışma dalında uygulandı. Veri kaynağı adapter'ları, migration, API, UI, canlı pilot ve production doğrulaması henüz yapılmadı.

## 1. Ürün kararı

Bilge Arena Kurumsal bir dershane ERP'si olmayacaktır. Ürünün tek görevi:

> Öğrencinin hangi ders ve kazanımda hangi düzeyde olduğunu güvenilir kanıtlarla belirlemek, zaman içindeki gelişimini izlemek, öğretmenin uygun çalışma programını hazırlamasını kolaylaştırmak ve kurumun öğretim takibini açıklanabilir göstergelerle değerlendirmesini sağlamak.

İlk pilot tek kurum/tek şube ve 50–100 öğrenci için tasarlanacaktır. Mevcut kurum tenant sınırı, öğretmen sınıfları, adaptif tanılama, mastery evidence v2, FSRS, günlük plan ve kağıt çıktı altyapısı yeniden kullanılacaktır.

## 2. Başarı ölçütü

Pilot, aşağıdaki sonuçlar görülürse ürün açısından başarılı sayılır:

1. Öğretmen bir öğrencinin güçlü ve destek gerektiren konularını beş dakikadan kısa sürede anlayabilir.
2. Sistem her değerlendirmede kanıt miktarını ve güven düzeyini açıklar; az soruya dayanarak kesin hüküm vermez.
3. Öğretmen bir haftalık kişisel çalışma programını sistem taslağından üç dakikadan kısa sürede hazırlayıp yayınlayabilir.
4. Program sonucunda yalnız görev tamamlanması değil, hedef kazanımdaki değişim de görülebilir.
5. Kurum yöneticisi öğretmeni ham öğrenci ortalamasıyla değil; takip düzeni, program yönetimi, öğrenci gelişimi, müdahale ve veri güvenilirliği boyutlarında izleyebilir.
6. Başka kurum, sınıf, öğretmen veya öğrenci verisine çapraz erişim mümkün olmaz.

### 2.1 Ürün sağlığı ve kullanım ölçütleri

Bu metrikler öğrenci mastery/başarı hesabına karıştırılmaz. Platform genelinde Bilge Arena ürün ekibinin aktivasyon, geri dönüş ve oyunlaştırma etkisini izlemesi içindir; kurum yöneticisine başka kurumların veya platformun toplamları açılmaz.

#### Uygun kullanıcı paydası

Her metrikte önce `eligibleLearner` kümesi sabitlenir:

- Yalnız öğrenci hesapları dahil edilir; admin, öğretmen, kurum yöneticisi, sentetik test ve demo hesapları hariç tutulur.
- Silinmiş, engellenmiş veya veri kullanım kapsamı dışında kalan hesaplar hariç tutulur.
- Kayıt zamanı için tek kanonik alan ve `Europe/Istanbul` gün sınırı kullanılır.
- D1/D7/D30 hesabına yalnız ilgili günü tamamlayacak kadar eski cohort girer. Örneğin dün kaydolan kullanıcı D30 paydasına eklenmez.
- Her sonuç `numerator`, `denominator`, tarih aralığı, cohort tanımı, hariç tutulan hesap sayısı ve hesaplayıcı sürümüyle raporlanır.

#### Aktivasyon — kayıttan sonra en az bir soru

Bir öğrenci, kayıt zamanından sonra en az bir server-authoritative ve başarıyla değerlendirilmiş soru attempt'i oluşturduğunda aktive olmuş sayılır. Sayfa açma, oyuna girme veya yalnız client event'i aktivasyon değildir.

Birlikte izlenecek metrikler:

- `everQuestionActivatedCount / eligibleRegisteredCount`
- İlk 24 saatte aktivasyon oranı.
- İlk 7 günde aktivasyon oranı.
- Kayıttan ilk geçerli soruya kadar medyan süre.

“Kayıttan sonra en az bir soru çözen kaç kişi?” sorusu hem kişi sayısı hem yüzdeyle cevaplanır. `Ever` oranı yaşlı cohort'ların daha fazla zamanı olduğu için tek başına dönem karşılaştırmasında kullanılmaz; 24 saat ve 7 gün pencereleri esas karşılaştırmayı sağlar.

#### D1 / D7 / D30 anlamlı geri dönüş

Bir geri dönüş, yalnız login veya sayfa görüntüleme değil; geçerli soru attempt'i, tamamlanmış doğrulanmış oyun oturumu ya da yayınlanmış programdaki anlamlı çalışma eylemidir.

- **D1:** Kayıt gününden sonraki 1. yerel takvim gününde en az bir anlamlı öğrenme eylemi yapan uygun öğrenci / olgunlaşmış D1 cohort'u.
- **D7:** Kayıt gününden sonraki 7. yerel takvim gününde en az bir anlamlı öğrenme eylemi yapan uygun öğrenci / olgunlaşmış D7 cohort'u.
- **D30:** Kayıt gününden sonraki 30. yerel takvim gününde en az bir anlamlı öğrenme eylemi yapan uygun öğrenci / olgunlaşmış D30 cohort'u.

Birincil payda ilgili kayıt tarihindeki bütün uygun öğrencilerdir (`signup retention`). Tanı amaçlı ikinci görünümde yalnız kayıt gününde aktive olan öğrenciler payda yapılabilir (`activated retention`); bu iki oran aynı adla veya aynı seri içinde birleştirilmez.

Exact-day D1/D7/D30 yanında küçük örneklem gürültüsünü görmek için `D7 window = gün 6–8` ve `D30 window = gün 27–33` yardımcı değerleri gösterilebilir; bunlar exact-day oranıyla aynı ad altında birleştirilmez.

#### Haftalık aktif öğrenci — WAU

`WAU`, son tamamlanmış 7 günlük pencerede en az bir anlamlı öğrenme eylemi yapan tekil uygun öğrencidir.

```text
WAU oranı = weeklyActiveEligibleLearnerCount / eligibleRegisteredLearnerCount
```

“380'in yüzde kaçı?” ancak 380 hesap yukarıdaki uygun kullanıcı filtresinden sonra kalan paydaysa bu şekilde hesaplanır. 380 içinde demo, öğretmen veya hiç tamamlanmamış kayıtlar varsa önce payda temizlenir. Rapor `X / N = %Y` biçiminde gösterilir; yalnız yüzde gösterilmez.

#### Streak/seri etkisi

İlk gözlemsel analizde bir `streak break`, öğrencinin en az 3 günlük doğrulanmış seriden sonra gereken anlamlı günlük eylemi yapmaması olarak tanımlanır. Şunlar raporlanır:

- Seri kırıldıktan sonraki 1, 3 ve 7 gün içinde anlamlı geri dönüş oranı.
- Aynı hesap yaşına, önceki 14 günlük aktif gün sayısına ve önceki seri uzunluğuna sahip; aynı cohort tarihinde serisini kırmayan karşılaştırma grubunun geri dönüş oranı.
- Mutlak fark yüzde puan olarak, göreli fark yüzde olarak; her iki grubun `n` değeri ve belirsizlik aralığı.

Bu karşılaştırma tek başına “oyunlaştırma geri dönüşe neden oldu” sonucunu vermez. Daha bağlı öğrenciler zaten hem seriyi koruyup hem geri dönebilir. Nedensel karar gerekiyorsa streak görünürlüğü veya hatırlatma davranışı feature flag ile önceden tanımlanmış, etik ve kontrollü bir A/B testinde ölçülür. Öğrencinin kazanılmış ödülü geriye dönük alınmaz; manipülatif bildirim kullanılmaz.

#### Raporlama ritmi

- Platform geneli haftalık ürün sağlığı raporu.
- Kayıt haftasına göre cohort tablosu: kayıt, 24 saat/7 gün aktivasyon, D1/D7/D30 ve WAU.
- Başlangıç koruma eşiği olarak 20 uygun kullanıcıdan küçük hücrelerde oran yerine `veri yetersiz`; eşik pilot verisi ve belirsizlik analiziyle kalibre edilmeden kalıcı ürün kuralı sayılmaz.
- Oranlarda yalnız nokta tahmini değil, küçük örnekleme uygun %95 Wilson güven aralığı gösterilir.
- Üretim, demo ve sentetik veriler ayrı environment/cohort etiketiyle tutulur.
- Metrik tanımı veya event kapsamı değişirse `metricVersion` artırılır; eski seri sessizce yeniden yazılmaz.

## 3. Kapsam

### 3.1 İlk pilotta var

- Kuruma özel çalışma alanı ve temel marka bilgisi: kurum adı, kısa ad, logo, vurgu rengi.
- Kurum genel görünümü.
- Her sınıf için ayrı takip yüzü.
- Öğrenci listesi ve öğrenci ayrıntı sayfası.
- Ders → ünite → konu → kazanım analizi.
- Kanıt yeterliliği ve güven seviyesi.
- İlk durum tespiti ve gerektiğinde yeniden tanılama.
- Son 7/30/90 günlük gelişim görünümü.
- Öğretmen takip işaretleri ve kısa kurum içi not.
- Sistem taslağı + öğretmen onaylı haftalık çalışma programı.
- Program tamamlama ve hedef kazanım etkisi.
- Kurum yöneticisi için açıklanabilir öğretmen takip göstergeleri.
- Öğretmenin gerekli gördüğünde hazırladığı A4/PDF öğrenci durum raporu.
- Öğretmenin bilinçli olarak başlattığı tekil hazır e-posta; zamanlanmış veya toplu otomasyon yoktur.

### 3.2 İlk pilotta yok

- Veli hesabı veya veli paneli.
- Otomatik haftalık/aylık e-posta.
- Toplu e-posta kampanyası.
- WhatsApp API veya otomatik mesaj.
- Muhasebe, tahsilat, fatura veya sözleşme yönetimi.
- Yoklama ve devamsızlık.
- Ders çizelgesi veya öğretmen nöbet programı.
- Bordro, izin veya insan kaynakları.
- CRM, aday öğrenci ve satış takibi.
- Çok şube ve kurumlar arası personel paylaşımı.
- Öğrenci veya öğretmen sıralaması.
- Psikolojik değerlendirme, zekâ seviyesi veya sağlık çıkarımı.
- Yapay zekânın tek başına öğrenci/öğretmen hakkında karar vermesi.
- Yeterli veri oluşmadan IRT/CAT puanlamasını production kararı olarak kullanmak.

## 4. Roller ve görünürlük

### Kurum yöneticisi

- Kendi kurumundaki bütün aktif sınıfları görür.
- Öğrenci takip özetlerini ve öğretmen göstergelerini görür.
- Öğretmen ekler/çıkarır ve sınıf sorumluluğunu görür.
- Ham cevap anahtarı, seçilen seçenek, e-posta veya platform içi gizli kimlikleri görmez.

### Öğretmen

- Yalnız sahibi veya atanmış sorumlusu olduğu sınıfları görür.
- Bu sınıflardaki aktif ve paylaşım izni devam eden öğrencilerin takip özetlerini görür.
- Çalışma programı taslağı üretir, düzenler, yayınlar ve değerlendirir.
- Öğrenciye takip işareti ve kısa kurum içi not ekler.
- Başka öğretmenin sınıfına erişemez.

### Öğrenci

- Kendi durum özetini, yayınlanmış çalışma programını ve görevlerini görür.
- Öğretmenin kurum içi notunu ve öğretmen performans göstergelerini göremez.
- Sınıftan ayrılma/paylaşımı durdurma mekanizması korunur.

## 5. Bilgi mimarisi

```text
Kurum
├── Genel Bakış
├── Sınıflar
│   └── Sınıf
│       ├── Durum Özeti
│       ├── Kazanım Isı Haritası
│       ├── Öğrenciler
│       ├── Programlar
│       └── Takip Gerektirenler
├── Öğrenciler
│   └── Öğrenci
│       ├── Genel Durum
│       ├── Ders ve Kazanımlar
│       ├── Gelişim
│       ├── Durum Tespiti
│       ├── Çalışma Programı
│       ├── Öğretmen Notları
│       └── Rapor
├── Öğretmenler
│   └── Öğretmen Takip Göstergeleri
└── Kurum Ayarları
```

## 6. Öğrenci durum analizi

### 6.1 Analiz birimi

Tek bir genel seviye yerine şu hiyerarşi kullanılacaktır:

```text
Ders → Ünite → Konu → Kazanım
```

Kanonik kaynak mevcut curriculum graph ve learning outcome eşlemeleridir. Category/topic metinleri yalnız geçiş ve kapsam gösterimi için kullanılabilir; karar üretiminde kanonik outcome kimliği tercih edilir.

### 6.2 Her kazanım için gösterilecek kanıtlar

- Toplam doğrulanmış deneme.
- Doğru deneme.
- Ham doğruluk.
- Zorluk ağırlıklı doğruluk.
- Ortalama cevap süresi.
- Hızlı yanlış oranı.
- İpucu kullanım oranı ve ortalama ipucu derinliği.
- Tahmin ve dikkatsizlik riski.
- Gecikmeli doğru cevap kanıtı.
- Son cevap tarihi.
- Son 30 gündeki değişim.
- Kanıt tamlığı.
- Model sürümü.

Öğretmen API'sine soru kimliği, seçilen seçenek, doğru seçenek, e-posta, öğrenci UUID'si veya serbest istem içeriği taşınmaz.

### 6.3 Durum etiketleri

| Durum | Asgari anlam |
|---|---|
| Veri yetersiz | Üçten az geçerli kanıt veya kapsam eksikliği |
| Destek gerekiyor | Yeterli kanıt var, açıklanabilir skor hedefin altında |
| Gelişiyor | Orta bantta veya son dönemde olumlu eğilim var |
| Güçlü | Yeterli kanıt ve yüksek başarı var |
| Kalıcı öğrenme doğrulandı | En az beş kanıt, yüksek başarı ve gecikmeli doğru cevap var |

Durumun yanında ayrı güven seviyesi gösterilir:

- Düşük güven
- Orta güven
- Güçlü kanıt

Kullanıcıya yüzde gösterilse bile örneklem sayısı ve son kanıt tarihi aynı bağlamda görünür olmalıdır.

### 6.4 Gelişim hesabı

- Gelişim aynı outcome ve aynı model sürümü içinde karşılaştırılır.
- En az iki ayrı zaman penceresi ve her pencerede yeterli kanıt yoksa değişim yorumu üretilmez.
- Yeni öğrencinin geçmişteki platform verisi öğretmene, geçerli sınıf paylaşım başlangıcından önceki dönem için varsayılan olarak açılmaz. Hukuki karar farklıysa ayrıca migration/RPC tasarımı gerekir.
- Sınıf ve öğretmen agregaları öğrenci düzeyindeki güven ağırlıklarıyla hesaplanır; yetersiz kanıtlı öğrenci başarı ortalamasına sıfır olarak eklenmez.

### 6.5 İstatistik kalite değişmezleri

Sağlam ve doğru istatistik bu ürünün birinci önceliğidir. UI ve otomasyon, aşağıdaki kurallar kanıtlanmadan genişletilmez:

1. **Doğrulanmış kaynak:** Öğrenme sonucu yalnız server-authoritative değerlendirilmiş attempt/session, tamamlanmış tanılama veya ağırlığı açıkça tanımlı kağıt kanıtından üretilir. Client event'i tek başına mastery kanıtı değildir.
2. **Eksik veri sıfır değildir:** Yanıt vermeyen, kapsamı ölçülmeyen veya kanıtı yetersiz öğrenci “başarısız” ve sınıf ortalamasında `0` sayılmaz.
3. **Payda görünürdür:** Her yüzdeyle birlikte öğrenci, outcome ve deneme sayısı taşınır. UI, paydası bilinmeyen yüzde göstermez.
4. **Zaman aralığı görünürdür:** Anlık durum ile 7/30/90 günlük eğilim aynı alan gibi sunulmaz.
5. **Başlangıç seviyesi korunur:** Gelişim, öğrencinin doğrulanmış başlangıç snapshot'ına göre hesaplanır; yalnız son toplam skora bakılmaz.
6. **Maruziyet ayrıştırılır:** Öğrenci çalışmadıysa “öğrenme değişmedi” ile “öğretmen etkisiz” aynı sonuç değildir. Çalışma miktarı ve öğretmen müdahalesi ayrı boyutlardır.
7. **Tekrar sayım yoktur:** Aynı answer/attempt/outcome kanıtı idempotent materialization ile bir kez sayılır.
8. **Model sürümlüdür:** Skor, eşik, ağırlık veya taxonomy değiştiğinde `modelVersion`/`taxonomyVersion` değişir; eski ve yeni sonuçlar sessizce aynı seri içinde karşılaştırılmaz.
9. **Kapsam ölçülür:** Soru bankasının outcome eşleme yüzdesi tam değilse desteklenmeyen kapsam başarı haritasına dahil edilmez.
10. **Küçük örneklem bastırılır:** Öğretmen/kurum agregasında minimum yeterli öğrenci ve outcome yoksa sayı yerine “veri yetersiz” gösterilir. İlk pilot eşiği fixture/pilot verisiyle doğrulanmadan kesinleştirilmez.
11. **Aykırı değer açıklanır:** Çok hızlı yanıt, yoğun ipucu veya yalnız kolay sorular başarı skorunu tek başına yükseltemez; bileşenler ayrı görünür kalır.
12. **Tekrarlanabilirlik:** Aynı kanıt snapshot'ı ve aynı model sürümü her çalıştırmada aynı sonucu üretir.
13. **İzlenebilirlik:** Rapor ve kurum agregası hangi kanıt snapshot'ına, hesaplayıcı sürümüne ve tarih aralığına dayandığını audit düzeyinde taşır.
14. **Geriye dönük doğrulama:** Yeni model önce shadow hesaplanır; eski modelle fark dağılımı ve beklenmeyen öğrenci/öğretmen etkisi incelenmeden karar yüzeyine alınmaz.

### 6.6 İstatistik sözleşmesi

Her öğrenci/outcome sonucu asgari şu metadata ile taşınacaktır:

```text
status
score
confidence
evidenceCount
independentEvidenceCount
firstEvidenceAt
lastEvidenceAt
windowStart
windowEnd
modelVersion
taxonomyVersion
coverageSupported
```

Agrega sonuçlarında bunlara ek olarak şunlar bulunur:

```text
eligibleStudentCount
excludedInsufficientCount
outcomeCount
baselineAvailableCount
activeStudyCount
```

Bu alanlar öğretmen/kurum karar ekranındaki son JSON'a tamamen açılmak zorunda değildir; fakat hesaplama ve drill-down sözleşmesinde kaybolamaz.

## 7. Durum tespiti

### 7.1 İlk katılım

1. Öğrencinin sınav kapsamı belirlenir.
2. Desteklenen dersler listelenir.
3. İlk ders için kısa adaptif tanılama başlatılır.
4. Orta zorlukta başlanır; yanıta göre bir kademe kolaylaşır/zorlaşır.
5. Kapsam tamamlanmadan sonuç kesin seviye olarak gösterilmez.
6. Sonuç başlangıç haritasına yazılır ve normal çalışma kanıtından ayrı kaynak olarak işaretlenir.

### 7.2 Yeniden tanılama

- Öğretmen elle talep edebilir.
- Sistem, yeterli süre geçtiğinde veya ölçüm çelişkili olduğunda önerir.
- Yeniden tanılama önceki skoru sessizce silmez; tarihçeli yeni snapshot oluşturur.
- Tanılama reward, XP, coin, lig veya öğretmen performans puanı üretmez.

### 7.3 Pilot kapsamı

Mevcut adaptif tanılama yalnız desteklenen taxonomy kapsamlarında açılır. Yeni ders, ilgili outcome kapsamı ve yeterli soru bankası statik ve gerçek PostgreSQL testlerinden geçmeden etkinleştirilmez.

## 8. Haftalık çalışma programı

### 8.1 Program amacı

Program bir takvim listesi değil, gerekçeli öğrenme müdahalesidir. Her görev şunları açıklamalıdır:

- Ne çalışılacak?
- Neden seçildi?
- Hangi kazanım hedefleniyor?
- Ne kadar sürecek?
- Hangi zorlukta çalışılacak?
- Başarı ölçütü nedir?
- Sonuç ne zaman yeniden kontrol edilecek?

### 8.2 Program girdileri

#### Sistem girdileri

- Tanılama sonucu.
- Zayıf ve gelişmekte olan outcome'lar.
- FSRS tekrar zamanı gelen sorular/outcome'lar.
- Son 7/30 günlük çalışma düzeni.
- Önceki program tamamlama oranı.
- Önceki programın hedef kazanımlara etkisi.
- Güncel kanıt yeterliliği.
- Öğrencinin soru çözme hızı.
- İpucu bağımlılığı ve hızlı yanlış riski.

#### Öğretmen girdileri

- Hafta başlangıcı.
- Uygun çalışma günleri.
- Hafta içi/hafta sonu günlük süre.
- Öncelikli ve hariç tutulacak ders/konu.
- Kurumun ortak sınıf görevi.
- Yaklaşan sınav/deneme tarihi.
- Serbest fakat uzunluğu sınırlı öğretmen notu.

### 8.3 Program türleri

- Başlangıç/veri toplama programı.
- Eksik kapatma programı.
- Gelişim programı.
- Kalıcılık programı.
- Sınav hazırlık programı.

### 8.4 Görev türleri

- Durum tespiti.
- Konu anlatımı/Bilge Tahta.
- Kolay alıştırma.
- Standart soru çözümü.
- Zorlayıcı soru.
- Yanlış soruların tekrarı.
- Gecikmeli kazanım kontrolü.
- Süreli mini test.
- Branş denemesi.
- Öğretmenin verdiği dış görev.

### 8.5 Program item sözleşmesi

Her görev şu alanları taşır:

```text
planDate
position
activityType
game
examRef
outcomeCode | null
category | null
topic | null
title
reason
estimatedMinutes
targetQuestionCount | null
difficulty | null
successThreshold | null
status
```

`reason` sistem tarafından kapalı ve açıklanabilir neden kodlarından üretilir; kişisel veri veya LLM serbest metni değildir. Öğretmen notu ayrı alanda saklanır.

### 8.6 Taslak üretim politikası

1. Günlük süre aşılmaz.
2. Aynı güne en fazla üç görev konur.
3. Bir haftaya öğrencinin geçmiş tamamlama kapasitesinden orantısız fazla yük eklenmez.
4. Öncelik sırası: gecikmiş tekrar → destek gereken outcome → güncel hedef → kontrollü meydan okuma.
5. En az bir hafif/tamamlama günü bırakılır.
6. Yeni outcome yükü, zayıf outcome yükünü tamamen bastıramaz.
7. Aynı outcome art arda her güne yığılmaz; öğrenme aralığı korunur.
8. Taslak öğretmen onayı olmadan yayınlanmaz.

### 8.7 Öğretmen iş akışı

1. Öğrenci seçilir.
2. Sistem son durum ve veri güvenini gösterir.
3. Öğretmen süre ve gün tercihlerini belirler.
4. Sistem haftalık taslak üretir.
5. Öğretmen görev ekler, siler, taşır veya değiştirir.
6. Sistem yük ve çakışma uyarılarını gösterir.
7. Öğretmen yayınlar.
8. Öğrenci yalnız yayınlanmış sürümü görür.
9. Değişiklik gerekiyorsa yeni sürüm oluşturulur; geçmiş sürüm audit için korunur.

### 8.8 Program sonucu

Hafta sonunda şu göstergeler üretilir:

- Planlanan/tamamlanan görev.
- Planlanan/tamamlanan dakika.
- Plan öncesi ve sonrası hedef outcome durumu.
- Gecikmeli kontrol sonucu.
- İpucu bağımlılığı değişimi.
- Öğrencinin programı tamamlama düzeni.
- Öğretmen değerlendirmesi: etkili, kısmen etkili, etkisiz, veri yetersiz.

Görev tamamlamak tek başına öğrenme başarısı sayılmaz. Program etkisi için hedef outcome'da sonraki bağımsız kanıt aranır.

## 9. Öğretmen takip göstergeleri

### 9.1 İlke

İlk pilotta tek bir “öğretmen performans puanı” veya öğretmen sıralaması olmayacaktır. Kurum yöneticisine beş açıklanabilir boyut gösterilecektir:

1. Takip düzeni.
2. Program yönetimi.
3. Öğrenci gelişimi.
4. Müdahale etkinliği.
5. Veri güvenilirliği.

Bu ekran işten çıkarma, ücret veya disiplin kararını otomatik vermez. Öğretmen kendi göstergelerini, dayanaklarını ve eksik verileri görebilir.

### 9.2 Takip düzeni

- Güncel tanılama/analiz bulunan aktif öğrenci oranı.
- Desteğe ihtiyaç duyan öğrenciler içinde incelenenlerin oranı.
- Uzun süre çalışmayan öğrenciler içinde takip işareti açılanların oranı.
- Açık takiplerin yaş dağılımı.
- Güncel programı olmayan ve programa ihtiyaç duyan öğrenci sayısı.

### 9.3 Program yönetimi

- Program gereken öğrenciler içinde programı yayınlananların oranı.
- Programların zamanında hazırlanma oranı.
- Öğretmen tarafından incelenmeden yayınlanan taslak sayısı: her zaman sıfır olmalıdır.
- Program tamamlama oranı.
- Sürekli yarım kalan programların yeniden düzenlenme oranı.
- Kişiselleştirme göstergesi: sınıf ortak görevleri ile kişisel outcome görevlerinin dağılımı.

### 9.4 Öğrenci gelişimi

- Başlangıca göre yeterli kanıtlı outcome gelişimi.
- Destek gerekiyor durumundan gelişiyor/güçlü durumuna geçen outcome oranı.
- Kalıcı öğrenmesi doğrulanan outcome sayısı.
- İpucu bağımlılığındaki azalma.
- Gecikmeli tekrar başarısı.
- Düşüş gösteren ve henüz müdahale edilmemiş öğrenci sayısı.

Ham öğrenci ortalaması öğretmen başarısı olarak kullanılmaz. Ölçüm öğretmen sorumluluk dönemi, öğrencinin başlangıç seviyesi, aktif çalışma miktarı ve kanıt güveniyle birlikte gösterilir.

### 9.5 Müdahale etkinliği

- Risk/eksik tespitinden ilk takip eylemine kadar geçen gün dilimi.
- Müdahale açılan öğrenciler içinde programı güncellenenlerin oranı.
- Müdahale sonrası yeterli kanıt oluşanlarda iyileşme oranı.
- Etkisiz programların yeniden düzenlenme oranı.
- Tekrarlayan başarısızlıkta farklı görev türü veya zorluk denenme oranı.

Yanıt süresi tek başına performans değildir; öğretmenin çalışma günü ve sorumluluk dönemi dışında süre sayılmaz.

### 9.6 Veri güvenilirliği

- Yeterli kanıt olmadan kesin durum/rapor üretilen öğrenci sayısı: sıfır olmalıdır.
- Eksik tanılama kapsamı.
- Öğretmen değerlendirmesi tamamlanmamış program sayısı.
- Eski/güncelliğini yitirmiş program sayısı.
- Göstergeye dahil edilen öğrenci ve outcome sayısı.
- Her göstergenin güven seviyesi.

### 9.7 Adalet kuralları

- Üçten az geçerli kanıtı olan outcome gelişim hesabına katılmaz.
- Yeni öğrenci için başlangıç penceresi tanınır.
- Öğretmenin atanmadığı dönem ona yazılmaz.
- Öğrenci hiç çalışmadıysa gelişim eksikliği doğrudan öğretmene mal edilmez; takip eylemi ayrıca değerlendirilir.
- Sınıf büyüklüğü ve başlangıç düzeyi görünür kalır.
- Öğretmenler birbirine karşı sıralanmaz.
- Küçük örneklemde skor yerine “veri yetersiz” gösterilir.
- Kurum yöneticisi her agreganın hangi öğrenci/outcome sayısına dayandığını görebilir.
- Öğretmen açıklama/itiraz notu ekleyebilir; gösterge verisi sessizce değiştirilemez.

## 10. Açık kaynak ve standartlardan alınacaklar

Bu projeler Bilge Arena'ya doğrudan kopyalanmayacak veya yeni bir LMS/ERP bağımlılığı olarak kurulmayacaktır. Her birinden yalnız aşağıdaki kanıtlanmış desen alınacaktır.

### 10.1 Moodle — gösterge → hedef → içgörü → aksiyon

- **Alınacak:** Yeniden kullanılabilir göstergeler, açık hedef, güveni görünen içgörü ve içgörüden öğretmen aksiyonuna geçiş.
- **Bilge Arena karşılığı:** `indicator` saf hesaplayıcıları → öğrenci/outcome hedef durumu → takip içgörüsü → program/müdahale aksiyonu.
- **Alınmayacak:** Moodle'ın bütün LMS, kurs ve eklenti mimarisi.
- **Kalite etkisi:** Gösterge ile karar birbirine karıştırılmaz; her içgörünün hangi göstergelere dayandığı açıklanır.

Kaynak: [Moodle](https://github.com/moodle/moodle) ve [Moodle Analytics API](https://moodledev.io/docs/5.0/apis/subsystems/analytics).

### 10.2 Gibbon — küçük kurum bilgi mimarisi

- **Alınacak:** Kurum → personel → sınıf → öğrenci hiyerarşisi, küçük okul/dershane kullanıcılarının sade gezinme ihtiyaçları ve modüler ekran ayrımı.
- **Alınmayacak:** Veli paneli, yoklama, personel/operasyon ve genel okul yönetimi modülleri.
- **Kalite etkisi:** Analitik katmanı ERP ekranlarıyla karışmaz; kullanıcı doğrudan kurum/sınıf/öğrenci bağlamında kalır.

Kaynak: [Gibbon](https://github.com/GibbonEdu/core).

### 10.3 Open edX — olay ve modül sınırları

- **Alınacak:** Öğrenme olaylarının üretim, materialization ve okuma katmanlarının ayrılması; yüksek hacimli olaylarda idempotency ve immutable history yaklaşımı.
- **Alınmayacak:** Open edX monoliti, CMS, micro-frontend ekosistemi veya operasyon yükü.
- **Kalite etkisi:** UI event'i ile doğrulanmış öğrenme kanıtı ayrılır; aynı olay iki kez sayılmaz.

Kaynak: [Open edX](https://github.com/openedx/openedx-platform).

### 10.4 OneRoster 1.2 — gelecekteki roster sınırı

- **Alınacak:** Kurum, akademik dönem, sınıf, kullanıcı, öğretmen, öğrenci ve enrollment kavramlarının dış sistem aktarımındaki isim/sınırları.
- **İlk pilotta:** OneRoster endpoint'i veya tam CSV import/export yapılmaz. İç model gelecekte eşlenebilir kalacak şekilde adlandırılır.
- **Kalite etkisi:** Öğrenci-sınıf-öğretmen ilişkisi serbest metin veya geçici CSV alanlarıyla bozulmaz.

Kaynak: [OneRoster 1.2](https://standards.1edtech.org/oneroster/?view=category).

### 10.5 CASE 1.1 — kanonik kazanım grafiği

- **Alınacak:** Yetkinlik çerçevesi, outcome kimliği, hiyerarşik ilişki ve sürümlü association yaklaşımı.
- **Bilge Arena karşılığı:** Mevcut course → unit → topic → outcome graph; `outcomeCode`, `taxonomyVersion` ve question mapping.
- **Kalite etkisi:** Category metni değişse bile istatistik aynı kanonik kazanıma bağlı kalır; farklı taxonomy sürümleri sessizce karışmaz.

Kaynak: [CASE 1.1](https://standards.1edtech.org/case/).

### 10.6 xAPI — öğrenme olayı zarfı

- **Alınacak:** `actor → verb → object → result → context → timestamp` düşünce modeli ve immutable event kimliği.
- **İlk pilotta:** Ayrı Learning Record Store kurulmaz ve tam xAPI uygunluğu iddia edilmez.
- **Bilge Arena karşılığı:** İç olay sözleşmelerinde actor kimliği private kalır; verb kapalı enum, object outcome/activity, result doğrulanmış sonuç ve context kurum/sınıf/program kapsamıdır.
- **Kalite etkisi:** Aynı anlama gelen olaylar farklı ekranlardan gelse bile tek sözleşmeyle analiz edilir; serbest event adı ve serbest PII payload engellenir.

Kaynak: [xAPI specification](https://github.com/adlnet/xAPI-Spec).

### 10.7 Metabase/Superset — yalnız anonim iç doğrulama

- **İlk pilotta kullanılmayacak:** Kurum/öğretmen paneli bu araçlara gömülmeyecek; öğrenci düzeyi PII bu sistemlere taşınmayacak.
- **İleride kullanılabilir:** Anonimleştirilmiş ürün sağlığı, model coverage, hesaplayıcı sürüm karşılaştırması ve iç operasyon analizi.
- **Kalite etkisi:** Ürün kararı veren kanonik metrikler uygulama kodu/DB fonksiyonlarında sürümlü kalır; harici dashboard içindeki değişken sorgular tek doğruluk kaynağı olmaz.

Kaynak: [Metabase](https://github.com/metabase/metabase) ve [Apache Superset](https://github.com/apache/superset).

### 10.8 Standart eşleme özeti

| Bilge Arena varlığı | Kaynak desen | İlk pilot kararı |
|---|---|---|
| Kurum/sınıf/enrollment | OneRoster + Gibbon | İç model eşlenebilir, entegrasyon yok |
| Ders/ünite/konu/outcome | CASE | Kanonik ve sürümlü graph zorunlu |
| Öğrenme olayı | xAPI + Open edX | İç typed event, ayrı LRS yok |
| Gösterge/içgörü/aksiyon | Moodle | Açıklanabilir saf hesaplayıcılar |
| İç toplu analiz | Metabase/Superset | Pilot sonrası, yalnız anonim |

## 11. Kurum ekranları

### 11.1 Genel bakış

- Aktif sınıf, öğretmen ve öğrenci sayısı.
- Güncel durum tespiti bulunan öğrenci oranı.
- Veri yetersiz öğrenci sayısı.
- Destek gereken öğrenci sayısı.
- Son 7/30 günde aktif öğrenci oranı.
- Programı bulunan/tamamlayan öğrenci oranı.
- Ders bazında durum dağılımı.
- En sık destek gereken outcome'lar.
- Takip bekleyen öğrenciler.

### 11.2 Sınıf

- Öğrenci listesi.
- Ders/kazanım ısı haritası.
- Öğrenci başına veri güveni.
- Son aktivite.
- Son 30 günlük yön: gelişiyor, sabit, düşüyor, veri yetersiz.
- Açık takip ve program durumu.
- Sınıf ortak görevi oluşturma.

### 11.3 Öğrenci

- Genel durum özeti.
- Ders ve outcome ağacı.
- Kanıt ayrıntıları.
- Zaman çizgisi ve snapshot karşılaştırması.
- Durum tespiti başlat/öner.
- Takip işaretleri.
- Program taslağı/düzenle/yayınla.
- A4/PDF rapor.

### 11.4 Öğretmen

- Sorumlu sınıflar ve öğrenci sayıları.
- Beş takip boyutu.
- Her boyutun kanıt/güven düzeyi.
- Açık müdahaleler.
- Öğrenci gelişim dağılımı.
- Dönem karşılaştırması.
- Öğretmenin açıklama notu.

## 12. Veliye hazır rapor ve manuel e-posta

Veli paneli veya otomatik iletişim kurulmayacaktır.

### Rapor akışı

1. Öğretmen öğrenciyi ve tarih aralığını seçer.
2. Sistem öğrenci durum snapshot'ından taslak rapor üretir.
3. Öğretmen açıklama metnini kontrol eder/düzenler.
4. Rapor değişmez sürüm olarak onaylanır.
5. Öğretmen A4 yazdırır/PDF indirir veya tekil e-posta gönderimini bilinçli olarak başlatır.

### E-posta ilkesi

- Zamanlanmış gönderim yoktur.
- Toplu gönderim yoktur.
- Öğretmen onayı olmadan gönderim yoktur.
- Konu ve gövdede ayrıntılı kişisel veri asgari tutulur.
- Tercihen rapor eki yerine süreli, iptal edilebilir güvenli bağlantı kullanılır.
- Gönderim sonucu ve başlatan öğretmen audit edilir.
- Veli iletişim adresinin toplanması/saklanması ayrıca hukuki ve teknik kabul kapısıdır; bu karar tamamlanana kadar “PDF indir + e-posta taslağını kopyala” akışı kullanılabilir.

## 13. Önerilen veri modeli

İlk migration numarası, o anda master'daki son migration tekrar doğrulandıktan sonra seçilecektir. Mevcut dal bağlamında aday `114`'tür.

### Kurum ve sorumluluk

- `institution_branding`
  - `institution_id`, `short_name`, `logo_path`, `accent_color`, zamanlar.
- `classroom_teacher_assignments`
  - `institution_id`, `classroom_id`, `teacher_id`, `role=lead|support`, başlangıç/bitiş, atayan.

### Öğrenci takip

- `institution_student_followups`
  - kurum, sınıf üyeliği, opak member ref ilişkisi, tür, durum, açan/kapatan, sınırlı not, zamanlar.
- `institution_student_snapshots`
  - kurum, sınıf üyeliği, snapshot tarihi, model sürümü, kapsam, kanıt agregaları.
- `institution_student_outcome_snapshots`
  - snapshot, outcome, skor, durum, güven, kanıt sayısı, bileşenler.

Snapshot ilk sürümde gerekli değilse sorgu anında agregasyonla başlanabilir; performans ve rapor değişmezliği gerektirdiğinde eklenir. İlk migration gereksiz kopya veri üretmeyecektir.

### Çalışma programı

- `institution_study_programs`
  - kurum, sınıf, membership/student bağı, hazırlayan öğretmen, hafta başlangıcı, `draft|published|completed|archived`, süre tercihleri, sürüm, öğretmen notu, zamanlar.
- `institution_study_program_items`
  - program, tarih, sıra, görev türü, game/exam, outcome/category/topic, başlık, neden kodu, süre, hedef soru, zorluk, başarı eşiği, durum ve tamamlanma.
- `institution_study_program_reviews`
  - program, değerlendiren öğretmen, `effective|partial|ineffective|insufficient`, outcome önce/sonra snapshot referansı, sınırlı not, zaman.

### Rapor ve gönderim

- `institution_student_reports`
  - kurum, membership, tarih aralığı, snapshot payload, oluşturan/onaylayan, durum, zamanlar.
- `institution_report_deliveries`
  - rapor, kanal, başlatan, sağlayıcı opak kimliği, durum, zamanlar; açık adresin log/audit kopyası tutulmaz.

### Ürün sağlığı agregaları

İlk sürümde yeni bir genel amaçlı event ambarı kurulmaz. Mevcut server-authoritative attempt, tamamlanmış oyun oturumu ve program eylemleri salt-okunur kaynak kabul edilir; gerekirse günlük, sürümlü ve yeniden üretilebilir agregalar materialize edilir.

- `product_cohort_daily_metrics` (yalnız ihtiyaç kanıtlanırsa)
  - cohort tarihi, environment, metrik sürümü, eligible kayıt, aktivasyon, D1/D7/D30 ve hariç tutma sayıları.
- `product_streak_outcomes` (yalnız gözlemsel sorgu pahalıysa)
  - anonim/opak learner ref, anchor tarihi, önceki seri/aktivite kovaları, break durumu, 1/3/7 günlük geri dönüş sonucu ve model sürümü.

Bu agregalar kurum tenant ekranlarının veri kaynağı değildir. Ham e-posta, telefon, isim veya serbest metin taşımaz; erişim yalnız Bilge Arena iç ürün analizi rolündedir.

## 14. RPC ve API sınırı

Tablolar RLS altında, client ve service-role doğrudan DML'ine kapalı olacaktır. Uygulama kapsamı doğrulayan `SECURITY DEFINER` RPC'leri kullanacaktır.

### Okuma

- `GET /api/institution/tracking/overview`
- `GET /api/institution/tracking/classrooms/:classroomId`
- `GET /api/institution/tracking/classrooms/:classroomId/students/:memberRef`
- `GET /api/institution/tracking/teachers`
- `GET /api/institution/tracking/teachers/:memberRef`
- `GET /api/institution/tracking/programs/:programId`

### Yazma

- `POST /api/institution/tracking/followups`
- `PATCH /api/institution/tracking/followups/:followupRef`
- `POST /api/institution/tracking/programs/draft`
- `PATCH /api/institution/tracking/programs/:programId`
- `POST /api/institution/tracking/programs/:programId/publish`
- `POST /api/institution/tracking/programs/:programId/review`
- `POST /api/institution/tracking/reports`
- `POST /api/institution/tracking/reports/:reportId/send-email`

Tüm yazmalar `requestId` ve canonical payload hash ile idempotent olacaktır. HTTP yanıtları `private, no-store`; hata gövdeleri PII ve iç kimlik içermez.

## 15. Feature flag ve rollout

Önerilen kapılar:

- `INSTITUTION_TRACKING_ENABLED=false` — bütün server API/RPC kapısı.
- `NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED=false` — kurum takip UI kapısı.
- `INSTITUTION_STUDY_PROGRAM_ENABLED=false` — program yazma/yayınlama kapısı.
- `INSTITUTION_MANUAL_REPORT_EMAIL_ENABLED=false` — tekil e-posta kapısı.

Migration önce uygulanabilir ancak bütün bayraklar kapalı kalır. Canlı erişim aşağıdaki sırayla açılır:

1. Tenant ve ACL salt-okunur smoke.
2. Sentetik kurum/sınıf/öğrenci verisi.
3. Kurum yöneticisi okuma ekranı.
4. Öğretmen öğrenci takip ekranı.
5. Program taslağı ve yayınlama.
6. A4/PDF rapor.
7. Hukuki onay sonrası manuel tekil e-posta.

## 16. Uygulama fazları

### Faz 0 — Plan ve hukuki/ürün kararları

- Bu planın onayı.
- Öğretmen performans göstergelerinin kullanım amacı ve erişim sınırı.
- Öğrenci geçmiş verisinin sınıfa katılım öncesi görünürlüğü kararı.
- Öğretmen notu saklama süresi.
- Veli e-posta adresi hiç saklanacak mı kararı.
- Canlı migration 105/112/113 ve feature flag durumunun yeniden doğrulanması.

**Çıkış:** Açık karar kaydı; kod henüz canlı özelliği açmaz.

### Faz 1 — Saf hesaplama ve public contract

- Öğrenci durum özetleyici.
- Kanıt/güven hesaplayıcı.
- Sınıf agregasyonu.
- Haftalık program taslak üreticisi.
- Öğretmen beş boyut gösterge hesaplayıcısı.
- Strict Zod/public parser'lar ve negatif leakage testleri.

**Çıkış:** Saf birim testleri ve açıklanabilir örnek fixture'lar.

### Faz 2 — Veri ve yetki temeli

- Gerekli minimum tablolar.
- Kurum yöneticisi / sınıf öğretmeni scope fonksiyonları.
- Program ve takip write RPC'leri.
- Öğrenci/öğretmen analitik read RPC'leri.
- RLS, revoke, idempotency ve audit.

**Çıkış:** Statik migration testi + disposable gerçek PostgreSQL tenant testleri.

### Faz 3 — Kurum, sınıf ve öğrenci API/UI

- Kurum genel bakış.
- Sınıf listesi ve kazanım ısı haritası.
- Öğrenci ayrıntısı ve gelişim.
- Takip işaretleri.
- Loading/error/empty/insufficient-evidence durumları.

**Çıkış:** Route/component testleri, 320/375/390 px mobil ve masaüstü QA.

### Faz 4 — Çalışma programı

- Taslak üretme.
- Öğretmen düzenleme.
- Yük/çakışma doğrulama.
- Yayınlama ve sürümleme.
- Öğrenci görünümü.
- Program sonuç değerlendirmesi.

**Çıkış:** Program invariants, yarış/replay ve öğrenci owner testleri.

### Faz 5 — Öğretmen takip göstergeleri

- Beş boyutlu kurum ekranı.
- Güven ve örneklem görünürlüğü.
- Sorumluluk dönemi filtresi.
- Müdahale/takip kuyruğu.
- Öğretmen açıklama notu.

**Çıkış:** Adalet fixture'ları: yeni öğrenci, düşük katılım, küçük sınıf, atanma değişimi ve yetersiz kanıt.

### Faz 6 — Rapor ve manuel e-posta

- Değişmez rapor snapshot'ı.
- A4/PDF çıktı.
- Öğretmen önizleme/onayı.
- İlk aşamada PDF indir + e-posta taslağı.
- Hukuki/operasyonel onay sonrası platformdan tekil Resend gönderimi.

**Çıkış:** Yazdırma QA, no-store/süreli erişim, idempotent send ve delivery audit testi.

### Faz 7 — Küçük pilot

- Bir demo kurum.
- 2–4 öğretmen.
- 2–5 sınıf.
- 50–100 sentetik/test öğrenci veya açıkça onaylı gerçek pilot kapsamı.
- En az iki haftalık program çevrimi.
- Öğretmen geri bildirimi ve ürün metrikleri.

**Çıkış:** Ödeme/kullanım kararı; otomasyon veya yeni kapsam ancak bu değerlendirmeden sonra planlanır.

## 17. Test matrisi

### Güvenlik

- Kurumlar arası IDOR.
- Sınıflar arası öğretmen erişimi.
- Kurumdan/öğretmenlikten çıkarma sonrası anlık erişim kesilmesi.
- Öğrenci sınıftan ayrıldıktan sonra analitik/program erişimi.
- Service-role direct table DML reddi.
- Public response içinde email, phone, userId, questionId, selected/correct option ve raw answer bulunmaması.
- Feature flag/config yokken fail-closed.
- Audit ve no-store başlıkları.

### Analiz doğruluğu

- 0–2 kanıt veri yetersiz.
- Zorluk ağırlığı.
- Delayed correctness.
- İpucu bağımlılığı.
- Model sürümü ve kapsam uyuşmazlığı.
- Yetersiz outcome'un sınıf ortalamasını aşağı çekmemesi.
- Aynı fixture için deterministik sonuç.
- Eksik verinin sıfıra dönüşmemesi ve paydanın görünür kalması.
- Aynı answer/attempt/outcome kanıtının ikinci kez sayılmaması.
- Model/taxonomy sürümü değişiminde sessiz seri birleştirilmemesi.
- Coverage eksik olduğunda desteklenmeyen kapsamın karar dışı kalması.
- Shadow model karşılaştırmasının mevcut kararı değiştirmemesi.

### Ürün sağlığı metrikleri

- Test/demo/admin/öğretmen hesaplarının bütün paydalardan çıkarılması.
- D30 için henüz olgunlaşmamış cohort'un paydaya girmemesi.
- Kayıttan önceki attempt'in aktivasyon sayılmaması.
- Client-only soru/oyun event'inin anlamlı aktivite sayılmaması.
- Aynı kullanıcının bir pencerede yalnız bir kez WAU sayılması.
- `X / N = %Y` hesabının numerator ve denominator fixture'ıyla doğrulanması.
- Yerel gün sınırında D1/D7/D30 davranışı ve saat dilimi testi.
- Streak break anchor'ının en az 3 doğrulanmış gün gerektirmesi.
- Karşılaştırma grubunda hesap yaşı, önceki aktivite ve seri uzunluğu kovalarının eşleşmesi.
- Düşük örneklemde oran/fark yerine `veri yetersiz`.
- Metric sürümü değiştiğinde eski ve yeni cohort serilerinin karışmaması.

### Program

- Günlük süre ve üç görev sınırı.
- Benzersiz sıra ve tarih.
- Öğretmen onayı olmadan yayınlanmama.
- Taslak/published sürüm değişmezliği.
- Aynı request replay ve farklı payload çatışması.
- Öğrencinin yalnız kendi yayınlanmış programını görmesi.
- Tamamlamanın tek başına öğrenme etkisi sayılmaması.

### Öğretmen göstergeleri

- Yeni öğrenci başlangıç penceresi.
- Öğretmen atanma tarihinden önceki sonucun hariç tutulması.
- Çalışmayan öğrenci ile müdahale etmeyen öğretmenin ayrıştırılması.
- Küçük örneklemde veri yetersiz.
- Başlangıç düzeyi farklı sınıfların ham ortalamayla karşılaştırılmaması.
- Tek puan/sıralama alanının public contract'ta bulunmaması.

### UI ve çıktı

- 320, 375, 390 px ve masaüstü.
- Uzun kurum/sınıf/öğrenci adı çakışmaları.
- Klavye ve screen-reader adları.
- Renk dışında metinsel durum.
- A4 sayfa kırılması ve Türkçe karakter/font.
- Açık/koyu tema; yazdırmada beyaz zemin.

## 18. Commit ve geri dönüş disiplini

Her faz ayrı, sınırlı commit olacaktır. Her commit/push öncesi:

1. `restore/<scope>-precommit-<timestamp>` etiketi.
2. İlgili hedefli testler.
3. `git diff --check`.
4. Yalnız ilgili dosyaların açıkça stage edilmesi.
5. Push öncesi `restore/<scope>-prepush-<timestamp>` etiketi.

Migration ve production işlemleri kod merge'inden ayrıdır. Kodda bulunmak; migration uygulanmış, flag açılmış, pilot yapılmış veya production'da doğrulanmış anlamına gelmez.

## 19. İlk uygulama dilimi

Plan onaylandıktan sonra ilk patch yalnız şu kapsamda tutulacaktır:

1. Saf öğrenci durum/güven public contract'ı.
2. Saf haftalık program taslak modeli ve invariants.
3. Saf beş boyutlu öğretmen gösterge modeli.
4. Aktivasyon, D1/D7/D30, WAU ve streak gözlem metriklerinin saf sözleşmeleri.
5. Birim test fixture'ları.
6. Gerekli minimum migration için ayrı tasarım notu.

Bu dilim geçmeden UI, e-posta veya geniş migration yazılmayacaktır.

### 19.1 Uygulama durumu — 2026-08-13

- [x] Kanıt, zaman penceresi, model/taxonomy sürümü ve coverage metadata sözleşmesi.
- [x] Eksik veriyi sayısal sıfırdan ayıran öğrenci/outcome karar sözleşmesi.
- [x] Haftalık program taslak değişmezleri: haftada en fazla 21, günde en fazla 3 görev, günlük süre sınırı ve ardışık sıra.
- [x] Tek toplam puanı reddeden beş boyutlu öğretmen gösterge sözleşmesi.
- [x] Aktivasyon, D1/D7/D30, WAU ve gözlemsel streak dönüş saf hesaplayıcıları.
- [x] Uygun kullanıcı, olgunlaşmış cohort, doğrulanmış aktivite, idempotent event kimliği, küçük örneklem ve Wilson aralığı testleri.
- [x] Doğrulanmış answer/session/program satırlarını kimlik-minimal aktivite sözleşmesine çeviren salt-okunur kaynak adapter'ı.
- [x] Demo/test/sentetik hesap envanteri onaylanmadan metrik üretimini durduran fail-closed veri kalite raporu.
- [ ] Production kaynak sorgusu ve yalnız toplu sonuç veren ilk canlı veri kalite çalıştırması.
- [ ] Kaynak sorgular doğrulandıktan sonra gerekli olup olmadığına karar verilecek günlük agrega migration'ı.
- [x] Tenant-sınırlı ilk öğrenci analiz API sözleşmesi.
- [x] İlk kurum öğrenci analiz UI.
- [ ] Sınıf/kurum agregaları ve öğretmen gösterge UI.

### 19.2 Kurum öğrenci analiz dilimi — 2026-08-13

- [x] Aktif aynı-kurum yöneticisi veya sınıfın sahibi öğretmenle sınırlı salt-okunur analiz RPC'si.
- [x] Öğrencinin sınıf üyeliğini kabul etmesinden önceki kanıtı dışlayan zaman penceresi.
- [x] Yalnız doğrulanmış, idempotent mastery evidence v2 kanıtını kullanan outcome agregasyonu.
- [x] Eksik kanıtı sıfır başarıya çevirmeyen güven/status builder'ı.
- [x] Ham kullanıcı, cevap, soru, oturum ve attempt kimliklerini reddeden public API sözleşmesi.
- [x] Varsayılan kapalı server feature flag, route/SQL güvenlik ve contract testleri.
- [ ] Migration 114'ün hedef Supabase projesine uygulanması ve şema tiplerinin canlı şemadan yeniden üretilmesi.
- [ ] Sentetik tenant/classroom fixture ile canlı RPC smoke testi.
- [x] İlk kurum, sınıf ve öğrenci takip arayüzü.

### 19.3 İlk kurum takip arayüzü — 2026-08-14

- [x] Manager için kurumdaki bütün aktif sınıfları, teacher için yalnız sahip olduğu sınıfları döndüren takip dizini.
- [x] Silinmiş, ayrılmış veya bloklanmış öğrenci kimliklerini dizinden çıkaran SQL sınırı.
- [x] Ayrı `/arena/kurum` çalışma alanı ve Arena feature-flag kartı.
- [x] Sınıf ve öğrenci seçimi; TYT Matematik outcome durum, güven, payda ve son kanıt görünümü.
- [x] Eksik kanıtta sayısal sıfır yerine `Kanıt yetersiz` gösterimi.
- [x] 320, 375 ve 390 px fixture render testleri; uzun kurum, sınıf, öğrenci ve kazanım metinleri.
- [ ] Migration 114/115 ve iki server/client feature flag production'da kapalıdır; deploy/canlı smoke yapılmadı.

### 19.4 Haftalık program üretim çekirdeği — 2026-08-14

- [x] Yalnız doğrulanmış öğrenci/outcome analizini kabul eden saf program üretici.
- [x] Gelişiyor durumundaki en düşük skorlu outcome'ları önceleyen hedefli soru görevleri.
- [x] Kanıtı yetersiz outcome'ları başarı/başarısızlık saymadan kısa durum tespitine yönlendirme.
- [x] Güçlü outcome'larda kalıcılık tekrarı; tek haftada en fazla dokuz açıklanabilir görev.
- [x] Pazartesi başlangıcı, günlük süre limiti ve ardışık görev sırası değişmezleri.
- [x] Taslağın atanmış sınıf öğretmeni tarafından idempotent kalıcılaştırılması ve ayrı istekle açık yayın onayı.
- [ ] Taslağın öğretmen tarafından görev bazında düzenlenmesi.
- [x] Öğretmen çalışma alanında taslağı görev, gerekçe, süre ve tarih bazında inceleyip ayrı eylemle yayınlama.
- [ ] Öğrenci çalışma ekranı ve yazdırılabilir haftalık görünüm.

### 19.5 Öğretmen gösterge hesaplama çekirdeği — 2026-08-14

- [x] Tek performans puanı veya sıralama üretmeyen beş ayrı boyut.
- [x] Her boyutta görünür pay, payda, uygun öğrenci ve hariç tutulan yetersiz veri sayısı.
- [x] Üçten az öğrenci veya gözlemde yüzdelik değeri gizleyen küçük örneklem kapısı.
- [x] Kaynağı henüz olmayan takip/müdahale boyutlarında sahte sıfır yerine `veri yetersiz`.
- [ ] Kurumsal program ve takip kaynak adapter'ı ile tenant-sınırlı öğretmen API/UI.

### 19.6 Sınıf agregası hesaplama çekirdeği — 2026-08-14

- [x] Aktif roster ile öğrenci analizlerinin bire bir eşleşmesini zorunlu tutan fail-closed sınıf sözleşmesi.
- [x] Karar güvenli kanıtı olan, desteğe ihtiyaç duyan ve kanıtı yetersiz öğrenci sayıları.
- [x] Yalnız en az üç öğrencide görülen outcome ihtiyacını sınıf önceliği olarak gösteren gizlilik eşiği.
- [x] Program yönetimini yalnız desteğe ihtiyacı doğrulanmış öğrencilerde yayınlanan program kapsamıyla ölçme.
- [x] Baseline ve takip kaynağı yokken öğrenci gelişimi/takip/müdahale boyutlarını açıkça yetersiz bırakma.
- [x] Seçili sınıfta en fazla 40 analiz çağrısını dörtlü eşzamanlılıkla sınırlayan fail-closed pilot adapter.
- [x] Yalnız aynı tenant/sınıfta yayınlanmış programların opak üye referanslarını döndüren salt-okunur RPC.
- [ ] 100+ öğrenci veya ölçülen p95 bütçesi aşılırsa N+1 pilot adapter yerine tek batch RPC.
- [x] Kurum çalışma alanında sınıf özeti, gizlilik eşikli outcome öncelikleri ve beş ayrı öğretmen gösterge kartı.
- [x] Sınıf agregası alınamazsa geçerli öğrenci analizini ayrı tutan kısmi ekran hata sınırı.
