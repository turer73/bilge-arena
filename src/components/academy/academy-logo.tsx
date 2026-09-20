import Image from 'next/image'
import Link from 'next/link'
import styles from './academy.module.css'

export function AcademyLogo() {
  return <Link href="/" className={styles.logo} aria-label="Bilge Arena ana sayfa">
    <Image src="/academy/brand-crest-orbit.png" alt="" width={52} height={52} sizes="52px" />
    <span>BİLGE <b>ARENA</b><small>ÖĞREN · KAZAN · YÜKSEL</small></span>
  </Link>
}
