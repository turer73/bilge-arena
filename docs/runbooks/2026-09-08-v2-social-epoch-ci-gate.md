# V2 — Migration 212 PostgreSQL CI kapısı

## Kapsam

8 Eylül 2026, disc 1714. Başlangıç HEAD `0debb88aa78a560a8af027ae4f29889cd2036251`,
dal `fix/v2-social-policy-epoch`, PR #491 taslak. Bu çalışma yalnız yerel CI
bağlantısı, sonuç doğrulayıcısı ve regresyon testlerini kapsar. Uygulama kodu,
212/213 migration gövdeleri, production, bayraklar ve repository ruleset değişmez.
Yeni kod için push/PR güncellemesi veya yayın bu kapsamda yapılmaz.

## Kanıtlanan eksik

[PR CI koşusunda](https://github.com/turer73/bilge-arena/actions/runs/34239261122)
11 zorunlu kontrol geçti; ancak genel `test:db` işi migration 212'nin
`tyt-social-selection-epoch-postgres.integration.test.mjs` dosyasındaki 13 testi
atladı. Gereken URL ve disposable environment değişkenleri sağlanmıyordu.
Yerel 13/13 kabul geçerliydi; GitHub CI'da çalışmış gibi yorumlanamaz.
Migration 213 aynı eksikten etkilenmedi: dedicated diagnostic suite 27/27 koştu.

## Yerel düzeltme

- Ayrı `tyt-social-epoch-postgres` işi: Ubuntu runner, Node 22, PostgreSQL 16,
  yalnız `127.0.0.1:5432` host portuna yayımlanan geçici service.
- Bootstrap yalnız hardcoded job-local PostgreSQL'e bağlanır; production
  bağlantı dizesi/secret almaz. Rastgele 16-hex son ekli, regex ile sınırlanmış
  `bilge_r44_test_...` veritabanı oluşturur. PostgreSQL 16 dışındaki sürüm reddedilir.
- Tek acceptance dosyası bir worker ile çalışır. Vitest hatası shell'i durdurur.
  Ardından bağımsız JSON doğrulayıcı, tek doğru dosyada 13 benzersiz passed
  assertion, 13/13 toplam/başarılı test, sıfır hata/skip/pending/todo ve boş hata
  mesajları ister. Eksik/bozuk/atlanan rapor başarıya dönüştürülmez.
- Beklenen sayı 13 olarak kilitlidir. Acceptance kapsamına test eklendiğinde
  bu sayı ve doğrulayıcı testleri birlikte gözden geçirilmelidir.
- Mevcut zorunlu Build işi yeni kabul işine bağımlıdır. `needs` tek başına yeterli
  değildir: GitHub atlanan zorunlu check'i geçerli sayabilir. Build, iptal edilmemiş
  koşularda dependency sonuçlarını ilk adımda denetler; altı sonucun tamamı exact
  `success` değilse derlemeye başlamadan açıkça hata verir. `continue-on-error` yoktur.
- Ayrı job, diğer PostgreSQL fixture'larıyla şema çakışmasını önler. Genel
  `test:db` içindeki opt-in davranış korunur; gerçek kabulü yeni iş zorunlu kılar.

Kaynaklar: [GitHub PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers),
[required check ve skipped davranışı](https://docs.github.com/en/pull-requests/reference/status-checks).

## Yerel doğrulama sınırı

- YAML parse, inline bootstrap Node sözdizimi ve Git Bash `-n` denetimi geçti.
- İlk yeni contract koşusu 18 testte 11 geçti / 7 başarısız oldu: pozitif test
  raporunda gerçek Vitest alanları eksikti ve workflow için statik URL/npm script
  varsayılmıştı. Test verisi gerçek rapora ve dinamik disposable DB tasarımına
  düzeltildi; üretim veya migration koruması gevşetilmedi.
- Fresh PostgreSQL 16.15 / exact Node 22.23.2 kabulü **13/13**, sıfır skip:
  `secure/entry-preview/social-epoch-pg16-1788882017366-c4bca6f10f/evidence.json`.
  Dokuz test/fixture/migration girdisinin hashleri koşu öncesi–sonrası eşleşti.
  Küme yalnız loopback dinledi, preload boştu, kendi kümesi durduruldu.
- Yeni sonuç doğrulayıcısı bu fresh raporu kabul etti. Önceki gerçek rapor da
  kabul edildi; skip/hata/eksik raporlar negatif contract testlerinde reddedilir.
- Son exact Node 22 koşusunda yeni CI contract paketi **24/24** geçti.
  Genel SQL paketi **119 dosya / 687 test geçti**, **26 dosya / 238 opt-in test
  atlandı**; bunlar PG16 kabul koşusuyla toplanmaz. Raporlar:
  `secure/entry-preview/social-epoch-ci-contract-20260908.json` ve
  `secure/entry-preview/social-epoch-ci-full-sql-20260908.json`.
- Gerçek workflow'dan çıkarılan Build guard'ı Git Bash üzerinde ayrıca
  **16/16** olumlu/olumsuz senaryoda doğrulandı. Kalıcı contract testi Windows
  Git Bash ve Linux `/bin/bash` ayrımını kullanır; guard'ın kopyasını test etmez.
- Değişen JavaScript dosyalarında ESLint, 215 migration için sıra/idempotency
  lint'i, SECURITY DEFINER grant/search_path lint'i ve `git diff --check` temiz.
  Terra'nın son salt-okunur incelemesinde somut blocker yok; Luna contract testlerini
  hazırladı, ana ajan gerçek workflow guard'ı ve platform ayrımını tamamlayıp
  Node 22 üzerinde yeniden çalıştırdı.
- İlk rapor yazımı D: sandbox izni nedeniyle `EPERM` ile başarısız oldu; test
  başarısı tek başına yeterli sayılmadı. İzinli yeniden koşu raporu yazdı ve
  tüm komut sıfır çıkış koduyla tamamlandı. Migration 212/213 içeriği değişmedi.
- Bu, sentetik yerel PG16 kanıtıdır. Docker service'in GitHub üzerinde çalışması,
  yeni Build kapısının remote kabulü ve exact 212→213 PG17 production-baseline
  provası değildir. Yeni head yayımlanıp CI tamamlanmadan disc 1714 canlı kapanmaz.

## Sonraki kapılar

Yeni yerel adayın ayrı push onayı → PR #491 yeni-head CI (212 PG 13/13 ve rapor
kapısı dahil) → güncel baseline'a bağlı PG17 prova → ayrı kontrollü production
onayı ve smoke. Başarılı CI, migrationların canlıya uygulandığını veya V2'nin
tamamlandığını göstermez. Gerçek kurum pilotu/7–14 günlük öğrenme sonucu ayrı kalır.
