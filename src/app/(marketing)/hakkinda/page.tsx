import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hakkında',
  description:
    'Bilge Arena, YKS\'ye hazırlanan öğrenciler için oyunlaştırılmış ücretsiz bir alıştırma platformudur. Misyonumuz, vizyonumuz ve takım bilgileri.',
  openGraph: {
    title: 'Hakkında | Bilge Arena',
    description: 'Bilge Arena\'nın hikayesi, misyonu ve vizyonu.',
  },
}

const VALUES = [
  {
    icon: '🎯',
    title: 'Hedefe Odaklı',
    desc: 'Her özelliğimiz öğrencinin başarı oranını artırmaya yöneliktir.',
  },
  {
    icon: '🎮',
    title: 'Oyunlaştırma',
    desc: 'Çalışmayı eğlenceye dönüştürüyoruz. XP, rozetler ve sıralama ile motivasyonu artırıyoruz.',
  },
  {
    icon: '🤝',
    title: 'Erişebilirlik',
    desc: 'Platform tamamen ücretsiz. Her öğrenci, her yerden erişebilir.',
  },
  {
    icon: '📊',
    title: 'Veri Odaklı',
    desc: 'Konu bazlı ilerleme, zayıf nokta analizi ve kişiselleştirilmiş öneriler sunuyoruz.',
  },
]

const TIMELINE = [
  { year: '2024', event: 'Fikir aşaması — YKS hazırlığı neden sıkıcı olmak zorunda?' },
  { year: '2025 Q1', event: 'Prototip ve soru bankası oluşturma' },
  { year: '2025 Q2', event: 'Beta lansman — ilk 100 öğrenci' },
  { year: '2025 Q3', event: 'AYT modülleri ve yapay zeka asistan' },
  { year: '2026', event: 'Tam sürüm — 5 oyun, 5000+ soru, topluluk özellikleri' },
]

export default function HakkindaPage() {
  return (
    <div className="mx-auto max-w-[800px] px-6 py-12 lg:px-8">
      {/* Başlık */}
      <section className="mb-16 text-center">
        <div className="mb-4 text-5xl">🦉</div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Bilge Arena Hakkında
        </h1>
        <p className="mx-auto max-w-[560px] text-base leading-relaxed text-[var(--text-sub)]">
          YKS&#39;ye hazırlanan öğrenciler için oyun tabanlı, ücretsiz bir alıştırma platformu.
          Amacımız çalışmayı sıkıcı olmaktan çıkarıp, öğrenciyi motive eden bir deneyime
          dönüştürmek.
        </p>
      </section>

      {/* Misyon & Vizyon */}
      <section className="mb-16 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="mb-3 text-lg font-bold">Misyonumuz</h2>
          <p className="text-sm leading-relaxed text-[var(--text-sub)]">
            Her Türk öğrenciye eşit, eğlenceli ve etkili bir sınav hazırlık deneyimi sunmak.
            Sosyo-ekonomik farklılıkları en aza indirerek eğitimde fırsat eşitliği sağlamak.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="mb-3 text-lg font-bold">Vizyonumuz</h2>
          <p className="text-sm leading-relaxed text-[var(--text-sub)]">
            Türkiye&#39;nin en büyük oyunlaştırılmış eğitim platformu olmak.
            Her öğrencinin potansiyelini keşfettiği, ölçtüğü ve geliştirdiği bir arena yaratmak.
          </p>
        </div>
      </section>

      {/* Değerlerimiz */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Değerlerimiz</h2>
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

      {/* Yol Haritası */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Yol Haritamız</h2>
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

      {/* İletişim */}
      <section className="text-center">
        <h2 className="mb-4 text-2xl font-bold">İletişim</h2>
        <p className="text-sm text-[var(--text-sub)]">
          Sorularınız, önerileriniz veya iş birlikleriniz için bize ulaşın.
        </p>
        <p className="mt-2 text-sm font-medium text-[var(--focus)]">iletisim@bilgearena.com</p>
      </section>
    </div>
  )
}
