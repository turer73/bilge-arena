import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hakkinda',
  description:
    'Bilge Arena, YKS\'ye hazirlanan ogrenciler icin oyunlastirilmis ucretsiz bir alistirma platformudur. Misyonumuz, vizyonumuz ve takim bilgileri.',
  openGraph: {
    title: 'Hakkinda | Bilge Arena',
    description: 'Bilge Arena\'nin hikayesi, misyonu ve vizyonu.',
  },
}

const VALUES = [
  {
    icon: '🎯',
    title: 'Hedefe Odakli',
    desc: 'Her ozelligimiz ogrencinin basari oranini artirmaya yoneliktir.',
  },
  {
    icon: '🎮',
    title: 'Oyunlastirma',
    desc: 'Calismayi eglenceye donusturuyoruz. XP, rozetler ve siralama ile motivasyonu artiriyoruz.',
  },
  {
    icon: '🤝',
    title: 'Erisebilirlik',
    desc: 'Platform tamamen ucretsiz. Her ogrenci, her yerden erisebilir.',
  },
  {
    icon: '📊',
    title: 'Veri Odakli',
    desc: 'Konu bazli ilerleme, zayif nokta analizi ve kisisellestirilmis oneriler sunuyoruz.',
  },
]

const TIMELINE = [
  { year: '2024', event: 'Fikir asamasi — YKS hazirligi neden sikici olmak zorunda?' },
  { year: '2025 Q1', event: 'Prototip ve soru bankasi olusturma' },
  { year: '2025 Q2', event: 'Beta lansman — ilk 100 ogrenci' },
  { year: '2025 Q3', event: 'AYT modulleri ve yapay zeka asistan' },
  { year: '2026', event: 'Tam suru — 5 oyun, 5000+ soru, topluluk ozellikleri' },
]

export default function HakkindaPage() {
  return (
    <div className="mx-auto max-w-[800px] px-6 py-12 lg:px-8">
      {/* Baslik */}
      <section className="mb-16 text-center">
        <div className="mb-4 text-5xl">🦉</div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Bilge Arena Hakkinda
        </h1>
        <p className="mx-auto max-w-[560px] text-base leading-relaxed text-[var(--text-sub)]">
          YKS&#39;ye hazirlanan ogrenciler icin oyun tabanli, ucretsiz bir alistirma platformu.
          Amacimiz calismayi sikici olmaktan cikarip, ogrenciyi motive eden bir deneyime
          donusturmek.
        </p>
      </section>

      {/* Misyon & Vizyon */}
      <section className="mb-16 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="mb-3 text-lg font-bold">Misyonumuz</h2>
          <p className="text-sm leading-relaxed text-[var(--text-sub)]">
            Her Turk ogrenciye esit, eglenceli ve etkili bir sinav hazirlık deneyimi sunmak.
            Sosyo-ekonomik farkliliklari en aza indirerek egitimde firsat esitligi saglamak.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="mb-3 text-lg font-bold">Vizyonumuz</h2>
          <p className="text-sm leading-relaxed text-[var(--text-sub)]">
            Turkiye&#39;nin en buyuk oyunlastirilmis egitim platformu olmak.
            Her ogrencinin potansiyelini kesfettigi, olctuguvu ve gelistirdigi bir arena yaratmak.
          </p>
        </div>
      </section>

      {/* Degerlerimiz */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Degerlerimiz</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <span className="text-2xl">{v.icon}</span>
              <div>
                <div className="mb-1 font-bold text-sm">{v.title}</div>
                <div className="text-xs leading-relaxed text-[var(--text-sub)]">{v.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Yol Haritasi */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Yol Haritamiz</h2>
        <div className="relative ml-4 border-l-2 border-[var(--border)] pl-8">
          {TIMELINE.map((t, i) => (
            <div key={i} className="relative mb-8 last:mb-0">
              <div className="absolute -left-[41px] top-1 h-3 w-3 rounded-full bg-[var(--focus)]" />
              <div className="text-xs font-bold text-[var(--focus)]">{t.year}</div>
              <div className="mt-1 text-sm text-[var(--text-sub)]">{t.event}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Iletisim */}
      <section className="text-center">
        <h2 className="mb-4 text-2xl font-bold">Iletisim</h2>
        <p className="text-sm text-[var(--text-sub)]">
          Sorulariniz, onerileriniz veya is birlikleriniz icin bize ulasin.
        </p>
        <p className="mt-2 text-sm font-medium text-[var(--focus)]">iletisim@bilgearena.com</p>
      </section>
    </div>
  )
}
