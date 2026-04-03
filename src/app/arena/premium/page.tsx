import type { Metadata } from 'next'
import PremiumClient from './premium-client'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bilgearena.com').trim()

/* ─── SEO Metadata ─── */
export const metadata: Metadata = {
  title: 'Premium — Sınırsız YKS Hazırlık',
  description:
    'Bilge Arena Premium ile sınırsız quiz çöz, reklamsız öğren, AI asistandan sınırsız destek al. 7 gün ücretsiz dene!',
  keywords: [
    'Bilge Arena Premium', 'YKS premium', 'sınırsız soru çöz',
    'reklamsız öğrenme', 'YKS hazırlık abonelik',
  ],
  alternates: {
    canonical: `${siteUrl}/arena/premium`,
  },
  openGraph: {
    title: 'Bilge Arena Premium — Sınırsız YKS Hazırlık',
    description: 'Sınırsız quiz, reklamsız deneyim, AI asistan. 7 gün ücretsiz dene!',
    url: `${siteUrl}/arena/premium`,
    images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: 'Bilge Arena Premium' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena Premium — Sınırsız YKS Hazırlık',
    description: 'Sınırsız quiz, reklamsız deneyim, AI asistan. 7 gün ücretsiz dene!',
    images: [`${siteUrl}/og-image.png`],
  },
}

/* ─── FAQ Schema (Google SERP zengin sonuc) ─── */
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Bilge Arena Premium ücretsiz deneme nasıl çalışır?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '7 gün boyunca tüm Premium özellikleri ücretsiz kullanabilirsiniz. İstediğiniz zaman iptal edebilirsiniz, ücret alınmaz.',
      },
    },
    {
      '@type': 'Question',
      name: 'İstediğim zaman iptal edebilir miyim?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Evet! Profil ayarlarından tek tıkla iptal edebilirsiniz. Kalan süreniz sonuna kadar devam eder.',
      },
    },
    {
      '@type': 'Question',
      name: 'Hangi ödeme yöntemlerini kabul ediyorsunuz?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Kredi kartı, banka kartı ve mobil ödeme yöntemlerini kabul ediyoruz.',
      },
    },
    {
      '@type': 'Question',
      name: 'Bilge Arena Premium ne sunar?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sınırsız quiz çözme, reklamsız deneyim, sınırsız AI asistan, detaylı konu analizi, özel rozetler ve yeni özelliklere erken erişim sunar.',
      },
    },
  ],
}

export default function PremiumPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <PremiumClient />
    </>
  )
}
