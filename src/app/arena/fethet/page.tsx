import type { Metadata } from 'next'
import { FethetClient } from './fethet-client'

export const metadata: Metadata = {
  title: 'Bil ve Fethet — Bilge Arena',
  description: 'Kategorileri fethederek tüm bilgi alanlarını ele geçir! Her kategoriyi 3 soruyu doğru yanıtlayarak fethet.',
}

export default function FethetPage() {
  return <FethetClient />
}
