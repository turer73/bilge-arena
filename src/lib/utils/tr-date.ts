/**
 * TR (Europe/Istanbul) takvim-gunu yardimcilari.
 *
 * Sunucu (Vercel) UTC calisir. Streak / daily-login / gunluk-gorev gibi "gun"
 * mantigi UTC gun-siniriyla hesaplaninca UTC+3 kullanicilar icin kayiyordu:
 * TR gece 00:00–03:00 arasi hala onceki UTC-gunu sayilir → ayni takvim gununde
 * ikinci daily-odul + yapay streak, veya gece oynayanin serisinin haksiz kirilmasi
 * (denetim bulgusu: daily-login double-claim). Bu helper gun-sinirini kullanicinin
 * yerel (TR) gunune gore hesaplar. Turkiye kalici UTC+3'tur (DST yok); yine de
 * saglamlik icin Intl + timeZone kullanilir.
 */

export const TR_TIME_ZONE = 'Europe/Istanbul'

/** Verilen ani TR takvim gunune cevirir: "YYYY-MM-DD". */
export function trDayString(date: Date = new Date()): string {
  // en-CA locale ISO-benzeri YYYY-MM-DD uretir.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Verilen anin ait oldugu TR gununun BASLANGICINI UTC ISO olarak dondurur.
 * TR gun basi = D 00:00 +03:00. Atomik guard karsilastirmalari icin
 * (last_played_at.lt.<this>).
 */
export function trDayStartUtcISO(date: Date = new Date()): string {
  return new Date(`${trDayString(date)}T00:00:00+03:00`).toISOString()
}

/** Verilen anin TR gununun bir onceki TR gunu: "YYYY-MM-DD". */
export function trYesterdayString(date: Date = new Date()): string {
  // TR-ogle demirini kullanarak gun-sinir/DST kenar durumlarindan kacin.
  const anchor = new Date(`${trDayString(date)}T12:00:00+03:00`)
  anchor.setDate(anchor.getDate() - 1)
  return trDayString(anchor)
}
