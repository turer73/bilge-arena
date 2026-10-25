import Image from 'next/image'
import Link from 'next/link'
import styles from './academy.module.css'

export function AcademyLogo() {
  // Ad her genişlikte "Bilge Arena ana sayfa": görünen marka adı adın içinde
  // kalır (WCAG 2.5.3, sesli komut). Eski aria-label slogan metnini dışarıda
  // bırakıyordu; büyük harfli dekoratif yazı ekran okuyucudan gizlidir. Dar
  // ekranda yalnız .wordmark gizlenir, ad taşıyan sr-only metin kalır.
  return <Link href="/" className={styles.logo} data-academy-logo>
    <Image src="/academy/brand-crest-orbit.png" alt="" width={52} height={52} sizes="52px" />
    <span className={styles.wordmark} aria-hidden="true">BİLGE <b>ARENA</b><small>ÖĞREN · KAZAN · YÜKSEL</small></span>
    <span className="sr-only">Bilge Arena ana sayfa</span>
  </Link>
}
