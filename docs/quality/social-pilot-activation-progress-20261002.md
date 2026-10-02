# Sosyal keşif pilotu: kapalı canlı altyapı ve açılış kanıtları

## 2 Ekim 2026 durumu

Bu kayıt pilotun öğrenciye açıldığını veya uygulamanın deploy edildiğini söylemez.
Kapsam, 24 adaydan 12 soru sunan tarih/coğrafya/felsefe/sosyoloji keşfidir;
resmî tam TYT tanılama ve hâkimiyet puanı değildir.

- Migration 216 canlı Supabase ledger'ına `20261002103535` ile uygulandı.
- Dosya SHA-256: `18be64e76839937ad5c36c79ded5e445e7df870518e679aea30da6011be711ed`.
- Dört özel tablonun RLS'i açık; anon, authenticated ve service_role doğrudan
  SELECT/INSERT/UPDATE/DELETE yapamıyor. Üç giriş RPC'si yalnız service_role için.
- 0 paket, 0 aday kaydı, 0 oturum, 0 cevap. Gerçek context `enabled=false` dönüyor.
- 4.473 soru kaydının tam satır fingerprint'i önce/sonra aynı:
  `a83dc5361d26ff44618c498c406ab8f8`. Soru yayını/düzeltmesi yapılmadı.
- TYT Sosyal registry hâlâ validating ve diagnostic_enabled=false.
- question-quality@2 yayın kapısı açık kalıyor. 217/218 korumaları değiştirilmedi.
- Supabase güvenlik danışmanı yeni WARN üretmedi. Dört özel tablo için yeni
  INFO, kasıtlı deny-all RLS/no-policy durumudur; doğrudan erişim açılmadı.
  [RLS/no-policy açıklaması](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Uygulama düzeltmesi

MasteryActionCard, tam TYT kapsamı kapalı olsa da bağımsız pilot context'i
destekleniyorsa pilot girişini gösteriyor. Context hata/yükleniyor/kapalı
durumlarında eski hazırlık kartı korunuyor. Diğer dersler ve AYT etkilenmiyor;
tam kapsam yayımlandığında keşif kartı mevcut seviye gösterimini değiştirmiyor.
Bu düzeltme yereldir; GitHub/deploy durumunu ayrıca kontrol etmek gerekir.

## Gerçek testler

- 16/16 native PostgreSQL pilot testi: concurrency, idempotency, sahip ayrımı,
  karantina, pinler, expiry ve 12 cevap bitirme; mastery yazması yok.
- 19/19 native PostgreSQL content governance testi: 217 ve 218 birlikte yüklendi.
- 47/47 pilot API/hook/istemci/mastery kartı testi.
- 101/101 pilot sözleşme/oturum/hazırlık ve kaynak inceleme API/UI testi.
- 94/94 kaynak CLI/taslak/registration/PG-WASM testi.
- Toplam 277 ilgili test; TypeScript, değişen iki dosyanın ESLint'i,
  migration ve SECURITY DEFINER grant kontrolleri geçti.

Yerel Node 24.13.0, kurulu Next 16.3.5; master lockfile Next 16.3.8 ister.
Paylaşılan node_modules junction'ı değiştirilmedi. Bu sonuçlar lockfile ile
kurulmuş Node 22 CI veya üretim tarayıcı kabulü yerine geçmez.

## Güncel içerik teslimi ve gerçek açılış engelleri

Özel `secure/social-pilot-release-20261002/` altında canlı snapshot, DB
UUID/hash'lerine bağlı 24 kaynak görevi, ANTIGRAVITY-START.md ve 216 receipt var.
17 yeni draft + 7 mevcut yayın; 24 soru aktif. Eski yayın pinleri korunuyor.
170 ham model kaydı vardır; 17 draft için yetkili kalite kararı ve insan onayı
yoktur. Ham/model APPROVED etiketi yayın kararı yerine konmadı.

Yeni 24 görev paketinde henüz response.json yok. Eski 17 kaynak raporunun
insufficient_evidence sonucu yeni görevde tamamlanmış kabul edilmiyor.
Kaynak kapsamı/lisans-köken kabulü, gerçek reviewer kimliği ve gereken benchmark
kanıtı olmadan draft'lar yayımlanmayacak; eski kusurlu içerik pilot diye açılmayacak.

Açılış sırası: Antigravity gerçek kaynak raporları → bağımsız içerik/erişim
kontrolü → meşru kaynak ve kazanım kabulü + yetkili kalite kararları → 17
değişmez revizyonun normal yayın akışı → güncel 24 yayımlı pinle paket kabulü
ve release → uygulama deploy → girişli 12 soruluk öğrenci akışı doğrulaması.
Başka ajan/oturum kimliği altında insan imzası, AAL2 beyanı veya gold etiketi
üretilmedi. Opus incelemesi bu turda çalıştırılmadı.
