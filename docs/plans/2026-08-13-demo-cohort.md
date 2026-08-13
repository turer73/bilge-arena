# Bilge Tahta dar demo kohortu

## Erisim modeli

- Kullanici kimlikleri public JavaScript paketine veya `NEXT_PUBLIC_*` ortam degiskenlerine yazilmaz.
- `BILGE_TAHTA_PILOT_ENABLED=true`, yalniz sunucu tarafindaki kohort kontrolunu acar.
- `BILGE_TAHTA_PILOT_INSTITUTION_ID`, erisimi tek bir demo kurumuyla sinirlar; eksik veya gecersizse erisim kapali kalir.
- Erisim, production veritabanindaki aktif Institution Lite uyeligi ve bu ozel kurum kimligiyle kanitlanir.
- Uye olmayan ve oturum acmamis kullanicilar ayni `{ "enabled": false }` yanitini alir.
- `NEXT_PUBLIC_BILGE_TAHTA_ENABLED=true` tum kullanicilara acik onizleme bayragidir ve dar production demosunda kapali tutulur.

## Demo kurulumu

1. Tam eslesen hesaplardan biri kurum yoneticisi, en fazla besi ogretmen olarak secilir.
2. Demo kurumu mevcut idempotent Institution Lite RPC'leriyle olusturulur; dogrudan tablo yazimi yapilmaz.
3. `BILGE_TAHTA_PILOT_ENABLED=true` ve demo kurumunun `BILGE_TAHTA_PILOT_INSTITUTION_ID` degeri production ortaminda etkinlestirilir.
4. Bir kohort uyesi ve bir uye olmayan hesapla erisim testi yapilir.
5. Ders Calis ve oyun akisi 320, 375 ve 390 px genisliklerde smoke testten gecirilir.

## Geri alma

Ilk geri alma noktasi `BILGE_TAHTA_PILOT_ENABLED=false` yapmaktir. Bu, uyelik verisini silmeden Bilge Tahta kohort erisimini kapatir. Kurum pilotu da durdurulacaksa `INSTITUTION_PILOT_ENABLED=false` ayrica uygulanir; uye silme veya migration geri alma normal rollback adimi degildir.
