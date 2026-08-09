import type { Metadata } from 'next'
import Link from 'next/link'
import type { GameSlug } from '@/lib/constants/games'
import { PaperPackCreateClient } from './paper-pack-create-client'

export const metadata: Metadata = {
  title: 'Kağıt Çalışma Paketi',
  description: 'Bugünün 15’i planını yazdırılabilir, owner-only kağıt/PDF paketine dönüştür.',
  robots: { index: false, follow: false },
}

const GAMES = new Set<GameSlug>(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal'])
const EXAMS = new Set(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ'])

export default async function PaperModePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED !== 'true') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">Kağıt modu henüz kapalı</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Bu özellik kontrollü pilot tamamlandıktan sonra açılacak.</p>
        <Link href="/arena/calisma" className="mt-5 inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-[var(--focus)]">Çalışmaya dön</Link>
      </div>
    )
  }

  const raw = await searchParams
  const gameValue = Array.isArray(raw.game) ? raw.game[0] : raw.game
  const examValue = Array.isArray(raw.examRef) ? raw.examRef[0] : raw.examRef
  if (!gameValue || !GAMES.has(gameValue as GameSlug) || (examValue && !EXAMS.has(examValue))) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">Plan bağlantısı geçersiz</h1>
        <p className="mt-2 text-sm text-[var(--text-sub)]">Kağıt paketini “Bugünün 15’i” kartından açmayı dene.</p>
        <Link href="/arena/calisma" className="mt-5 inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-[var(--focus)]">Çalışmaya dön</Link>
      </div>
    )
  }

  return (
    <PaperPackCreateClient
      game={gameValue as GameSlug}
      examRef={(examValue ?? null) as 'TYT' | 'LGS' | 'AYT-SAY' | 'AYT-EA' | 'AYT-SOZ' | null}
    />
  )
}
