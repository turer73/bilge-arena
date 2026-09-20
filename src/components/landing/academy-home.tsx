'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { ArrowDown, ArrowRight, BookOpenText, Compass, Flag, Gamepad2, Palette, Sparkles, Swords, Users } from 'lucide-react'
import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import { bilgeImage } from '@/lib/bilge/characters'
import { useAuthStore } from '@/stores/auth-store'
import type { HomepageElement, HomepageSection } from '@/types/database'
import { SectionWrapper } from './section-wrapper'
import { StatsBar } from './stats-bar'
import { GamesSection } from './games-section'
import styles from './academy-home.module.css'

const HowItWorks = dynamic(() => import('./how-it-works').then(module => module.HowItWorks))
const LeaderboardPreview = dynamic(() => import('./leaderboard-preview').then(module => module.LeaderboardPreview))
const CTASection = dynamic(() => import('./cta-section').then(module => module.CTASection))

export interface AcademyHomeProps {
  sections: Partial<Record<HomepageSection, Record<string, unknown>>>
  elements: HomepageElement[]
  gameCounts: Record<string, number>
}

const modes = [
  { name: 'Kule Modu', eyebrow: 'HER KATTA YENİ BİR SORU', description: 'Bilginle yüksel, kendi rekoruna meydan oku.', image: '/academy/modes/tower-v1.png', href: '/arena/kule', color: '#a5b4fc' },
  { name: 'Bil ve Fethet', eyebrow: 'BİLGİYLE YENİ ALANLAR AÇ', description: 'Konuları keşfet, soruları çöz, haritada ilerle.', image: '/academy/modes/conquest-janissary-v2.png', href: '/arena/fethet', color: '#fcd34d' },
  { name: 'WordQuest', eyebrow: 'İNGİLİZCEYE BİR YOLCULUK', description: 'Kelime, dil bilgisi ve okumayla yeni yollar aç.', image: '/academy/modes/wordquest-v1.png', href: '/arena/wordquest', color: '#67e8f9' },
] as const

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function cta(value: unknown, fallback: { text: string; href: string }) {
  if (!value || typeof value !== 'object') return fallback
  const input = value as Record<string, unknown>
  const href = typeof input.href === 'string' && (/^\/(?!\/)/.test(input.href) || /^https?:\/\//.test(input.href))
    ? input.href : fallback.href
  return { text: text(input.text, fallback.text), href }
}

export function AcademyHome({ sections, elements, gameCounts }: AcademyHomeProps) {
  const { character, setCharacter, persisted } = useBilgeCharacter()
  const { user, loading } = useAuthStore()
  const hero = sections.hero
  const primary = cta(hero?.cta_primary, { text: 'Oyunları keşfet', href: '/arena' })
  const secondary = cta(hero?.cta_secondary, { text: 'Ders çalış', href: '/arena/calisma' })
  const customHeading = Array.isArray(hero?.heading) && hero.heading.every(item => typeof item === 'string')
    ? hero.heading.filter(item => item.trim()).slice(0, 3) as string[] : []
  const miniStats = Array.isArray(hero?.mini_stats) ? hero.mini_stats.filter(item => typeof item === 'string').slice(0, 3) as string[] : []
  const customLogo = typeof hero?.logo_url === 'string' && (/^\/(?!\/)/.test(hero.logo_url) || /^https?:\/\//.test(hero.logo_url)) ? hero.logo_url : null

  return (
    <div className={styles.root} data-academy-home>
      <SectionWrapper section="hero" elements={elements}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.landscape} aria-hidden="true">
            <Image src="/academy/academy-landscape.png" alt="" fill sizes="(min-width: 1440px) 1360px, 100vw" loading="eager" />
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{customLogo ? <Image src={customLogo} alt="" width={36} height={36} sizes="36px" /> : <Sparkles size={16} aria-hidden="true" />} {text(hero?.badge, 'BİLGİN, EN BÜYÜK GÜCÜN')}</p>
            <h1 id="home-title" className={customHeading.length ? styles.configuredHeading : undefined}>{customHeading.length ? customHeading.map((part, index) => <span key={index}>{part}</span>) : <>Bilginle<br /><span>yeni dünyalar aç.</span></>}</h1>
            <p className={styles.intro}>{text(hero?.subheading, 'Bir oyunla kendine meydan oku, bir dersle hedefine yaklaş. Bilge Arena’da ilerlemenin yolu sana ait.')}</p>
            <div className={styles.heroActions}>
              <Link href={primary.href} className={styles.primary}><Swords size={19} aria-hidden="true" />{primary.text}<ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href={secondary.href} className={styles.secondary}><BookOpenText size={19} aria-hidden="true" />{secondary.text}</Link>
            </div>
            <p className={styles.examNote}>LGS · TYT · AYT · YDT <span>Hedefin farklı, yolculuk senin.</span></p>
            {miniStats.length > 0 && <dl className={styles.configuredStats}>{miniStats.map((value, index) => <div key={index}><dt>{['Soru', 'Oyun', 'Sonsuza dek'][index]}</dt><dd>{value}</dd></div>)}</dl>}
          </div>
          <aside className={styles.guide} aria-label="Bilge rehberin">
            <div className={styles.portrait}>
              <Image key={character} src={bilgeImage(character, 'portrait')} alt={`${character === 'male' ? 'Erkek' : 'Kadın'} Bilge, öğrenme yolculuğundaki rehberin`} fill sizes="(min-width: 1200px) 410px, 36vw" loading="eager" />
            </div>
            <div className={styles.guideNote}><span>BİLGE YANINDA</span><p>“Küçük adımlar da ilerlemedir.<br />Hadi, birlikte başlayalım.”</p></div>
            <div className={styles.guideChoice} role="group" aria-label="Bilge karakteri">
              <span>Rehberini seç</span>
              <button type="button" aria-pressed={character === 'female'} onClick={() => setCharacter('female')}>Kadın Bilge</button>
              <button type="button" aria-pressed={character === 'male'} onClick={() => setCharacter('male')}>Erkek Bilge</button>
            </div>
            {!persisted && <small role="status">Seçimin yalnız bu oturumda saklanabiliyor.</small>}
          </aside>
        </section>
      </SectionWrapper>

      <SectionWrapper section="stats" elements={elements}>
        {sections.stats ? <div className={styles.managed}><StatsBar config={sections.stats} /></div> : <div className={styles.welcomeLine}>
          <p><Compass size={17} aria-hidden="true" /> Her gün, biraz daha ileri.</p>
          <Link href="#home-paths">Kendi yolunu seç <ArrowDown size={16} aria-hidden="true" /></Link>
        </div>}
      </SectionWrapper>

      <section className={styles.pathsSection} id="home-paths" aria-labelledby="paths-title">
        <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>İKİ FARKLI YOL, AYNI HEDEF</p><h2 id="paths-title">Bugün nasıl ilerlemek istersin?</h2></div><p>Oynamak da çalışmak da bir başlangıç.</p></header>
        <div className={styles.paths}>
          <article className={styles.path} data-path="games">
            <div className={styles.pathArt} aria-hidden="true"><Image src="/academy/lobby-modes/classic-v1.webp" alt="" fill sizes="(min-width: 1440px) 660px, 50vw" /></div>
            <div className={styles.pathCopy}><span className={styles.pathLabel}><Swords size={18} aria-hidden="true" /> OYUNLAR</span><h3>Meydan okumaya hazır mısın?</h3><p>Bir ders veya oyun modu seç. Turunu kur, soruları çöz ve kendi rekorunu zorla.</p><ul><li>Kısa soru turları</li><li>Kule ve fetih</li><li>Oda modu</li></ul><Link href="/arena">Oyunlara git <ArrowRight size={18} aria-hidden="true" /></Link></div>
          </article>
          <article className={styles.path} data-path="study">
            <div className={styles.pathArt} aria-hidden="true"><Image src="/academy/academy-landscape.png" alt="" fill sizes="(min-width: 1440px) 660px, 50vw" /></div>
            <div className={styles.pathCopy}><span className={styles.pathLabel}><BookOpenText size={18} aria-hidden="true" /> DERS ÇALIŞ</span><h3>Hedefine adım adım yaklaş.</h3><p>Konunu seç, öğrenme yolunu takip et. Günlük planınla çalış, yanlışlarına yeniden dön.</p><ul><li>Öğrenme yolu</li><li>Günlük plan</li><li>Konu tekrarı</li></ul><Link href="/arena/calisma">Çalışma alanına git <ArrowRight size={18} aria-hidden="true" /></Link></div>
          </article>
        </div>
      </section>

      <SectionWrapper section="games" elements={elements}>
        {sections.games ? <div className={styles.managed}><GamesSection config={sections.games} gameCounts={gameCounts} /></div> : <section className={styles.modesSection} aria-labelledby="home-modes-title">
          <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>ARENA’DAN BİR KEŞİF</p><h2 id="home-modes-title">Her maceranın anahtarı bilgi.</h2></div><Link href="/arena">Tüm oyunlar <ArrowRight size={17} aria-hidden="true" /></Link></header>
          <div className={styles.modes}>{modes.map(mode => <Link href={mode.href === '/arena/wordquest' || user ? mode.href : loading ? '/arena' : `/giris?next=${encodeURIComponent(mode.href)}`} key={mode.href} className={styles.mode}>
            <div className={styles.modeArt}><Image src={mode.image} alt="" fill sizes="(min-width: 1440px) 440px, 33vw" /><span style={{ color: mode.color }}>{mode.eyebrow}</span></div>
            <div className={styles.modeCopy}><h3>{mode.name}<ArrowRight size={18} aria-hidden="true" /></h3><p>{mode.description}</p></div>
          </Link>)}</div>
        </section>}
      </SectionWrapper>

      <SectionWrapper section="how_it_works" elements={elements}>
        {sections.how_it_works ? <div className={styles.managed}><HowItWorks config={sections.how_it_works} /></div> : <section className={styles.journey} aria-labelledby="journey-title">
          <div><p className={styles.eyebrow}>BAŞLAMAK İÇİN BÜYÜK BİR ADIM GEREKMİYOR</p><h2 id="journey-title">Küçük adımlar.<br />Sana ait bir yol.</h2><Link href="/nasil-calisir">Nasıl çalışır? <ArrowRight size={16} aria-hidden="true" /></Link></div>
          <ol>
            <li><span>01</span><div><h3>Hedefini seç</h3><p>Profilinde lise veya üniversite hazırlık hedefini belirle.</p></div></li>
            <li><span>02</span><div><h3>Bugünkü yoluna karar ver</h3><p>Oyunlara katıl veya Ders Çalış alanında konunu seç.</p></div></li>
            <li><span>03</span><div><h3>İlerlemeni takip et</h3><p>Hesabınla çalışmalarını kaydet, gerektiğinde yanlışlarına dön.</p></div></li>
          </ol>
        </section>}
      </SectionWrapper>

      <SectionWrapper section="leaderboard" elements={elements}>
        {sections.leaderboard ? <div className={styles.managed}><LeaderboardPreview config={sections.leaderboard} /></div> : <section className={styles.together} aria-labelledby="together-title">
          <span className={styles.togetherIcon}><Users size={32} aria-hidden="true" /></span><div><p className={styles.eyebrow}>AYNI ODA, ORTAK HEYECAN</p><h2 id="together-title">Birlikte oynamak başka.</h2><p>Bir oda oluştur ya da arkadaşının koduyla katıl.</p></div>
          <Link href="/oda" className={styles.primary}>Oda moduna git <ArrowRight size={18} aria-hidden="true" /></Link>
          <Link href="/arena/siralama" className={styles.textLink}><Flag size={16} aria-hidden="true" /> Sıralamayı keşfet</Link>
        </section>}
      </SectionWrapper>

      <SectionWrapper section="cta" elements={elements}>
        {sections.cta ? <div className={styles.managed}><CTASection config={sections.cta} /></div> : <div className={styles.personalize}>
          <div><Palette size={22} aria-hidden="true" /><p><strong>Bu dünya senin renklerinle güzel.</strong><span>Temanı, arka planını ve Bilge rehberini kendine göre seç.</span></p></div><Link href="/arena/kisisellestir">Kişiselleştir <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>}
      </SectionWrapper>
      <p className={styles.signoff}><Gamepad2 size={16} aria-hidden="true" /> Daha çok öğren. Daha çok oyna. Daha güçlü ol.</p>
    </div>
  )
}
