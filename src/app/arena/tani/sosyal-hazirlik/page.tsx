import type { Metadata } from 'next'
import PreparationClient from './preparation-client'

export const metadata: Metadata = {
  title: '2027 TYT Sosyal hazırlık pilotu',
  description: 'İncelenmiş sorularla sınırlı başlangıç çalışması; resmî seviye ölçümü değildir.',
  robots: { index: false, follow: true },
}
export default function Page() { return <PreparationClient /> }
