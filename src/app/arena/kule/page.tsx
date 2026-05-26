import type { Metadata } from 'next'
import { KuleClient } from './kule-client'

export const metadata: Metadata = {
  title: 'Kule Modu — Bilge Arena',
  description: '3 canınla kuleyi tırman! Her katta zorluk artıyor. Ne kadar yükseğe çıkabilirsin?',
}

export default function KulePage() {
  return <KuleClient />
}
