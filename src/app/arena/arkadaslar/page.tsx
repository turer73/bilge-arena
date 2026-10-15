import type { Metadata } from 'next'
import FriendsClient from './friends-client'

export const metadata: Metadata = {
  title: 'Arkadaşlar — Çalışma Çevren',
  description: 'Bilge Arena arkadaşlarını bul, isteklerini yönet ve ders düellosu başlat.',
  robots: { index: false, follow: false },
}

export default function FriendsPage() {
  return <FriendsClient />
}
