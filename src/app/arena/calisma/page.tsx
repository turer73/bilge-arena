import type { Metadata } from 'next'
import CalismaClient from './calisma-client'

export const metadata: Metadata = {
  title: 'Ders Çalışma Ortamı',
  description: 'Bugünün 15\'i, kazanım haritan ve Bilge Asistan tek ekranda — odaklı ders çalışma hub\'ı.',
  robots: { index: false, follow: true },
}

export default function CalismaPage() {
  return <CalismaClient />
}
