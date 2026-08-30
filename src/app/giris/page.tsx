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
  searchParams: Promise<{ deleted?: string; error?: string }>
}) {
  const { deleted, error } = await searchParams
  const initialAccountNotice = deleted === '1'
    ? {
        kind: 'deleted' as const,
        message: 'Bu hesabın uygulama profili kapatılmıştır. Aynı hesapla yeniden giriş yapılamaz; farklı bir Google hesabı seçebilirsiniz.',
      }
    : error === 'account_unavailable'
      ? {
          kind: 'unavailable' as const,
          message: 'Hesap durumu şu anda doğrulanamıyor. Verilerinizi korumak için giriş geçici olarak durduruldu; lütfen daha sonra yeniden deneyin.',
        }
      : null
  return (
    <GirisClient
      initialConsentError={error === 'consent_required'
        ? 'Giriş onayı doğrulanamadı veya süresi doldu. Koşulları işaretleyip yeniden deneyin.'
        : null}
      initialAccountNotice={initialAccountNotice}
    />
  )
}
