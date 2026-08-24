# Kurum canary ve Tenant A/B kanıt runbook'u — 2026-08-25

Bu runbook sentetik demo ile gerçek kurum kanıtını birbirine karıştırmaz.
Üretimdeki `/arena/kurum/demo` yalnız ürün akışını gösterir; gerçek oturum,
tenant izolasyonu, sözleşme veya operasyon hazırlığı kanıtı değildir.

## Başlatma ön koşulları

- Ücretli onboarding kill-switch kapalı kalır.
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

İlk canary tek gerçek kurumla ve sözleşmede yazan kullanıcı sınırıyla yürütülür.
`INSTITUTION_ONBOARDING_ENABLED` canary için de genel olarak açılmaz; tenant
yalnız kontrollü platform-admin akışıyla oluşturulur.

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

Bu iki bloke satır kod yazarak veya sentetik kayıt uydurarak “tamamlandı”
gösterilemez. Ön koşullar sağlandığında bu runbook doğrudan yürütülebilir.
