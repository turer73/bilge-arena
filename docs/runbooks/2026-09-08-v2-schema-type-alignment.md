# V2-01 — production şema tipleri ve yerel release bazı

## Kapsam ve durum

8 Eylül 2026: yalnız yerel tip eşitlemesi, master bağımlılık entegrasyonu ve
doğrulama. Push, PR, deploy, production SQL, token veya bayrak değişikliği yok.
Bu paket V2'nin tamamlandığı ya da migration 212'nin canlıya alındığı anlamına gelmez.

Başlangıç adayı `336320ba6f653a89f70389307d3117503f777678`, dal
`fix/v2-social-policy-epoch`. Fetch ile doğrulanan master
`dc5e4b862c3d52348a3c89c199ed101d9b772c8a` yerel olarak çakışmasız birleştirildi.
Master farkı yalnız package.json / package-lock.json; bu iki dosya master ile
birebir tutuldu. Migration 212 gövdesi ve uygulama davranışları değiştirilmedi.

## Salt-okunur production kanıtı

- Proje `lvnmzdowhfzmpkueurih`, `bilge-arena`, ACTIVE_HEALTHY, PostgreSQL 17.
- Canlı tip üretimi, [7 Eylül CI artefaktı](https://github.com/turer73/bilge-arena/actions/runs/34095097333)
  ile CRLF/LF normalizasyonu ve son newline dışında birebir eşleşti.
- Yerel `src/types/database.generated.ts` SHA-256:
  `3e19cd87ecffd4e7f0d50c5e15206b91622dbb642287013a4a2d906d0134e566`.
- READ ONLY transaction içinde ledger sayımı: 187–211 arasındaki her ordinal
  bir kez mevcut (25/25). 212 kaydı ve altı yeni 212 fonksiyonu yok.
- Ledger ad/sayı kontrolüdür; tüm historical SQL gövdelerinin/hashlerinin
  production ile eşleştiğini veya tüm fonksiyonların doğru yetkide çalıştığını kanıtlamaz.
- Yeni CI çalıştırılmadı. Şema kontrolünün remote kapanışı, bu aday yayımlandıktan
  sonra aynı head üzerinde doğrulanmalı. Çalışan PAT değiştirilmedi.

## Fark incelemesi

TypeScript AST karşılaştırması: 152→163 tablo, 265→300 fonksiyon. Yalnız 11 tablo
ve 35 fonksiyon ekleniyor; eski tablo/fonksiyon/view/enum/composite tanımlarında
değişiklik veya kaldırma yok. Eklenen 46 tanım çıkarılınca kalan dosya eski
adayla boşluk normalizasyonu altında birebir eşleşiyor.

11 tablo migration 205 kaynaklı; 91 sütunun Row/Insert/Update alanları, beş
nullable ve 15 default/Insert-optional alanı bağımsız incelemede eşleştirildi.
`int4range` için `unknown` üretimi korunuyor; üretilen dosya elle daraltılmadı.

| RPC'nin son SQL tanımı | Eklenen RPC sayısı |
|---|---:|
| 205 | 8 |
| 206 | 10 |
| 207 | 2 |
| 208 | 4 |
| 209 | 4 |
| 210 | 5 |
| 211 | 2 |

35 RPC'nin parametre adları, SQL→TypeScript tipleri ve default/opsiyonellik
sözleşmeleri eşleşti. Bu imza kontrolüdür; runtime/ACL kabulünün yerine geçmez.

## Client overlay kararı

- Artık generated kaynakta olan sekiz Sosyal RPC tekrar tanımı kaldırıldı.
- `get_my_tyt_social_exam_policy` boş-object çağrı sözleşmesi ile
  `read_tyt_social_mastery_outcome_state` nullable uygulama projeksiyonu korundu.
  İkisi `Omit` ile generated tanımın yerine geçer; aksi durumda `never` argüman
  ve non-null dönüş ile kesişim özel sözleşmeyi istemeden daraltır.
- Migration 212'nin dört yeni consumer RPC'si yalnız açık yerel overlay'de
  kalır. Henüz uygulanmamış SQL, generated production snapshot'a eklenmez.
- Tip dosyasında bulunmak RPC çağırma yetkisi vermez. Mevcut auth, AAL2,
  actor/tenant sınırları, fail-closed seçim ve rollout kapıları korunur.

[Supabase tip üretimi](https://supabase.com/docs/guides/api/rest/generating-types)
yaklaşımı izlendi: canlı introspection çıktısı ve gerekçeli client override ayrı.

## Yerel doğrulama

- Exact Node 22.23.2; master lockfile ile `npm ci --ignore-scripts` başarılı.
- Tüm mevcut uygulama paketi: 462 dosya, 4.247/4.247 test.
- Sonradan eklenen tip sözleşmesi: ayrı 1 dosya, 4/4 test; sekiz inherited RPC,
  iki bilinçli override ve dört local-only 212 RPC kontrol ediliyor.
- SQL sözleşmeleri: 117 dosya / 657 test geçti; 26 dosya / 226 opt-in test
  atlandı. Atlananlar başarılı gibi sayılmadı.
- Fresh gerçek PostgreSQL 16.15: seçim-epoch kabulü 13/13, sıfır skip;
  localhost-only, boş preload, production credential yok; kendi cluster'ı
  durduruldu. Kanıt sınıfı focused/synthetic; production-equivalent clone değil.
- Son tam TypeScript `--noEmit --incremental false` ve değişen tip dosyalarında
  sıfır-uyarı ESLint geçti. Genel src lint: sıfır hata, kapsam dışı dosyalarda
  21 uyarı; bu uyarılar temizlenmiş gibi gösterilmez.
- Next.js 16.3.4 yerel build: 221/221 statik sayfa, exit 0. Üretim credential'ı
  geçirilmedi; yerel placeholder ve kapalı bayraklar kullanıldı. Module-format
  ve Edge Runtime deprecation uyarıları açık; build başarısı canlı smoke değil.
- Migration lint: 214 dosya; grant/search_path lint ve `git diff --check` temiz.
- Linux-native lockfile sentinel'ları 6/6; package dosyaları master ile aynı.

İlk yoğun paralel SQL koşusunda gold-label CLI vakası hata verdi (656 pass /
1 fail / 226 opt-in skip, hatalı vakanın süresi 7,3 sn). Sonraki tek-worker
incelemede bu vaka geçti, başka CLI vakası 5.000 ms sınırını aştı. Ağır uygulama
koşusu bittikten sonra tam SQL paketi iki worker ile, aynı timeout ve aynı
assertion'larla 657/657 geçti. Kontroller gevşetilmedi; ilk iki hata kaydı saklandı.
İlk npm launcher yolu bulunamadı; doğrulanan npm CLI exact Node 22 ile kullanıldı.

Yerel ignored kanıtlar `secure/entry-preview/` altında:

- `v2-schema-unit-20260908.json`
- `v2-schema-type-contract-20260908.json`
- `v2-schema-db-20260908.json` (ilk başarısız koşu)
- `v2-schema-db-serial-20260908.json` (tam başarılı düşük-paralel koşu)
- `v2-schema-eslint-20260908.json`
- `v2-schema-build-20260908.log`
- `social-epoch-pg16-1788851495078-2b4382f51f/evidence.json`

Migration 212 SHA-256 değişmedi:
`8a6e4d82ad665be9e8e078d62e73356cac66d89ff7635508f723dc4dab47583d`.

## Sonraki yayın kapıları

1. Bu birleşik yerel head için ayrı push/PR yetkisi; Node 22 ve zorunlu CI.
2. Migration 212 için güncel production baseline'a bağlı izole rehearsal.
3. Ayrı yayın yetkisiyle kapalı bayraklar, RPC/app sırası ve bağımsız postcheck.
4. A→B→A seçim yarışı, eski plan değişmezliği ve kayıt/ödül canlı smoke.

Diagnostic 23514, içerik kapsamı, yaş/AI kapıları, deneyim tercihleri, 7–14 günlük
bağımsız ölçüm ve gerçek kurum pilotu bu küçük bakım paketinin dışında açık kalır.
