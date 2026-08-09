# R1.3 — TYT Matematik Kazanım Grafiği V1

**Tarih:** 2026-08-08
**Kanonik üst plan:** [`2026-08-08-research-roadmap-completion.md`](./2026-08-08-research-roadmap-completion.md)
**Durum:** Yerel uygulama, Sol gerçek-PostgreSQL doğrulaması ve son düzeltmelerin bağımsız Terra yeniden incelemesi tamamlandı. Canlı migration/deploy yetkisi verilmedi.

## Kapsam ve dürüst ürün iddiası

- İlk tam pilot kapsam `game=matematik + exam_ref=TYT` olur.
- Taksonomi Bilge Arena'nın iç öğrenme grafiğidir; resmî MEB kazanım kodu veya resmî müfredat eşdeğerliği iddiası taşımaz.
- V1 mevcut altı ürün kategorisini kapsar: `sayilar`, `denklemler`, `fonksiyonlar`, `problemler`, `geometri`, `olasilik`.
- Her aktif TYT Matematik sorusu en az bir aktif leaf kazanıma bağlanır. V1'de kategori başına bir leaf bulunur; veri modeli daha ince ve çoklu eşlemeyi destekler.
- Pilot dışındaki oyun/sınavlar sahte kapsama yüzdesi göstermez; `unsupported` olarak kalır.

## Dört seviyeli grafik

`curriculum_nodes` şu kapalı seviyeleri taşır:

1. `course`: TYT Matematik
2. `unit`: Sayılar ve Cebir, Problem Çözme, Geometri, Olasılık
3. `topic`: mevcut altı ürün kategorisi
4. `outcome`: ölçülen leaf beceri

Her node tek parent'a sahiptir. Parent seviyesi, oyun, sınav ve taxonomy version eşitliği DB tarafından doğrulanır; bu nedenle cycle veya farklı sınava bağlanan path oluşamaz. `curriculum_outcomes.node_id`, yalnız `outcome` leaf'ine bağlanabilir.

## Kapsama ve gelecekteki sorular

- Mevcut aktif TYT Matematik soruları migration içinde kategori eşlemesiyle `question_outcomes` tablosuna idempotent bağlanır.
- `question_outcomes.mapping_source`, manuel ve taxonomy-auto eşlemeyi ayırır.
- Soru aktifleştiğinde veya oyun/kategori/sınav kapsamı değiştiğinde trigger yalnız taxonomy-auto eşlemeyi yeniden kurar; manuel çoklu eşlemelere dokunmaz.
- Desteklenmeyen pilot kategorisinde soru aktifleşmesi fail-closed olur; sessiz yetim soru üretilmez.
- Service-role integrity RPC'si toplam, geçerli eşlenmiş, eşlenmemiş, scope-mismatch, leaf/node orphan sayılarını kimlik döndürmeden raporlar. Migration sonunda pilot `unmapped=0` invariantı aranır.

## Çok boyutlu kanıt V2

Yeni cevaplardan ve idempotent bounded backfill'den şu kanıtlar ayrı tutulur:

- ham ve zorluk-ağırlıklı doğruluk,
- cevap süresi ve zamanlı kanıt sayısı,
- hızlı yanlış oranı (yalnız tahmin riski sinyali; kesin teşhis değildir),
- kontrollü Koç ipucu kullanılan deneme ve en ileri ipucu aşaması,
- öğrenci tarafından seçilen `guess` ve `careless` hata nedenleri,
- 24+ saat gecikmeli doğru geri getirme.

Ham kanıt append-only answer/outcome ledger'ında tutulur; aggregate `user_outcome_state` replay-safe güncellenir. Koç olayı yalnız owner'a ait, süresi geçmemiş ve soruyu içeren doğrulanmış attempt için kaydedilir. Serbest metin tutulmaz.

## Şeffaf durum modeli

- `insufficient`: üçten az cevap kanıtı.
- `mastered`: en az beş cevap, en az bir gecikmeli doğru, V2 birleşik skor ≥80 ve ağır ipucu bağımlılığı yok.
- diğer durumlar `developing`.

Birleşik skor API'de bileşenleriyle açıklanır; yalnız opak tek sayı dönmez. Zorluk-ağırlıklı doğruluk ana bileşen, gecikmeli geri getirme ikinci bileşen, bağımsızlık ve hızlı-yanlış/self-report riskleri küçük düzeltmelerdir. Ortalama süre karşılaştırmalı norm olmadığı için tek başına ceza üretmez; görünür kanıt olarak sunulur. Eski satırlar V2 kanıtı/backfill yokken mevcut mastery sonucuna güvenli biçimde düşer.

## API ve öğrenci yüzeyi

- `/api/profile/mastery` güvenli course/unit/topic/outcome ağacını, coverage özetini ve outcome başına açıklanabilir kanıtı döndürür; DB UUID, user/session/attempt/answer ID veya soru cevabı döndürmez.
- Hook runtime sözleşmesini doğrular ve geç kalan isteklerin yeni oyun/sınav bağlamını ezmesini engeller.
- `/arena/hakimiyet` tam haritayı; çalışma hub'ı ise en zayıf leaf ve haritaya geçiş CTA'sını gösterir.
- Leaf pratik CTA'sı mevcut oyun/kategori/sınav filtrelerini kurar; sahte “tam 5 soru” garantisi vermez.

## Migration dilimleri

1. `096_curriculum_graph_v1.sql`: node hiyerarşisi, TYT Matematik seed'i, tam/gelecek kapsama, integrity RPC ve ACL/RLS.
2. `097_mastery_evidence_v2.sql`: append-only evidence, yeni aggregate alanları, cevap/error-reason/Koç kanıtı, bounded idempotent backfill ve ACL/RLS.

## Test kapıları

- Gerçek PostgreSQL: hierarchy shape, seed replay, mevcut/future question coverage, manual mapping korunması, scope mismatch, ACL/RLS.
- Gerçek PostgreSQL: answer replay, difficulty/time, delayed evidence, hint owner/attempt binding, annotation change accounting, bounded backfill idempotency ve rollback.
- Saf skor: minimum kanıt, zorluk, gecikmeli doğru, ipucu ve risk bileşenleri.
- Route/hook/UI: safe payload, exact sınav kapsamı, unsupported scope, tree order, stale request, CTA ve no-answer/no-ID.
- Tam Vitest, type-check, scoped ESLint, migration lint ve `git diff --check`.

## Yerel doğrulama sonucu — 2026-08-08

- `096_curriculum_graph_v1.sql` gerçek PostgreSQL testi `5/5` geçti: dört seviye, replay, mevcut/gelecek soru eşlemesi, yanlış kategori kapsamı ve tam ACL/RLS.
- `097_mastery_evidence_v2.sql` gerçek PostgreSQL testi `5/5` geçti: aynı outcome'a birden çok cevap, bounded tarihsel backfill, 25 saat gecikmeli doğru, hint sahipliği/süre/aşama, annotation delta ve append-only ACL/RLS.
- DB statik testleri `8/8`; migration lint `100` dosyada baseline dışı ihlal olmadan geçti.
- API, runtime sözleşme, hook, grafik ekranı ve doğrulanmış-attempt Koç bağlantısını kapsayan birleşik hedef grubu `13/13` dosya ve `90/90` test geçti.
- Tam Vitest paketi `238/238` dosya ve `2511/2511` test ile geçti. Type-check, R1.3 kapsamındaki scoped ESLint, migration lint (`100` dosya) ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- Sol incelemesinde ve gerçek PostgreSQL koşularında bulunan dört kritik sınıf kapatıldı: yanlış-category mapping'in coverage'ı maskelemesi, aynı outcome için çoklu satır UPSERT cardinality hatası, service-role'da kalan `REFERENCES/TRIGGER` yetkileri ve transient conflict satırına erken uygulanan V2 bounds kontrolü.
- Terra son bağımsız tekrar incelemede 096/097 migration, mastery evidence/API ve UI sınırında P0/P1 bulmadan `APPROVED` verdi.

## Canlı sınır

Bu dilim yalnız yerel migration/app/test hazırlığıdır. Production migration, backfill, integrity snapshot, rollout, smoke, gözlemleme ve rollback ayrı onay kapılarıdır.
