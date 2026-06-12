/**
 * OpenGraph zorunlu alanları (og:type, og:locale, og:site_name).
 *
 * Next.js Metadata API'de sayfa-seviyesi `openGraph` tanımı layout'unkini
 * KOMPLE ezer (shallow-merge — alan bazında birleşmez). Bu yüzden kendi
 * openGraph'ını tanımlayan HER sayfa bu defaults'u spread etmeli:
 *
 *   openGraph: { ...OG_DEFAULTS, title: '...', ... }
 */
export const OG_DEFAULTS = {
  type: 'website',
  locale: 'tr_TR',
  siteName: 'Bilge Arena',
} as const
