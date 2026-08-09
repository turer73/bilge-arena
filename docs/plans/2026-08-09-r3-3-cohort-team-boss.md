# R3.3 — Kohort Takım Bossu Pilotu

**Tarih:** 2026-08-09
**Kapsam:** R3.1 haftalık yakın-rakip kohortunun tek ortak, ödülsüz öğrenme bossu
**Durum:** Yerel uygulama ve doğrulama tamamlandı. Commit/PR, canlı migration, pilot ve deploy yapılmadı.

## Ürün sınırı

R3.3 yeni bir oyun modu, lonca sistemi veya ham-XP yarışı kurmaz. Aynı açık-rızalı `20–30` kişilik R3.1 kohortu, o hafta tek bir **Unutma Ejderi** hedefini birlikte tamamlar. Rekabet ve işbirliği aynı doğrulanmış öğrenme kanıtını kullanır:

- her kullanıcının R3.1 lig katkısı aynı zamanda takım hasarıdır;
- kaynak yalnız `verified_attempt → owned completed game_session → weekly_learning_league_contribution` zinciridir;
- mevcut R3.1 `15/session` ve `30/İstanbul-günü` sınırları aynen korunur;
- boss yeni XP, coin, görev, mastery, seri, rozet, lig puanı veya ödül ledger kaydı üretmez;
- bireysel takım sıralaması, isim/avatar listesi, en az katkı yapan veya eksik üye gösterilmez.

Pilot ayrı varsayılan-kapalı anahtarlara bağlıdır ve R3.1 kapıları açık olmadan çalışmaz:

- `SOCIAL_TEAM_BOSS_ENABLED=false`;
- `NEXT_PUBLIC_SOCIAL_TEAM_BOSS_ENABLED=false`.

## Hedef ve ilerleme

- Takım hedefi: `cohort memberCount × 30` doğrulanmış puan. R3.1 boyutunda hedef `600–900` olur; kişi başına zorunluluk değildir, yalnız takım hedefi formülüdür.
- Ham takım toplamı exact kohortun pozitif contribution satırlarından gelir. Public `progress`, hedefte clamp edilir; hedef sonrası “overkill” rekabeti gösterilmez.
- `remaining = target - progress` ve `progressPercent = floor(progress × 100 / target)`; yüzde `0–100` aralığındadır.
- Aşamalar deterministiktir: ilk üçte `awakening`, ikinci üçte `weakened`, son üçte `critical`, hedefte `defeated`.
- `activeMemberCount`, o hafta en az bir pozitif doğrulanmış katkısı olan kohort üyesi sayısıdır. Başkasının katkı miktarı veya kimliği dönmez.
- `ownerContribution`, yalnız authenticated owner'ın aynı haftaki toplamıdır; `0–210` aralığındadır.
- Aktif hafta tamamlanırsa katkılar donar. R3.1 ile aynı biçimde güncel üyelik yoksa owner'ın en son finalized haftası salt-okunur gösterilebilir.

## Kesin public JSON

```text
{
  status: opted_out | waiting | active | finalized,
  weekStart: YYYY-MM-DD | null,
  boss: null | {
    name: "Unutma Ejderi",
    phase: awakening | weakened | critical | defeated,
    target: integer,
    progress: integer,
    remaining: integer,
    progressPercent: integer,
    defeated: boolean
  },
  team: null | {
    memberCount: integer,
    activeMemberCount: integer,
    ownerContribution: integer
  },
  privacy: {
    cohortOnly: true,
    individualsHidden: true,
    verifiedOnly: true,
    rewardFree: true
  }
}
```

- `opted_out/waiting` durumunda `weekStart`, `boss` ve `team` null'dır.
- `active/finalized` durumunda hafta, boss ve takım birlikte vardır.
- `defeated` yalnız `progress=target`, `remaining=0`, `progressPercent=100` ve `phase=defeated` iken true'dur.
- UUID, user/session/attempt/cohort/membership id, isim, avatar, e-posta, cevap/soru içeriği, client zamanı ve bireysel rakip katkısı yoktur.

## Veritabanı ve API

- Migration 103 yalnız service-role execute yetkili, owner-scoped `get_my_weekly_team_boss(uuid)` SECURITY DEFINER RPC'sini ekler; yeni tablo, trigger veya mutable/reward write eklemez.
- RPC `search_path=pg_catalog`, `auth.uid()` owner guard, exact R3.1 membership/cohort sınırı, `20–30` privacy eşiği ve contribution→membership owner/cohort bütünlük join'i uygular.
- `GET /api/social/league/team-boss`: auth + mevcut sosyal read rate-limit + iki server flag + strict Zod + `Cache-Control: no-store`.
- Hook yalnız owner GET'ini yükler/yeniler; client week/cohort/user/hedef seçemez.
- `/arena/siralama`: R3.1 kartı ve R3.2 spotlarından sonra ortak boss kartını gösterir. İlerleme çubuğu semantik `progressbar`; tamamlanma metni ödül vaat etmez.

## Test ve inceleme kapıları

- Saf sözleşme: strict/null/status tutarlılığı, matematik invariant'ları, bounds, no-ID/no-individual alan.
- Statik SQL: salt-okunur RPC, exact contribution/membership/cohort join'i, hedef/clamp/aşama formülü, owner/ACL ve no reward write.
- Disposable gerçek PostgreSQL: `091+101+103`, opt-out/waiting, 20 üyeli hedef, yalnız trigger üretimli verified katkı, session/day cap mirası, owner katkısı, active member, target öncesi ve defeated clamp, owner mismatch, ACL/RLS.
- API/hook/UI: çift flag fail-closed, auth/rate-limit/no-store, strict payload, loading/error/waiting/active/final/defeated, semantik progressbar ve eski XP ayrımı.
- Gerçek masaüstü/mobil, açık/koyu tema; yatay taşma/kırpılma, en az 44 px retry ve 4.5:1 normal metin kontrastı.
- Hedef/tam Vitest, type-check, scoped/tam ESLint, migration lint, DB `node --check`, `git diff --check` ve bağımsız Terra P0/P1 kapanış incelemesi.

## Yerel doğrulama kanıtı (2026-08-09)

- R3.3 hedef uygulama paketi `5/5` dosya ve `25/25` test; R3.3 statik DB paketi `4/4` test geçti.
- Disposable gerçek PostgreSQL koşusu `091+101+103` zincirinde `3/3` geçti: opted-out/waiting null yüzeyleri, yalnız 101 trigger'ından gelen katkılar, günlük/session cap mirası, hedef öncesi ve hedef sonrası clamp, finalized durum, owner mismatch ve service ACL/RLS doğrulandı.
- Tam uygulama paketi `264/264` dosya ve `2645/2645` test; tam DB paketi `20` dosya/`144` test geçti, opt-in gerçek-DB paketleri ortam değişkeni olmayan genel koşuda beklendiği gibi `12` dosya/`57` test skip edildi. R3.3 gerçek-DB paketi ayrıca yukarıdaki disposable koşuda çalıştırıldı.
- Type-check, R3.3 scoped ESLint, migration lint (`106` migration), iki R3.3 DB testinde `node --check` ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- `1280×720` masaüstü ve `390×844` mobil açık/koyu gerçek render kontrolünde yatay taşma veya kırpılma yoktur. En düşük ölçülen normal metin kontrastı koyuda `5.17:1`, açıkta `5.92:1`; retry hedefi `44px`; progressbar `min=0`, `max=600`, `now=450` ve açıklayıcı value text taşır. Ürün kaynaklı konsol hatası görülmedi.
- Bağımsız Terra kapanış incelemesinde P0/P1/P2 bulgusu kalmadı ve inceleme dosya değiştirmedi.

## Canlı kapı ve rollback

Canlı sıra: migration 103 → iki yeni flag kapalı deploy → owner JSON/ACL/RLS smoke → tek küçük açık-rıza kohortu → server flag → UI flag. Rollback iki R3.3 flag'ini kapatır; R3.1/R3.2 ve mevcut XP tablosu çalışmaya devam eder. R3.3 veri veya ödül yazmadığından backfill/veri silme rollback'i yoktur.
