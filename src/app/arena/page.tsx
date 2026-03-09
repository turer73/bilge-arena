import type { Metadata } from 'next'
import ArenaClient from './arena-client'

export const metadata: Metadata = {
  title: 'Arena',
  description: 'Matematik, Turkce, Fen, Sosyal ve Ingilizce — 5 oyun konsolundan birini sec ve YKS sorularini cozerek XP kazan.',
  openGraph: {
    title: 'Arena | Bilge Arena',
    description: '5 farkli oyun konsoluyla YKS\'ye hazirlan. Sorulari coz, XP kazan, siralamada yuksel.',
  },
}

export default function ArenaPage() {
  return <ArenaClient />
}
