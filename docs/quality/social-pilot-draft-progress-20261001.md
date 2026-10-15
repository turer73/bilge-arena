# Sosyal pilotu — gerçek taslak ve ham kanıt adımı

**Güncel ek:** [kaynak incelemesi ve kazanım bağları](social-pilot-source-outcome-progress-20261001.md).
Aşağıdaki 16:03 UTC tablosu tarihsel ilk taslak adımıdır; sonraki turda 17 iç
beceri bağı eklenmiştir. Bu yeni adım da yayın veya kaynak kabulü değildir.

1 Ekim 2026; son DB doğrulaması **16:03:35 UTC**. Önceki
[yerel v2 tesliminden](social-pilot-review-handoff-20261001.md) sonra aşağıdaki
sınırlı canlı işlemler yapıldı. **Yeni içerik yayımlanmadı.**

## Canlı uygulama ve kanıt

- Kullanıcının verdiği giriş adları e-posta ön adlarıyla gerçek `Turer` ve
  `Turer2` profillerine eşleştirildi; taslak hazırlama yetkileri doğrulandı.
  İlk profil kullanıcı adı aramasındaki eşleşmeme, rol/grant artırılarak
  giderilmedi. Hiçbir yetki değiştirilmedi.
- **17 gerçek düzeltme taslağı `Turer` adına oluşturuldu.** Mevcut `buildBatch`,
  `expectedBase` ve `create_question_content_revision` yolu kullanıldı.
  Gerçek legacy kaynak, lisans ve provenance korundu; kazanım uydurulmadı.
  17 RPC tek kısa DB transaction'a sarıldı. Her sorunun eski yayın UUID/hash'i
  ve kaynağı yeniden kontrol edildi; bir hata bütün taslak yazımını geri alırdı.
- Gerçek taslak UUID/PostgreSQL `jsonb::text` hash'leriyle Gemini ve DeepSeek
  yeniden çalıştırıldı. Önizleme onayları yeni DB kimliklerine kopyalanmadı.
  Metadata'daki legacy TYT etiketi resmî kapsam kabulü sayılmadı.
- Mevcut `toValidationRunRows` mapper'ı ve geri-okuma/schema doğrulamasıyla
  **170 ham ajan kaydı `question_validation_runs` tablosuna eklendi**.
  Mevcut `service_role` INSERT yetkisi kullanıldı; DB revizyon/hash'i tekrar
  denetlendi. Dedup'ta `DO NOTHING` ile eski ham kayıtlara yazılmadı.
- **`question_validation_decisions` tablosuna yazılmadı.** Yetkili yayın
  kararı ayrıca insan-altın benchmark/terfi kanıtı ister; model birliği bunun
  yerine geçirilmedi. Review/publish/retire RPC'si veya insan imzası oluşturulmadı.

| Son kontrol | Sonuç |
| --- | ---: |
| Yeni revizyonlar, status=draft | 17 |
| Eski revizyon hâlâ yayımlanmış | 17/17 |
| Gemini / DeepSeek türetilmiş model sonuçları | Her ikisinde 17/17 APPROVED |
| Kör örnek / anahtar eşleşmesi | 102/102 |
| Çözüm denetimi / anahtar eşleşmesi | 34/34 |
| Bu gerçek-revizyon koşusunun HTTP isteği / başarısız sonuç | 170 / 0 |
| Canlı ham kayıt / kapsanan revizyon | 170 / 17 |
| Ham kanıtta UUID/hash uyumsuzluğu | 0 |
| Yeni revizyon kazanım bağı / insan onayı / yetkili kalite kararı | 0 / 0 / 0 |

Buradaki `APPROVED` model sonucudur; yayın kararı, kaynak kabulü veya insan
imzası değildir. Kaynak kabulü, içerik yayını, pilot release, migration/deploy
ve Git push yapılmadı. Eski oynanmış revizyon ve cevaplara dokunulmadı.

## Araç güvenliği ve regresyon

Mevcut taslak aracına açık **`--require-all-ready`** eklendi. Bir öğe engelli,
henüz yamalanmamış veya yalnız preview ise hiçbir mutation RPC çağrılmaz.
Boş veya aynı soru için birden fazla önerili paket de durur.
`--mapping-pending-drafts` yalnız draft kabul eder; 215 hızlı yayın hattına
düşemez. Varsayılan kısmi hazır-öğe davranışı değişmedi.

Bu CLI ön kontrolü tek başına transaction garantisi değildir; yazım başladıktan
sonra her RPC kendi CAS/izin/idempotency kapısını korur. Bu turdaki 17'li
uygulama **ayrıca** tek transaction'da yapıldı.

Kaynak inceleme aracının SSR yardımcı sunucusunda gereksiz HMR kapatılarak
paralel model/kaynak koşusundaki 24678 WebSocket çakışması giderildi. Normal
uygulama sunucusu değişmedi. DB araçları **61**, persistence/kaynak ve Sosyal
öğrenci akışı **105**, toplam **166 regresyon testi** geçti. Bu, deploy veya
fiziksel öğrenci kabulü değildir; tam test paketi bu turda yeniden çalıştırılmadı.

## Yeni kaynak görevleri ve kalan kapılar

Mevcut `source-comparison@1` ile **17 yeni kaynak inceleme görevi** gerçek
taslak UUID/hash'lerine hazırlandı. Giriş manifest hash'leri doğrulandı.
Başlangıç sonucu: **17 missing response**, 0 invalid, 0 revision mismatch,
0 evidence_complete. Görev hazırlamak tamamlanmış inceleme değildir.

Antigravity giriş noktası:
`secure/social-source-review-drafts-20261001/CONTEXT.md`; ardından her görevde
`START.md` ve `task.json`. Kök, beş şık, çözüm, bağımsız kaynak, lisans ve güncel
kapsam ayrı incelenir. Paket anahtarı içerir; kör çözücüye gönderilmez.
Eski kaynak raporları yeni metinlere onay diye kopyalanmaz.

```powershell
node database/source-comparison-review.mjs validate secure/social-source-review-drafts-20261001
```

Güncel operatör yolu önce yazmasız çalıştırılır; `--apply` ayrı canlı taslak
yazımıdır, kaynak/insan kabulü veya yayın değildir:

```powershell
npm run revision:drafts -- --proposals secure/social-correction-proposals-v2-20261001.json --user-id <operator-uuid> --mapping-pending-drafts --require-all-ready --out-dir secure/social-v2-live-check
```

Kalan: yeni revizyon kaynak/kazanım incelemesi ve gerçek kabulü; benchmark/terfi
kanıtıyla yetkili kalite kararı; mevcut semantik revizyon onay/yayın sözleşmesi;
yayın sonrası pilot pinlerinin yenilenmesi; 216 schema/uygulama dağıtımı ve
kimlik doğrulanmış öğrenci kabulü. Hiçbiri yapılmış olarak gösterilmez.

Özel kanıtlar: `secure/social-v2-atomic-drafts-20261001/` (plan/SQL/sonuç/canlı
kontrol), `secure/social-draft-audit-20261001/` (34 gerçek model koşusu),
`secure/social-draft-run-evidence-20261001/` (mapper, hash manifesti ve kalıcılık),
`secure/social-source-review-drafts-20261001/` (17 yeni kaynak görevi).
