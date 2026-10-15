# Resmî TYT Sosyal — incelenmiş alt havuz ön kontrolü

Bu adım bir **yayın adayı incelemesidir**, yeni kalite/otorite sistemi değildir.
Migration 222 mevcut kaynak, kazanım, kalite ve sınav rolü kayıtlarını okur.
Hiçbir soru, onay, kapsam, kullanıcı seçimi veya öğrenme kaydı yazmaz.
Migration 221'in resmî kategori sınırına dayanır; ayrı dört alanlı pilota dokunmaz.

## Sözleşme

`POST /api/admin/content-quality/tyt-social/reviewed-pool`

Mevcut içerik yönetişimi bayrağı, kullanıcı oturumu, AAL2, içerik yetkisi ve
istek sınırı geçerlidir. RPC de aktörü JWT'ye bağlar ve yetkiyi tekrar kontrol
eder. İstek gövdesi yalnız politika sürümü ve 1–100 kimlik/hash/rol içerir.
İstemci `approved`, `sourcePolicyReady` veya aktör kimliği gönderemez.

```json
{
  "policyVersion": "tyt-social-2026-v1",
  "items": [{
    "questionId": "00000000-0000-4000-8000-000000000001",
    "revisionId": "00000000-0000-4000-8000-000000000101",
    "contentSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "examRole": "common_history"
  }]
}
```

Örnekteki kimlikler sentetiktir, canlı aday veya onay değildir. Hash'ler
PostgreSQL'in kanonik JSONB içerik hash'idir; dosya SHA-256'sı yerine konmaz.
İki revizyonu aynı sorudan saymak veya aynı revizyonu iki role yazmak reddedilir.

## Okunan mevcut otoriteler

- Güncel etkin soru/yayımlı revizyon ilişkisi, içerik/hash, ders/sınav/kategori,
  zorluk ve beş benzersiz seçenek bütünlüğü.
- `tyt_social_revision_source_policy_ready`: 217'nin kaynak karşılaştırmalı
  tek inceleme yolu veya geçerli eski onay yolu. Bu koşul yayımlı revizyon
  bekler; taslağın bu adımda uygun olmaması tek başına kaynak hatası demek değildir.
- `question_revision_outcomes_valid`: geçerli sınav/kazanım kapsamı.
- Mevcut `question_validation_runtime` açık yayın kapısı ve gereken sürümde,
  aynı soru/revizyon/hash için `APPROVED` yetkili kalite kararı.
- Mevcut atanmış rol ve `assert_tyt_social_exam_role_approval`: rolün gerçek
  inceleme kökeni. Kaynak incelemesi ile sınav rolü incelemesi karıştırılmaz;
  bu değişiklik rol onayı sayısını değiştirmez.

Her rol için en az beş **uygun, farklı** soru gerekir: tarih, coğrafya, ortak
felsefe, Din Kültürü, ilave felsefe. Böylece iki cevaplama düzeni için asgari
25 soru bulunur. Bu yalnız kapasitedir; psikometrik kalibrasyon, zorluk dengesi,
yeniden gösterim limiti veya keşif geçerliği değildir.

## Çıktının sınırı

`items[].issues` eksikleri belirtir; `roleCounts` yalnız uygun soruları sayar,
`roleDeficits` beşli kotaların açığını verir. `poolEvidenceReady` bütün seçili
öğeler uygun ve beş kota tam ise doğrudur. Ancak **her koşulda**:

```json
{
  "candidateEvidenceOnly": true,
  "publicationAuthorized": false,
  "activationSupported": false,
  "globalGateUnchanged": true,
  "databaseWrites": 0
}
```

`manifestSha256` sıralamadan bağımsız istek parmak izidir; kabul makbuzu veya
zamanla geçerli kalacak imza değildir. Sonuç kaydedilmez. Yeni revizyon,
karantina, iptal, kaynak/kazanım değişikliği veya politika süresinin bitmesi
sonrasında yeniden hesaplanmalıdır. Kaynak/cevap metinleri ve inceleyici
kimlikleri yanıtla dışarı verilmez. API yanıtları önbelleğe alınmaz.

## Sonraki entegrasyon — henüz uygulanmadı

1. Eksik Din Kültürü adaylarını ve iki ayrı felsefe grubunu mevcut taslak/
   kaynak karşılaştırma akışında hazırlayıp gerçek kabulleri tamamlamak.
2. Eski global kapıyı kaldırmadan, incelenmiş revizyon manifestine bağlı yeni
   sürümlü kapsamı tasarlamak. Seçici, snapshot, sonuç okuyucu ve tüm raporlama
   tüketicileri aynı manifesti kullanmalı; tek bir okuyucunun tüm bankaya geri
   dönmesi kabul edilemez.
3. Kapsam kabulünde ve soru dağıtımında kaynak/kalite/rol/pointer/hash kontrollerini
   transaction içinde yeniden çalıştırmak. Ön kontrol çıktısıyla doğrudan
   `release_tyt_social_mastery_scope` çağrılamaz; mevcut global kapı değişmemiştir.
4. Resmî bölüm akışını keşif ürünü ve imzalı öğrenci oturumuyla doğrulamak.
   Bayrağı açmak veya 25 soru saymak bu işi tamamlamaz. 2026 kanıtı 2027 kapsam
   onayı olarak kullanılamaz.

## Test sınırı

Gerçek 222, tek kullanımlık loopback PostgreSQL üzerinde çalışır; gerçek
166 aktör, 205 politika/rol, 216 içerik ve 217 kaynak yordamları kullanılır.
Yetki, kazanım ve tek inceleme yordamlarının alt bağımlılıkları kontrollü
fikstürdür. Bu testler onların bütün akademik/kurumsal mantığını veya tam
migration zincirini doğruladığı iddiasında değildir. `READ ONLY` transaction
testi, yeni ön kontrolün hiçbir veritabanı yazısı yapmadığını ayrıca sınar.
