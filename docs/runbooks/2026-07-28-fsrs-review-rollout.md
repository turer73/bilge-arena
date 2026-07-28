# FSRS genel quiz kademeli yayilim runbook'u

Bu runbook yalniz genel quiz review karisimi ve `Yanlislarim` due rozetlerini
kapsar. `Bugunun 15'i` gunluk plani mevcut urun karari geregi bu rollout'tan
bagimsizdir.

## Ortam degiskenleri

- `FSRS_REVIEW_ENABLED`: ana anahtar. Yalniz `true` degeri acik sayilir.
- `FSRS_REVIEW_ROLLOUT_PERCENT`: `0..100` tam sayi. Gecersiz deger `0` olur.
- `FSRS_REVIEW_KILL_SWITCH`: `true` ise diger iki ayardan bagimsiz kapatir.

Ayarlar server-only'dir. Eksik veya gecersiz konfigurasyon fail-closed davranir.
Ayni kullanici deterministik olarak ayni `0..99` kohortunda kalir.

Vercel ortam degiskeni degisikligi yeni deployment gerektirir. Acil geri donuste
`FSRS_REVIEW_KILL_SWITCH=true` ayarlanip production yeniden deploy edilmelidir.

## Onerilen asamalar

1. Kod deployment'i: `ENABLED=false`, yuzde `0`.
2. Ic smoke: `ENABLED=true`, yuzde `5`; en az bir due ve bir not-due kullanici.
3. Yuzde `25`: 24 saat hata/latency ve quiz tamamlama takibi.
4. Yuzde `50`: 48 saat ayni takip ve ogrenci geri bildirimi.
5. Yuzde `100`: legacy 7-gun yolunun kaldirilmasi ayri PR olarak degerlendirilir.

Her yuzde degisikliginde ayni build kullanilmali; boylece kod ve kohort etkisi
birbirine karismaz.

## Kontrol listesi

- `/api/questions/random?includeReview=true` 5xx ve p95 gecikmesi artmiyor.
- Due sorusu olmayan FSRS kullanicisina legacy soru enjekte edilmiyor.
- FSRS okuma/fold hatasinda istek 200 kalip 7-gun fallback calisiyor.
- Skip cevaplar due kartini veya `Yanlislarim` son durumunu degistirmiyor.
- `Yanlislarim` icin `isDue/dueAt` kohortta dolu, kontrol grubunda `null`.
- Quiz baslatma/tamamlama ve gunluk geri donus oranlari kontrol grubuyla
  karsilastiriliyor; nitel geri bildirim ayrica kaydediliyor.

## Geri alma

1. `FSRS_REVIEW_KILL_SWITCH=true` ayarla.
2. Production deployment baslat.
3. Random quiz smoke yap; review havuzunun legacy 7-gun yoluna dondugunu dogrula.
4. Hata kayitlarini ve etkilenen zaman araligini incele.

Bu rollout veritabani yazma yolu veya migration icermedigi icin geri alma veri
duzeltmesi gerektirmez.
