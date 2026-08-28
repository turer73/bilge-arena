# Profil görünürlüğü ve arkadaş sistemi rollout

Bu değişiklik iki yeni migration içerir:

- `185_profile_visibility_scope.sql`: `private | friends | public` profil hedef kitlesi, viewer-aware profil RPC ve arama sonucu minimizasyonu.
- `186_atomic_friend_requests.sql`: atomik arkadaş isteği RPC'si ve browser rolü için doğrudan friendship DML kapatma.

## Güvenli sıra

1. Uygulama sürümünü dağıt.
   - Profil sayfası 185 öncesinde eski public-only RPC'ye fail-closed fallback yapar.
   - Arkadaş isteği 186 öncesinde yalnız missing-function hatasında eski server-side yola fallback yapar.
2. Migration 185'i uygula.
3. Migration 186'yı uygula.
4. PostgREST schema cache yenilemesini doğrula (`NOTIFY pgrst` migrationlarda bulunur).

Migrationlar uygulanmadan yeni görünürlük tercihi kaydedilemez; UI hata gösterir ve yerel profili değiştirmez. Migration 186 uygulandıktan sonra tarayıcı rollerinin `friendships` tablosuna doğrudan DML yetkisi kalmamalıdır.

## Canlı doğrulama matrisi

Test hesapları gerçek kullanıcı verisi taşımamalıdır.

1. Profil hedef kitlesi:
   - `private`: anon, ilgisiz kullanıcı ve accepted arkadaş 404; sahibi 200.
   - `friends`: anon/ilgisiz/pending 404; sahibi ve accepted arkadaş 200.
   - `public`: anon 200; blocked kullanıcı 404.
2. Metadata:
   - `private` ve `friends` profiller anon istekte kullanıcı adı, XP veya seri sızdırmamalı.
3. Arama:
   - `is_discoverable=false` sonuç üretmemeli.
   - `is_discoverable=true + private/friends` sonuçta gerçek ad ve XP dönmemeli.
4. Arkadaşlık:
   - `public + is_discoverable=false` profil doğrudan bağlantıdan istek kabul edebilmeli; yalnız aramada görünmemeli.
   - A→B ve B→A eşzamanlı istekleri tek pending ilişki üretmeli.
   - blocked/deleted hedefe istek reddedilmeli.
   - yalnız alıcı kabul edebilmeli; yalnız iki taraftan biri silebilmeli.
5. Yetkiler:
   - anon/authenticated `friendships` SELECT/INSERT/UPDATE/DELETE alamamalı.
   - `request_friendship` yalnız service_role tarafından çalıştırılabilmeli.

## Geri dönüş

Uygulamayı önceki sürüme döndürmek 186 sonrasında arkadaş mutasyonlarını bozar; çünkü browser DML kapalıdır. Geri dönüş gerekiyorsa uygulama rollback'i yerine yeni route/RPC düzeltmesi çıkarılmalıdır. Profil verisi için `profile_visibility` kolonu silinmemeli; tercihleri kaybetmek geri döndürülemez kullanıcı kararı kaybı yaratır.
