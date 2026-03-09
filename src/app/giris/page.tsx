import type { Metadata } from 'next'
import GirisClient from './giris-client'

export const metadata: Metadata = {
  title: 'Giris Yap',
  description: 'Bilge Arena\'ya Google hesabinla giris yap. Ilerlemenin kaydedilsin, siralamada yerinl al.',
  robots: { index: false, follow: true },
}

export default function GirisPage() {
  return <GirisClient />
}
