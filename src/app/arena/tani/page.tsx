import type { Metadata } from 'next'
import TaniClient from './tani-client'

export const metadata: Metadata = {
  title: 'Kısa Kazanım Tanılaması',
  description: 'TYT Matematik kazanımlarını 10 soruluk adaptif başlangıç tanılamasıyla yokla.',
  robots: { index: false, follow: true },
}

export default function TaniPage() {
  return <TaniClient />
}
