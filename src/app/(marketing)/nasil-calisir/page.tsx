import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Nasil Calisir',
  description:
    'Bilge Arena nasil calisir? Kayit ol, oyun sec, sorulari coz, XP kazan ve siralamalarda yuksel!',
  openGraph: {
    title: 'Nasil Calisir | Bilge Arena',
    description: 'Bilge Arena\'da YKS hazirlik sureci adim adim.',
  },
}

const STEPS = [
  {
    num: '01',
    icon: '🚀',
    title: 'Hesap Olustur',
    desc: 'Google hesabinla tek tikla kayit ol. Misafir olarak da oynayabilirsin — ama ilerlemen kaydedilmez.',
    detail: 'Google OAuth ile guvenli giris. Ek bilgi istenmez.',
  },
  {
    num: '02',
    icon: '🎮',
    title: 'Oyun Sec',
    desc: '5 farkli oyun konsolundan birini sec: Matematik, Turkce, Fen, Sosyal veya Ingilizce (WordQuest).',
    detail: 'Her konsol kendi tema rengine, kategorilerine ve liderboard\'una sahiptir.',
  },
  {
    num: '03',
    icon: '⚡',
    title: 'Mod Belirle',
    desc: 'Klasik, Blitz, Maraton, Boss ve Pratik modlarindan seviyene uygun olani sec.',
    detail: 'Klasik: 10 soru / 30sn. Blitz: 5 soru / 15sn. Boss: 5 zor soru / 45sn.',
  },
  {
    num: '04',
    icon: '🧠',
    title: 'Sorulari Coz',
    desc: 'Zamanli sorulari coz, dogru cevaplarla seri olustur ve bonus XP kazan.',
    detail: '3+ seri: +5 XP bonus. 5+ seri: +10 XP bonus. 10+ seri: "YANGIN!" modu!',
  },
  {
    num: '05',
    icon: '📊',
    title: 'Sonuclari Incele',
    desc: 'Her oturum sonunda rank (S/A/B/C/D), toplam XP ve detayli cozum analizini gor.',
    detail: '%90+ = S rank. Her soru icin detayli aciklama + yorum + hata raporlama.',
  },
  {
    num: '06',
    icon: '🏆',
    title: 'Yuksel & Rekabet Et',
    desc: 'XP biriktir, seviye atla, rozetler topla ve haftalik siralama listesinde yerinizi alin.',
    detail: '5 seviye: Acemi → Cirak → Bilge → Usta → Efsane. 14 rozet kazanilabilir.',
  },
]

const FEATURES = [
  { icon: '🦉', title: 'Bilge Asistan', desc: 'AI destekli soru cozumu ve konu anlatimi' },
  { icon: '💬', title: 'Soru Yorumlari', desc: 'Sorular hakkinda yorum yap, tartis, ogren' },
  { icon: '📱', title: 'Her Cihazda', desc: 'Telefon, tablet ve bilgisayarda calısır' },
  { icon: '🆓', title: 'Tamamen Ucretsiz', desc: 'Sinav bankasi dahil her sey ucretsiz' },
]

export default function NasilCalisirPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12 lg:px-8">
      {/* Hero */}
      <section className="mb-16 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Nasil Calisir?
        </h1>
        <p className="mx-auto max-w-[520px] text-base text-[var(--text-sub)]">
          6 adimda YKS hazirligini oyuna donustur. Kayit ol, oyna, ogren, yuksel!
        </p>
      </section>

      {/* Adimlar */}
      <section className="mb-16 space-y-6">
        {STEPS.map((s) => (
          <div
            key={s.num}
            className="group flex gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--focus)]/30"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--focus-bg)] text-2xl">
              {s.icon}
            </div>
            <div className="flex-1">
              <div className="mb-0.5 text-[10px] font-bold tracking-widest text-[var(--focus)]">
                ADIM {s.num}
              </div>
              <h3 className="mb-1.5 text-lg font-bold">{s.title}</h3>
              <p className="mb-2 text-sm leading-relaxed text-[var(--text-sub)]">{s.desc}</p>
              <p className="text-xs text-[var(--text-muted)] italic">{s.detail}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Ekstra Ozellikler */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Ekstra Ozellikler</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <span className="text-2xl">{f.icon}</span>
              <div>
                <div className="mb-1 font-bold text-sm">{f.title}</div>
                <div className="text-xs text-[var(--text-sub)]">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center">
        <h2 className="mb-4 text-2xl font-bold">Hazir misin?</h2>
        <p className="mb-6 text-sm text-[var(--text-sub)]">
          Hemen kaydol ve ilk oyununu oynamaya basla!
        </p>
        <Link href="/arena">
          <Button variant="primary" size="lg">
            Oynamaya Basla
          </Button>
        </Link>
      </section>
    </div>
  )
}
