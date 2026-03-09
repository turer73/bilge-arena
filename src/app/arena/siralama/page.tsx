import type { Metadata } from 'next'
import SiralamaClient from './siralama-client'

export const metadata: Metadata = {
  title: 'Siralama',
  description: 'Bilge Arena haftalik ve tum zamanlar siralamasi. En cok XP kazanan ogrencileri gor ve siralamada yuksel.',
  openGraph: {
    title: 'Siralama | Bilge Arena',
    description: 'Haftalik ve genel siralama — en basarili arenacilari gor.',
  },
}

export default function SiralamaPage() {
  return <SiralamaClient />
}
