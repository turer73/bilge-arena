# Kurum canary ve Tenant A/B kanıt runbook'u — 2026-08-25

Bu runbook sentetik demo ile gerçek kurum kanıtını birbirine karıştırmaz.
Üretimdeki `/arena/kurum/demo` yalnız ürün akışını gösterir; gerçek oturum,
tenant izolasyonu, sözleşme veya operasyon hazırlığı kanıtı değildir.

## Başlatma ön koşulları

- Ücretli onboarding'in uygulama bayrağı ve bağımsız DB
  `commercial_provisioning` kontrolü kapalı kalır.
- Platform kontrollü ücretsiz canary yalnız gerektiği pencerede iki bağımsız kontrolle
  açılır: DB `institution_pilot_controls.free_provisioning=true` ve uygulama
  `INSTITUTION_FREE_PILOT_ENABLED=true`. Uygulama bayrağı yalnız UI/API yüzeyini,
  DB kontrolü doğrudan authenticated RPC'yi ve privileged/manual INSERT'i de
  kapatır; ücretli veya public onboarding açılmaz.
- Migration 167 sonrasında DB kontrolü tek başına açılamaz. DB sahibi; hukuk,
  kurum DPA'sı, retention kararı, vendor register, gerçek oturumlu Tenant A/B,
  DB parola rotasyonu, güncel backup/restore, AAL2 hesap hazırlığı ve sorumlu
  owner kanıtlarının **kişisel veri içermeyen referanslarını** kısa ömürlü bir
  readiness kaydına bağlar. Migration hiçbir readiness kaydı üretmez.
- KVKK olayının teknik kapanış kaydı ile nihai hukuk kararı tutarlıdır.
- Kurum aydınlatması, sözleşme/DPA, saklama-imha kararı ve sorumlu kişi imzalıdır.
- İki ayrı test tenant'ı ve her tenant için yönetici, öğretmen ve öğrenci hesabı
  tahsis edilir; personel hesapları TOTP/AAL2 kurulumunu tamamlar.
- Supabase, Vercel, Upstash, Sentry ve Resend hesap kanıtları vendor register'a
  eklenir.
- Güncel yedek restore tatbikatı geçer ve rollback sorumlusu hazırdır.

## Tenant A/B gerçek oturum matrisi

Her istek gerçek browser/Auth session cookie veya kullanıcı JWT'siyle yapılır.
Service-role ile kullanıcı taklidi kanıt sayılmaz.

Tek açık ücretsiz canary sınırı iki ücretsiz production tenant'ı kurmaya izin
vermez. A/B güvenlik kabulü, gerçek Auth oturumlarıyla ayrılmış QA tenant'larında
veya daha önce onaylanmış kalıcı bir test/sentinel tenant'ıyla yapılır. İkinci
tenant hazırlamak için production `commercial_provisioning` kontrolü açılmaz.

| Aktör | Hedef | Beklenen sonuç |
|---|---|---|
| Tenant A yöneticisi, A kaynağı | Kurum, personel, rol, sınıf, audit | Yetkisi kapsamındaysa 2xx |
| Tenant A yöneticisi, B UUID/ref'i | Aynı kaynakların tüm GET/RPC/API yolları | 403/404; response'ta B veri alanı yok |
| Tenant A öğretmeni, A öğrencisi | Atanmış sınıf/rapor/program | Yetkisi kapsamındaysa 2xx |
| Tenant A öğretmeni, B öğrencisi | UUID/ref değiştirerek BOLA denemesi | 403/404; isim/e-posta/ref sızıntısı yok |
| Tenant A öğrencisi, A sınıfı | Kendi üyelik ve yayınlanmış çalışma | Yalnız kendi/izinli veri |
| Tenant A öğrencisi, B sınıfı | Invite/ref/assignment/submission değiştirme | 403/404 |
| AAL1 personel | Kurum sayfası ve her kurum write API'si | Sayfa güvenlik kurulumuna gider; API 428 `aal2_required` |
| Askıya alınmış tenant personeli | Tüm kurum/sınıf RPC'leri | Fail-closed; yazma ve hassas okuma yok |
| İki kez aynı request UUID | Aynı payload / farklı payload | Aynı payload idempotent; farklı payload conflict; tek audit event |

Kanıt paketi request/response status, redakte edilmiş body şeması, tenant ve aktör
referansı, audit event ref'i ve zaman damgasını içerir. JWT, cookie, e-posta ve
gerçek öğrenci verisi rapora yazılmaz.

## Canary sınırı ve durdurma koşulları

İlk canary tek gerçek küçük dershaneyle, en fazla 40 öğrenci ve toplam 2
personelle yürütülür. Değerlendirme penceresi 14, 30 veya en fazla 60 gündür ve
kurum kaydındaki `review_due_at` alanıyla platform yöneticisine gösterilir.
Süre dolduğunda tenant yetki yardımcıları ve çalışma alanı DB'de fail-closed
olur; normal Bilge Arena hesabı çalışmaya devam eder.
`INSTITUTION_ONBOARDING_ENABLED` canary için de genel olarak açılmaz; tenant
yalnız AAL2'li platform-admin akışı ve
`POST /api/admin/institutions/free-pilots` ile oluşturulur. Yönetici önceden
doğrulanmış normal Bilge Arena hesabıdır; normal kayıt sırasında kurum yetkisi
otomatik verilmez.

## Platform kontrollü ücretsiz canary açılış sırası

1. Kurum sorumlusu, değerlendirme süresi, öğrenci/personel sınırı ve
   aydınlatma-DPA kanıtını pilot dosyasına ekle. KVKK/hukuk, retention, vendor,
   Tenant A/B, parola rotasyonu, backup/restore, hesap-AAL2 ve sorumlu owner
   kayıtlarının her biri için kişisel veri içermeyen benzersiz referans belirle.
2. Yöneticinin doğrulanmış normal hesabı ve TOTP/AAL2 kurulumu hazır olsun.
3. `INSTITUTION_PILOT_ENABLED=true` kalırken migration 158–160 ve 167'yi,
   ardından uygulama sürümünü ücretsiz-pilot bayrağı kapalıyken dağıt. Migration
   167 tekrar çalıştırılırsa açık kalmış `free_provisioning` kontrolünü auditli
   biçimde kapatır; mevcut tenant erişimini değiştirmez.
4. DB sahibi, aşağıdaki auditli transaction ile önce append-only readiness
   kaydını oluşturur, sonra `free_provisioning` kontrolünü bu kayda bağlayarak
   açar. Açılış en çok yedi gün geçerli olabilir; normal operasyon için saatlik
   dar pencere kullanılmalıdır. Tabloya ad, e-posta, JWT, cookie, sözleşme metni
   veya başka kişisel veri yazılmaz. Aşağıdaki `<...>` değerleri bilerek DB
   desenini geçmez; gerçek harici kanıt referanslarıyla değiştirilmeden işlem
   commit olamaz.

   ```sql
   BEGIN;

   INSERT INTO public.institution_free_pilot_readiness_attestations(
     readiness_ref,
     legal_approval_ref,
     institution_dpa_ref,
     retention_decision_ref,
     vendor_register_ref,
     tenant_ab_evidence_ref,
     credential_rotation_ref,
     backup_restore_ref,
     account_readiness_ref,
     accountable_owner_ref,
     valid_until
   ) VALUES (
     '<READINESS-REF>',
     '<LEGAL-APPROVAL-REF>',
     '<INSTITUTION-DPA-REF>',
     '<RETENTION-DECISION-REF>',
     '<VENDOR-REGISTER-REF>',
     '<TENANT-AB-EVIDENCE-REF>',
     '<DB-CREDENTIAL-ROTATION-REF>',
     '<BACKUP-RESTORE-REF>',
     '<ACCOUNT-AAL2-READINESS-REF>',
     '<ACCOUNTABLE-OWNER-REF>',
     clock_timestamp() + interval '2 hours'
   );

   SET LOCAL app.institution_control_change_ref = '<CHANGE-REF>';
   SET LOCAL app.institution_readiness_ref = '<READINESS-REF>';
   UPDATE public.institution_pilot_controls
   SET enabled = true
   WHERE control_key = 'free_provisioning' AND enabled = false;

   SELECT readiness_ref, valid_until, database_actor
   FROM public.institution_free_pilot_readiness_attestations
   WHERE readiness_ref = '<READINESS-REF>';
   SELECT control_key, enabled, updated_at
   FROM public.institution_pilot_controls
   WHERE control_key IN ('free_provisioning', 'commercial_provisioning')
   ORDER BY control_key;
   SELECT previous_enabled, enabled, change_reference, readiness_ref, changed_at
   FROM public.institution_pilot_control_events
   WHERE control_key = 'free_provisioning'
   ORDER BY changed_at DESC
   LIMIT 1;
   COMMIT;
   ```

   Postflight sonucunda fresh readiness ref'i, `free_provisioning=true` ve
   `commercial_provisioning=false` birlikte görülmeden uygulama bayrağı açılmaz.

5. Audit satırı ve DB kontrolü doğrulandıktan sonra
   `INSTITUTION_FREE_PILOT_ENABLED=true` uygulama bayrağını açıp yeni production
   deploy al.
6. Platform admin ekranından **tek** kurumu oluştur; immutable
   `institution_provisioned` event'inde `pilotKind=invitation_free`, onay
   referansı, kotalar ve değerlendirme tarihini doğrula. Aynı transaction'da
   `institution_free_pilot_readiness_consumptions` kaydının readiness ref'ini
   bu kurum ID'sine tek kullanımlı bağladığını kontrol et.
7. Başarılı provisioning doğrulanır doğrulanmaz farklı bir change referansıyla
   önce DB `free_provisioning=false` yap. Sonra
   `INSTITUTION_FREE_PILOT_ENABLED=false` ile yeniden deploy et. Provisioning
   kapısının kapanması mevcut tenant'ı kapatmaz; doğrudan PostgREST tekrarlarını,
   route rate-limit'ini atlayan yeni provisioning çağrılarını durdurur.
8. Bir öğretmen, iki kontrollü öğrenci ve süreli/tek kullanımlık davetlerle
   AAL2, tenant izolasyonu, kota ve audit smoke'unu tamamla.
9. Değerlendirme tarihinde DB erişiminin kapandığını doğrula ve tenant'ı auditli
   `suspended` durumuna geçir. Readiness kaydı yeniden kullanılamaz; yeni deneme
   ancak yeni kanıt paketi, yeni readiness/onay referansı ve yeni kontrollü
   açılışla yapılır. Veri silmeyi yalnız onaylı saklama-imha prosedürüyle yürüt.

Canary şu durumlardan birinde derhal durdurulur:

- tenantlar arası veri, ref, isim veya hata ayrıntısı görünmesi;
- AAL1 personelin kurum verisine erişmesi;
- audit event'in kritik işlemden sonra oluşmaması;
- rate-limit backend kesintisinde işlemin açık kalması;
- yedek/rollback sorumlusuna ulaşılamaması;
- KVKK talebi veya olayının süre içinde işlenememesi.

Rollback sırası: onboarding kapalı olduğunu doğrula, tenant'ı `suspended` yap,
aktif oturumları sonlandır, destek erişimini iptal et, değişiklik/audit paketini
dondur ve olay runbook'unu başlat. Veri, onaylı imha kararı olmadan manuel SQL
ile silinmez.

## 25 Ağustos 2026 kanıt durumu

| Kanıt | Durum | Neden |
|---|---|---|
| Sentetik demo | Tamam | Üretim route'u ve UI testi var |
| RPC/PG tenant izolasyon testleri | Tamam | Disposable PostgreSQL CI suite'i var |
| Gerçek Auth session Tenant A/B | **Bloke** | İki tenant ve AAL2'li altı test hesabı tahsis edilmedi |
| Gerçek kurum canary | **Bloke** | Kurum, sözleşme/DPA, hukuk onayı ve sorumlu kişi seçilmedi |

Ücretsiz canary provisioning kodunun/flag'inin hazır olması bu son satırı tek
başına tamamlamaz; gerçek kurum kanıtı ancak yukarıdaki oturumlu akışla oluşur.

Bu iki bloke satır kod yazarak veya sentetik kayıt uydurarak “tamamlandı”
gösterilemez. Ön koşullar sağlandığında bu runbook doğrudan yürütülebilir.
