/**
 * Premium / Monetizasyon Feature Flag'leri
 *
 * Tum premium altyapisi bu sabitler uzerinden kontrol edilir.
 * Aktif etmek icin ilgili flag'i true yapin.
 *
 * NOT: Tum flag'ler varsayilan olarak KAPALI.
 */

export const FEATURES = {
  /** Gunluk quiz limiti (free: 5/gun). false iken herkes sinirsiz oynar. */
  QUIZ_LIMIT: false,

  /** Reklam banner'lari (lobby + sonuc ekrani). false iken reklamlar gizli. */
  ADS: true,

  /** Premium upsell modali (limit dolunca gosterilir). false iken gosterilmez. */
  PREMIUM_UPSELL: false,
} as const

// ---------- Sabitler ----------

/** Free kullanici gunluk quiz limiti */
export const FREE_DAILY_LIMIT = 5

/** Premium fiyat bilgisi (gosterim icin) */
export const PREMIUM_PRICE = {
  monthly: 49.90,
  yearly: 399.90, // aylik 33.3 TL
  currency: 'TRY',
  label: {
    monthly: '₺49,90/ay',
    yearly: '₺399,90/yıl',
    yearlySaving: '%33 indirim',
  },
} as const

/** Premium ozellikleri listesi */
export const PREMIUM_FEATURES = [
  { icon: '♾️', title: 'Sınırsız Quiz', description: 'Günlük limit olmadan istediğin kadar çöz' },
  { icon: '🚫', title: 'Reklamsız Deneyim', description: 'Hiçbir reklam görmeden odaklan' },
  { icon: '🤖', title: 'Sınırsız Bilge Asistan', description: 'AI asistanla sınırsız sohbet' },
  { icon: '📊', title: 'Detaylı Analiz', description: 'Konu bazlı zayıf/güçlü yön analizi' },
  { icon: '🏆', title: 'Özel Rozetler', description: 'Premium üyelere özel rozetler' },
  { icon: '⚡', title: 'Erken Erişim', description: 'Yeni özellikler herkesten önce' },
] as const
