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
- Boş PostgreSQL üzerinde platform + baseline + **248 migration** zinciri geçti. İlk provada 224 sonrasında 439 public fonksiyonun üretim parmak izi karşılaştırması geçti; yalnız kayıtlı 3 bilinen sapma var. Canlı uygulama sonrasında manifest ve parmak izi 225 seviyesine güncellendi.
- Migration lint: 248 dosyada yeni ihlal yok.
- Tam uygulama testleri: **544 dosya / 5614 test başarılı**. Varsayılan koşuda mevcut 14 dosya / 60 test atlandı; bu işin 31 gerçek PostgreSQL testi ayrıca çalıştırıldı. Son build ve CI sonuçları PR doğrulama kaydında belirtilir.

İlk çalıştırmada rollback testinin yardımcı SQL gövdesindeki dollar-quote üretim hatası düzeltildi. İlk tip kontrolünde snapshot içeriğinin JSON sınır tipi eksikti; çalışma anındaki doğrulama korunarak tip düzeltildi. Testler zayıflatılmadı.

## Üretime uygulama sırası

18 Ekim 2026 canlı DB uygulaması tamamlandı: `225_coach_reveal_session_replay`, defter sürümü `20261018114004`. Kullanıcının kalan yayını tamamlama talebi ve `[codex] CLAIM #103506` kapsamında yalnız 225 uygulandı. Dört fonksiyonun önceki tanımları yedeklendi ve uygulama öncesinde gövde hash'leri yeniden denetlendi. Kilit bekleme sınırı 5 saniye, işlem süresi sınırı 30 saniye olarak uygulandı.

Migration dosyası SHA256: `EB228721BF59B8917D328BAAAA74A79AF2EECFA1C694517CA451BA65357BBB0D`.

Üretim PostgreSQL 17.6 üzerinde **12 davranış kontrolü geçti**: transferin kaynak deneme dışında kaydı, sonraki denemede sıfır XP, eski transfer tekrarında kaydın oluşması, yanlış kullanıcı/rastgele soru/cevaplanmamış transfer reddi, anon ve authenticated yetkileri, kayıt hatasında cevabın geri alınması, tekrar yanıtının değişmezliği, günlük tavanla tekrar kesintisinin birlikte korunması ve eski NULL kesinti bilgisinde ödenen XP'nin korunması. Kontroller tek transaction içinde çalıştırılıp ROLLBACK yapıldı. Ardından yedi ilişkili tabloda test kullanıcısı/satırı kalmadığı salt okumayla doğrulandı.

Canlı test betiğinin ilk denemelerinde CASE parantezi, değişmez Koç kimliği ve üretimin snapshot puanlama kuralına uymayan test fikstürü düzeltildi. Ürün kuralları gevşetilmedi; başarısız denemeler geri alındı. Son test gerçek soru sürümündeki doğru seçenek, taban puan ve yüzde 70 taban XP ayrımını kullandı.

Canlı defter **174 satır**, public fonksiyon parmak izi **439 fonksiyon** içeriyor; önceki görüntüye göre yalnız bu migration'ın dört fonksiyonu değişti. Anon/authenticated yürütme yetkileri kapalı, özel iç tamamlama fonksiyonu service_role'e de kapalı kaldı. Güncel DB tipleri [39124204259](https://github.com/turer73/bilge-arena/actions/runs/39124204259) çalışmasının üretim şeması çıktısından alındı. Bu ilk çalışma eski tip dosyasıyla farkı saptadığı için beklenen şekilde başarısızdı; artifact yeni iki sütunun yanında önceki XP/reveal migration'larından kalan tip farklarını da içeriyor.

Uygulama yayını ve son CI durumu PR kapanış kaydında tutulur. Tekrar uygulama gerektiğinde sıra:

1. Güncel kodun CI kontrolleri başarılı olmalı. Kullanıcı onayıyla uygulayıcı canlıdaki fonksiyon tanımlarını/yapılandırmayı yedekler ve dosya SHA256'sını doğrular.
2. **Yalnız 225** uygulanır. Önkoşul canlı defterin 224'e kadar olmasıdır; manifestteki diğer üç `pending` migration bu düzeltmenin önkoşulu değildir ve bu yayında uygulanmaz. Önce rollback ile prova, sonra gerçek uygulama ve ledger kaydı yapılır. Dosya şema önbelleğini yenilemek için `NOTIFY pgrst` içerir.
3. Kod dağıtılır; transfer → başka denemede aynı soru ve ilk tamamlamayla tekrar yanıtı karşılaştırılır. Günlük tavanla tekrar kesintisinin birlikte olduğu durum da kontrol edilir.
4. Canlı defter ve fonksiyon parmak izi okunup manifestte 225 `ledger` yapılır. Üretilen DB tipleri canlı şemanın taze çıktısından eşitlenir; elle alan eklenmez. Bu eşitleme 18 Ekim uygulamasında tamamlandı.

Geri alma: önceki `099` ve `20261017110000` tanımlarındaki dört işlevi geri yükle; gerekirse uygulama sürümünü geri al. Yeni sütunları ve açılış kayıtlarını silme. Geri alma transfer XP korumasını yeniden kaldırır; güvenlik bakımından ileri düzeltme tercih edilir.
