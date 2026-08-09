# R3.1 — Yakın Rakipli Haftalık Öğrenme Ligleri

**Tarih:** 2026-08-08
**Kapsam:** Açık rıza veren ve son 28 günde doğrulanmış öğrenme oturumu bulunan kullanıcılar
**Durum (2026-08-09):** Tasarım, yerel uygulama, disposable gerçek PostgreSQL doğrulaması, masaüstü/mobil/erişilebilirlik kontrolü ve bağımsız Terra kapanış incelemesi tamamlandı. Commit/PR, canlı migration, cron aktivasyonu, pilot ve deploy yapılmadı.

## Ürün sonucu

Mevcut global ham-XP sıralaması pilot açıkken yeni ligin veri kaynağı olmaz. R3.1:

- kullanıcıyı hedef sınavı, mevcut lig kademesi ve son 28 günlük doğrulanmış başarı düzeyi yakın olan 20–30 kişilik haftalık bir kohorta yerleştirir;
- yalnız `verified_attempts → completed game_sessions` zincirinden gelen öğrenme katkılarını puanlar;
- ilk üç için yükselme, son üç için düşme bölgesi üretir;
- alt sıralardaki başka kullanıcıların kimliğini ve tam tablosunu göstermez;
- ham XP, coin, mastery, seri, görev ve ödül ekonomisini değiştirmez.

Pilot iki ayrı varsayılan-kapalı anahtara bağlıdır:

- `SOCIAL_LEAGUE_ENABLED=false`: cron/API sunucu kapısı;
- `NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED=false`: istemci yüzeyi.

## Açık rıza ve mahremiyet

`profiles.is_discoverable` arkadaş arama rızasıdır; lig rızası olarak yeniden yorumlanmaz. Ayrı private tercih kaydı varsayılan `opted_in=false` başlar. Katılım ekranı şu sonucu açıkça söyler: haftalık ligde seçilen profil adı/avatarı yakın rakiplere görünür; ayrılma sonraki hafta için geçerlidir, başlayan haftanın audit kaydı silinmez.

Lig ham tabloları anon/authenticated rollere kapalıdır. Owner-scoped public RPC yalnız şunları döndürür:

- kendi sıra, puan, bölge ve kademe bilgisi;
- yükselme bölgesindeki ilk üç satır;
- kendi etrafındaki en fazla iki üst ve iki alt yakın rakip;
- son üçteki başka kullanıcılar için ad/avatar/satır yok;
- block ilişkisindeki bir rakip için kimlik yerine sabit `Gizli Arenacı` etiketi;
- user/session/attempt/cohort UUID veya e-posta/şehir/sınıf gibi PII yok.

Kullanıcı son üçteyse kendi tam sıra ve düşme durumu yalnız kendisine gösterilir. Katılımcı olmayan veya kohorta giremeyen kullanıcı başka lig verisi göremez.

## Haftalık kohort sözleşmesi

Hafta sınırı `Europe/Istanbul` takviminde Pazartesi 00:00–sonraki Pazartesi 00:00'dır. Yetkili haftalık cron tek idempotent RPC çağırır:

1. Önce biten haftayı finalize eder ve immutable final rank/zone değerlerini yazar.
2. Finalize edilen, en az 20 üyeli kohortlarda ilk üçü bir kademe yükseltir; son üçü `bronz` dışında bir kademe düşürür.
3. Yeni hafta adaylarını `exam_type` (`null` mevcut ürün sözleşmesi gereği `yks`), güncel kademe ve son 28 günlük doğrulanmış skill score'a göre sıralar.
4. Skill score küçük örneklemi %50 önsele çeken sabit formüldür: `(correct + 10) / (answered + 20) * 10000` basis point.
5. Her partition mümkün olduğunda 20–30 kişilik kohortlara bölünür. 20'den az kalan kullanıcı `waiting` kalır; 30'dan büyük kohort oluşturulmaz.
6. Eşitlikler yalnız deterministik, PII olmayan stable hash ile çözülür. Cron replay'i aynı membership'leri döndürür; ikinci satır üretmez.

Kademe sırası `bronz → gümüş → altın → elmas`tır. İlk katılım `bronz` başlar. Bir hafta ortasında opt-in olan veya yeterli geçmişi olmayan kullanıcı sonraki formasyonu bekler.

## Doğrulanmış lig puanı

Yeni bir append-only contribution satırı yalnız tamamlanmış ve bağlanmış doğrulanmış session için trusted trigger/RPC tarafından yazılır:

- session başına en fazla 15 doğru cevap puanı;
- İstanbul takvim gününde kullanıcı başına en fazla 30 puan;
- aynı `session_id` yalnız bir kez katkı verir;
- yalnız aktif haftadaki immutable membership'e yazılır;
- contribution zamanı server-side `verified_attempts.completed_at`/DB receipt'tir;
- istemci puan, zaman, session veya kullanıcı seçemez.

Günlük tavan aynı kullanıcının membership satırı kilitlenerek concurrency-safe hesaplanır. Sıra `points DESC`, `active_days DESC`, `last_contribution_at ASC`, ardından stable hash ile belirlenir. Puan ayrı bir sosyal ölçümdür; `profiles.total_xp`, coin veya ödül ledger'ına yazılmaz.

## API ve UI

- `POST /api/social/league/preference`: authenticated owner için strict boolean opt-in/opt-out; CSRF korumalı ve user rate-limitli.
- `GET /api/social/league`: authenticated owner'ın bekleme/aktif/final durumu ve privacy-safe görünür satırları; `no-store`.
- `GET /api/cron/weekly-learning-leagues`: zorunlu `CRON_SECRET`, server kill switch ve tek idempotency request UUID ile finalize + formasyon.
- `/arena/siralama`: UI flag açıkken “Yakın Rakip Ligi” sekmesi; kapalıyken mevcut haftalık/genel ekran aynen korunur.

UI; açık rızayı geri alınabilir bir kontrolle, veri kaynağını “yalnız doğrulanmış öğrenme”, günlük 30 puan tavanını, yükselme/düşme bölgelerini ve alt sıraların gizliliğini açıklar. Loading, opted-out, waiting, active, finalized ve error durumları klavye/ekran okuyucu sözleşmesiyle ayrı gösterilir.

## Güvenlik ve fail-closed kuralları

- Raw league tablolarında RLS açık; PUBLIC/anon/authenticated ve service-role için doğrudan INSERT/UPDATE/DELETE/TRUNCATE yok.
- Yazma yalnız owner preference, trusted verified-contribution ve cron formation/finalization definer fonksiyonlarından geçer.
- RPC'ler `search_path=pg_catalog`, owner/scope/hafta/statü kontrolleri ve advisory/row lock kullanır.
- Cron secret yoksa veya iki feature flag'den ilgili olan kapalıysa hiçbir cohort/terfi/düşme yazılmaz.
- Aynı session, cron request veya hafta replay'i canonical sonucu döndürür.
- Eski `leaderboard_weekly` ve mevcut API pilot kapalıyken davranış değiştirmez.

## Test kapıları

- Saf kohort bölme: 0/19 bekler; 20/30 tek kohort; 31–39 en fazla 30 + bekleyen; 40–60 iki geçerli kohort; partition sınırları karışmaz.
- Gerçek PostgreSQL: opt-in default-off, 28 günlük eligibility, stable grouping, 20–30 sınırı, cron replay, tier finalize, owner/ACL/RLS, block redaction.
- Katkı: doğrulanmamış session reddi, session idempotency, 15/session ve 30/gün tavanı, concurrency, hafta sınırı, ödül/XP değişmezliği.
- API: default-off, auth, strict body, forged user/session/score reddi, rate limit ve `no-store`.
- UI: opt-in metni, waiting/active/final durumları, yalnız görünür satırlar, kendi düşme uyarısı, mobil/masaüstü taşma ve a11y.
- Hedef/tam Vitest, type-check, scoped/tam ESLint, migration lint, `git diff --check`, disposable gerçek PostgreSQL ve Terra P0/P1 kapanış incelemesi.

## Yerel kapanış kanıtı — 2026-08-09

- Uygulama hedefi 6 test dosyasında `17/17`; migration 101 statik DB sözleşmesi `4/4`; disposable gerçek PostgreSQL senaryosu `2/2` geçti. Gerçek-PG senaryosu tercih replay/mismatch, 19/20/31/40 kohort paketleme, formation replay, `15/session` ve `30/İstanbul-günü` tavanı, katkı idempotency/no-XP, terfi, mahremiyet redaksiyonu ve ACL/RLS sınırlarını kapsar.
- Tam Vitest paketi `256/256` dosya ve `2609/2609` testle geçti. `npm run type-check`, R3.1 scoped ESLint, migration lint (`104` migration), iki DB testinde `node --check` ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- Gerçek tarayıcıda 1440×900 masaüstü ve 390×844 mobil aktif/opt-out/kendi-düşme durumları incelendi: yatay taşma/kırpılma yok, tablo ve region/heading semantiği doğru, hedefler en az `44 px`. Durum geçişleri ayrı yerel fixture URL'leriyle görsel olarak; onay kutusu/düğme davranışı component testiyle doğrulandı. İn-app tarayıcı etkileşim katmanı yerel React handler'larını tetiklemediği için gerçek tıklama sonucu browser kanıtı olarak ileri sürülmez.
- İlk ölçümde puan metninde `2.87–3.53:1` kontrast açığı bulundu ve `--focus-text` semantik tonu ile düzeltildi. Son ölçüm koyu temada en az `5.24:1`, açık temada en az `4.76:1`; puanlarda `5.83–7.17:1` verdi. Konsolda ürün hatası yoktur; yalnız analitik betiğinin beklenen localhost-yoksay uyarısı vardır.
- Terra'nın son salt-okunur incelemesinde açık P0/P1 kalmadı ve R3.1 yerel onaya uygun bulundu. Varsayılan-kapalı iki feature flag korunur; `vercel.json` cron aktivasyonu özellikle yapılmadı.

## Canlı kapı ve rollback

Canlı sıra: migration → iki flag kapalı deploy → ACL/RLS/cron dry-run → küçük açık-rıza pilotu → server flag → UI flag. Rollback önce UI ve server flag'lerini kapatır; yeni contribution durur, eski global sıralama aynen kalır. Audit/membership/contribution satırları silinmez; cohort statüsü `cancelled` olarak ileri migration/RPC ile kapatılır.
