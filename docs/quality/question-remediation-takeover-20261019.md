# Sabitlenmiş soru taslakları

`prepare-question-revision-drafts.mjs --apply` tarihsel olarak Türkçe harf
restorasyonu (215) adaylarını yayımlayabilir. Yalnız taslak hazırlanması istenen
paketlerde `--draft-only` kullanılır. Bu seçenek:

- Her öneride `expectedBase.revisionId` ve tam içeriğin canonical JSON SHA-256
  değerini ister; taban değişirse öğeyi engeller.
- 215 hattını seçmez; yalnız `create_question_content_revision` çağırır.
- `--require-all-ready` ön kontrolünü de açar. Eksik, engelli, önizleme veya
  yinelenen soru varsa hiçbir mutation çağrısı yapılmaz.
- Kaynak kaydı eksikse `INTERNAL` kaynak türetmez.

```sh
node database/prepare-question-revision-drafts.mjs \
  --proposals secure/reviewed-package/proposals.json \
  --user-id <actual-preparer-uuid> --draft-only \
  --mapping-pending-drafts --out-dir secure/reviewed-package/dry-run
```

İnceleme bittikten sonra aynı komuta `--apply` eklenmesi taslak açar.
`--mapping-pending-drafts`, yalnız mevcut soru revizyonlarının kazanımsız taslak
olmasına izin verir. Yeni soru, kaynak kabulü, kalite kararı veya yayın için
izin sağlamaz. Tam paket ön kontrolü, ardışık RPC'leri atomik bir işlem yapmaz;
her RPC taban CAS ve istek kimliği korumasını ayrıca uygular.

## Eski WordQuest alanları

Yabancı içerik alanlarını sessizce atma koruması korunur. Yalnız eski WordQuest
kayıtlarındaki `correct` ve boş `structure` için öneriye açık bir beyan eklenebilir:

```json
{
  "legacyNormalization": {
    "remove": { "correct": 1, "structure": null },
    "reason": "Kanonik answer ve correct aynı seçenek indeksini gösteriyor; soru ve seçenekler incelendi. Boş structure bilgi taşımıyor."
  }
}
```

Bu beyan ancak aynı taban revizyon ve tam içerik hash'iyle, belirtilen alanların
tam olarak aynı değerleri taşıdığı bir WordQuest düzenlemesinde geçer.
`answer` geçerli olmalı ve `correct` ile aynı olmalıdır. Dolu `structure`, yeni
yabancı alan, çelişen cevap, eksik pin veya eksik gerekçe engellenir. Bu kapsamın
dışındaki eski veriler ayrıca incelenir; genel bir alan silme izni yoktur.
İnceleme sayfası kaldırılan alanları da değişiklik olarak gösterir.

## 19 Ekim düzeltme paketi

Özel soru metinleri ve canlı snapshot'lar Git'e eklenmez. Yerel paket
`secure/question-quality-remediation-20261019/` altındadır. İlk 673 önerideki
sekiz edit/retire çakışması korunan kayda taşıma ile çözülmüş, üç korunan kayda
ek içerik düzeltmesi eklenmiş, farklı sınav kapsamlarını birleştiren bir
emeklilik ayrılmıştır: 675 farklı soru için 152 düzenleme ve 523 emeklilik
taslağı önerisi. İncelenmemiş 200 kazanım eklemesi kaldırılmıştır. Tek tek
gerekçelendirilen 44 eşleme önerisi vardır; 156 öğe eşleme bekler.

675 önerinin tamamı taban/hash ile sabitlenir. Matematikte 45 düzenleme ayrı
hesapla denetlenir; 22 WordQuest kaydının eski alanları açık beyanla ele alınır.
`ready` yalnız taslak hazırlama kontrolünden geçtiğini belirtir. Paket raporu
insan kabulü veya bütün derslerde pedagojik doğruluk belgesi değildir.

Kaynak ve yayın için [AI hazırlığı + tek yetkili kabulü](ai-prepared-owner-acceptance.md)
veya standart bağımsız inceleme yolu, gerçek revizyon/hash'e bağlı kalite kararı
ve ayrı yayın işlemi gerekir. Kullanıcının iki özgün soru için önceki beyanı,
paketteki diğer soruların kaynak hakkı beyanına genişletilemez.

## Doğrulama

Hazırlama ve metin tarama testleri; 215 adayının taslak olarak kurulmasını,
tam paket engelinde sıfır mutation çağrısını, eski veri normalizasyonunun
olumlu/olumsuz koşullarını ve mevcut varsayılan davranışın uyumluluğunu kapsar.
Paketin ayrı yerel denetleyicisi tüm işlemlerin tekilliğini, korunan kayıtları,
orijinal dosya karmalarını, matematik hesaplarını ve yayın çağrısı yapılmadığını
sahte RPC ile kontrol eder. Canlı SQL doğrulaması `BEGIN READ ONLY` içinde
payload sözleşmesini ve incelenen tabanı denetler; canlı veri yazmaz.
