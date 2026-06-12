import type { Metadata } from 'next'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { Navbar } from '@/components/layout/navbar'
import { SubmitQuestionClient } from './submit-client'

export const metadata: Metadata = {
  title: 'Soru Gönder',
  description: 'Bilge Arena soru havuzuna katkıda bulun: kendi sorunu yaz, moderasyondan geçsin, binlerce öğrenciye ulaşsın.',
  robots: { index: false }, // auth-gated araç sayfası
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Soru Gönder | Bilge Arena',
    description: 'Soru havuzuna katkıda bulun.',
  },
}

export default function SubmitQuestionPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-[680px] p-4 md:p-6">
        <h1 className="font-display text-2xl font-black text-[var(--text)]">Soru Gönder</h1>
        <p className="mt-1 text-sm text-[var(--text-sub)]">
          Yazdığın soru moderasyondan geçtikten sonra soru havuzuna eklenir ve
          profilinden durumunu takip edebilirsin.
        </p>
        <SubmitQuestionClient />
      </main>
    </>
  )
}
