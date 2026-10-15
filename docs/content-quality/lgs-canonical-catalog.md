# LGS kanonik katalog ve doğrulanmış kanıt okuması

Migration 219 katalog kimliğini, 220 kapsam kontrollü öğrenci okumasını kurar;
ikisi de katalog içe aktarmaz veya LGS yayınını açmaz. Bu belge kaynak/kazanım kabulü, sınav yılı uygunluğu,
kalite kararı veya yayın onayı değildir.

## Sözleşme

Mevcut kategoriye bağlı `curriculum_outcomes.id` kayıtları ve bunları kullanan
soru revizyonları/öğrenci geçmişi korunur. Yeni kimlik tablosu bu kayıtların hangi
resmî kazanımı temsil ettiğini açık bağlantılarla gösterir. Örneğin Türkçedeki
iki `T.8.3.25` kategori kaydı, katalog okumasında tek kazanımdır.

Kanonik kimlik: `program_key + program_edition + grade + exam_ref + official_code`.
Örnek: `meb-turkce@2019:grade8:LGS:T.8.3.25`.

`program_edition` programın açıkça belirlenen resmî sürümüdür; PDF indirme tarihi,
dosya hash'i veya sınav yılı değildir. Farklı PDF baytları kimliği değiştirmez.
PDF/hash/sayfa/çıkarıcı bilgileri ve eski inceleme kimliği `source_receipt` içinde
ayrı tutulur. Kaydın var olması kaynak doğruluğunun kabul edildiği anlamına gelmez.
Mevcut kaydın farklı başlık veya makbuzla sessizce UPSERT edilmesi desteklenmez;
böyle bir uyuşmazlık yeni, yetkili bir bakım/kanıt kararı gerektirir.

`database/canonical-curriculum.mjs` saf bir aday paket dönüştürücüsüdür:

- Hash'li v2 inceleme kimliklerini ve kaynak makbuzlarını korur; eski dosyalara yazmaz.
- Program/sürüm eşlemesini çağıran açıkça verir; kod adından yıl tahmin etmez.
- Kanonik program yolunu kullanır; dört seviyeyi tamamlamak için oluşturulan
  iç depolama başlıklarını kullanıcıya sunulacak katalog yoluna kopyalamaz.
- `bindCanonicalCatalogPlan` ancak tam ve kapsamı eşleşen eski kayıtlarla UUID
  bağlantısı üretir. Benzer başlıktan veya cevap metninden eşleme çıkarmaz.
- Dosya, ağ, SQL veya onay/yayın işlemi yapmaz. Çıktıda `importAuthorized`,
  `curriculumAcceptance`, `learnerReady`, `publicationAuthorized` daima `false`.
- Paket hash'i tek başına köken doğrulamaz. Çağıran paketin dosya hash'lerini
  yeniden kontrol etmelidir; özel paket kabul testi bunu ayrıca yapar.

## Migration 219

`curriculum_canonical_outcomes` ve `curriculum_outcome_canonical_links` mevcut
kataloğu tamamlar. Yeni bir kalite/onay sistemi oluşturulmaz. Migration katalog
satırı, soru içeriği, kazanım eşlemesi, insan onayı veya yayın kaydı içermez.

- İki tabloda RLS açık; `PUBLIC`, `anon`, `authenticated` erişimi yoktur.
- `service_role` yalnız SELECT yapabilir; INSERT/UPDATE/DELETE/TRUNCATE verilmez.
- Kayıtlar yeniden bağlanamaz veya sessizce değiştirilemez. Hazırlık katmanında
  genel amaçlı import/update RPC'si bulunmaz.
- `read_canonical_curriculum_catalog(game, exam, taxonomy)` SECURITY INVOKER'dır;
  sabit `pg_catalog` arama yoluyla, yalnız `service_role` tarafından çağrılır.
- Mevcut `curriculum_outcome_scope_valid` gövdesi değiştirilmez. Bu salt-okuma
  boolean fonksiyonunu çağırabilmek için yalnız `service_role` EXECUTE alır;
  anonim/kullanıcı izinleri genişletilmez.
- Okuyucu her seferinde aktif eski kayıtların tamamını ve mevcut dört seviyeli,
  tam kategori eşleşmeli kapsam korumasını yeniden kontrol eder. Eksik bağlantı
  veya sonradan değişen kapsam varsa hiçbir kısmi katalog döndürmez.
- Yanıt `catalogStatus: empty | incomplete | complete`, eski/kanonik sayılar,
  sorunlu kimlikler ve kanonik öğeleri içerir. `complete` yalnız yapısal bütünlük
  demektir; `learnerReady` ve `publicationAuthorized` bu durumda da `false` kalır.

RLS/rol yaklaşımı [Supabase RLS belgeleri](https://supabase.com/docs/guides/database/postgres/row-level-security)
ve mevcut proje sınırlarıyla uyumludur. Yeni migration önce Supabase CLI ile boş
olarak oluşturulmuş, sonra deponun sıralı migration adlandırmasına taşınmıştır.
Birleştirmeden önce 219/220 sıra numaraları hedef dalda tekrar kontrol edilmelidir.

## Migration 220 ve uygulama yolu

- Mevcut yayın siciline `canonical_reviewed` eşleme modu eklenir. Bu mod yalnız
  LGS, aynı soru kapsamı ve **tanılama kapalı** iken geçerlidir. Sicile satır eklenmez.
- `read_canonical_mastery_context` yalnız sunucu rolüne açık SECURITY INVOKER'dır.
  API kullanıcı kimliğini `auth.getUser()` sonucundan alır; istek kimliği kullanmaz.
- Kapsamın yayımlanmış olması, mevcut sekiz alanlı kapsam bütünlüğü ve bütün
  aktif eski kazanımların kanonik bağlantısı birlikte aranır. Eksiklik/çelişki
  halinde `null` döner; uygulama eski alias sayaçlarına geri dönmez.
- `mastery_outcome_evidence` için yalnız `service_role` SELECT ve SELECT RLS politikası
  eklenir. Anonim/kullanıcı erişimi veya yazma yetkisi verilmez.
- Aynı kanonik kazanım + `answer_id` bir kez sayılır. Alias ağırlıkları toplanmaz:
  en büyük mevcut eşleme ağırlığı alınır. Cevap, oturum, doğrulanmış deneme ve
  kullanıcı bağı tekrar kontrol edilir; aliaslar aynı olay hakkında çelişirse
  kısmi bir skor üretilmez. Bu birleştirme kuralıdır, psikometrik kalibrasyon değildir.
- Farklı günler, `verified_completed_at` üzerinden oluşmuş `evidence_day_tr`
  değerlerinin birleşimidir. İstemci zamanı ve `user_outcome_state` toplamları
  bu hesapta kullanılmaz. Geçmiş tablo kayıtları yeniden yazılmaz.
- Mastery API yeni `graphFormat: canonical@1` sözleşmesini kullanır. Değişken
  derinlikli resmî program yolları, ürün başlığı olan `collection` altında gösterilir;
  eski TYT/YDT dört seviyeli sözleşmesi aynen korunur.
- Günlük plan, sıralamadan **önce** aliasları tek kazanıma indirger; aynı sorunun
  iki alias üzerinden iki hedef tüketmesine izin vermez. Tercih edilen kategori
  yalnız mevcut aliaslar arasından seçilir.
- Kategori otomatik eşleyicisi kanonik kapsamda yeni `taxonomy_auto` kaydı üretmez.
  Soruya özgü incelenmiş eşlemeler yerinde kalır.

Uyarlamalı tanılama ve kurum raporları bu mod için yayımlanmaz. Bunların kendi
kanıt ve yayın kapıları vardır; uygulama eklenmiş diye açılmaz. LGS pratik haritası
ise kaynak/kazanım kabulü ve tam kapsam release kaydı tamamlanınca bu yolu kullanır.

## Çalıştırma ve doğrulama

Saf testler, canlı veriye gerek duymadan:

```powershell
node --test database/__tests__/canonical-curriculum.test.mjs
node database/lint-migrations.mjs
node database/lint-function-grants.mjs
```

Gerçek PostgreSQL testi, kurulu `initdb`/`pg_ctl` dizini açıkça verilince çalışır:

```powershell
$env:CANONICAL_PG_BIN = '<PostgreSQL bin dizininin mutlak yolu>'
node --test database/__tests__/canonical-curriculum-postgres.integration.test.mjs
```

Test kendi rastgele geçici dizinini ve loopback portunu oluşturur; dış veritabanı
URL'si kabul etmez. Bağlanınca `data_directory` eşitliğini doğrular, test sonunda
sunucuyu kapatır. Tanı dosyaları geçici dizinde korunur. Supabase yerine gerçek
PostgreSQL ve dar kapsamlı şema fikstürü kullanılır; tüm migration zincirinin veya
üretim Auth/PostgREST ortamının provası olduğu iddia edilmez.

İncelenen özel v2 paketini de aynı geçici veritabanında sınamak için
`CANONICAL_REVIEW_PACKAGE` ortam değişkenine paketin mutlak dizinini verin.
Bu ek test 18 dosya hash'ini ve `d84e0a1c…2769` paket hash'ini doğrular; 104 depolama
düğümü/52 kategori kaydını **sentetik UUID'lerle** kurar, 51 kanonik kazanımı gerçek
SQL okuyucusuyla kontrol eder. Canlı UUID eşlemesi veya canlı kabul değildir.

Standart `vitest.database.config.ts` saf testleri de kapsar. PostgreSQL testi
ortam değişkeni verilmezse açıkça atlanır; atlanmış test geçmiştir diye raporlanmaz.

## İçerik yayını için kalan kapılar

Bu teknik sürüm tek başına LGS seviye ekranını açmaz. İncelenen özel aday paket
bir kabul belgesi değildir; olduğu gibi üretime aktarılmaz:

1. Aday `lgs-2018-cohort-candidate@2` etiketi, yayın sicilindeki `ba-...-vN`
   sözleşmesini karşılamaz. Kabul edilmiş katalog için ders başına ayrı, sabit
   yayın sürümü belirlenmeli; eski inceleme makbuzu dönüştürülmeden korunmalıdır.
2. Mevcut kapsam bütünlüğü koruması bütün aktif sorular için tam eşleme ister.
   Yalnız 100 adayın bulunması, 233 aktif soruluk anlık bankanın kapsandığını göstermez.
3. Kaynak/kazanım kabulü, sınav kuşağı, 12 bekleme ve inceleme dışındaki 130 soru
   kendi gerçek kanıtlarıyla ele alınır. Fable'ın uygunluk denetimi bağımsız insan
   kabulü sayılmaz. 100 eşleme adayı otomatik kabul edilmez.
4. Yeni canlı pin okuması, yetkili kalite kararları ve yayın kayıtları gerekir.
   Önceki 242-pin makbuzu 2026-10-04T22:55:47Z anına aittir, bugünün canlı durumu
   diye kullanılamaz. Migrationın merge/deploy/import adımları da ayrı yürütülür.

Koşullar tamamlanmadan eski tüketicileri yeni depolama projeksiyonuna yönlendirmek,
tekilleştirilmiş istatistik veya yayına hazır LGS havuzu varmış gibi davranmak yoktur.

## Yayın / geri dönüş sınırı

Teknik yayın sırası: dar kapsamlı PR ve CI, schema/grant/function önceki durum
makbuzu, 219 sonra 220, fonksiyon/izin geri okuması, uygulama dağıtım SHA doğrulaması.
Her iki migration yeniden çalıştırma testinden geçer, veri import etmez.
Uygulama geri dönüşü önceki başarılı deployment'a yapılır; ek tablolar ve geçmiş
kanıtlar silinmez. Bir LGS scope daha sonra etkinleştirilirse eski tüketiciye
rollback öncesinde o scope `validating` durumuna alınmalıdır. Bu teknik yayında
etkinleştirilen LGS scope yoktur; yayımlı TYT/YDT sicili değiştirilmez.
