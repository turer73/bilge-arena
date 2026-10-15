# AI hazırlığı + tek yetkili kaynak kabulü

8 Ekim 2026: kullanıcının yetkilendirdiği yeni yol, AI yardımıyla hazırlanan taslak
için aynı sorumlu kişinin kaynak kabulü verebilmesidir. Bu kayıt **bağımsız insan
incelemesi değildir**. İkinci hesap açmak, hazırlayıcı kimliğini değiştirmek veya
AI raporunu insan kararı gibi göstermek gerekmez ve bu değişiklik bunları yapmaz.

Bu doküman bir soru için kabul veya yayın yetkisi belgesi değildir. Kullanıcının
iş akışını değiştirme izni, taslağı gerçekten inceleyip kabul ettiği anlamına gelmez.

## İki açık kabul türü

| Tür | Aktör kuralı | Kayıt |
| --- | --- | --- |
| `separate_reviewer` | İnceleyen, içerik ve kazanım hazırlayıcısından farklı hesap | Mevcut `source-review-single@1` |
| `ai_assisted_owner` | Hazırlayıcı ve varsa kazanım eşleyicisi aynı sorumlu hesap | Yeni `source-review-ai-owner@1` |

İlk yol hesap ayrılığını denetler; iki farklı hesabın gerçekten iki bağımsız insan
olduğunu yazılım kanıtlamaz. Eski iki-aşamalı inceleme yolu değişmez. Yeni yolda
`content.prepare`, `content.review.stage1` ve `content.publish` izinlerinin **üçü
birlikte** gerekir. Migration hiçbir kullanıcıya veya role izin eklemez.

## Yönetim ekranındaki işlem

1. Mevcut taslağın soru, seçenek, çözüm, köken ve kazanım kanıtlarını incele.
2. O revizyona bağlı kaynak karşılaştırma JSON dosyasını yükle. Yeni LGS kabulü
   `source-comparison@2` ve kayıtlı gerçek katalog/sınav yılı bağlantısı gerektirir.
3. Yetki ve hazırlayıcı hesabı uygunsa “AI hazırlığı için tek yetkili kabulü”nü seç.
4. Gerçek AI/araç adını, hazırlık kaydının referansını ve dosya SHA-256 değerini gir.
   Kabulün bağımsız inceleme olmadığını ve sorumluluğu üstlendiğini açıkça işaretle.
5. Gerekçeyi yazıp kabulü kaydet. Bu yalnız stage-1 ve kaynak kabulü oluşturur.
6. Tam soru/revizyon/hash ve güncel politika için `APPROVED` kalite kararı ile diğer
   yayın kapıları hazırsa **ayrı** “Yayınla” işlemini yap.

Rapor, hazırlık alanları veya revizyon değişince sorumluluk kutusu sıfırlanır.
Kabulden sonra arayüz açıkça “bağımsız insan incelemesi değildir” yazar. Yetki
yoksa yeni seçenek gösterilmez; API/RPC de reddeder. Eski DB ile yeni arayüz bu
yeteneği varsaymaz; sıradan kabul yoluna sessiz dönüş yoktur.

## Sözleşme ve güvenlik

POST gövdesinde `acceptanceMode: "ai_assisted_owner"` ve aşağıdaki `preparation`
zorunludur. Aktör kimliği istek gövdesinden değil, doğrulanmış oturumdan gelir.

```text
version: ai-preparation-declaration@1
agent: gerçek hazırlayan AI/araç
evidenceRef: gerçek hazırlık kaydı referansı
evidenceSha256: 64 küçük harfli hex karakter
revisionEvidenceFingerprint: sunucunun mevcut revizyon için verdiği parmak izi
acknowledgesNonIndependentReview: true
acceptsResponsibility: true
```

Beyan AI üretimini bağımsız kanıtlamaz. Dosya referansı/hash'i sorumlu kişinin
beyanıdır; sunucu rastgele dosya yolu veya URL açmaz. Parmak izi içerik, metadata,
kaynak ve kazanım kayıtlarına bağlıdır; eski ekran görüntüsüyle değişmiş taslak
kabul edilemez. RPC bu bağı, gerçek hazırlayıcıyı, üç izni, kaynak raporunu, lisans/
köken kaydını ve kapsamı kilitli işlem içinde yeniden kontrol eder.

Kaynak kabulü, gerçek actor/timestamp ile tek stage-1 kaydı ve değişmez rapor kaydı
üretir. Ayrı request namespace ve payload hash'i tam tekrarı güvenli kılar;
değişmiş payload aynı requestId ile kabul edilmez. Hazırlayıcı kimlikleri, kaynak
paketleri ve önceki onaylar yeniden yazılmaz. Yeni RPC yalnız `service_role` için;
yardımcı fonksiyonlar ve kaynak kabul tablosu istemcilere açılmaz. Mevcut yönetim
oturumu, hız ve gövde boyutu kontrolleri korunur.

`evidence_complete`, AI beyanı veya kaynak kabulü tek başına yayın değildir. Güncel
kalite politikası, tam hash, aktif kazanım ve kaynak/yıl bağlantısı gerekir.
Benchmark/model terfi kanıtı bu migration ile oluşturulmaz. 2026 kapsamı 2027
kabulüne dönüştürülmez; LGS keşif/tanılama aktivasyonu da kapsam dışıdır.

## Dağıtım ve geri dönüş

1. Mevcut branch/diff, 217/219 ve kaynak-v2 ön koşulları, canlı fonksiyon ve izinler
   salt okunur kontrol edilir. Önce test/inceleme, sonra onaylı yayın yapılır.
2. `20261008183619_question_source_curriculum_v2.sql`, ardından
   `20261008200746_question_source_ai_owner_acceptance.sql` uygulanır. Yeni migration
   yalnız şema/fonksiyon değiştirir; içerik onayı, kalite kararı veya yayın yapmaz.
3. ACL, eski kabul kayıtları ve yeni mode/kapasite çıktısı geri okunur; sonra uygulama
   sürümü dağıtılır. Canlıda gerçek bir soruyla sentetik kabul testi yapılmaz.
4. İlgili kişi kaynak kabulünü fiilen verir. Kalite ve yayın ayrı işlemlerdir.

Acil durdurmada yeni AI kabul RPC'sinin `service_role` EXECUTE izni geri alınabilir;
diğer yollar ve bütün kanıt kayıtları korunur. Bu yeni kabulleri durdurur, önceden
verilmiş kabulü geri almış sayılmaz. Mevcut kabulün iptali ayrıca yönetişim kararıdır.
Eski uygulamaya dönüş veya yalnız EXECUTE iptali, eski onayları “bağımsız” yapmaz.
Eski migration'ları körlemesine tekrar uygulama; kayıtları veya kolonları silme.

## Yerel doğrulama ve sınırlar

- Native PostgreSQL 16.15: kaynak kabulü, actor/RBAC, parmak izi, ACL, migration
  tekrarı, değişmez geçmiş, katalog/yıl ve kalite kontrolü regresyonları.
- Seçilmiş gerçek yönetişim migration zinciri: taslak oluşturma, eşzamanlı kabul,
  doğru hash gelene kadar yayın reddi, tek aktörün ayrı yayın işlemi ve geri okuma.
- API ve arayüz: açık mode/beyan, oturum actor'ü, izin reddinde fallback olmaması,
  alan/rapor/revizyon değişiminde kutunun sıfırlanması, non-independent etiketi.
- TypeScript, ESLint, migration idempotency ve SECURITY DEFINER grant kontrolleri.

Testlerdeki kaynaklar, kullanıcılar ve kararlar sentetik ve izole veridir. Bunlar
üretim kaynak kabulü değildir. Seçilmiş migration testleri tam üretim zincirinin,
PostgreSQL sürüm eşitliğinin veya GitHub CI/dağıtım başarısının kanıtı sayılmaz.
Bu değişikliğin yerel testlerinin geçmesi canlıya uygulanmış olduğu anlamına gelmez.
