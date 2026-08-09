# R2.2 — Kontrollü Bilge Koç

**Tarih:** 2026-08-08
**Kapsam:** Aktif, owner'a ait ve süresi geçmemiş doğrulanmış denemelerde standart çoktan seçmeli sorular
**Durum:** Yerel uygulama ve doğrulama tamamlandı; henüz commit/PR, canlı migration, gerçek model çağrısı, pilot veya deploy yapılmadı.

## Pedagojik akış

1. Öğrenci yardım almadan önce seçeneklerden birini kendi ilk denemesi olarak işaretler. Bu seçim normal oyun cevabını göndermez.
2. Koç, seçime ve yalnız onaylı soru/çözüm/kazanım bağlamına dayalı bir **olası yanılgı** ile birinci ipucunu verir; doğru/yanlış sonucu açıklamaz.
3. Öğrenci isterse daha açık ikinci ipucunu alır.
4. Sonraki aşama, aynı yöntemi farklı değerlerle gösteren küçük ve çözülmüş bir örnektir.
5. Asıl sorunun küratörlü çözümü yalnız açık istek ve geçerli aşama zincirinden sonra açılır.
6. DB aynı primary outcome ve exact game/exam kapsamında farklı, aktif ve onaylı bir soruyu transfer sorusu olarak seçer. Öğrencinin cevabı server-side değerlendirilir ve aynı oturumda transfer başarısı kaydedilir.

Koç coin, XP, seri, lig veya görev ilerlemesi üretmez. İlk deneme ve Koç aşamaları normal soru cevabı değildir; transfer sonucu yalnız Koç etkililiği ölçümüdür.

## Güvenlik ve veri sözleşmesi

- İstemci serbest prompt, soru metni, çözüm, outcome veya cevap anahtarı gönderemez; yalnız `attemptId`, `questionId`, aşama, idempotency `requestId`, geçerli imzalı token ve gerekli iki seçim indeksini gönderir.
- `COACH_TOKEN_SECRET` ayrı ve zorunlu anahtardır. Supabase/service-role anahtarı HMAC fallback'i olarak kullanılmaz.
- UI ve route ayrı, varsayılan-kapalı `NEXT_PUBLIC_COACH_ENABLED` / `COACH_ENABLED` kill switch'leriyle açılır. Genel Gemini anahtarı Koç AI'ını tek başına etkinleştiremez; üçüncü taraf çağrı ayrıca varsayılan-kapalı `COACH_AI_ENABLED=true` ister.
- Token user, source attempt, source question, private coach session, sonraki aşama, expiry ve transfer aşamasında transfer sorusuna bağlanır.
- Model yalnız DB'den okunan aktif soru, küratörlü çözüm, topic/category, primary outcome ve sorudaki seçili seçenek metnini görür. Kullanıcı serbest metni ve kimlik verisi modele gönderilmez.
- Hint/yanılgı/örnek çıktısı cevap, seçenek harfi ve asıl sorunun nihai sonucuna karşı yerel koruyucu değerlendirmeden geçer; başarısız çıktı güvenli fallback'e döner.
- Private/RLS kayıtlar ilk seçimi değiştirilemez yapar, aşamaları sıralı ve idempotent ilerletir, kaynak/eval/policy/hash bilgisini tutar. Prompt, soru metni ve çözüm kopyası tutulmaz; yalnız güvenli stage 1–3 yanıt snapshot'ı exact replay için saklanır.
- Service role tablo DML yetkisi almaz; yazma yalnız owner/scope doğrulayan `SECURITY DEFINER` RPC'lerden geçer. Raw tablolar istemci rollerine kapalı ve append-only'dir.
- Plausible yalnız game, aşama, sonuç, Koç derinliği ve aynı-session transfer sonucu gibi allowlist alanlarını alır; kimlik, soru, seçim, prompt, token veya metin almaz.

## Kaynak ve değerlendirme

Her görünür Koç aşaması güvenli bir kaynak etiketi taşır: küratörlü içerik, onaylı bağlamdan AI, koruyucu şablon veya onaylı soru bankası. Public yanıt yalnız `evaluationPassed=true` ve sabit politika sürümü taşıyabilir; değerlendirmeden geçmeyen model çıktısı public olmaz.

Model entegrasyonu üçüncü taraf soru içeriği işlemesidir. Canlı pilot öncesi veri işleme/retention/region kararı ve ürün bilgilendirmesi ayrıca onaylanmalıdır. Testler gerçek modele içerik göndermez.

## Test kapıları

- Saf politika: prompt sınırı, kaynak/eval sözleşmesi, cevap sızıntısı, fallback ve public transfer şekli.
- Route: auth/rate limit, ayrı secret, active owner attempt, strict body, ilk deneme, stage/token sırası, idempotent replay, evidence fail-closed, çözüm ve transfer answer leakage sınırı.
- Gerçek PostgreSQL: owner/expiry/membership, immutable ilk seçim, stage concurrency/replay, same-outcome transfer seçimi, append-only, server grading ve ACL/RLS.
- UI: önce deneme, altı basamaklı öğrenci akışı, kaynak etiketi, request kilidi/retry, transfer cevabı, klavye ve dar ekran.
- Hedef testler, tam Vitest, type-check, scoped/tam ESLint, migration lint ve `git diff --check`; son kapı Terra P0/P1 bağımsız incelemesidir.

## Yerel kapanış kanıtı

- Koç uygulama hedefi `6/6` dosya ve `46/46` test; TDK uygunluk paketi `507/507` geçti.
- 099 DB statik testi `5/5`; temiz tek kullanımlık gerçek PostgreSQL entegrasyonu `4/4` geçti. Gerçek koşular önce PostgreSQL'in desteklemediği `min(uuid)` kullanımını, sonra testler arası primary-outcome fikstür sızıntısını ortaya çıkardı; UUID seçimi sıralı tek-satır sorgusuna çevrildi ve test izolasyonu `finally` temizliğiyle kapatıldı. Exact-primary fail-closed ürün kuralı gevşetilmedi.
- Tam Vitest paketi `245/245` dosya ve `2567/2567` test ile geçti. Type-check ve R2.2 scoped ESLint temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- Migration lint `102` migration için temizdir; `git diff --check` geçer.
- Gerçek bileşen ve yerel fixture API yanıtlarıyla 1440×900 masaüstü ve 390×844 mobil tarayıcı akışı denetlendi: ilk deneme, kademeli ipucu, küçük örnek, çözüm ve transfer sırası çalıştı; yatay taşma ve konsol hatası yoktu, etkileşim düğmeleri en az 44 px idi. Canlı migration/auth/model olmadığı için bu, imzalı production backend smoke testi değildir.
- Terra'nın denetiminde gerçek 099 RPC yanıtı ile route şemasındaki sahte `recorded` alanı uyuşmazlığı kapatıldı; canonical replay alanları runtime'da doğrulanır. UUID aggregate ve test izolasyonu düzeltmelerinden sonraki salt-okunur kapanış incelemesinde P0/P1 kalmadı ve Terra `APPROVED` verdi.

## Canlı sınır ve rollback

Canlı migration, model anahtarı/politika onayı, küçük pilot, source/fallback/error oranı ve transfer başarısı izlemi ayrı yetki ister. Rollback önce `NEXT_PUBLIC_COACH_ENABLED`, `COACH_ENABLED` ve `COACH_AI_ENABLED` bayraklarını kapatır; sonra gerekirse RPC'ler ve 099 tabloları kaldırılır. Normal verified attempt, cevap, mastery ve ödül kayıtları etkilenmez.
