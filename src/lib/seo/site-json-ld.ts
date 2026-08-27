export function createSiteJsonLd(siteUrl: string) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'Bilge Arena',
      alternateName: 'BilgeArena',
      url: siteUrl,
      inLanguage: 'tr-TR',
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#webapp`,
      name: 'Bilge Arena',
      description: 'Oyunlaştırılmış YKS, LGS ve AYT hazırlık platformu. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularıyla öğren, kazan, yüksel!',
      url: siteUrl,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'TRY',
      },
      inLanguage: 'tr',
      // aggregateRating intentionally omitted: no visible rating mechanism.
      author: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      '@id': `${siteUrl}/#organization`,
      name: 'Bilge Arena',
      url: siteUrl,
      logo: `${siteUrl}/logo-horizontal.png`,
      description: 'YKS, LGS ve AYT\'ye hazırlanan öğrenciler için oyunlaştırılmış öğrenme platformu.',
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'iletisim@bilgearena.com',
        contactType: 'customer service',
        availableLanguage: 'Turkish',
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'YKS · LGS · AYT Hazırlık Oyunları',
        itemListElement: [
          { '@type': 'Course', name: 'Matematik', description: 'TYT · AYT-SAY · LGS Matematik soruları — sayılar, geometri, türev, integral', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
          { '@type': 'Course', name: 'Türkçe & Edebiyat', description: 'TYT · AYT-EA · LGS Türkçe soruları — paragraf, dil bilgisi, edebiyat', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
          { '@type': 'Course', name: 'Fen Bilimleri', description: 'TYT · AYT-SAY · LGS Fen Bilimleri soruları — fizik, kimya, biyoloji', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
          { '@type': 'Course', name: 'Sosyal Bilimler', description: 'TYT · LGS Sosyal Bilimler soruları — tarih, coğrafya, felsefe', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
          { '@type': 'Course', name: 'İngilizce (WordQuest)', description: 'YDT İngilizce soruları — vocabulary, grammar, reading', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        ],
      },
    },
  ]
}
