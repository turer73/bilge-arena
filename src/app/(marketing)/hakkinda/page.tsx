import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronRight,
  Eye,
  Flag,
  Gamepad2,
  GraduationCap,
  HeartHandshake,
  Lightbulb,
  Mail,
  MessageSquareWarning,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { TrackedCtaLink } from '@/components/marketing/tracked-cta-link'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { serializeJsonLd } from '@/lib/seo/serialize-json-ld'
import styles from '../academy-marketing.module.css'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Hakkımızda: Bilge Arena Nedir?',
  description:
    'Bilge Arena’nın adaptif öğrenme, soru kalite güvencesi, kazanım bazlı öğrenci analizi ve kurumsal öğrenme takibi yaklaşımını keşfedin.',
  keywords: [
    'Bilge Arena nedir',
    'Bilge Arena hakkında',
    'adaptif öğrenme platformu',
    'soru kalite sistemi',
    'öğrenci seviye belirleme',
    'kurumsal öğrenme takip sistemi',
    'oyunlaştırılmış eğitim platformu',
    'YKS çalışma platformu',
    'LGS çalışma platformu',
    'eğitim teknolojisi Türkiye',
  ],
  alternates: { canonical: `${siteUrl}/hakkinda` },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Bilge Arena Hakkında',
    description:
      'Soru kalitesi, adaptif öğrenme ve kurumsal takip altyapısının arkasındaki amacı keşfet.',
    url: `${siteUrl}/hakkinda`,
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Bilge Arena hakkında',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena Hakkında',
    description: 'Oyunlaştırılmış pratiğin ötesindeki adaptif öğrenme ve kalite mimarisi.',
    images: [`${siteUrl}/og-image.png`],
  },
}

const PRINCIPLES = [
  {
    icon: Target,
    title: 'Pratiğe odaklan',
    desc: 'Her ekranın öğrenciyi bir sonraki anlamlı çalışmaya götürmesi gerektiğine inanıyoruz.',
    color: 'var(--focus-text)',
    background: 'var(--focus-bg)',
  },
  {
    icon: Gamepad2,
    title: 'Motivasyonu tasarla',
    desc: 'XP, seri ve rozetleri amaç değil; düzenli çalışmayı görünür kılan yardımcı araçlar olarak kullanıyoruz.',
    color: 'var(--reward-text)',
    background: 'var(--reward-bg)',
  },
  {
    icon: Eye,
    title: 'Açık ve anlaşılır ol',
    desc: 'Üyelik, kullanım sınırları, veri işleme ve platformun kapsamı hakkında sürpriz oluşturmamayı hedefliyoruz.',
    color: 'var(--growth-text)',
    background: 'var(--growth-bg)',
  },
  {
    icon: MessageSquareWarning,
    title: 'Hataları düzeltilebilir kıl',
    desc: 'Kullanıcıların tartışmalı veya hatalı gördükleri soruları bildirebilmesi, içerik kalitesinin temel parçasıdır.',
    color: 'var(--urgency-text)',
    background: 'color-mix(in srgb, var(--urgency) 14%, transparent)',
  },
]

const SYSTEM_PILLARS = [
  {
    icon: BookOpenCheck,
    title: 'Soru yaşam döngüsü',
    desc: 'Yapay zekâ destekli taslaktan deterministik kontrollere, bağımsız incelemelerden yayın ve karantinaya uzanan izlenebilir içerik yönetişimi.',
  },
  {
    icon: Target,
    title: 'Kazanım bazlı öğrenci modeli',
    desc: 'Tek bir genel seviye yerine kanıt sayısı, zorluk, gecikmeli doğru, süre ve ipucu davranışıyla gelişen kazanım profili.',
  },
  {
    icon: GraduationCap,
    title: 'Açıklanabilir adaptasyon',
    desc: 'Kısa tanılama, uygun zorluk seçimi ve zamanı gelen tekrarlarla öğrenciyi sıradaki anlamlı çalışmaya götüren kapalı döngü.',
  },
  {
    icon: Users,
    title: 'Kurumsal öğrenme takibi',
    desc: 'Öğretmenin kanıtı yorumlayıp program hazırladığı; kurumun gelişim, takip ve veri güvenilirliğini ayrı ayrı görebildiği yapı.',
  },
]

const AUDIENCES = [
  {
    icon: GraduationCap,
    title: 'Öğrenciler için',
    desc: 'TYT, AYT, LGS veya YDT kapsamında kısa soru oturumlarıyla düzenli pratik yapmak isteyenler.',
  },
  {
    icon: Users,
    title: 'Arkadaş grupları için',
    desc: 'Aynı soruları eş zamanlı çözmek ve çalışmayı sosyal bir deneyime dönüştürmek isteyenler.',
  },
  {
    icon: HeartHandshake,
    title: 'Eğitim paydaşları için',
    desc: 'Öğrenci pratiğini destekleyecek iş birlikleri veya kurumsal kullanım üzerine görüşmek isteyen okul ve kurumlar.',
  },
]

const FACTS = [
  ['Hizmet', 'Kanıta dayalı, oyunlaştırılmış öğrenme ve soru pratiği altyapısı'],
  ['Kapsam', 'TYT · AYT · LGS · YDT'],
  ['Ders alanları', 'Matematik · Türkçe · Fen · Sosyal · İngilizce'],
  ['Dil ve bölge', 'Türkçe · Türkiye odaklı'],
  ['Erişim', 'Misafir önizlemesi ve Google hesabıyla giriş'],
  ['Ücretlendirme', 'Ücretsiz başlangıç; limit ve ek planlar için Premium sayfası'],
  ['Destek', 'iletisim@bilgearena.com'],
  ['Resmî statü', 'ÖSYM ve MEB’den bağımsız bir platform'],
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AboutPage',
      '@id': `${siteUrl}/hakkinda#webpage`,
      url: `${siteUrl}/hakkinda`,
      name: 'Bilge Arena Hakkında',
      description:
        'Bilge Arena’nın adaptif öğrenme, soru kalite güvencesi, kurumsal takip yaklaşımı, ürün kapsamı ve iletişim bilgileri.',
      inLanguage: 'tr-TR',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#organization` },
      mainEntity: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'EducationalOrganization',
      '@id': `${siteUrl}/#organization`,
      name: 'Bilge Arena',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/logo-horizontal.png`,
      },
      description:
        'TYT, AYT, LGS ve YDT öğrencileri için soru kalite güvencesi, kazanım bazlı analiz, adaptif pratik ve kurumsal öğrenme takibi sunan eğitim teknolojisi platformu.',
      areaServed: { '@type': 'Country', name: 'Türkiye' },
      knowsLanguage: 'tr-TR',
      email: 'iletisim@bilgearena.com',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'iletisim@bilgearena.com',
        availableLanguage: ['Turkish'],
        areaServed: 'TR',
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${siteUrl}/hakkinda#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Hakkımızda', item: `${siteUrl}/hakkinda` },
      ],
    },
  ],
}

export default function HakkindaPage() {
  return (
    <div className={styles.page} data-academy-marketing="about">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <section className={styles.hero}>
        <div className={styles.heroBackdrop} aria-hidden="true">
          <Image
            src="/academy/academy-landscape.png"
            alt=""
            fill
            sizes="(min-width: 1440px) 1360px, (min-width: 1101px) calc(100vw - 80px), (min-width: 768px) calc(100vw - 48px), calc(100vw - 32px)"
            priority
          />
        </div>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <nav aria-label="Sayfa yolu" className={styles.breadcrumb}>
              <Link href="/" className="transition-colors hover:text-[var(--focus-text)]">Ana Sayfa</Link>
              <ChevronRight size={13} aria-hidden="true" />
              <span aria-current="page">Hakkımızda</span>
            </nav>
            <div className={styles.eyebrow}>
              <Sparkles size={14} aria-hidden="true" />
              Bilge Arena’yı tanı
            </div>
            <h1 className={styles.heroTitle}>
              Çalışmayı bir yük değil,
              <span>ilerleme hissi yapan arena.</span>
            </h1>
            <p className={styles.heroDescription}>
              Bilge Arena; nitelikli soruyu, öğrencinin kazanım kanıtını ve öğretmenin
              müdahalesini aynı öğrenme döngüsünde buluşturan Türkiye odaklı bir eğitim
              teknolojisi projesidir. Oyunlaştırma görünen yüzüdür; soru kalitesi,
              açıklanabilir adaptasyon ve ilerleme takibi sistemin omurgasıdır.
            </p>
            <div className={styles.actions}>
              <TrackedCtaLink href="/nasil-calisir" page="hakkinda" placement="hero_how" className={styles.primaryButton}>Nasıl çalıştığını gör <ArrowRight size={17} /></TrackedCtaLink>
              <TrackedCtaLink href="/iletisim" page="hakkinda" placement="hero_contact" variant="ghost" className={styles.secondaryButton}>Bize ulaş</TrackedCtaLink>
            </div>
          </div>

          <div className="relative mx-auto flex w-full max-w-[460px] items-center justify-center">
            <div className="absolute h-72 w-72 rounded-full bg-[var(--focus-bg)] blur-3xl" />
            <div className={`${styles.brandCard} ${styles.glassCard} relative w-full`}>
              <div className={styles.brandCrest}>
                <Image src="/academy/brand-crest-orbit.png" alt="Bilge Arena logosu" fill sizes="118px" />
              </div>
              <div className="mt-4 text-center">
                <p className="text-2xl font-bold tracking-tight">Bilge Arena</p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-sub)]">Öğren · Kazan · Yüksel</p>
              </div>
              <div className={styles.companions} aria-label="Bilge rehberleri">
                <div className={styles.companion}>
                  <span className={styles.companionAvatar}>
                    <Image src="/academy/bilge/female/destekleyici.png" alt="Kadın Bilge rehber" fill sizes="46px" />
                  </span>
                  <span>Kadın Bilge</span>
                </div>
                <span className={styles.companionDivider} aria-hidden="true" />
                <div className={styles.companion}>
                  <span className={styles.companionAvatar}>
                    <Image src="/academy/bilge/male/destekleyici.png" alt="Erkek Bilge rehber" fill sizes="46px" />
                  </span>
                  <span>Erkek Bilge</span>
                </div>
              </div>
              <div className={`${styles.statsGrid} mt-4 grid grid-cols-2 gap-3`}>
                {[
                  ['5', 'ders alanı'],
                  ['4', 'sınav kapsamı'],
                  ['Web', 'kurulumsuz erişim'],
                  ['TR', 'Türkiye odaklı'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-center">
                    <p className="text-lg font-bold text-[var(--focus-text)]">{value}</p>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="neden-baslik">
        <div className="mx-auto grid max-w-full gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--focus-bg)] text-[var(--focus-text)]"><Lightbulb size={24} aria-hidden="true" /></div>
            <p className={`${styles.sectionLabel} mt-5`}>Neden varız?</p>
            <h2 id="neden-baslik" className="mt-3 text-3xl font-bold sm:text-4xl">Başlama eşiğini küçültmek için</h2>
          </div>
          <div className="space-y-5 text-base leading-8 text-[var(--text-sub)]">
            <p>Sınava hazırlık çoğu zaman “nereden başlayacağım?” sorusunda tıkanır. Büyük hedefler ve uzun konu listeleri öğrencinin ilk adımı atmasını zorlaştırabilir.</p>
            <p>Bilge Arena bu eşiği küçük ve anlaşılır bir akışa dönüştürür: dersini seç, bir oturum başlat, cevabını gör ve sonucundan bir sonraki adımı çıkar.</p>
            <p>Oyunlaştırmayı eğitimin yerine koymuyoruz. Onu, çalışmaya başlamayı ve geri dönmeyi kolaylaştıran bir motivasyon katmanı olarak kullanıyoruz.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.panel}`} aria-labelledby="sistem-baslik">
        <div className="mx-auto max-w-full">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className={styles.sectionLabel}>Bir soru sitesinin ötesinde</p>
              <h2 id="sistem-baslik" className="mt-3 text-3xl font-bold sm:text-4xl">Öğrenmeyi kanıta dönüştüren sistem</h2>
            </div>
            <div>
              <p className="leading-8 text-[var(--text-sub)]">Bilge Arena’nın hedefi daha çok soru göstermek değil; doğru soruyu güvenilir biçimde yayınlamak, öğrencinin hangi kazanımda ne kadar kanıt ürettiğini anlamak ve sıradaki çalışmayı bu kanıta göre düzenlemektir.</p>
              <Link href="/rehber/bilge-arena-ogrenme-sistemi" className="mt-5 inline-flex items-center gap-2 font-bold text-[var(--focus-text)] hover:underline">
                Bilimsel ve teknik mimariyi oku <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {SYSTEM_PILLARS.map(({ icon: Icon, title, desc }) => (
              <article key={title} className={styles.card}>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--wisdom-bg)] text-[var(--wisdom-text)]"><Icon size={23} aria-hidden="true" /></div>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.panel}`} aria-labelledby="kimin-icin-baslik">
        <div className="mx-auto max-w-full">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionLabel}>Kimin için?</p>
            <h2 id="kimin-icin-baslik" className="mt-3 text-3xl font-bold sm:text-4xl">Farklı çalışma biçimlerine açık</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, title, desc }) => (
              <article key={title} className={styles.card}>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--growth-bg)] text-[var(--growth-text)]"><Icon size={23} aria-hidden="true" /></div>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-sub)]">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="ilkeler-baslik">
        <div className="mx-auto max-w-full">
          <div className={styles.sectionHeading}>
            <p className={styles.sectionLabel}>Çalışma ilkelerimiz</p>
            <h2 id="ilkeler-baslik" className="mt-3 text-3xl font-bold sm:text-4xl">Ürünü nasıl düşünüyoruz?</h2>
            <p className="mt-4 leading-7 text-[var(--text-sub)]">Bir özelliğin yalnızca ilgi çekici olması yetmez; öğrencinin ne yaptığını ve neden yaptığını anlamasına da yardım etmelidir.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, title, desc, color, background }) => (
              <article key={title} className={`${styles.card} flex gap-4`}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ color, background }}><Icon size={23} aria-hidden="true" /></div>
                <div>
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">{desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="icerik-sorumlulugu" className={`${styles.section} scroll-mt-24`} aria-labelledby="icerik-baslik">
        <div className="mx-auto grid max-w-full gap-8 lg:grid-cols-2">
          <div className={styles.card}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--wisdom-bg)] text-[var(--wisdom-text)]"><BookOpenCheck size={24} aria-hidden="true" /></div>
            <h2 id="icerik-baslik" className="mt-5 text-2xl font-bold">İçerik sorumluluğu</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">Soru ve açıklamaların anlaşılır, tutarlı ve çalışılan kapsama uygun olması temel beklentimizdir. Buna rağmen eğitim içeriğinde hata olasılığını sıfır kabul etmiyoruz.</p>
            <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">Bu nedenle kullanıcıların soru ekranından hata bildirebilmesini sağlıyor; bildirimleri içerik iyileştirme sürecinin parçası olarak ele alıyoruz.</p>
          </div>
          <div className={styles.card}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--growth-bg)] text-[var(--growth-text)]"><ShieldCheck size={24} aria-hidden="true" /></div>
            <h2 className="mt-5 text-2xl font-bold">Gizlilik ve güven</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-sub)]">Hangi verilerin neden işlendiğini, çerez tercihlerini ve hesap kullanım koşullarını erişilebilir yasal sayfalarda açıklıyoruz.</p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/gizlilik-politikasi" className="font-semibold text-[var(--focus-text)] hover:underline">Gizlilik politikası</Link>
              <Link href="/kvkk" className="font-semibold text-[var(--focus-text)] hover:underline">KVKK aydınlatma</Link>
              <Link href="/cerez-politikasi" className="font-semibold text-[var(--focus-text)] hover:underline">Çerez politikası</Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="kimlik-baslik">
        <div className="mx-auto max-w-full">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--reward-bg)] text-[var(--reward-text)]"><Flag size={24} aria-hidden="true" /></div>
              <h2 id="kimlik-baslik" className="mt-5 text-3xl font-bold">Platform bilgileri</h2>
              <p className="mt-4 leading-7 text-[var(--text-sub)]">Bir reklamı veya arama sonucunu tıklamadan önce hizmetin kim tarafından, kimin için ve hangi kapsamda sunulduğunu görebilmelisin.</p>
            </div>
            <dl className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {FACTS.map(([term, detail]) => (
                <div key={term} className="grid gap-1 border-b border-[var(--border)] px-5 py-4 last:border-b-0 sm:grid-cols-[170px_1fr] sm:gap-5 sm:px-6">
                  <dt className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{term}</dt>
                  <dd className="text-sm leading-6 text-[var(--text-sub)]">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.panel}`} aria-labelledby="sinirlar-baslik">
        <div className="w-full">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
            <div>
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--urgency-text)]"
                style={{ background: 'color-mix(in srgb, var(--urgency) 10%, transparent)' }}
              >
                <Scale size={24} aria-hidden="true" />
              </div>
              <h2 id="sinirlar-baslik" className="mt-5 text-3xl font-bold">Ne değildir?</h2>
            </div>
            <ul className="space-y-4">
              {[
                'Bilge Arena, ÖSYM veya Millî Eğitim Bakanlığı tarafından işletilen resmî bir platform değildir.',
                'Okul, öğretmen, ders kitabı veya resmî sınav duyurularının yerine geçmez.',
                'Belirli bir puan, sıralama, okul yerleşimi veya sınav başarısı garantisi vermez.',
                'Oyun puanı ve sıralamalar, resmî sınav puanı ya da akademik yeterlilik belgesi değildir.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-7 text-[var(--text-sub)]"><Check size={17} className="mt-1 shrink-0 text-[var(--growth-text)]" aria-hidden="true" />{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.cta}`}>
        <div className="w-full">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--card)] text-[var(--focus-text)]"><Mail size={23} aria-hidden="true" /></div>
          <h2 className="mt-5 text-3xl font-bold sm:text-4xl">Sorun, önerin veya iş birliği fikrin mi var?</h2>
          <p className="mx-auto mt-4 max-w-[650px] leading-7 text-[var(--text-sub)]">Ürün, içerik, teknik destek, okul ve kurum iş birlikleri hakkında bize ulaşabilirsin.</p>
          <div className={styles.actions}>
            <TrackedCtaLink href="/iletisim" page="hakkinda" placement="final_contact" className={styles.primaryButton}>İletişim kanallarını gör <ArrowRight size={17} /></TrackedCtaLink>
            <a href="mailto:iletisim@bilgearena.com" className={`${styles.secondaryButton} inline-flex items-center justify-center`}>iletisim@bilgearena.com</a>
          </div>
        </div>
      </section>
    </div>
  )
}
