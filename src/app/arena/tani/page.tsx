import type { Metadata } from 'next'
import TaniClient from './tani-client'

export const metadata: Metadata = {
  title: 'Seviyeni Ölç',
  description: 'Uyarlanabilir kısa taramayla ilk çalışma yönünü ve sana özel sonraki adımı belirle.',
  robots: { index: false, follow: true },
}

export default function TaniPage() {
  return <TaniClient />
}
