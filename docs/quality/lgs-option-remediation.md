# LGS dört seçenek — üretim ve içe aktarma koruması (#1575)

Bu sürüm yalnız yeni LGS sorularının üretim/içe aktarma girişlerini düzeltir.
Mevcut soru içeriğini, öğrenci yanıtını, kazanımı, onayı veya yayın durumunu
değiştirmez. Soru bankasının düzeltilmesi ayrıca değişmez revizyon akışını izler.

## Sözleşme

Üç eski üretici (`generate-lgs-fen`, `generate-lgs-matematik`,
`generate-lgs-matematik-retry`) prompt ve JSON örneklerinde A–D kullanır.
Ortak `validateLgsContent` kontrolü şunları zorunlu tutar:

- Tam dört, boş olmayan ve birebir aynı olmayan metin seçeneği.
- 0–3 arasında tam sayı cevap indeksi; otomatik tip dönüşümü yok.
- Soru kökü ve çözüm metni.

Geçersiz sorudan beşinci seçenek kesilmez; soru reddedilir. Büyük/küçük harf
ayrımı Türkçe yazım ve genetik sorularını bozmamak için korunur. Modülleri
import etmek model çağrısı veya DB yazımı başlatmaz. Üreticileri doğrudan
çalıştırmak hâlâ ücretli API çağrısı ve yeni pasif soru insert'i yapabilir.
Bu sürüm bu işlemleri çalıştırmaz ve bütün içerik yazma yollarında veritabanı
düzeyinde yeni bir seçenek sayısı kısıtı oluşturmaz.

## Importer

`import-lgs-batch.mjs` varsayılan olarak **kuru çalışma** yapar:

```powershell
node database/import-lgs-batch.mjs secure/new-lgs.json
node --env-file=.env.local database/import-lgs-batch.mjs secure/new-lgs.json --apply
```

İlk komut ağ/anahtar gerektirmeyen kontroldür. İkinci komut gerçek yazımdır:
tüm paket doğrulandıktan sonra tek insert ile yalnız yeni pasif sorular ekler.
`id`, yayımlı revizyon, `is_active=true`, farklı sınav veya geçersiz tek satır
varsa ilk DB bağlantısından önce tüm paket reddedilir. Yanlış bayrak yazımı
sessizce yutulmaz. Yazma sonucu belirsizse körlemesine tekrar çalıştırılmaz.
Mevcut bir soruyu değiştirmek veya yayımlamak için bu importer kullanılmaz.

## Doğrulama

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.database.config.ts database/__tests__/lgs-question-contract.test.mjs database/__tests__/question-bank.test.mjs
```

Testler dört seçeneği, indeks tip/aralığını, seçenek tekrarını, prompt
örneklerini, import yan etkisizliğini, paket bütünlüğünü ve gerçek ağ yerine
stub üzerinden pasif insert sınırını denetler. İçerik doğruluğunun akademik
veya bağımsız kabulü değildir. Canlı insert veya ücretli model çağrısı yapılmaz.

## Mevcut bankanın ayrı yayın kapısı

4 Ekim 2026 özel canlı okumada 259 LGS kaydı beş seçenekliydi. Hazırlanan
242 dört seçenekli revizyon yalnız **draft** durumunda; 13 kesin içerik
hatası karantinada tutuldu. Bu tarihte LGS kazanım kataloğu, bu taslaklara
bağlı kaynak kabulü ve yetkili kalite kararı eksikti. Bu bir tarihli durum
kaydıdır; yayın öncesinde exact revizyon/hash ve aktiflik yeniden okunmalıdır.

Kaynak/kazanım kapsamı, gerçek bağımsız kabul ve `question-quality@2`
yayın kapıları korunur. Sahibin özgün üretim beyanı akademik onay sayılmaz.
Eski içerik/snapshot/istatistikler silinmez; karantina kendiliğinden açılmaz.

Revizyon-pimli öneri aracı `codex/social-pilot-completion-20260929` dalındaki
birleşmemiş `expectedBase` altyapısına bağlıdır; bu dar üretim-koruma sürümüne
katılmamıştır. Sosyal pilot ve kaynak inceleme arayüzünün dağıtımı ayrı iştir.
