import type { Metadata } from 'next'
import TaniClient from './tani-client'

export const metadata: Metadata = {
  title: 'Kısa Başlangıç Taraması',
  description: 'Yayınlanmış ders kapsamlarında kısa ve adaptif bir başlangıç tahmini oluştur.',
  robots: { index: false, follow: true },
}

export default function TaniPage() {
  return <TaniClient />
}
