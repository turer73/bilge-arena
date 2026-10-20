# AI hazırlığı ile tek sorumlu pasife alma kabulü

20 Ekim 2026. Kullanıcı bu görev için uygulamayı Codex'e devretti ve içerik incelemesini kendisinin yapacağını bildirdi. Bu tercih tek başına hiçbir sorunun kabul edildiği anlamına gelmez. Migration 228 henüz canlıya uygulanmadı; rol, soru, karar ve onay verisi yazmaz.

523 pasife alma taslağı mevcut tek kaynak kabulü yolunun dışında kalıyordu. Yeni yol gerçek hazırlayıcı hesabının kaldırma gerekçesini açık sorumluluk beyanıyla kabul etmesine izin verir. Kayıt `ai_assisted_owner_retirement` olarak tutulur; bağımsız insan incelemesi veya içerik doğruluğu kararı değildir. Eski iki aşamalı yol değişmez. İçerik değişikliklerinin kaynak/kalite kapıları korunur.

## Kullanım ve kanıt

Yönetim panelinde pasife alma revizyonunu açın; mevcut soru, çözüm, kaldırma gerekçesi ve varsa korunacak soruyu karşılaştırın. O soru/revizyon/hash ve mevcut yayın tabanına bağlı `retirement-evidence@1` JSON dosyasını yükleyin. Gerçek hazırlayan AI/araç adını ve kendi inceleme gerekçenizi yazın. Bağımsız insan incelemesi olmadığını kabul edip sorumluluğu üstlenin; ardından kabulü kaydedin. Kabul yalnız gerçek stage-1 imzası ile özel, değişmez bir pasife alma kanıtı oluşturur. Ayrı **Kabul edilen revizyonu pasife al** işlemi mevcut yayın RPC'sini kullanır.

Kanıt alanları:

```json
{
  "version": "retirement-evidence@1",
  "questionId": "SORU_UUID",
  "revisionId": "REVIZYON_UUID",
  "contentSha256": "64_kucuk_hex",
  "baseRevisionId": "MEVCUT_YAYIN_UUID",
  "reason": "invalid_content",
  "evidenceRef": "gercek_kanit_paketi_referansi",
  "evidenceSha256": "64_kucuk_hex",
  "survivor": null
}
```

`reason`: `duplicate`, `invalid_content` veya `out_of_curriculum`. Yinelenen kayıtta `survivor`, farklı bir sorunun `questionId`, `publishedRevisionId`, `contentSha256` alanlarını taşır. Diğer nedenlerde `null` olmalıdır. Bunlar örnek yer tutuculardır; geçerli bir üretim raporu değildir. Kanıt dosyasının erişimi/hash'i sorumlu kişinin beyanıdır; sunucu keyfi dosya veya URL açmaz. Aynı referans/hash, mevcut AI hazırlık beyanında da zorunludur.

Yeni GET/POST: `/api/admin/content-quality/revisions/[revisionId]/retirement-review`. POST yalnız açık `acceptanceMode`, kanıt, hazırlık beyanı, gerekçe ve requestId kabul eder. Aktör doğrulanmış oturumdan gelir. Yanıtlar özel ve `no-store`; GET kanıtı veya inceleyen kimliğini dışarı vermez. Akış 64 KiB gerçek gövde sınırını denetler. Arayüz 32 KiB dosya sınırı uygular. Rapor/revizyon/hazırlayan/gerekçe değişince sorumluluk yeniden gerekir. Başarısız kabul aynı değişmemiş payload için requestId ile tekrar edilebilir; yayın kendiliğinden çağrılmaz.

## Veritabanı sınırları

- Gerçek hazırlayıcı ve varsa kazanım hazırlayıcısı aynı sorumlu olmalı; `content.prepare`, `content.review.stage1`, `content.publish` birlikte gerekir. Yeni rol veya izin verilmez.
- Yalnız `retire`, güncel taban ve mevcut yayınla birebir içerik/metadata kabul edilir. Değiştirilmiş cevap, çözüm veya metadata bu yolu kullanamaz.
- Özgün/legacy olmayan lisans ve gerçek provenance kaydı zorunlu. Kaynak, kazanım ve güncel soru parmak izi kabulde ve yayında yeniden kontrol edilir.
- Geçerli kazanımı olmayan kayıt için yalnız 227'nin dar istisnası korunur: önceden pasif, bütünüyle eşlemesiz, güncel ve değişmemiş soru. Aktif kazanımsız veya kısmi/geçersiz eşleme geçemez.
- Yinelenen kaldırmada korunan soru ve onun yayın/hash'i sabitlenir. Aktif soru kaldırılırken korunan soru aktif olmalıdır; zaten pasif bir kopyanın biçimsel kaldırılması bu şarttan muaftır. Korunan soru bu yeni kabul yolu ile aynı anda kaldırılamaz. Böyle bir koruma kaydı sonraki kaldırmayı da engelleyebilir; ayrı yönetişim değerlendirmesi gerekir. Eski iki aşamalı yol korunur.
- Her iki soru UUID sırasıyla kilitlenir. Yayın kontrolü sırasında korunan soru değiştirilemez. Kaynak/kazanım kilitleri ve mevcut taban CAS sürer. Değişmiş kanıt/payload için eski onay veya requestId kullanılamaz.
- Yeni kabul tablosunda RLS, doğrudan DML reddi ve değişmez geçmiş vardır. Yeni yazma/okuma RPC'leri yalnız service_role; içeride gerçek kullanıcı izni zorunlu. İstemci rolleri ve service_role tabloya doğrudan erişemez.

Pasife almada hatalı içerik için sahte `APPROVED` içerik kararı üretilmez. Bu ayrı kaldırma kabulüdür. 171 içerik değişikliğinin kaynak kabulü, geçerli kalite kararı ve akademik kapsamı bu migration ile tamamlanmış olmaz. `question-quality@5` ham sonuçları `question-quality@2` kararı diye etiketlenmez.

## Yerel doğrulama

Native PostgreSQL 16.15, yeni boş yerel küme ve seçilmiş gerçek yönetişim zinciri: mevcut 23 kabul testi, yeni kapsamlı kaldırma kabul testi ve 15 manifest testi; toplam 39 test, sıfır skip. Yeni test gerçek RPC/ACL, hazırlayıcı/izin, eşzamanlı replay, yanlış hash/kanıt, değiştirilmiş içerik/metadata, eski taban, değişen kaynak/kazanım/korunan soru, korunan soru kilidi, tek imza ve ayrı yayın, migration tekrar ve geri dönüşü denetler. Mevcut iki aşamalı pasife alma regresyonu ayrıca çalışır. Fixture ve kullanıcılar sentetiktir; tam üretim migration zinciri veya canlı kullanıcı kabulü değildir.

API/sözleşme ve arayüz: 60 test geçti. Gerçek oturum aktörü, mode/kanıt bağları, sorumluluk, boyut sınırı, yanlış revizyon, izin reddi/fallback olmaması, eski dosya yanıtı, kutunun sıfırlanması ve ayrı yayın kontrol edilir. TypeScript ve değişen uygulama dosyalarının ESLint'i geçti. Migration idempotency/order ve SECURITY DEFINER ACL/search_path linter'ları geçti.

İlk yerel denemede test callback'inde async yazım hatası vardı. İki ek negatif fixture, yanlış kapsamda kazanım eklemeye çalıştığı için mevcut guard tarafından reddedildi. Fixture, var olan geçerli eşlemenin akademik düğümünün sonradan geri çekilmesi şeklinde düzeltildi; guard veya test beklentisi gevşetilmedi. İlk UI denemesinde test iki ayrı bileşen mount ederek revizyon geçişini yanlış kurdu; gerçek rerender/unmount ile düzeltildi. Sonuçlar ve geçici kümeler yerel inceleme dizininde tutulur.

Yerel bağımlılıklar önceki worktree'nin kurulu node_modules junction'ını kullanır. Güncel kilit dosyasıyla temiz kurulum, GitHub CI ve PostgreSQL 16/17 tam zincir ayrı doğrulamalardır. Yeni yetkili inceleme HTML dosyası üretildi; araç güvenlik politikası `file:` tarayıcı önizlemesini engellediğinden görsel tarayıcı doğrulaması yapılmadı. Testler canlı yayın kabulü sayılmaz.

## Yayın ve geri dönüş

1. PR incelemesi, güncel HEAD için yeşil CI, PostgreSQL 16/17 tam zincir ve uygulama build kanıtı tamamlanır. `database/migration-order.json` içindeki 228 henüz `pending` kalır; sahte ledger yazılmaz.
2. Somut paket incelenip canlı şema adımı ayrıca yetkilendirildikten sonra mevcut fonksiyon/ACL/parmak izleri ve 227 ön koşulu salt okunur doğrulanır. Yeni migration uygulanır, gerçek ledger kimliği kaydedilir; ACL ve sıfır içerik/onay/yayın farkı geri okunur. Ardından arayüz dağıtılır. Üretim sorularıyla sentetik kabul yazılmaz.
3. Gemini/DeepSeek sonuçları tamamlanır; uyuşmazlıklar görünür tutulur. Gerçek yetkili kişi soru bazında kanıtı inceleyerek kabul verir. Yayın/pasife alma ayrı işlemdir. Güncel taban ve kanıt her yazımda yeniden denetlenir.
4. Acil durdurmada yeni kabul RPC'sinin EXECUTE izni geri alınabilir. `database/rollback/228_ai_owner_retirement_acceptance.sql` eski readiness/publisher yordamlarını geri getirir ve yeni RPC'leri kapatır. Kanıt tablosu, imzalar ve daha önce gerçekleşmiş pasife almalar silinmez veya geri çevrilmez. Bekleyen tek yetkili kabulleri rollback sonrası yayınlanamaz. Eski kabul hiçbir zaman bağımsız inceleme olarak yeniden etiketlenmez.

Canlı migration, deploy, insan kabulü ve içerik yayını bu yerel kod paketinde yapılmadı. 694 model doğrulaması ayrı işlem olarak sürmektedir.
