# Sosyal pilotu — canlı şema ve taslak hazırlığı

**Güncel teslim:** [Soru/şık bazlı v2 inceleme ve son canlı kontrol](social-pilot-review-handoff-20261001.md).
Tabakalaşma sorusu yeniden yazılıp iki modelde yeniden denetlendi. Aşağıdaki
07:51 UTC ve v1 dosya referansları tarihsel kayıttır; yeni işlemlerde v2 paketini
kullanın. Son canlı pin kontrolü 14:27–14:28 UTC'de tekrarlandı.

1 Ekim 2026, 07:51 UTC salt okunur Supabase kontrolü. Ana dal tabanı
`ebb39b82` (#544). Bu çalışma canlı veritabanına yazmadı.

## Doğrulanan canlı durum

| Kontrol | Sonuç |
| --- | --- |
| Pilot adayları | 24/24 aktif; yayımlanmış revizyon/hash eşleşiyor |
| Soru içeriği / yayımlanmış revizyon içeriği | 24/24 aynı |
| Mevcut soru ve yayımlanmış revizyon kazanım bağları | Her iki tabloda da 0/24 |
| İçerik kaynak kaydı | 24/24 `Legacy import`, `legacy-import`; lisans incelemesi gerekli |
| TYT Sosyal kapsamı | `validating`, `diagnostic_enabled=false` |
| Dört alan keşif pilotunun tabloları | Canlıda yok |
| Genel içerik kalite yayın kapısı | Açık; `question-quality@2` gerekli |

Canlı katalogda tarih, coğrafya, felsefe ve sosyoloji için birer genel kazanım
bulunuyor. Bunların kategoriyle eşleşmesi soru bazlı pedagojik kabul değildir.
Sosyoloji adayı resmî TYT kapsamı kabulü sayılmaz; dört alan keşif pilotu ile tam
TYT tanılaması ayrı kalır. Din kültürü kazanımı bu pilotun dört alanına eklenmedi.

## Tamamlanan yerel uyumluluk işleri

- Ana daldaki #543 migration linter'ı ve #544 Türkçe harf geri getirme yolu
  birleştirildi. Yerel `expectedBase` ve açık `--offline` korumaları korundu.
- Canlıya uygulanmış 215, Türkçe harf düzeltmesi migration'ıdır. Henüz
  uygulanmamış Sosyal migration'ı **216** olarak yeniden numaralandırıldı.
  Canlı migration geçmişi, 215 dosyası ve tablolar değiştirilmedi.
- Migration 164 zaten mevcut bir soru için kazanımsız düzeltme taslağına
  izin veriyor. Yerel araç bunu açık `--mapping-pending-drafts` ile destekliyor.
  Varsayılan davranış hâlâ kazanım eksikliğinde bloklar.
- Bu mod incelenmiş `expectedBase.revisionId` ve tam içerik fingerprint'ini
  zorunlu tutar. Bayat taban, eksik gerçek kaynak, bozuk dolu kazanım veya
  deterministik içerik hatası geçirilmez. Yeni soru yaratma için kazanımsız
  payload kabul edilmez.
- Moddaki bütün öğeler yalnız `create_question_content_revision` yoluna gider;
  215'in iki onaysız hızlı yayın yolu **kapalıdır**. Stage 2/yayın için mevcut
  gerçek kazanım, kaynak, bağımsız onay ve kalite kapıları değiştirilmedi.
- 17 öneri güncel canlı pin ve gerçek kaynak kayıtlarına bağlanarak **taslak
  açmaya hazır yerel plan** olarak üretildi. Hepsi `lane=draft`,
  `mappingRequired=true`; lisans kodu ve legacy provenance aynen korundu.
  `INTERNAL` kaynak uydurulmadı, canlı revizyon açılmadı.
- 24 kazanım katalog adayı ayrı, **kabul edilmemiş yerel öneri** olarak
  hazırlandı. Hiçbiri mevcut soru veya revizyona otomatik bağlanmadı.

Özel kanıtlar:
`secure/social-live-readiness-20261001.json`,
`secure/social-mapping-pending-drafts-20261001/{report.json,review-sheet.md,mapping-candidates.json}`.
Hazırlama betiği yalnız dosyaları okur; DB istemcisi ve LLM çağrısı içermez.

## Güvenli çalıştırma ve yayın sınırı

Yetkili gerçek operatör kimliğiyle, önce **yazmasız** kontrol:

```powershell
npm run revision:drafts -- --proposals secure/social-correction-proposals-20261001.json --user-id <operator-uuid> --mapping-pending-drafts --out-dir secure/social-draft-live-check-10
npm run revision:drafts -- --proposals secure/social-additional-correction-proposals-20261001.json --user-id <operator-uuid> --mapping-pending-drafts --out-dir secure/social-draft-live-check-7
```

`--apply` eklemek canlı **taslak** oluşturur; ayrı yetkilendirilmiş yazma
adımıdır. Kaynak/kazanım kabulü, onay veya yayın değildir. Mevcut içerik ve eski
oynanmış revizyon/cevap kayıtları taslak oluşturmayla değişmez.

Yeni gerçek revizyon UUID/hash'i oluşturulunca kaynak raporu ve kalite koşusu
o kimliğe bağlanmalıdır. 17/17 iki-model yerel `APPROVED` sonucu eski revizyona
veya yeni PostgreSQL hash'ine kopyalanamaz. Yerel-preview fingerprint'i
PostgreSQL `jsonb::text` hash'i değildir. Kör çözüm permütasyonları da gerçek
revizyon kimliğine göre yeniden üretilecektir.

Pilotun 216 schema dağıtımı, kaynak paketinin gerçek kabulü, paketin
`released` yapılması, uygulama dağıtımı ve kimlik doğrulanmış öğrenci kabulü
ayrı adımlardır. Eski 12 çelişkili / 12 eksik kaynak raporu yeni metne otomatik
aktarılmadı. Lisansın açık erişim olması ticari yeniden kullanım veya LLM
ingestion izni olarak yorumlanmadı.

## Yerel doğrulama

- Frontend: 490 dosya, **4.457 test geçti**.
- DB araçları/SQL sözleşmeleri: **762 geçti**, 233 opt-in test atlandı.
  İlk eşzamanlı koşuda bir CLI testi 5 saniyelik sınırda zaman aşımına uğradı;
  aynı sınırla tek başına ve ardından bütün paket ayrı çalıştırıldığında geçti.
  Timeout yükseltilmedi; test veya kontrol kapısı atlanmadı.
- Ayrı disposable PostgreSQL 17: **22 governance + 16 Sosyal pilotu** testi
  gerçekten çalıştırıldı ve geçti. 164'ün stage 2 eşleme kapısı, 215'in sınırlı
  harf yayını, 216'nın eski revizyon/cevap korunumu ve release kapıları doğrulandı.
- TypeScript, değişen araçların eslint kontrolü, 218 migration'ın sıra/icerik/
  idempotency linter'ı ve SECURITY DEFINER grant/search_path linter'ı geçti.
- Webpack üretim build'i geçti. Bu bir deploy veya canlı tarayıcı kabulü değildir.
- 24 pin / 17 düzeltme / 24 kabul edilmemiş kazanım adayı planının tutarlılığı
  kontrol edildi; önceki iki-model ham raporları da yeniden doğrulandı.

Sonuç: 17 içerik düzeltmesi ve taslak hazırlama yolu yerelde hazır; **canlı
pilot henüz açılmadı**. Kaynak/kazanım kabulü ve dağıtım tamamlanmadan yayın
iddiası veya fiziksel öğrenci akışının geçtiği iddiası yapılmaz.
