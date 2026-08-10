# Koç Küratörlü Veri: Pilot ve Yayına Alma Kararı

**Karar tarihi:** 2026-08-10
**Durum:** Kabul edildi; üretim verisi yazımı pilot kabulünden önce yasak.

## Kapsam ve mevcut durum

- 2026-08-09 keşif anlık görüntüsünde **636 uygun soru** bulundu. Bu sayı pilot
  seçimi öncesinde salt-okunur keşifle yeniden ölçülür; sabit ürün gerçeği sayılmaz.
- `COACH_AI_ENABLED` kapalı kalır. Küratörlü statik ipuçlarının kullanımı üçüncü
  taraf modeli çalışma zamanında açmayı gerektirmez.
- Mevcut commit edilmemiş `database/generate-coach-hints.mjs` üretimde
  kullanılmaz. Betik doğrudan `questions.content` güncelliyor, immutable revision
  zincirini ve insan onay kapısını atlıyor.
- DeepSeek anahtarı Codex girdisine, komutuna veya transkriptine yazılmaz. Önce
  anahtar Codex kapalıyken döndürülür; üretim yalnız ayrı ve dar izinli yürütücüde
  yapılır.

## 20 soruluk pilot

Pilot manifesti soru metni taşımadan yalnız `questionId`, yayımlanmış
`revisionId`, `contentSha256`, game, category, difficulty, examRef ve seçenek
sayısını içerir. Örneklem deterministik ve katmanlıdır:

1. Uygun havuzdaki her game ailesine en az bir yer ayrılır.
2. Kategori, zorluk 1-5, sınav türü ve 3/4/5 seçenekli yapıların kapsaması en
   yüksek olacak şekilde round-robin seçim yapılır.
3. Aynı soru/revision yeniden seçilemez; manifest hash'i üretim kaydına yazılır.
4. DeepSeek yalnız manifestteki immutable revision içeriğini görür ve yalnız
   staging JSONL üretir. Veritabanına yazma yetkisi verilmez.

Her pilot çıktısı iki bağımsız kontrolden geçer: konu doğruluğu için insan
küratör ve sözleşme/güvenlik için ikinci kontrol. İnceleyen kişiye model cevabı
gösterilir fakat modelin önerdiği doğru şık otorite kabul edilmez; yayımlanmış
revision anahtarıyla karşılaştırılır.

## Kabul kapısı

Kritik hata toleransı **0/20**:

- doğru cevap, şık harfi veya nihai sonucun ipucunda sızması;
- yanlış/fabrikasyon bilgi ya da hatalı mini örnek;
- yanlış şıkla ilgisiz kavram yanılgısı;
- soru/çözüm/cevap anahtarının değiştirilmesi;
- kaynak, kişisel veri, prompt veya anahtar sızıntısı.

Kritik olmayan her boyutta en az **18/20** gerekir: Türkçe anlatım, yaş düzeyi,
hint1'in çözümü başlatması, hint2'nin yöntemi ilerletmesi ve mini örneğin aynı
yöntemi farklı değerlerle göstermesi. Tek kritik hata veya herhangi bir boyutta
18'in altı, prompt/validator düzeltmesi ve **yeni bir 20'lik pilot** gerektirir.

`misconceptions` sözleşmesi seçenek sayısıyla birebir kalır: yanlış seçeneklerin
her biri dolu ve özgül açıklama taşır; doğru seçenek girdisi güvenli bir `null`
olarak temsil edilir. Uygulama validatorü pilot betiğinden önce bu sözleşmeyle
eşitlenir. Boş string veya doğru seçeneği yanlış diye açıklayan metin kabul edilmez.

## Kontrollü yayılım

Pilot geçerse partiler sırasıyla **50 → 100 → kalan havuz** olur.

- Otomatik şema, uzunluk, cevap sızıntısı ve revision-hash kontrolleri tüm
  kayıtlarda çalışır.
- Her kayıt tek bir konu küratörü tarafından onaylanır; her partinin en az
  %20'si ikinci kişi tarafından kör yeniden incelenir.
- Onaylı veri doğrudan tablo güncellemesiyle değil, 106 içerik yönetişimi
  revision akışıyla hazırlanır ve iki aşamalı yayınlanır.
- Bir partide kritik hata görülürse parti yayımlanmaz; önceki yayımlanmış
  revision'lar etkilenmez.
- Yayından sonra fallback oranı, ipucu aşaması tamamlama, transfer sorusu başarısı
  ve itiraz oranı izlenir. Hata artışında Koç bayrağı kapatılır ve problemli
  revision karantinaya alınır.

## Uygulama önkoşulları

- [ ] Salt-okunur keşifle uygun havuz sayısını yeniden doğrula.
- [ ] Mevcut betiği varsayılan staging-only, `--manifest` zorunlu ve soru metni
      loglamayan hale getir.
- [ ] Doğru seçenek için `null`, yanlış seçenekler için dolu metin sözleşmesini
      uygulama validatorü ve testlerinde eşitle.
- [ ] 20 soruluk manifesti ve hash'ini üret; iki incelemeciyi kaydet.
- [ ] Yalnız iki onaylı governed revision'ları yayımla; pilot raporunu sakla.

Bu maddeler tamamlanmadan 636 soruluk toplu üretim veya üretim veritabanına yazım
"tamamlandı" sayılmaz.
