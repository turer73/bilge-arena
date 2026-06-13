import type { Metadata } from 'next'
import { KisisellestirClient } from './kisisellestir-client'

export const metadata: Metadata = {
  title: 'Kişiselleştir',
  description:
    'Bilge Arena profilini kişiselleştir: zemin, profil kartı arka planı, isim paneli, çerçeve ve rozetleri canlı önizlemeyle uygula.',
  robots: { index: false, follow: true },
}

export default function KisisellestirPage() {
  return <KisisellestirClient />
}
