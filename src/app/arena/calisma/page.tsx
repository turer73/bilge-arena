import type { Metadata } from 'next'
import CalismaClient from './calisma-client'

export const metadata: Metadata = {
  title: 'Ders Çalışma Ortamı',
  description: 'Dersini ve sınav kapsamını seç, çalışma turunu sade bir akışla başlat.',
  robots: { index: false, follow: true },
}

export default function CalismaPage() {
  return <CalismaClient />
}
