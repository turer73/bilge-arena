import type { Metadata } from 'next'
import QualityMissionsClient from './quality-missions-client'

export const metadata: Metadata = {
  title: 'Kalite Görevleri',
  description: 'Soruları bağımsız çöz, içerik kalitesine katkı ver.',
  robots: { index: false, follow: false },
}

export default function QualityMissionsPage() {
  return <QualityMissionsClient />
}

