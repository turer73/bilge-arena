import type { Metadata } from 'next'
import HakimiyetClient from './hakimiyet-client'

export const metadata: Metadata = {
  title: 'Hâkimiyet Haritam',
  description: 'Bilge Arena iç öğrenme grafiğinde kazanım kanıtlarını ve çalışma önerilerini incele.',
  robots: { index: false, follow: true },
}

export default function HakimiyetPage() {
  return <HakimiyetClient />
}
