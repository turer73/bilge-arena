# TYT Sosyal V2 güvenli rollout runbook'u

Bu runbook, adayın cevaplama düzenini ve buna bağlı soru/ustalık kanıtını yöneten
TYT Sosyal V2 akışını canlıya alırken mevcut Sosyal çalışmasını kesmemek için
izlenecek fail-closed sırayı tanımlar. Migration'ların uygulanması, içeriğin
yayıma hazır olduğu veya öğrenci özelliğinin açıldığı anlamına gelmez.

## Rollout bayrakları

| `NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED` | `TYT_SOCIAL_V2_LEARNER_ENABLED` | Durum |
| --- | --- | --- |
| `false` / tanımsız | `false` / tanımsız | Güvenli başlangıç: mevcut öğrenci akışı korunur. |
| `true` | `true` | Yalnız aşağıdaki tüm önkoşullar sonrası izin verilen V2 öğrenci akışı. |
| diğer tüm kombinasyonlar | diğer tüm kombinasyonlar | Hatalı yapılandırma; yayın kabul edilmez ve iki değer de `false` yapılarak yeniden deploy edilir. |

`NEXT_PUBLIC_*` değeri istemci paketine build sırasında gömülür. Değeri
değiştirmek tek başına çalışan deployment'ı değiştirmez; Preview ve Production
için yeni build/deploy zorunludur. İki bayrak her ortamda birlikte yönetilir.
`next.config.mjs` preflight'ı ayrık veya literal olmayan değerlerde build'i
reddeder.

## Önkoşullar

1. Release commit'i ve kaynak bundle SHA-256 değeri birebir doğrulanmış olmalı.
2. Node 22 zorunlu CI tamamen temiz olmalı.
3. Ağsız PostgreSQL 16 uyumluluk rehearsal'ı ve fresh post-204/pre-205
   PostgreSQL 17 exact-chain rehearsal'ı 205–210 için temiz olmalı.
4. Production migration ledger salt-okunur denetimde 205–210'un tamamını eksik
   göstermeli. Kısmi zincir, beklenmeyen ordinal veya hash driftinde işlem durur.
5. Preview ve Production ortamlarında iki rollout bayrağı da açıkça `false`
   olmalı; mevcut deployment fingerprint'i kaydedilmeli.

## Güvenli uygulama sırası

1. Kod, bayraklar kapalıyken deploy edilir.
2. İmzalı kullanıcıyla legacy TYT/LGS Sosyal pratik, Bugünün 15'i, Fethet ve
   Kule akışlarının başladığı doğrulanır. Politika ve resmî bölüm uçları `503`
   dönmelidir.
3. Migration 205–210 sırayla transaction + ledger kaydıyla uygulanır. Her
   migration'dan sonra bağımsız postcheck temiz değilse zincir durur.
4. `NOTIFY pgrst, 'reload schema'` sonrası ledger, RPC grant'leri, RLS ve final
   aggregate tekrar salt-okunur doğrulanır.
5. Bayraklar hâlâ kapalıyken legacy smoke tekrarlanır. Migration'ların mevcut
   öğrenci akışını değiştirmediği kanıtlanır.
6. `din_kulturu` dahil beş kategori için yeterli, yayımlanmış ve kazanımla
   eşlenmiş içerik; iki bağımsız insan incelemesi; immutable provenance ve
   release-integrity kontrolleri tamamlanır. Kapsam bu kanıtlar olmadan
   `validating` durumundan çıkarılmaz.
7. Yalnız release-integrity temizken iki bayrak Preview'da birlikte `true`
   yapılır ve yeniden deploy edilir. Politika seçimi, 5/5/5/5 resmî bölüm,
   normal pratik, günlük plan, kişiselleştirilmiş deneme, mastery ve LGS ayrımı
   uçtan uca sınanır.
8. Preview kanıtı temizse aynı işlem dar Production canary'sinde tekrarlanır;
   yeni deployment fingerprint'i ve smoke çıktıları release kanıtına eklenir.

## Smoke matrisi

- Bayraklar kapalı: politika/resmî bölüm `503`; mevcut TYT ve LGS Sosyal
  çalışmaları politika seçimi istemeden devam eder; deneme 40 soruluk legacy
  çalışma denemesidir; eski Fethet `v1` ilerlemesi görünür.
- Bayraklar açık: anonim TYT Sosyal başlangıcı giriş ister; kullanıcı politika
  seçmeden öğrenci başlangıçları kapalıdır; seçim sonrası resmî bölüm tam 20
  soru ve 5/5/5/5 kompozisyondur; public yanıtta cevap anahtarı, özel varyant,
  snapshot veya hassas seçim nedeni yoktur.
- LGS: her iki bayrak durumunda da LGS profili ve açık `exam_ref=LGS` TYT'ye
  çevrilmez.
- Doğrudan PostgREST: authenticated rol yeni service-only tabloları/RPC'leri
  okuyamaz veya çalıştıramaz; aktör bağı ve RLS testleri temizdir.

## Geri alma

İlk geri alma noktası iki bayrağı Preview ve Production'da birlikte `false`
yapıp yeniden deploy etmektir. Ardından politika/resmî bölüm `503` ve legacy
akış smoke'u doğrulanır. 205–210 additive güvenlik/yönetişim migration'ları
normal rollback sırasında silinmez; veri veya şema geri alma ayrı olay planı ve
ayrı production onayı gerektirir.
