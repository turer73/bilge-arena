# R3.2 — Pozitif Öğrenme Sıralamaları

**Tarih:** 2026-08-09
**Kapsam:** R3.1 haftalık yakın-rakip kohortundaki açık-rızalı kullanıcılar
**Durum:** Yerel uygulama, disposable gerçek PostgreSQL doğrulaması, tarayıcı QA'sı ve bağımsız Terra incelemesi tamamlandı. Commit/PR, canlı migration, pilot ve deploy yapılmadı.

## Ürün sonucu

R3.2 ham XP veya tüm-zamanlar hacmi yerine aynı 20–30 kişilik yakın-rakip kohortunda yalnız olumlu öğrenme davranışlarını görünür kılar:

- **En çok gelişen:** doğrulanmış başarı tahmini kendi önceki 28 günlük tabanına göre en çok yükselenler;
- **En düzenli:** haftada en çok farklı İstanbul takvim gününde doğrulanmış çalışma yapanlar;
- **En iyi geri dönüş:** en az yedi günlük doğrulanmış çalışma arası sonrasında aynı hafta en az iki aktif günle dönenler.

Bu yüzey yeni XP, coin, görev, mastery, seri, rozet, lig puanı veya başka ödül üretmez. Negatif sıralama, “en az çalışan”, tam alt tablo veya başkasının devamsızlık süresi gösterilmez.

R3.1 rızası yalnız aynı haftalık kohort içindeki lig ve olumlu başarı spotları için kullanılır. R3.2 ayrıca iki varsayılan-kapalı anahtara bağlıdır:

- `SOCIAL_SPOTLIGHTS_ENABLED=false`: server/API kapısı;
- `NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED=false`: istemci yüzeyi.

Spotlight yüzeyi ancak ilgili R3.1 flag'i de açıksa çalışır; bağımsız biçimde lig rızasını veya kohort sınırını aşamaz.

## Kesin metrik sözleşmesi

Hafta `Europe/Istanbul` takviminde Pazartesi 00:00–sonraki Pazartesi 00:00 aralığıdır. Kaynak yalnız `verified_attempts.completed_at + session_id → owned completed game_sessions` zinciridir. Client zamanı, XP, coin, normal leaderboard, tahmini/yarım attempt ve doğrulanmamış session kullanılmaz.

### En çok gelişen

- Güncel pencere: seçilen lig haftası.
- Taban pencere: lig haftasından önceki 28 gün.
- Uygunluk: güncel pencerede en az `10` cevap ve `2` aktif gün; tabanda en az `20` cevap; gelişim pozitif.
- Her pencerenin küçültülmüş başarı puanı: `(correct + 10) / (answered + 20) * 10000` basis point.
- Değer: `round(current_score - baseline_score)`; UI bunu pozitif yüzde-puan farkı olarak gösterir.
- Sıra: değer azalan; eşitlikte güncel küçültülmüş başarı, aktif gün ve en son PII içermeyen stable hash.

### En düzenli

- Uygunluk: seçilen haftada en az `2` farklı İstanbul takvim gününde doğrulanmış, cevap içeren tamamlanmış session.
- Değer: `activeDays` (`2–7`).
- Sıra: aktif gün azalan. Aynı aktif gün sayısı aynı dense rank'i alır; yalnız görünür ilk üç satırın deterministik sırası stable hash ile çözülür. Hacim/XP eşitlik bozucu değildir.

### En iyi geri dönüş

- Önkoşul: hafta başlangıcından önce en az bir doğrulanmış tamamlanmış session ve son session ile hafta başlangıcı arasında en az `7` tam İstanbul takvim günü.
- Güncel uygunluk: en az `2` aktif gün ve `10` cevap.
- Değer: `activeDays`; ara verilen gün sayısı yalnız uygunluk için kullanılır, yanıta çıkmaz ve sıralamayı büyütmez.
- Sıra: aktif gün, güncel küçültülmüş başarı ve stable hash. Böylece daha uzun süre çalışmamış olmak ödüllendirilmez.

Kullanıcı aynı hafta birden fazla olumlu listede yer alabilir. Yeni kullanıcı, geçmiş session'ı olmadığı için “geri dönüş” sayılmaz.

## Public JSON ve mahremiyet

Owner-scoped RPC/API kesin olarak şu yapıyı döndürür:

```text
{
  status: opted_out | waiting | active | finalized,
  weekStart: YYYY-MM-DD | null,
  boards: {
    improved:   { me: { eligible, rank, value }, entries: Entry[] },
    consistent: { me: { eligible, rank, value }, entries: Entry[] },
    comeback:   { me: { eligible, rank, value }, entries: Entry[] }
  },
  privacy: { cohortOnly: true, positiveOnly: true, verifiedOnly: true, fullTableHidden: true }
}

Entry = { rank, name, avatarUrl, value, isMe }
```

- Her listede deterministik ilk üç ve, uygunsa ilk üç dışında kalan owner satırı vardır; en fazla `4` satır.
- `me.rank/value` uygun değilse `null`; owner'ın uygunluk nedeni veya başkasının eksikliği public yanıta çıkmaz.
- Başka kullanıcının alt sırası, answered/correct/session sayısı, aktif tarihleri, ara süresi veya tam başarı yüzdesi dönmez.
- Block ilişkisi veya sonradan soft-delete kimliği `Gizli Arenacı + null avatar` olarak redakte eder.
- Avatar yalnız tek `/` ile başlayan local yol veya onaylı Supabase public storage / Googleusercontent HTTPS hostundan gelir.
- UUID, session/attempt/cohort/membership id, e-posta, sınav cevabı/içeriği, client zamanı ve ham PII yoktur.

## Veritabanı ve API

- Migration 102, tamamlanmış attempt okumaları için gerekli kısmi `(user_id, completed_at)` indeksini ve `get_my_weekly_learning_spotlights(uuid)` SECURITY DEFINER RPC'sini ekler.
- RPC `search_path=pg_catalog`, owner guard, R3.1 preference/membership/cohort sınırı, soft-delete/block redaksiyonu ve service-role-only execute ACL kullanır; yeni mutable tablo veya reward write oluşturmaz.
- `GET /api/social/league/spotlights`: auth + user rate limit + iki server flag + strict Zod + `no-store`.
- Hook kayıp yanıtı yalnız yeniden GET eder; client user/cohort/week seçemez.
- `/arena/siralama`: iki UI flag açık ve kullanıcı authenticated iken R3.1 kartının altında üç olumlu kart; eski XP tablosu ayrı etiketli kalır.

## Test ve inceleme kapıları

- Saf sözleşme: strict JSON, en fazla 4 satır, no-ID/no-negative-detail, null/eligible tutarlılığı, avatar allowlist.
- Statik SQL: index, source chain, pencere/threshold/formül, cohort/owner/privacy/ACL, no reward write.
- Disposable gerçek PostgreSQL: improved eşikleri ve shrinkage, consistency dense rank, comeback 7 gün/yeni-user reddi, top3+owner, block/deleted/avatar redaksiyonu, owner mismatch ve service ACL/RLS.
- API/hook/UI: iki flag fail-closed, auth/rate-limit/no-store, strict payload, loading/empty/active/final, açıklayıcı pozitif metin ve mevcut XP ayrımı.
- Gerçek masaüstü/mobil/açık-koyu tema kontrolü; yatay taşma, 44 px hedef, semantik heading/list/table ve en az 4.5:1 normal metin kontrastı.
- Hedef/tam Vitest, type-check, scoped/tam ESLint, migration lint, `node --check`, `git diff --check` ve bağımsız Terra P0/P1 kapanış incelemesi.

## Yerel doğrulama sonucu

- Uygulama hedefi `6/6` dosya ve `19/19` test; DB statik sözleşmesi `4/4`; disposable gerçek PostgreSQL `2/2` geçti.
- Tam paket `260/260` test dosyası ve `2623/2623` test geçti. Type-check, hedef ESLint, migration lint (`105` migration), iki DB testinde `node --check` ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- Gerçek PostgreSQL ilk koşusu statik testin kaçırdığı eksik dış `jsonb_build_object` kapanışını yakaladı; SQL ve yapısal regresyon testi düzeltildi. Yabancı kullanıcıya ait session'ın geri dönüş geçmişi sayılmaması da gerçek DB fixture'ıyla kanıtlandı.
- Gerçek tarayıcıda `1280×720` masaüstü ve `390×844` mobil, açık/koyu tema kontrol edildi. Mobil grid kesilmesi `min-w-0` ile düzeltildi; son ölçümde yatay taşma veya metin kesilmesi yoktur. Minimum normal metin kontrastı koyuda `6.47:1`, açıkta `6.70:1`; hata görünümündeki yeniden deneme hedefi `44px` ve `5.17:1`'dir. Semantik bölge/başlık/liste/alert/button yapısı doğrulandı; ürün konsol hatası görülmedi.
- Bağımsız Terra kapanış incelemesinde açık P0/P1 bulunmadı ve inceleme hiçbir dosyayı değiştirmedi.

## Canlı kapı ve rollback

Canlı sıra: migration 102 → iki yeni flag kapalı deploy → ACL/RLS ve owner JSON smoke → küçük açık-rıza pilotu → server flag → UI flag. Rollback önce iki R3.2 flag'ini kapatır; R3.1 ligi ve mevcut XP tablosu çalışmaya devam eder. R3.2 yeni veri/ödül yazmadığı için veri silme veya backfill rollback'i yoktur.
