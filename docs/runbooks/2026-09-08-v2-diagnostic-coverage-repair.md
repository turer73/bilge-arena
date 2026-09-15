# V2-02 — YDT tanılamasında eski altı-alan sınırı

## Kapsam

8 Eylül 2026. Başlangıç yerel HEAD: `aa22dba89bcd96d6e5a9bd934159657a44b7aac3`,
dal `fix/v2-social-policy-epoch`. Bu çalışma yalnız salt-okunur canlı inceleme,
yerel ileri düzeltme ve izole regresyon doğrulamasıdır. Push, PR, deploy,
production DML/DDL, ledger, secret veya bayrak değişikliği yapılmadı.
Migration 212 ve uygulanmış 098/140/193 değiştirilmez. V2 bütünü tamamlanmış değildir.

## Canlı bulgu

- Vercel `/api/study/diagnostic`: `[AdaptiveDiagnostic] answer failed: 23514`,
  2 Eylül 2026 19:12:18–19:12:34 UTC, 6 hata / 1 kullanıcı. İlgili deployment
  `dpl_8csAHLYtBsdQBzLcEfKv2sdPhJug`, commit `497bff352f0bd5fb6b5c746183ba2d09af08682d`.
- Supabase `lvnmzdowhfzmpkueurih` üzerindeki READ ONLY sorguda ilgili dar zaman
  aralığında tek oturum: wordquest/YDT, `ba-ydt-eng-diagnostic-v1`,
  `answered_count=6`, `covered_outcomes=6`, `question_count=10`, `outcome_count=7`,
  `max_per_outcome=2`. Kullanıcı kimliği ve cevap içeriği dışarı aktarılmadı.
- Eski, doğrulanmış `adaptive_diagnostic_sessions_check` canlıda hâlâ
  `covered_outcomes >= 0 AND covered_outcomes <= 6 AND covered_outcomes <= answered_count`
  koşulunu uyguluyor. Yeni dinamik counter/state/scope CHECK'leri de mevcut.
- Kaynak 098, iki sütuna bakan adsız CHECK oluşturuyor. 193, gerçek
  `adaptive_diagnostic_sessions_check` yerine varsayılan
  `adaptive_diagnostic_sessions_covered_outcomes_check` adını kaldırmayı deniyor.
  Bu nedenle yedinci farklı alan cevabı session UPDATE sırasında reddediliyor.

23514 PostgreSQL CHECK ihlalidir. Tarihsel uygulama logu yalnız SQLSTATE içerir;
orada tam constraint adı görülmedi. Canlı şema engeli doğrudan ölçüldü; eski
olayın aynı kökten geldiği zaman/oturum bulgularıyla güçlü biçimde desteklenir.
İzole testin tam hata kaydı, tarihsel production hata kaydı yerine sunulmaz.

## Düzeltme sözleşmesi

`213_adaptive_diagnostic_legacy_coverage_constraint.sql` tek kalıcı işlem yapar:
tam adı ve tam ifadesi ölçülen eski CHECK'i kaldırır. Önce:

1. Yalnız hedef tabloya 5 saniyelik lock timeout ile DDL kilidi alır.
2. Dinamik counter, state, scope ve süre CHECK'lerinin exact/validated/local
   olduğunu; counter sütunlarının smallint/NOT NULL kaldığını doğrular.
3. RLS, tablo topolojisi ve release/snapshot/immutable trigger'larının fonksiyon,
   event maskesi, UPDATE sütunu, argüman, WHEN ve etkinlik metadata'sını doğrular.
4. Diğer tüm constraint/trigger'ları, owner/ACL/RLS/policy ve sütun kataloğunu
   önce–sonra karşılaştırır. Driftte transaction başarısız olur.

Eski hedef zaten yoksa ancak diğer kapılar tam sağlamsa güvenli tekrar mümkündür.
Tanınan counter/state CHECK'leri dışında `covered_outcomes` sütununa bağlı
başka CHECK varsa adı veya SQL yazım biçimi ne olursa olsun işlem durur.
Soru/cevap/oturum verisi, yayımlanmış revizyon, plan, blueprint, yetki veya bayrak
değişmez. Eski session'ın süresi uzatılmaz ve cevap sayıları elle ilerletilmez.
Yedi alanlı kayıtlar oluştuktan sonra eski CHECK'i körlemesine geri eklemek doğru
rollback değildir; giriş durdurulup veri korunarak incelenmelidir.

[PostgreSQL constraint kaldırma kuralı](https://www.postgresql.org/docs/17/ddl-alter.html#DDL-ALTER-REMOVING-CONSTRAINT)
ve [Supabase güvenli şema değişikliği rehberi](https://supabase.com/docs/guides/database/postgres/data-deletion)
uygulandı: ölçülen ad, kısa transaction, kilit timeout'u, bağımlılıkları koruma.

## Doğrulama kaydı

Yerel düzeltme doğrulandı; bu kayıt canlı düzeltme kanıtı değildir.

- İlk gerçek PG16 koşusu: 19 geçti / 3 başarısız. Eski migration 140'ı yeniden
  uygulayan tarihsel test, v3 snapshot fonksiyonunu eski Matematik sürümüne
  döndürdüğü için yeni YDT testi başlatmada durdu. Diğer iki hata aynı
  ilerleyemeyen kurulumun sonucuydu. 213'e ulaşılmadı; cluster durduruldu.
- İlk kanıt: `secure/entry-preview/diagnostic-coverage-pg16-1788865016811-53083dbbeb/`.
- Eski tekrar testi gerçek 140 aşamasına taşındı. Revizyona bağlı session'ın
  önce–sonra aynı kaldığı ve sonraki testlerde gerçek 193 fonksiyonunun
  korunmuş olduğu ayrıca sınanıyor; hiçbir migration gövdesi gevşetilmedi.
- İkinci fresh PostgreSQL 16.15 / exact Node 22.23.2 koşusu: **22/22 geçti,
  sıfır skip**. YDT yedinci cevabı önce exact `adaptive_diagnostic_sessions_check`
  / 23514 ile başarısız; session ve answer kayıtları tamamen geri alınıyor.
  213 sonrası aynı request 7/7, sonra 10/7 completed ve yedi outcome state
  üretiyor. Tekrar istek ek kanıt oluşturmuyor. Matematik 10/6 ve Fen 5/3
  tamamlanıyor. Dört şema-drift negatif kontrolü ve dinamik sınırlar geçiyor.
- Terra/Luna incelemesi sonrası üçüncü koşu: 26 testte 23 geçti / 3 başarısız.
  Yeniden oluşturulan başka adlı CHECK'in eşdeğer fakat farklı parantezli ifadesi
  text guard'ını aştı; test kümesinde migration commit oldu ve sonraki iki test
  eksik legacy adı nedeniyle durdu. Bu production'a uygulanmadı. Guard sütun
  bağımlılığına çevrildi; hem gerçek RENAME hem yeniden oluşturma vakası eklendi.
  Kanıt: `secure/entry-preview/diagnostic-coverage-pg16-1788865700874-8a2788f7a9/`.
- **Son fresh PG16 koşusu: 27/27 geçti, sıfır skip.** Önceki 22 davranışa ek
  RENAME, yeniden oluşturma, yanlış trigger event'i, RLS-off ve gerçek kilit
  çakışması sınanıyor. İkinci bağlantı kilidi tutarken 5 saniyede `55P03` oluştu;
  hedef kısıt korunarak transaction geri alındı. Yalnız bu testin bütçesi
  15 saniye; migration'ın 5 saniyelik timeout'u veya diğer testler gevşetilmedi.
- Bağımsız READ ONLY postcheck başarılı. On girdi hash'i koşu öncesi/sonrası
  aynı. Küme yalnız `127.0.0.1` dinledi, preload boştu, production kimlik
  bilgileri aktarılmadı ve kendi kümesi durduruldu. Ağsız production klonu değil.
- Son başarılı kanıt: `secure/entry-preview/diagnostic-coverage-pg16-1788865833879-ed6ce5d312/evidence.json`.
- Tanılama route/policy/hook/type testleri: **61/61**. Tüm SQL sözleşmeleri:
  **663 geçti / 0 hata / 238 opt-in atlandı**; atlananlar başarı sayılmadı.
  Son rapor `secure/entry-preview/diagnostic-coverage-sql-closeout-20260908.json`.
- Tam TypeScript, değişen testlerde sıfır-uyarı ESLint, 215 migration lint,
  grant/search_path lint ve diff kontrolü geçti. Uygulama kaynakları değişmedi;
  önceki build ve geniş uygulama testi yeniden koşulmuş gibi raporlanmaz.
- Bağımsız postcheck: `scripts/security/verify-adaptive-diagnostic-coverage.sql`.
  READ ONLY çalışır, yalnız katalog okur; veri veya ledger yazmaz. Bu bir coverage
  postcheck'idir; tüm release ACL/owner/policy baseline attestation'ı değildir.

## Çok-model inceleme sınırları

- Kullanıcı isteğiyle Terra SQL güvenlik sınırını, Luna test/kanıt kapsamını
  doğrudan yerel dosyalarda inceledi. Önerilen metadata/drift/lock kontrolleri
  eklendi. Luna'nın ilk CI-skip şüphesi mevcut zorunlu job incelenince geri alındı:
  `question-quality-postgres` exact disposable env ile bu testi çalıştırıyor;
  build bu job'a bağlı. Bu turda yeni remote CI koşulmadı.
- DeepSeek API erişimi anahtar değeri yazdırılmadan doğrulandı. Yalnız anonim
  genel SQL yöntemi gönderildi; özel depo dosyası, kullanıcı verisi veya sır yok.
  Bu yöntem değerlendirmesidir, doğrudan kod incelemesi veya test kanıtı değil.
- `deepseek-v4-flash` ilk çağrıda 3.000 çıktı token sınırına ulaşıp nihai rapor
  üretmedi; başarısız/inconclusive kaydedildi. Resmi düşünme-kapalı ayarıyla
  tek sınırlı tekrar nihai rapor verdi (331 input / 205 output). İki çağrının
  toplam API kullanımı 3.969 token; maliyet/tahsilat miktarı ayrıca doğrulanmadı.
- Terra ve DeepSeek: yerel düzeltme için olumlu, production için güncel PG17
  prova ve baseline doğrulaması gerekli. Model görüşleri insan yayın onayının,
  CI'ın veya gerçek kullanıcı smoke'unun yerine geçmez.

Kilitleme SHA-256 değerleri:

- Migration 213: `fc0d0c3951d365275cca277d7bb77de46e7280fa1848dcbc2895d49ecea0a2e2`
- Bağımsız postcheck: `dd6d51f0e26d76167d41d6031170455815e013f699b4d4c3ec54695faba96e04`
- Başarılı PG16 evidence.json: `ab2e744e4f7317ad11aae8b589a73d247670d3548576ca50218a145b03188539`

Ham migration dosyası tek başına production uygulama paketi değildir; bu turda
production ledger yazarı veya release-host paketi hazırlanmadı.

## Yayın öncesi açık kapılar

- Exact yerel aday için ayrı push/PR ve zorunlu Node 22 / PostgreSQL CI kanıtı.
- Güncel production baseline'ına bağlı PG17 prova ve 212/213 ledger sırası.
  Bu odaklı sentetik PG16 testi production klonu veya exact-chain kanıtı değildir.
- Production preflight owner/ACL/RLS/policy/column-ACL parmak izinin bağımsız
  postcheck aşamasında tekrar eşleştirilmesi; OID'leri farklı kümeler arasında
  körlemesine kıyaslamak yerine role/object adlarıyla kanonikleştirme gerekir.
- Ayrı production migration yetkisi, kilitli SQL/hash, transaction+ledger,
  bağımsız postcheck; bayraklar korunmalı. Hata/drift/kısmi ledger'da durulmalı.
- Yetkili kullanıcıyla yeni YDT tanılamasının 10/7 tamamlanması, tekrar yükleme,
  idempotent replay ve Matematik/Fen canlı smoke. Eski, süresi dolmuş oturum
  zorla yeniden açılmamalı.

Ek route aday-kataloğu/published-revision uyumsuzluğu olasılığı ayrı incelenecek;
bu küçük CHECK düzeltmesi bütün olası 23514 nedenlerinin kapandığını iddia etmez.
