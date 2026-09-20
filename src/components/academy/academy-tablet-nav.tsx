'use client'

import Link from 'next/link'
import { AcademyLogo } from './academy-logo'
import styles from './academy.module.css'

/** Shared 768–1023px navigation; mobile and the full desktop navbar stay independent. */
export function AcademyTabletNav({ active }: { active: 'games' | 'study' | 'personalize' | 'rooms' }) {
  return <header className={styles.tabletHeader}>
    <style>{`@media (min-width:768px) and (max-width:1023px) { [data-app-navbar], [data-bottom-nav] { display:none!important; } [data-arena-main], [data-player-main] { padding-top:0!important; padding-bottom:0!important; } }`}</style>
    <AcademyLogo />
    <nav aria-label="Tablet gezinmesi">
      <Link href="/arena" aria-current={active === 'games' ? 'page' : undefined}>Oyunlar</Link>
      <Link href="/arena/calisma" aria-current={active === 'study' ? 'page' : undefined}>Ders Çalış</Link>
      <Link href="/oda" aria-current={active === 'rooms' ? 'page' : undefined}>Oda Modu</Link>
      <Link href="/arena/kisisellestir" aria-current={active === 'personalize' ? 'page' : undefined}>Kişiselleştir</Link>
    </nav>
  </header>
}
