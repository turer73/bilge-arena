# Basit kurum pilotu

Basit pilot, kapsamlı hazırlık belgelerinin tamamlandığı anlamına gelmez.
Platform sahibinin açık açılış onayıyla, mevcut ücretsiz pilot sınırları içinde
bir dersane denenebilir. Kapsamlı hazırlık tabloları ve kontrolleri korunur.

## Yönetici akışı

1. Platform yöneticisi `/admin/kurumlar` ekranını açar.
2. Kurum adını, dersanenin doğrulanmış hesabını ve paketi seçer.
3. Paket koşullarını kabul eder. Belge e-postası başarıyla gönderilmeden kurum oluşturulmaz.
4. Mevcut 30/60 günlük paket, öğrenci/personel kapasitesi ve tek açık ücretsiz pilot sınırları geçerlidir.

Platform yöneticisi ile kurum yöneticisi farklı hesaplardır. Kurum yöneticisi
başka bir kurumun aktif üyesi olamaz. Normal kayıt kimseye kurum yetkisi vermez.
Temel yetkilendirme, AAL2, tenant ayrımı, hız sınırı, tekrar-istek koruması ve
denetim kayıtları bu değişiklikle kaldırılmaz.

## İşletim

Geçiş dosyası tek başına pilotu açmaz. Açılış mevcut DB sahibi yetkisiyle,
aynı transaction içinde `app.institution_control_change_ref` ile gerçek onay
referansı ve `app.institution_onboarding_mode=basic` ayarlanarak yalnız
`free_provisioning` kontrolünün açılmasıdır. Mod kontrol olayına kaydedilir.
API çağrısındaki oturum ayarı kalıcı modu değiştiremez.

Uygulamada `INSTITUTION_FREE_PILOT_ENABLED=true` ayrıca etkinleştirilip yeniden
yayınlanmalıdır. Ücretli kabulün iki anahtarı kapalı kalır. Bu onay kurum veya
hazırlık belgesi oluşturmaz; kullanıcı kurum oluşturma formunu kendisi doldurur.

Kapatma: yeni bir değişiklik referansıyla `free_provisioning=false` yapın;
gerekirse uygulama anahtarını da kapatıp yeniden yayınlayın. Var olan kurumlara
ve başarılı eski isteklerin güvenli tekrarına dokunulmaz.

Kapsamlı moda dönüş: önce ücretsiz oluşturmayı kapatın; sonra geçerli, gerçek,
tüketilmemiş hazırlık kaydıyla `app.institution_onboarding_mode=comprehensive`
ve `app.institution_readiness_ref` kullanarak yeniden açın. Basit onay kapsamlı
kanıt yerine geçmez. Yeni mod, yalnızca sonraki kurum oluşturmalarına uygulanır.

## 9 Ekim 2026 uygulama kaydı

- Kullanıcı basit/kapsamlı ayrımını ve canlı pilot açılışını bu sohbet içinde onayladı.
- Canlı migration: `20261009200126_institution_basic_pilot_onboarding`.
- Açılış referansı: `OWNER-APPROVED-BASIC-PILOT-20261009`.
- `free_provisioning=true`, olay modu `basic`, `readiness_ref=NULL`.
- `commercial_provisioning=false`; mevcut iki aktif legacy kurum değiştirilmedi.
- Gerçek PostgreSQL: 45 test; yönetim sayfası/API: 36 test başarılı.
- Yeni kurum oluşturulmadı; gerçek e-posta teslimi ve kullanıcı oturumuyla form
  gönderimi bu kaydın kapsamında doğrulanmış değildir.
