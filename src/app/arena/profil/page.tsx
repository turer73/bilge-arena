import type { Metadata } from 'next'
import ProfilClient from './profil-client'

export const metadata: Metadata = {
  title: 'Profil',
  description: 'Bilge Arena profilin — XP, seviye, istatistikler ve basarimlar.',
  robots: { index: false, follow: true },
}

export default function ProfilPage() {
  return <ProfilClient />
}
