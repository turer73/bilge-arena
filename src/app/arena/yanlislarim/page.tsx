import type { Metadata } from 'next'
import YanlislarimClient from './yanlislarim-client'

export const metadata: Metadata = {
  title: 'Yanlışlarım',
  description: 'Yanlış cevapladığın soruları tekrar gör, çözümleri oku, aynı hatayı tekrarlama.',
  robots: { index: false, follow: true },
}

export default function YanlislarimPage() {
  return <YanlislarimClient />
}
