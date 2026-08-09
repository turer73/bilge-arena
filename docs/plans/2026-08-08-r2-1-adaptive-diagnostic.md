# R2.1 — Kısa Adaptif Tanılama

**Tarih:** 2026-08-08
**Kapsam:** İlk pilot yalnız `matematik + TYT + ba-tyt-math-v1`
**Durum:** Tasarım, yerel uygulama, Sol doğrulaması ve bağımsız Terra incelemesi tamamlandı; canlı migration/deploy yetkisi verilmedi.

## Amaç

Öğrencinin altı TYT Matematik kazanımını kısa, cevap anahtarı sızdırmayan ve sonuçları açıklanabilir bir akışla yoklamak; ilk tanılamadan sonra aynı kazanım için soruyu yanıta göre bir kademe kolaylaştırıp zorlaştırmak ve sonraki tarihte yeniden tanılama sunmak.

Bu akış bir ödül oyunu değildir. Coin, XP, seri, lig ve görev ilerlemesi üretmez. Tanılama sonucu normal çalışma kanıtından ayrı tutulur ve öğrenciye düşük güvenli bir başlangıç tahmini olarak gösterilir.

## Kanonik politika

- Oturum en fazla `10` sorudur ve `30` dakika geçerlidir.
- İlk geçişte altı aktif outcome'un her biri en az bir kez yoklanır.
- Kalan dört soru, oturum içindeki en zayıf ve henüz yalnız bir kez ölçülmüş outcome'lara gider; bir outcome aynı oturumda en fazla iki kez ölçülür.
- İlk hedef zorluk `3` olur. Yeniden tanılamada son önerilen zorluk kullanılabilir.
- İlk yanıttan sonra doğruysa hedef zorluk bir artar, yanlışsa bir azalır; sonuç `1..5` aralığında tutulur.
- Seçim yalnız aktif, exact scope içinde, aktif outcome'a eşlenmiş ve oturumda daha önce sorulmamış sorulardan yapılır. Hedef zorluğa en yakın soru seçilir; eşitlik oturum seed'i ile kararlı biçimde çözülür.
- Bir outcome için uygun ikinci soru yoksa politika sıradaki outcome'u dener. Altı outcome kapsanamıyorsa oturum başlatılmaz; yarım veya yanıltıcı kapsam başarı gibi gösterilmez.
- Soru sırasında doğru seçenek, çözüm ve ipucu açılmaz. Özet yalnız oturum tamamlandıktan sonra görünür.

## Veri ve güvenlik sözleşmesi

`098_adaptive_diagnostic.sql` şu özel kayıtları ekleyecektir:

- `adaptive_diagnostic_sessions`: kullanıcı/scope/kind, durum, bağlı güncel soru, sayaçlar, süre ve tamamlanma zamanı.
- `adaptive_diagnostic_answers`: append-only soru/outcome/zorluk/doğruluk/süre kanıtı, istek idempotency anahtarı ve replay snapshot'ı.
- `user_diagnostic_outcome_state`: son tamamlanmış tanılamadan açıklanabilir skor, önerilen zorluk ve zaman.

Tüm tablolar RLS altında ve istemci rollerine kapalıdır. Service role tablo DML yetkisi almaz; yalnız owner ve scope doğrulayan `SECURITY DEFINER` RPC'ler üzerinden yazar. Fonksiyonlar sabit `pg_catalog` search path, satır kilidi, exact scope, aktif soru, tek outcome mapping, süre, sıra, tekrar ve idempotency kontrollerini uygular.

Seçilen seçenek saklanmaz. API soruyu server tarafında değerlendirir ve DB'ye yalnız doğrulanmış boolean kanıtı geçirir. Kamu yanıtı user/outcome UUID'lerini, tamamlanmış oturumların iç kimliklerini, cevap anahtarını, çözümü veya iç tablo alanlarını içermez; aktif akışta istemciye yalnız opaque tanılama oturum kimliği ve public soru kimliği verilir.

## API ve ürün akışı

- `GET /api/study/diagnostic?game=matematik&exam_ref=TYT`: destek, aktif oturum veya son özet.
- `POST /api/study/diagnostic` + `action=start`: tam kapsamı doğrular, aktif oturumu sürdürür veya yeni ilk/recheck oturumu açar.
- `POST /api/study/diagnostic` + `action=answer`: bağlı soruyu server-authoritative değerlendirir, cevabı atomik kaydeder ve bir sonraki public soruyu döndürür.
- `/arena/tani`: giriş kapısı, tek-soru akışı, erişilebilir ilerleme ve tamamlanınca outcome özeti.
- `/arena/calisma`: tanılama başlangıç/sürdürme bağlantısı. Tamamlanan özet en zayıf category için mevcut practice akışına CTA verir.

Pilot dışındaki game/exam/taxonomy kombinasyonları açık `unsupported` döner; sessiz legacy fallback yoktur.

## Test ve onay kapıları

- Saf politika: altı outcome kapsama, adaptif zorluk, iki-soru sınırı, zayıf outcome önceliği, aday yokluğu ve kararlı seçim.
- Gerçek PostgreSQL: ilk/recheck, tek aktif oturum, expiry, owner/scope, idempotent replay, eşzamanlı cevap, append-only, özet upsert ve ACL/RLS.
- Route: auth/rate limit, strict body, answer gizliliği, server grading, stale/replay ve fail-closed bütünlük.
- UI: giriş, resume, progress, cevap gönderme kilidi, hata, summary, CTA, klavye ve dar ekran.
- Hedefli testler, tam Vitest, type-check, scoped ESLint, migration lint ve `git diff --check`.
- Terra bağımsız incelemesinde P0/P1 kalmamalı.

## Yerel doğrulama kanıtı

- Uygulama hedef grubu: `7/7` dosya ve `55/55` test; tam paket `244/244` dosya ve `2563/2563` test.
- DB statik sözleşme: `4/4`; disposable gerçek PostgreSQL: `5/5`.
- Type-check, scoped ESLint, migration lint (`101` migration) ve `git diff --check` temiz. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- Chrome masaüstü ve `390x844` mobil giriş kapısı kontrolünde yatay taşma/kırpılma görülmedi; mobil ana CTA yüksekliği `44px`, console error `0`.
- İmzalı aktif oturum tarayıcı akışı, migration canlı ortama uygulanmadığı için çalıştırılmadı; bu akış route/hook/UI testleriyle doğrulandı.
- Terra salt-okunur bağımsız incelemede P0/P1 bulmadan `APPROVED` verdi.

## Canlı sınır ve rollback

Canlıya geçiş; migration, coverage snapshot, küçük kullanıcı pilotu, hata/terk oranı gözlemi ve rollback için ayrıca onay ister. Rollback önce route/UI feature flag'ini kapatır; okuyucular durduktan sonra RPC ve tanılama tabloları kaldırılır. Tanılama kanıtı normal mastery evidence ile birleştirilmediği için rollback, mevcut öğrenme geçmişini silmez.
