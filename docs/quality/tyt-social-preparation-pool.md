# TYT Sosyal — sınırlı hazırlık havuzu

Hedef, 2027 TYT hazırlığı için incelenmiş 25 sorudan seçili cevaplama düzeninde
20 soru sunmaktır. Bu, bütün Sosyal bankasının kabulü, resmî 2027 sınav kılavuzu
sertifikası veya bütün müfredatı ölçen kalibre bir seviye testi değildir.
Kullanıcı 9 Ekim'de sınırlı havuz ve AI hazırlığı + tek yetkili kabulü modeliyle
ilerlemeyi onayladı. İş akışı izni, eksik soru kanıtını veya kayıtlarını üretmez.

## Bu migration neyi tamamlar?

- Mevcut sınav politikası, değişmez soru revizyonları, kaynak karşılaştırması ve
  kalite kararları üzerinde çalışır. Yeni bir soru/kalite karar deposu oluşturmaz.
- `prepare_tyt_social_reviewed_pool` tam 25 farklı soru/revizyon/hash/rolü,
  her rolde beş öğe olacak şekilde sabitler. Yalnız taslak **havuz** kaydıdır.
- `get_tyt_social_preparation_pool` her seferinde canlı yetkili kayıtları okur:
  aktif yayımlı revizyon, içerik/hash/metadata, TYT beş seçenek, kazanım, kabul
  edilmiş kaynak raporu, aynı yılın kanonik kabulü ve tam kimlikli kalite kararı.
- `accept_tyt_social_preparation_pool_roles` yalnız 25 sorunun bu koşulları
  sağladığı kilitli işlemde tek sorumlu kişinin rol kabulünü kaydeder. Bir stage-1
  incelemesi vardır, stage-2 yoktur. `independentHumanReview: false` açıkça döner.
- Eski iki-inceleyicili rol yolu aynı bağımsız hesap ve iki kayıt koşullarını
  korur. Yeni yol onu sessizce tek-inceleyicili olarak yorumlamaz.

Bu migration **öğrenciye açma işlemi değildir**. Kapsam, politika, soru, kaynak
kabulü veya kalite kararı oluşturmaz; sosyal keşif bayrağını açmaz. Mevcut resmî
TYT global yayın kapısı ve sosyoloji içeren eski dört-alan pilotu yerinde kalır.
`poolEvidenceReady` yalnız kanıt/rol koşullarını belirtir; `activationSupported`
ve `publicationAuthorized` bu aşamada daima `false` kalır.

## Sözleşme

Politika `validating` iken sabitlenir. Mevcut `exam_candidate_policy_versions`
kaydının `rules` nesnesinde şu açık sınırlar gerekir:

```json
{
  "purpose": "reviewed_preparation",
  "targetExamYear": 2027,
  "officialExamCertification": false,
  "wholeCurriculumMeasurement": false,
  "candidateQuestionCount": 20,
  "bookletQuestionCount": 25,
  "roleAcceptance": "ai_assisted_owner",
  "privacy": { "storeReason": false, "storeReligion": false, "storeDocument": false }
}
```

Politika kimliği `tyt-social-2027-vN` biçimindedir. Bu örnek seed değildir;
hazırlayan aktör, gerekçe, gerçek kaynak/yıl ve geçerlilik tarihleri ayrıca
incelenmelidir. 2026 belgesi kendiliğinden 2027 kabulü sayılmaz.

Havuz kaydı sıralamadan bağımsız manifest hash'i üretir. Kanıt parmak izi ayrıca
revizyonların mevcut kaynak/kazanım parmak izlerine ve politika kurallarına
bağlıdır. Kabulde ikisi de yeniden kontrol edilir. Bir revizyonun değişmesi yeni
havuz/politika gerektirir; eski kayıt güncellenmez. Karantina veya kalite kararı
değişikliği anlık uygunluğu düşürür, geçmiş kabul makbuzunu yeniden yazmaz.

Kabul beyanı mevcut `ai-preparation-declaration@1` alanlarını kullanır. Bu RPC'de
`revisionEvidenceFingerprint` toplu **havuz** kanıt parmak izidir; tek tek rol
kayıtlarında ilgili revizyonun parmak izi tutulur. Asıl toplu beyan request hash'i
ile bağlıdır; AI kanıt referansı akademik kabulün yerine geçmez.

## Güvenlik ve test sınırı

RPC'ler yalnız service-role sunucu kanalındadır; gerçek kullanıcı context'i varsa
JWT subject + AAL2 doğrulanır. Mevcut service-role görev aktörü istisnası korunur.
Tek yetkili kabulünde prepare, stage-1 review ve publish izinlerinin üçü gerekir.
Doğrudan tablo erişimi kapalı, kayıt değişmez ve her istek idempotenttir. Hiçbir
rapor veya AI modeline yeni kullanıcı/rol yetkisi verilmez.

Native testler gerçek yeni migration'ı iki kez uygular; mevcut rol tabloları,
aktör bağlama, içerik şeması, beyan ve ertelenmiş rol trigger'ını kullanır.
Kaynak/katalog ve RBAC bağımlılıkları kontrollü fikstürdür. Bunlar gerçek 25 sorunun
kabulü, tam migration zinciri, canlı PostgreSQL sürümü veya öğrenci testi değildir.
İlk koşudaki fikstürün `search_path` hatası kaynak tablosunu açık `public` şemasıyla
belirterek düzeltildi; uygulama güvenlik ayarı gevşetilmedi.

## Öğrenciye açılmadan önce

1. 25 soru için gerçek kaynak/kazanım-yıl ve exact-hash kalite kayıtlarını tamamla.
2. Yetkili rol kabulünü yeni açık modla kaydet; ham banka geçiş yapma.
3. Seçici, snapshot ve sonuç ekranını aynı manifestle bağla. Eski snapshot'ları
   koru, sınav yılı/politika değişimini açık yönet; karantina anında yeni dağıtımı durdur.
4. Standart/alternatif 20-soru akışı ve olumsuz durumları doğrula. Kalibrasyon yokken
   yalnız sınırlı hazırlık sonucu göster; genel başarı seviyesi iddiası üretme.
5. Ancak bu kontrollerden sonra ayrı, denetlenebilir etkinleştirme işlemi yap.

Mevcut snapshot yetenek makbuzları fonksiyon hash'lerine bağlıdır. Rol doğrulayıcı
değiştiği için eski yetenek hash'lerinin otomatik geçerli kaldığı varsayılamaz;
ilerideki dağıtım entegrasyonu bunları gerçek yeni tanımlarla yeniden doğrulamalıdır.
