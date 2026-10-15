import type { Metadata } from 'next'
import { connection } from 'next/server'
import PreparationClient from './preparation-client'

export const metadata: Metadata = {
  title: '2027 TYT Sosyal hazırlık pilotu',
  description: 'İncelenmiş sorularla sınırlı başlangıç çalışması; resmî seviye ölçümü değildir.',
  robots: { index: false, follow: true },
}
export default async function Page() {
  // Sensitive-document CSP uses a per-request nonce; a static shell cannot carry it.
  await connection()
  return <PreparationClient />
}
