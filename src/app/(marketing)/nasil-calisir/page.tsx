import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Gamepad2,
  Laptop,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap,
} from 'lucide-react'
import { TrackedCtaLink } from '@/components/marketing/tracked-cta-link'
import { GAME_LIST } from '@/lib/constants/games'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Nasıl Çalışır? YKS, LGS ve YDT Pratiği',
  description:
    'Bilge Arena ile TYT, AYT, LGS ve YDT pratiğinin nasıl çalıştığını keşfet: dersini ve oyun modunu seç, soru çöz, açıklamaları incele ve ilerlemeni takip et.',
  keywords: [
    'Bilge Arena nasıl çalışır',
    'YKS soru çözme',
    'TYT online test',
    'AYT soru pratiği',
    'LGS soru çöz',
    'YDT İngilizce',
    'oyunlaştırılmış eğitim',
  ],
  alternates: { canonical: `${siteUrl}/nasil-calisir` },
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
    title: 'Bilge Arena Nasıl Çalışır?',
    description:
      'Dersini seç, oyun modunu belirle, soruları çöz ve gelişimini takip et. TYT, AYT, LGS ve YDT pratiği adım adım.',
    url: `${siteUrl}/nasil-calisir`,
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Bilge Arena nasıl çalışır?',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena Nasıl Çalışır?',
    description: 'TYT, AYT, LGS ve YDT soru pratiğini oyunlaştıran akışı keşfet.',
    images: [`${siteUrl}/og-image.png`],
  },
}

const STEPS = [
  {
    num: '01',
    icon: Target,
    title: 'Hedefini ve dersini seç',
    desc: 'Matematik, Türkçe, Fen, Sosyal veya İngilizce alanlarından çalışmak istediğini seç. Ders sayfasında kapsamı ve sınav etiketlerini görebilirsin.',
    note: 'TYT · AYT · LGS · YDT kapsamları derslere göre değişir.',
    color: 'var(--focus)',
    background: 'var(--focus-bg)',
  },
  {
    num: '02',
    icon: Gamepad2,
    title: 'Çalışma biçimini belirle',
    desc: 'Klasik ve Pratik ile başlayabilir; tempo istediğinde Blitz, Maraton veya Boss modlarını açabilirsin.',
    note: 'Modlar soru sayısı, süre ve zorluk yapısına göre farklılaşır.',
    color: 'var(--reward)',
    background: 'var(--reward-bg)',
  },
  {
    num: '03',
    icon: Zap,
    title: 'Soruyu çöz, anında dönüt al',
    desc: 'Cevabını verdikten sonra doğru seçeneği ve mevcutsa çözüm açıklamasını incele. Tartışmalı bir içerik görürsen hata bildirimi oluştur.',
    note: 'Amaç yalnızca skoru değil, yanlışın nedenini de görünür kılmak.',
    color: 'var(--growth)',
    background: 'var(--growth-bg)',
  },
  {
    num: '04',
    icon: BarChart3,
    title: 'Sonucunu gör ve tekrar et',
    desc: 'Oturum sonunda doğruluk oranını, XP sonucunu ve performans özetini gör. Hesapla giriş yaptığında ilerlemeni saklayıp sonraki çalışmalarına taşı.',
    note: 'Misafir deneyimi hızlı deneme içindir; kalıcı ilerleme için hesap gerekir.',
    color: 'var(--wisdom)',
    background: 'var(--wisdom-bg)',
  },
]

const BENEFITS = [
  {
    icon: Clock3,
    title: 'Kısa ve odaklı oturumlar',
    desc: 'Uzun konu listeleri yerine seçtiğin ders ve mod üzerinden doğrudan soru pratiğine geçersin.',
  },
  {
    icon: BookOpen,
    title: 'Cevaptan sonra öğrenme',
    desc: 'Doğru seçeneği ve sunulan açıklamayı birlikte görerek yalnız sonucu değil çözüm yaklaşımını da incelersin.',
  },
  {
    icon: Trophy,
    title: 'Motivasyonu görünür kılan sistem',
    desc: 'XP, seri, rozet ve sıralama gibi oyun öğeleri düzenli pratiği daha takip edilebilir hale getirir.',
  },
  {
    icon: Users,
    title: 'Tek başına veya arkadaşlarla',
    desc: 'Bireysel çalışabilir ya da oda kodu paylaşarak arkadaşlarınla aynı sorular üzerinde yarışabilirsin.',
  },
  {
    icon: Laptop,
    title: 'Kurulum gerektirmeyen web deneyimi',
    desc: 'Bilge Arena modern telefon, tablet ve bilgisayar tarayıcılarında çalışır; ayrıca uygulama indirmen gerekmez.',
  },
  {
    icon: ShieldCheck,
    title: 'Şeffaf başlangıç',
    desc: 'Hesap açmadan sınırlı bir önizleme yapabilir, kayıt ve kullanım koşullarını başlamadan önce inceleyebilirsin.',
  },
]

const SAMPLE_FLOW = [
  ['Ders', 'Matematik', Target],
  ['Mod', 'Klasik', Gamepad2],
  ['Oturum', '10 soru', Clock3],
  ['Sonuç', 'Açıklama + performans özeti', BarChart3],
] as const

const FAQ = [
  {
    q: 'Bilge Arena nedir?',
    a: 'Bilge Arena; TYT, AYT, LGS ve YDT kapsamında soru pratiğini oyun öğeleriyle destekleyen web tabanlı bir alıştırma platformudur. Resmî sınav kurumu veya okulun yerine geçen bir eğitim kurumu değildir.',
  },
  {
    q: 'Bilge Arena ücretsiz mi?',
    a: 'Kayıt olmak ve temel deneyime başlamak ücretsizdir. Bazı kullanım limitleri veya ek özellikler planlara göre değişebilir; güncel kapsam için Premium sayfasını inceleyebilirsin.',
  },
  {
    q: 'Üye olmadan soru çözebilir miyim?',
    a: 'Evet. Misafir olarak kısa bir önizleme yapabilirsin. İlerlemenin, seri ve sonuçlarının kalıcı olarak saklanması için Google hesabınla giriş yapman gerekir.',
  },
  {
    q: 'Hangi dersler ve sınavlar var?',
    a: 'Matematik, Türkçe, Fen Bilimleri ve Sosyal Bilimler alanlarında TYT, AYT ve LGS kapsamları; İngilizce alanında YDT odaklı içerikler bulunur. Her dersin kapsadığı sınavlar kendi sayfasında gösterilir.',
  },
  {
    q: 'Yanlış veya eksik bir soru görürsem ne yapabilirim?',
    a: 'Soru deneyimindeki hata bildirimi kanalını kullanabilirsin. Bildirimde sorunu açıkça belirtmen, içeriğin incelenmesini kolaylaştırır.',
  },
  {
    q: 'Bilge Arena başarı garantisi verir mi?',
    a: 'Hayır. Bilge Arena düzenli soru pratiğine yardımcı bir araçtır; sınav sonucu veya puan garantisi vermez. Çalışma planını okul, öğretmen ve güvenilir resmî kaynaklarla birlikte yürütmelisin.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${siteUrl}/nasil-calisir#webpage`,
      url: `${siteUrl}/nasil-calisir`,
      name: 'Bilge Arena Nasıl Çalışır?',
      description:
        'Bilge Arena ile TYT, AYT, LGS ve YDT soru pratiğinin adım adım nasıl çalıştığını anlatan rehber.',
      inLanguage: 'tr-TR',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${siteUrl}/nasil-calisir#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Nasıl Çalışır', item: `${siteUrl}/nasil-calisir` },
      ],
    },
    {
      '@type': 'HowTo',
      '@id': `${siteUrl}/nasil-calisir#howto`,
      name: 'Bilge Arena ile soru pratiğine nasıl başlanır?',
      description: 'Ders seçiminden sonuç incelemeye uzanan dört adımlı Bilge Arena akışı.',
      totalTime: 'PT5M',
      step: STEPS.map((step, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        name: step.title,
        text: step.desc,
        url: `${siteUrl}/nasil-calisir#adim-${index + 1}`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/nasil-calisir#faq`,
      mainEntity: FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ],
}

export default function NasilCalisirPage() {
  return (
    <div className="overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="relative border-b border-[var(--border)] px-6 py-16 sm:py-20 lg:px-8 lg:py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(circle at 18% 10%, var(--focus-bg), transparent 34%), radial-gradient(circle at 82% 76%, var(--wisdom-bg), transparent 30%)',
          }}
        />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <nav aria-label="Sayfa yolu" className="mb-7 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Link href="/" className="transition-colors hover:text-[var(--focus-light)]">Ana Sayfa</Link>
              <ChevronRight size={13} aria-hidden="true" />
              <span aria-current="page">Nasıl Çalışır</span>
            </nav>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--focus-border)] bg-[var(--focus-bg)] px-3 py-1.5 text-xs font-bold text-[var(--focus-light)]">
              <Sparkles size={14} aria-hidden="true" />
              Soru pratiği, adım adım
            </div>
            <h1 className="font-display text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Çalışma hedefini seç.
              <span className="mt-2 block text-[var(--focus-light)]">Pratiğe hemen başla.</span>
            </h1>
            <p className="mt-6 max-w-[650px] text-base leading-8 text-[var(--text-sub)] sm:text-lg">
              Bilge Arena; TYT, AYT, LGS ve YDT için soru çözmeyi kısa oturumlar,
              anında geri bildirim ve oyun öğeleriyle daha takip edilebilir hale getirir.
              Başlamak için önce dersini, sonra çalışma biçimini seçersin.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrackedCtaLink href="/arena" page="nasil-calisir" placement="hero_try" className="w-full sm:w-auto">
                Ücretsiz dene
                <ArrowRight size={17} />
              </TrackedCtaLink>
              <TrackedCtaLink href="/konular" page="nasil-calisir" placement="hero_topics" variant="ghost" className="w-full sm:w-auto">
                Ders kapsamlarını incele
              </TrackedCtaLink>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Check size={14} className="text-[var(--growth-light)]" aria-hidden="true" />
              Kredi kartı gerekmez · Misafir önizlemesi vardır · Başarı garantisi verilmez
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[520px]">
            <div className="absolute -inset-6 rounded-[40px] bg-[var(--focus-bg)] blur-3xl" />
            <div className="relative rounded-[28px] border border-[var(--focus-border)] bg-[var(--surface)] p-5 shadow-2xl sm:p-7">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--focus-light)]">Örnek akış</p>
                  <h2 className="mt-1 text-xl font-black">Bugünkü Matematik pratiği</h2>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--reward-bg)] text-[var(--reward-light)]">
                  <Medal size={22} aria-hidden="true" />
                </div>
              </div>
              <div className="space-y-3">
                {SAMPLE_FLOW.map(([label, value, Icon]) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--focus-bg)] text-[var(--focus-light)]">
                      <Icon size={17} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{value}</p>
                    </div>
                    <Check size={17} className="text-[var(--growth-light)]" aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:px-8" aria-labelledby="adimlar-baslik">
        <div className="mx-auto max-w-[1200px]">
          <div className="mx-auto mb-12 max-w-[680px] text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--reward-light)]">Dört temel adım</p>
            <h2 id="adimlar-baslik" className="mt-3 font-display text-3xl font-black sm:text-4xl">İlk sorudan sonuç ekranına</h2>
            <p className="mt-4 leading-7 text-[var(--text-sub)]">Her adımın ne yaptığını ve senden ne beklediğini başlamadan önce gör.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              return (
                <article id={`adim-${index + 1}`} key={step.num} className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--focus-border)] sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: step.background, color: step.color }}>
                      <Icon size={23} aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-black tracking-[0.16em]" style={{ color: step.color }}>ADIM {step.num}</p>
                      <h3 className="mt-1 text-xl font-black">{step.title}</h3>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-7 text-[var(--text-sub)]">{step.desc}</p>
                  <p className="mt-4 border-t border-[var(--border)] pt-4 text-xs leading-6 text-[var(--text-muted)]">{step.note}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)] px-6 py-20 lg:px-8" aria-labelledby="kapsam-baslik">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-[720px]">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--growth-light)]">Ders ve sınav kapsamı</p>
              <h2 id="kapsam-baslik" className="mt-3 font-display text-3xl font-black sm:text-4xl">Hangi alanda pratik yapabilirsin?</h2>
              <p className="mt-4 leading-7 text-[var(--text-sub)]">Her dersin sınav kapsamı farklıdır. Ayrıntılı konu başlıkları için ilgili ders sayfasına geçebilirsin.</p>
            </div>
            <Link href="/konular" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--focus-light)] hover:underline">
              Tüm konuları gör <ArrowRight size={15} />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {GAME_LIST.map((game) => (
              <Link key={game.slug} href={`/konular/${game.slug}`} className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--focus-border)]">
                <div className="mb-5 h-1.5 w-12 rounded-full" style={{ backgroundColor: game.colorHex }} />
                <h3 className="font-black">{game.name}</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {game.examTags.map((tag) => (
                    <span key={tag} className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[10px] font-bold text-[var(--text-sub)]">{tag}</span>
                  ))}
                </div>
                <p className="mt-4 line-clamp-3 text-xs leading-6 text-[var(--text-muted)]">{game.description}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[var(--focus-light)]">Kapsamı incele <ArrowRight size={13} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:px-8" aria-labelledby="faydalar-baslik">
        <div className="mx-auto max-w-[1200px]">
          <div className="mx-auto mb-12 max-w-[680px] text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--wisdom-light)]">Deneyimin içinde</p>
            <h2 id="faydalar-baslik" className="mt-3 font-display text-3xl font-black sm:text-4xl">Bir soru ekranından fazlası</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] md:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <article key={title} className="bg-[var(--surface)] p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--focus-bg)] text-[var(--focus-light)]">
                  <Icon size={21} aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-black">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--text-sub)]">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)] px-6 py-20 lg:px-8" aria-labelledby="seffaflik-baslik">
        <div className="mx-auto grid max-w-[1100px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--growth-bg)] text-[var(--growth-light)]">
              <ShieldCheck size={24} aria-hidden="true" />
            </div>
            <h2 id="seffaflik-baslik" className="mt-5 font-display text-3xl font-black">Başlamadan önce bilmen gerekenler</h2>
            <p className="mt-4 leading-7 text-[var(--text-sub)]">Google’dan, bir reklamdan veya doğrudan geldiğinde aynı açık bilgilerle karşılaşırsın.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Ücretsiz başlangıç', 'Kayıt ve temel başlangıç ücretsizdir; limitler ve ek planlar değişebilir.'],
              ['Hesap gereksinimi', 'Misafir önizlemesi vardır; kalıcı ilerleme için Google ile giriş gerekir.'],
              ['Bağımsız platform', 'Bilge Arena, ÖSYM veya MEB tarafından işletilen resmî bir hizmet değildir.'],
              ['Sonuç beklentisi', 'Düzenli pratiğe yardımcı olur; sınav puanı veya başarı garantisi vermez.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="flex items-center gap-2 font-bold"><Check size={16} className="text-[var(--growth-light)]" />{title}</div>
                <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm lg:col-start-2">
            <Link href="/arena/premium" className="font-semibold text-[var(--focus-light)] hover:underline">Plan ve limitleri incele</Link>
            <Link href="/gizlilik-politikasi" className="font-semibold text-[var(--focus-light)] hover:underline">Gizlilik politikası</Link>
            <Link href="/kullanim-kosullari" className="font-semibold text-[var(--focus-light)] hover:underline">Kullanım koşulları</Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 lg:px-8" aria-labelledby="sss-baslik">
        <div className="mx-auto grid max-w-[1100px] gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--reward-bg)] text-[var(--reward-light)]">
              <CircleHelp size={24} aria-hidden="true" />
            </div>
            <h2 id="sss-baslik" className="mt-5 font-display text-3xl font-black">Sık sorulan sorular</h2>
            <p className="mt-4 leading-7 text-[var(--text-sub)]">Karar vermeden önce en çok merak edilen yanıtlar.</p>
          </div>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 open:border-[var(--focus-border)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold marker:hidden">
                  {item.q}
                  <span className="text-[var(--focus-light)] transition-transform group-open:rotate-90"><ChevronRight size={18} /></span>
                </summary>
                <p className="mt-4 border-t border-[var(--border)] pt-4 text-sm leading-7 text-[var(--text-sub)]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 lg:px-8">
        <div className="mx-auto max-w-[1100px] overflow-hidden rounded-[28px] border border-[var(--focus-border)] bg-[var(--focus-bg)] p-8 text-center sm:p-12">
          <h2 className="font-display text-3xl font-black sm:text-4xl">İlk oturumunu şimdi başlat</h2>
          <p className="mx-auto mt-4 max-w-[620px] leading-7 text-[var(--text-sub)]">Dersini seç, çalışma biçimini belirle ve ilk sorunu gör. Devam etmek isteyip istemediğine deneyimden sonra karar ver.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <TrackedCtaLink href="/arena" page="nasil-calisir" placement="final_arena" className="w-full sm:w-auto">Arena’ya gir <ArrowRight size={17} /></TrackedCtaLink>
            <TrackedCtaLink href="/rehber" page="nasil-calisir" placement="final_guides" variant="ghost" className="w-full sm:w-auto">Çalışma rehberlerini oku</TrackedCtaLink>
          </div>
        </div>
      </section>
    </div>
  )
}
