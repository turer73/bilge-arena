import type { Metadata } from 'next'
import Link from 'next/link'
import { z } from 'zod'
import { PaperPackAnswerView } from '@/components/paper/paper-pack-answer-view'

export const metadata: Metadata = {
  title: 'Kağıt Paketi Cevap Girişi',
  robots: { index: false, follow: false },
}

export default async function PaperPackAnswerPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params
  const valid = z.string().uuid().safeParse(packId).success
  if (process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED !== 'true' || !valid) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">Cevap girişi kullanılamıyor</h1>
        <p className="mt-2 text-sm text-[var(--text-sub)]">Kağıt modu kapalı veya paket bağlantısı geçersiz.</p>
        <Link href="/arena/calisma" className="mt-5 inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-[var(--focus)]">Çalışmaya dön</Link>
      </div>
    )
  }
  return <PaperPackAnswerView packId={packId} />
}
