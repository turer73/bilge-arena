import type { Metadata } from 'next'
import YanlislarimClient from './yanlislarim-client'

export const metadata: Metadata = {
  title: 'Yanlışlarım — Hata Defteri',
  description: 'Yanlış cevaplarını, çözümleri ve hata kaynaklarını tek bir akıllı tekrar defterinde incele.',
  robots: { index: false, follow: false },
}

export default function YanlislarimPage() {
  return <YanlislarimClient />
}
