import type { Metadata } from 'next'
import GirisClient from './giris-client'

export const metadata: Metadata = {
  title: 'Giris Yap',
  description: 'Bilge Arena\'ya Google hesabinla giris yap. Ilerlemenin kaydedilsin, siralamada yerinl al.',
  robots: { index: false, follow: true },
}

export default async function GirisPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <GirisClient
      initialConsentError={error === 'consent_required'
        ? 'Giriş onayı doğrulanamadı veya süresi doldu. Koşulları işaretleyip yeniden deneyin.'
        : null}
    />
  )
}
