'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type CSSProperties } from 'react'
import { BookOpenText, ChevronRight, Gamepad2, ShieldCheck, Swords, Users } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { DEFAULT_EXAM_REF, examRefsForType, gamesForExamType } from '@/lib/constants/exam-types'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import { bilgeImage } from '@/lib/bilge/characters'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { AcademyTabletNav } from './academy-tablet-nav'
import styles from './academy.module.css'

const SUBJECT_ART = {
  matematik: '/academy/subjects/matematik-magic-v1.png',
  turkce: '/academy/subjects/turkce-magic-v1.png',
  fen: '/academy/subjects/fen-magic-v1.png',
  sosyal: '/academy/subjects/sosyal-magic-v1.png',
  wordquest: '/academy/modes/wordquest-v1.png',
}
const EXAM_LABELS: Record<string, string> = { TYT: 'TYT', 'AYT-SAY': 'AYT Sayısal', 'AYT-EA': 'AYT Eşit Ağırlık', 'AYT-SOZ': 'AYT Sözel', YDT: 'YDT', LGS: 'LGS' }

export function DesktopGamesHome() {
  const [pressedSubject, setPressedSubject] = useState<keyof typeof SUBJECT_ART | null>(null)
  const releaseSubject = (slug: keyof typeof SUBJECT_ART) => setPressedSubject(current => current === slug ? null : current)
  const { user, profile, loading } = useAuthStore()
  const { character } = useBilgeCharacter()
  const selectedExamRef = useGameStore(state => state.selectedExamRef)
  const setExamRef = useGameStore(state => state.setExamRef)
  const examType = profile?.exam_type === 'lgs' ? 'lgs' : 'yks'
  const refs = examRefsForType(examType)
  const examRef = selectedExamRef && refs.includes(selectedExamRef) ? selectedExamRef : DEFAULT_EXAM_REF[examType]
  const games = gamesForExamType(examType).filter(game => game.examTags.includes(examRef))
  const modes = [
    { title: 'Kule Modu', subtitle: 'ADIM ADIM ZORLAŞAN MÜCADELE', description: '3 canınla yüksel. Her katta biraz daha zor bir soruyla karşılaş.', href: '/arena/kule', image: '/academy/modes/tower-v1.png', tone: 'tower', detail: '3 can · Artan zorluk', auth: true },
    { title: 'Bil ve Fethet', subtitle: 'KONU KONU FETİH', description: 'Kategorilerdeki soruları çöz, bilgi haritanda yeni alanlar aç.', href: '/arena/fethet', image: '/academy/modes/conquest-janissary-v2.png', tone: 'conquest', detail: 'Kategori haritası · Soru mücadeleleri', auth: true },
    ...(examType === 'lgs' ? [] : [{ title: 'WordQuest', subtitle: 'İNGİLİZCE KELİME OYUNU', description: 'Kelime, dil bilgisi ve okuma sorularıyla İngilizceni geliştir.', href: '/arena/wordquest', image: '/academy/modes/wordquest-v1.png', tone: 'words', detail: 'Kelime ve dil · YDT', auth: false }]),
  ]
  // Cover crops the panorama on narrow cards; size for its full rendered width,
  // not just the visible card, so the fixed-height tablet artwork stays sharp.
  const modeImageSizes = modes.length === 2
    ? '(min-width: 1440px) 730px, (min-width: 900px) calc(54vw - 42px), 420px'
    : '(min-width: 1440px) 480px, (min-width: 1280px) calc(36vw - 36px), 420px'
  return <div data-academy-desktop data-academy-games className={`${styles.root} ${styles.liveRoot}`}>
    <ThemeToggle variant="sync-only" />
    <AcademyTabletNav active="games" />
    <section className={styles.gamesHero} aria-labelledby="games-title">
      <div><p className={styles.eyebrow}><Swords size={17} aria-hidden="true" /> OYUNLAR</p><h1 id="games-title">Bugün hangi mücadele?</h1><p>Bir mod seç, kurallarını öğren ve oyuna katıl.</p>
        <Link href="/arena/calisma" className={styles.textLink}><BookOpenText size={18} /> Planlı çalışmak mı istiyorsun? Ders Çalış <ChevronRight size={18} /></Link>
      </div>
      <div className={styles.gamesGuide}><Image src={bilgeImage(character, 'kararli')} alt={(character === 'male' ? 'Erkek' : 'Kadın') + ' Bilge, oyun rehberin'} width={190} height={190} sizes="190px" /><p>“Her tur yeni bir deneme.<br />Hazırsan başlayalım!”</p></div>
    </section>
    <section aria-label="Oyun modları">
      <header className={styles.sectionHeader}><h2>Oyun modları</h2><span className={styles.secondary}>Kendi rekoruna meydan oku</span></header>
      <div className={styles.modeGrid}>{modes.map(mode => <article key={mode.href} className={styles.modeCard} data-tone={mode.tone}>
        <div className={styles.modeArt} aria-hidden="true">
          <Image src={mode.image} alt="" fill loading="eager" sizes={modeImageSizes} />
        </div>
        <div className={styles.modeCopy}><p className={styles.eyebrow}>{mode.subtitle}</p><h3>{mode.title}</h3><p>{mode.description}</p><small>{mode.detail}</small></div>
        {loading && mode.auth ? <span role="status" className={styles.modeAction}>Hesabın kontrol ediliyor…</span> : <Link className={styles.modeAction} href={mode.auth && !user ? `/giris?next=${encodeURIComponent(mode.href)}` : mode.href} aria-label={`${mode.title}${mode.auth && !user ? ' için giriş yap' : ' modunu aç'}`}>{mode.auth && !user ? 'Giriş yap ve oyna' : 'Modu aç'}<ChevronRight size={18} /></Link>}
      </article>)}</div>
    </section>
    <section className={styles.subjectGames} aria-label="Ders oyunları">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>KISA BİR SORU TURU</p><h2>Ders oyunları</h2><p className={styles.secondary}>Dersini seç; oyun biçimi, konu ve zorluğu sonraki ekranda belirle.</p></div>
        <label className={styles.exam}><ShieldCheck size={20} aria-hidden="true" /><select aria-label="Ders oyunlarının sınav kapsamı" value={examRef} onChange={event => setExamRef(event.target.value)}>{refs.map(ref => <option key={ref} value={ref}>{EXAM_LABELS[ref]}</option>)}</select></label>
      </header>
      <div className={styles.subjectGameGrid} data-count={games.length}>{games.map(game => {
        return <Link
          key={game.slug}
          className={styles.subjectGameCard}
          data-subject={game.slug}
          data-pressed={pressedSubject === game.slug ? 'true' : undefined}
          style={{ '--subject-color': game.colorHex } as CSSProperties}
          href={`/arena/${game.slug}?exam_ref=${encodeURIComponent(examRef)}`}
          aria-label={`${game.name} ${EXAM_LABELS[examRef]} · Turunu kur`}
          onPointerDown={event => {
            if (event.pointerType === 'touch' || event.pointerType === 'pen') setPressedSubject(game.slug)
          }}
          onPointerUp={() => releaseSubject(game.slug)}
          onPointerCancel={() => releaseSubject(game.slug)}
          onPointerLeave={() => releaseSubject(game.slug)}
          onBlur={() => releaseSubject(game.slug)}
        >
          <span className={styles.subjectGameArt} aria-hidden="true">
            <Image src={SUBJECT_ART[game.slug]} alt="" fill loading={game.slug === 'matematik' ? 'eager' : 'lazy'} sizes="(min-width: 1440px) 322px, (min-width: 1051px) 25vw, 50vw" />
          </span>
          <span className={styles.subjectGameScope}>{EXAM_LABELS[examRef]}</span>
          <span className={styles.subjectGameCopy}><strong>{game.name}</strong></span>
          <span className={styles.subjectGameAction}>Turunu kur <span><ChevronRight size={18} aria-hidden="true" /></span></span>
        </Link>
      })}</div>
    </section>
    <div className={styles.gamesFooter}>
      <Link href="/oda"><Users size={23} /><span><strong>Birlikte oyna</strong><small>Oda oluştur veya bir odaya katıl</small></span><ChevronRight size={18} /></Link>
      <Link href="/arena/kisisellestir"><Gamepad2 size={23} /><span><strong>Oyun alanını kişiselleştir</strong><small>Renkler, arka plan ve Bilge rehberin</small></span><ChevronRight size={18} /></Link>
    </div>
  </div>
}
