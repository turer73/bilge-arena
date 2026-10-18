# Koç açılış kaydı ve oturum tekrar yanıtı

Kapsam: Codex F4 / discovery #2615 ve F5 / #2616; ayrıca açıklamanın soru sürümü ve eksik açılış RPC'si sınırları. Başlangıç: `d8ec5ffc`. Çalışma sahipliği: `[codex] CLAIM #103490`, ek kapsam #103492.

## Davranış

- Migration **225_coach_reveal_session_replay.sql**, transfer cevabı ile açılış kaydını aynı transaction içinde yazar. Kayıt başarısızsa transfer cevabı da geri alınır. Tekrar istekleri de kayıt oluşturur; böylece migration öncesinde cevaplanmış transferler yeniden açıldığında korunur.
- Deneme dışındaki bir soru ancak aynı kullanıcıya ve denemeye bağlı, 4. aşamaya ulaşmış ve cevaplanmış Koç transferi ise kaydedilebilir. Rastgele soru, cevaplanmamış transfer, başka kullanıcı ve tarayıcı rollerinin erişimi reddedilir.
- `game_sessions.xp_repeat_withheld` ve `repeat_questions`, ilk tamamlamada ödeme ile birlikte saklanır. Hem özel iç fonksiyonun tekrar yolları hem doğrulanmış deneme tekrarı aynı ödeme bilgisini döndürür. 7 günlük pencere sonradan değişse bile geçmiş sonuç değişmez.
- Eski oturumların kesinti nedenleri geriye dönük güvenilir biçimde hesaplanamaz. Bu iki alan eski satırlarda `NULL` kalır. API `xpBreakdownKnown=false` döndürür ve günlük tavan uyarısı uydurmaz; ödenen XP korunur.
- Koç çözümü ve normal notlama, açılış RPC'si `PGRST202` dahil herhangi bir hata verdiğinde cevabı açmaz.
- Açıklama paneli deneme kimliğini taşır. Sunucu kendi kullanıcısına ait denemenin değişmez soru sürümünü okur; sonradan değişen soru bankası metniyle karıştırmaz. Başka denemeye ait veya okunamayan bağlamda canlı soru bankasına dönmez. Eski/önizleme istemcilerinin denemesiz bağlamı korunur.

Yeni bir kullanıcı/anon yetkisi verilmez; açılış tablosu özel kalır ve RPC'ler yalnız service_role'e açıktır. SECURITY DEFINER işlevlerinin search_path ve EXECUTE yetkileri açıkça korunur. [Supabase işlev güvenliği](https://supabase.com/docs/guides/database/functions).

## Doğrulama

- Node **22.23.2**, yerel ve atılabilir PostgreSQL **16.15**; üretim DB'si kullanılmadı.
- Gerçek PG ekonomi takımı: **31 test**. Ödeme, tekrar, günlük tavan, başka kullanıcı, tarayıcı rolleri ve kayıt hatasında transaction geri alma dahil.
- Hedefli uygulama testleri: **171 test**; migration manifesti: **15 test**.
- İki kasıtlı bozulma kontrolü: transfer açılış çağrılarını kaldırmak 1 davranış testini; tekrar yanıtından kesinti alanlarını kaldırmak 2 davranış testini düşürdü. SQL dosyası geri yüklenip SHA256 eşitliği kontrol edildi.
- Boş PostgreSQL üzerinde platform + baseline + **248 migration** zinciri geçti. 224 sonrasında 439 public fonksiyonun üretim parmak izi karşılaştırması geçti; yalnız kayıtlı 3 bilinen sapma var. 225 de zincirin sonunda uygulandı.
- Migration lint: 248 dosyada yeni ihlal yok.
- Tam uygulama testleri: **544 dosya / 5614 test başarılı**. Varsayılan koşuda mevcut 14 dosya / 60 test atlandı; bu işin 31 gerçek PostgreSQL testi ayrıca çalıştırıldı. Son build ve CI sonuçları PR doğrulama kaydında belirtilir.

İlk çalıştırmada rollback testinin yardımcı SQL gövdesindeki dollar-quote üretim hatası düzeltildi. İlk tip kontrolünde snapshot içeriğinin JSON sınır tipi eksikti; çalışma anındaki doğrulama korunarak tip düzeltildi. Testler zayıflatılmadı.

## Üretime uygulama sırası

Bu çalışma kaynak ve test paketidir; canlı DB/VPS değişikliği içermez.

1. Güncel kodun CI kontrolleri başarılı olmalı. Kullanıcı onayıyla uygulayıcı canlıdaki fonksiyon tanımlarını/yapılandırmayı yedekler ve dosya SHA256'sını doğrular.
2. **Yalnız 225** uygulanır. Önkoşul canlı defterin 224'e kadar olmasıdır; manifestteki diğer üç `pending` migration bu düzeltmenin önkoşulu değildir ve bu yayında uygulanmaz. Önce rollback ile prova, sonra gerçek uygulama ve ledger kaydı yapılır. Dosya şema önbelleğini yenilemek için `NOTIFY pgrst` içerir.
3. Kod dağıtılır; transfer → başka denemede aynı soru ve ilk tamamlamayla tekrar yanıtı karşılaştırılır. Günlük tavanla tekrar kesintisinin birlikte olduğu durum da kontrol edilir.
4. Canlı defter ve fonksiyon parmak izi okunup manifestte 225 `ledger` yapılır. Üretilen DB tipleri canlı şemanın taze çıktısından eşitlenir; bu PR eski tip dosyasına elle alan eklemez.

Geri alma: önceki `099` ve `20261017110000` tanımlarındaki dört işlevi geri yükle; gerekirse uygulama sürümünü geri al. Yeni sütunları ve açılış kayıtlarını silme. Geri alma transfer XP korumasını yeniden kaldırır; güvenlik bakımından ileri düzeltme tercih edilir.
