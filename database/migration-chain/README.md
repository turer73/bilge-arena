# Tam migration zinciri

`database/migrations` altındaki dosyalar **dosya adı sırasıyla değil**, `database/migration-order.json`'daki sırayla uygulanır. Zaman damgalı dosyalar (`20261008…`, `20261017…`) sözlük sırasında 201 ile 202 arasına düşer. Üretimde ise 222'den sonra uygulandılar. Zaman damgalı dosyalar sözlük konumunda çalıştırılırsa zincir `20261008183619`'da durur. Hata veren dosyalar atlansa bile 11 fonksiyon (ör. `export_account_data`, `publish_question_content_revision`, `resolve_current_tyt_social_candidate_policy`) eski gövdesine döner, 30 fonksiyon hiç oluşmaz (2026-10-17 ölçümü, PG17). Ayrıntı için derin inceleme 2026-10-15 §4.5'e bakın.

## Parçalar

| Dosya | Görev |
|---|---|
| `../migration-order.json` | Uygulama sırası. Kaynağı `supabase_migrations.schema_migrations` (2026-10-17, salt okuma). |
| `../migration-order.mjs` | Manifest denetimi (lint'te de koşar) ve `--ledger` ile üretim defteri karşılaştırması. |
| `../apply-migration-chain.mjs` | Zinciri boş PostgreSQL'e `psql` ile uygular, sonra üretim parmak iziyle karşılaştırır. |
| `supabase-platform-stub.sql` | Supabase'in hazır verdiği roller, `auth`/`storage`/`extensions` şemaları ve varsayılan yetkiler. |
| `operator/*.sql` | Üretimde migration dışında yapılmış operatör adımlarının taklidi (manifestte `operatorStep`). |
| `function-fingerprint.sql` | `public` fonksiyonlarının imza, gövde md5'i (CR'siz), SECURITY DEFINER, search_path ve ACL bilgisi. |
| `production-functions.txt` | Bu sorgunun üretimdeki çıktısı (2026-10-17, 440 fonksiyon). |
| `known-production-drift.json` | Zincir ile üretim arasındaki açıklanmış farklar. Her giriş hash'e bağlıdır, bayat giriş CI'ı durdurur. |

`status` değerleri:

- `pre-ledger`: defter açılmadan (2026-05-26) önce uygulandı. Sıra sayısaldır; zincirin çalışması için iki istisna var: 004, 003'ten önce; 016b, 017'lerden sonra.
- `ledger`: defter satırı var, sırayı defter versiyonu belirler.
- `ledger-backfill`: defter satırı sonradan yazılmış. Sıranın gerekçesi `note` alanında.
- `unrecorded`: üretimde var ama defter satırı yok. Sıra komşu dosyalardan çıkarıldı ve parmak iziyle doğrulandı.
- `pending`: üretime henüz uygulanmadı. Listenin sonunda durur.

## Yeni migration

1. Dosyaya mevcut her dosyadan sözlükte **sonra** gelen bir ad ver, ör. `223_konu.sql`. Zaman damgası 202_'den önceye düşer; lint bunu `order-lexical-position` ile reddeder.
2. Manifestin sonuna `{ "file": "223_konu.sql", "status": "pending" }` ekle.
3. Fonksiyonu düşürüp yeniden oluşturuyorsan PUBLIC, anon ve authenticated yetkisini `CREATE`'ten sonra açıkça yaz (`function-acl-reset`). `CREATE FUNCTION` ya `OR REPLACE` kullanmalı ya da önünde `DROP FUNCTION` olmalı (`create-function-no-replace`).

## Üretime uygulandıktan sonra

Aynı PR'da ya da hemen ardından manifesti ve parmak izini canlıyla eşitle. İkisi de salt okumadır:

```bash
psql "$SUPABASE_DB_URL" -X -A -F '|' -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version" > /tmp/ledger.txt
node database/migration-order.mjs --ledger /tmp/ledger.txt
```

Komut hangi `pending` girdinin hangi defter satırıyla `ledger` olacağını söyler. Girdiyi güncelle, sonra parmak izini yenile:

```bash
PGOPTIONS='-c default_transaction_read_only=on' psql "$SUPABASE_DB_URL" -X -q -A -t -F '|' -f database/migration-chain/function-fingerprint.sql > database/migration-chain/production-functions.txt
```

Parmak izi yenilenmezse, uygulanan dosyanın değiştirdiği fonksiyonlar CI'da `body-differs` verir. Bu kasıtlıdır: depo, canlının ne olduğunu söylemeye devam etmelidir.

## Yerelde çalıştırma

Boş ve atılabilir bir veritabanı gerekir. Hedef boş değilse koşucu durur.

```bash
MIGRATION_CHAIN_DATABASE_URL=postgres://postgres:postgres@localhost:5432/chain MIGRATION_CHAIN_DATABASE_DISPOSABLE=1 npm run db:chain
```

`--keep-going` hata veren dosyayı atlayıp tüm kırılmaları tek seferde listeler; sonuç yine başarısız sayılır. `--through <dosya>` verilen dosyadan sonra durur.

## Sınırlar

- Karşılaştırma yalnız `public` fonksiyonlarını kapsar. Tablo, politika ve tetikleyici farkı aranmaz. Üretimde `auth.users` üzerinde depoda olmayan `trg_block_disposable_emails` tetikleyicisi de bu yüzden ancak fonksiyonu üzerinden görünür.
- Parmak izi depoya kaydedilen anlık görüntüdür. Üretimde elle yapılan yeni bir değişikliği CI kendiliğinden görmez; yukarıdaki yenileme komutu görür.
- Soru bankası fikstürü (`operator/002_minimal_question_bank.sql`) yayın kapılarını geçecek kadar sentetik soru içerir; üretim verisinin yerine geçmez.
