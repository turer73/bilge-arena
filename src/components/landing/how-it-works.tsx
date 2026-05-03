import { Shield, Target, Zap, Trophy, Users } from 'lucide-react'

const STEPS = [
  {
    n: '01',
    icon: Shield,
    color: { m: 'var(--focus)', l: 'var(--focus-light)', bg: 'var(--focus-bg)' },
    title: 'Ücretsiz Kaydol',
    desc: 'Google ile saniyeler içinde hesap oluştur.',
  },
  {
    n: '02',
    icon: Target,
    color: { m: 'var(--reward)', l: 'var(--reward-light)', bg: 'var(--reward-bg)' },
    title: 'Oyunu Seç',
    desc: 'Hangi dersten alıştırma yapmak istediğini seç.',
  },
  {
    n: '03',
    icon: Zap,
    color: { m: 'var(--growth)', l: 'var(--growth-light)', bg: 'var(--growth-bg)' },
    title: 'Soruları Çöz',
    desc: 'Zamanlı sorular, 5 şık, anında geri bildirim.',
  },
  {
    n: '04',
    icon: Trophy,
    color: { m: 'var(--wisdom)', l: 'var(--wisdom-light)', bg: 'var(--wisdom-bg)' },
    title: 'XP Kazan & Yüksel',
    desc: 'Her doğru cevap XP kazandırır, seviye atla, listeye gir.',
  },
  {
    n: '05',
    icon: Users,
    color: { m: 'var(--urgency)', l: 'var(--urgency-light)', bg: 'var(--urgency-bg)' },
    title: 'Arkadaşlarınla Yarış',
    desc: 'Oda kur, kod paylaş, eş zamanlı çoklu oyuncu turnuvası.',
    badge: 'YENİ',
  },
]

interface HowItWorksProps {
  config?: Record<string, unknown>
}

export function HowItWorks({ config }: HowItWorksProps = {}) {
  const configSteps = config?.steps as { title?: string; desc?: string }[] | undefined
  const steps = STEPS.map((step, i) => ({
    ...step,
    title: configSteps?.[i]?.title || step.title,
    desc: configSteps?.[i]?.desc || step.desc,
  }))
  return (
    <section className="bg-[var(--surface)] py-24">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        {/* Baslik */}
        <div className="mb-14 text-center">
          <div className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--reward-light)]">
            Nasıl Çalışır
          </div>
          <h2 className="font-display text-4xl font-black lg:text-[42px]">
            <span className="text-[var(--text)]">5 Adımda </span>
            <span className="text-[var(--focus-light)]">Arena&apos;ya Gir</span>
          </h2>
        </div>

        {/* Adimlar */}
        <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Baglanti cizgisi (sadece desktop) */}
          <div
            className="absolute left-[10%] right-[10%] top-[52px] hidden h-px lg:block"
            style={{
              background:
                'linear-gradient(90deg, transparent, var(--focus-border), transparent)',
            }}
          />

          {steps.map(({ n, icon: Icon, color, title, desc, badge }) => (
            <div
              key={n}
              className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] p-7 text-center"
            >
              {badge && (
                <div
                  className="absolute -right-2 -top-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white"
                  style={{ background: 'var(--urgency)' }}
                >
                  {badge}
                </div>
              )}
              <div
                className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2"
                style={{
                  background: color.bg,
                  borderColor: color.m,
                  boxShadow: `0 0 20px ${color.bg}`,
                }}
              >
                <Icon size={26} style={{ color: color.l }} />
              </div>
              <div
                className="mb-2 text-xs font-extrabold tracking-[0.15em]"
                style={{ color: color.l }}
              >
                {n}
              </div>
              <h3 className="mb-2.5 text-lg font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-[var(--text-sub)]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
