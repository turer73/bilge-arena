# Sosyal pilotu — kaynak incelemesi ve kazanım bağları

**Güncel ek:** [Kaynak karşılaştırmalı tek onay](source-comparison-single-approval-20261001.md)
217 migration ile canlı sözleşmeye eklendi. Aşağıdaki iki reviewer zorunluluğu
notu önceki durumdur; yeni kaynak kabul yolunda ikinci reviewer aranmaz.
17 taslağın eksik kanıtı, yetkili karar eksikliği ve yayın yapılmaması değişmedi.

1 Ekim 2026. Canlı kazanım geri-okuması **18:22:29 UTC**. Önceki
[taslak ve ham kanıt adımının](social-pilot-draft-progress-20261001.md) devamıdır.
**17 iç beceri bağı eklendi; kaynak kabulü ve içerik yayını tamamlanmadı.**

## Canlı uygulanan işlem

17 gerçek taslak revizyona, mevcut `set_question_revision_outcomes` RPC'siyle
birer birincil kazanım bağlandı (ağırlık 1). Mevcut yetkili taslak hazırlayan
profil kullanıldı; rol/grant değiştirilmedi. UUID/hash, eski yayın işaretçisi,
draft durumu ve kapsam ön kontrolü bir kısa transaction'da doğrulandı.
Taslaklar kilitlenirken sabit UUID sırası, kısa lock/statement timeout kullanıldı.
İşlem sonrası canlı veritabanından aşağıdaki sonuç yeniden okundu:

| Kontrol | Sonuç |
| --- | ---: |
| Gerçek taslak revizyon | 17 |
| Beklenen tek birincil bağ, ağırlık 1 | 17/17 |
| İçerik hash'i eşleşen | 17/17 |
| Eski yayın işaretçisi korunan | 17/17 |
| Gerçek insan review kaydı | 0 |
| Yetkili `question_validation_decisions` kaydı | 0 |
| Mevcut revizyon/hash ile eşleşen ham ajan kaydı | 170 |
| Bu tur yayımlanan yeni revizyon | 0 |

`SOS-COG-01`, `SOS-FEL-01`, `SOS-SOS-01` ve `SOS-TAR-01`, Bilge Arena iç
öğrenme grafiğinin beceri kodlarıdır; resmî MEB kazanım veya ÖSYM kapsam kodu
olarak kabul edilmedi. Yağış kökünde tablo, Vestfalya kökünde belge pasajı
bulunmadığı için teslimdeki beceri açıklamaları doğrudan tablo/belge okuma
ölçtükleri şeklinde yazılmadı. Bu açıklama düzeltmesi içerik revizyonunu değiştirmedi.

## Tek tek kaynak incelemesi

Antigravity'nin mevcut gerçek-revizyon giriş paketi korunarak ayrı Codex
paketinde 17 adet `source-comparison@1` aday raporu hazırlandı. Her soru kökü,
beş şık ve çözüm tek tek okundu; 85 şık için karşılaştırma açıklaması yazıldı.
MEB OGM ders materyalleri, Stanford SEP, MIT Aristoteles metni, OpenStax,
TDV, Iranica, Open University, Yale Avalon, NASA ve resmî coğrafya anlatımları
gibi ilgili bölümler kullanıldı. Aynı eserin farklı bölümleri ayrı bağımsız
kaynak sayılmadı. Arama özeti okunan bölüm yerine kullanılmadı.

Kaynak erişim çıktıları ve bölüm hash'leri özel kanıtta tutuldu. MGM'nin
eldeki aynı gün PDF önbelleğinin sayfa 9, Tablo 2 görseli bu turda ayrıca
okundu; normal (1991–2020), 2024 ve 2025 sütunları karıştırılmadı.
Yeni web erişiminin timeout vermesi gizlenmedi. Bu tek MGM ölçüm zinciridir.

[2026 Sosyoloji program kataloğu](https://mufredat.meb.gov.tr/ProgramDetay.aspx?PID=2174)
erişilebildi; kataloğun bağlı PDF adresi bu turda 404 döndü. Ders kitabı
varlığı, tek başına güncel TYT kapsamı veya uygulama kohortu kabulü sayılmadı.

Mevcut kaynak doğrulayıcısının ayrı Codex paketinde sonucu:

| Kontrol | Sonuç |
| --- | ---: |
| Aday kaynak raporu | 17 |
| Eksik cevap / geçersiz şema / revizyon uyumsuzluğu | 0 / 0 / 0 |
| `conflicting_evidence` | 0 |
| `insufficient_evidence` | 17 |
| `evidence_complete` | 0 |
| Doğrulayıcının DB yazımı | 0 |

Bu sonuç soruların hepsinin hatalı olduğunu söylemez. 17 raporun tamamında
resmî sınav/kazanım kapsamı kanıtı eksiktir; bir bölümünde ayrıca bağımsız
ikinci bölüm, çeldirici veya çözümün ek iddiası için kanıt tamamlanmamıştır.
Örneğin linyit çözümündeki TKİ atfı, Tuz Gölü'nün sığlık niteliği ve bazı
felsefe çeldiricileri bu turda tamamen kaynaklandırılmış sayılmadı.
Lisanslar kesinleştirilmeden `reference_only` kullanımı ve uyarılar korundu.
Kaynak raporunun `candidateEvidenceOnly=true` ve `publicationAuthorized=false`
sınırları değiştirilmedi. Antigravity'nin ilk paketine yanıt eklenmedi.

## Doğrulama

- Kaynak karşılaştırması ve soru/revizyon normalizasyonu: **50 birim testi geçti**.
- Kaynak adapter, Sosyal kaynak sözleşmesi ve kazanım scope sözleşmesi:
  **9 test geçti** (Vitest database config).
- İlk DB testi denemesi yanlışlıkla Node runner ile başlatıldı; Vitest
  import hatası nedeniyle başarılı sayılmadı. Doğru runner ile yeniden geçti.
- Kaynak paketinin manifest/input hash doğrulaması ve canlı kazanım
  geri-okuması geçti. Tam uygulama test paketi, deploy ve öğrenci kabulü
  bu turda yeniden çalıştırılmadı.

## Yayından önce kalan somut kapılar

1. Güncel sınav/kazanım kapsamı ve raporlardaki eksik kaynak bölümleri
   tamamlanmalı; içerik sahipliği/lisans/provenance ayrıca doğrulanmalı.
   Legacy kaynakların `legacy-import` kaydı uydurma yeni lisansla değiştirilmedi.
2. Ham model birliği, insan-altın benchmark/terfi raporu olmadan yetkili
   `question_validation_decisions` kararına dönüştürülmedi.
3. Canlı semantik review/publish sözleşmesi hâlâ hazırlayandan ayrı iki
   bağımsız reviewer ister. Kullanıcının tek kaynak-karşılaştırmalı kabul
   yönündeki önceki kararıyla bu canlı sözleşme arasında fark var; mevcut
   görevde kayıt veya imza taklidiyle bu fark aşılmadı. Taslak hazırlayan ve
   kazanım bağlayan hesap kendi revizyonunu onaylayamaz.
4. İçerik yayını sonrası pilot revizyon pinleri ve 216 schema/uygulama
   dağıtımı ayrı doğrulanmalıdır; Sosyal keşif öğrenci kabulü bunlardan ayrıdır.

Yeni approval/publish RPC çağrılmadı; mevcut kapılar, eski oynanmış revizyonlar
ve öğrenci cevapları korunuyor. Yayın onayları tamamlandı olarak raporlanamaz.

Özel kanıt:
`secure/social-outcome-acceptance-20261001/` (plan, transaction, geri-okuma),
`secure/social-source-review-codex-20261001/` (17 gerçek-revizyon raporu),
`secure/social-source-review-codex-evidence-20261001/` (erişim ve hash kayıtları).

```powershell
node database/source-comparison-review.mjs validate secure/social-source-review-codex-20261001
```
