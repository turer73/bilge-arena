/** Coin/XP ödül sabitleri (tek yer — denge ayarı buradan). */

/** Onaylanan UGC sorusu başına gönderene verilen coin ödülü. */
export const UGC_APPROVAL_COIN_REWARD = 50

/**
 * Kabul edilen hata raporu başına raporlayana verilen coin ödülü.
 *
 * Ölçek bilinçli olarak yüksek: mağazadaki en uygun profil arka planı 1200
 * coin, yani beş kabul edilen bildirim bir arka plan ediyor. Bugüne kadar
 * gelen iki raporun ikisi de tek soruyu değil sistemik bir kusuru ortaya
 * çıkardı (131 soruluk kategori sapması ve 54 soruluk üs/alt indis yazım
 * karmaşası); bu sinyalin bize kazandırdığının yanında ödül ucuz kalıyor.
 *
 * DB tarafındaki üst sınır 300 (migration 128) — buradaki değer o sınırı
 * aşmamalı.
 */
export const ERROR_REPORT_COIN_REWARD = 250
