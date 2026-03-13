import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Nasıl Çalışır — Adım Adım YKS Hazırlık',
  description:
    'Bilge Arena nasıl çalışır? Kayıt ol, oyun seç, soruları çöz, XP kazan ve sıralamalarda yüksel!',
  alternates: {
    canonical: `${siteUrl}/nasil-calisir`,
  },
  openGraph: {
    title: 'Nasıl Çalışır | Bilge Arena',
    description: 'Bilge Arena\'da YKS hazırlık süreci adım adım.',
    url: `${siteUrl}/nasil-calisir`,
  },
}

const STEPS = [
  {
    num: '01',
    icon: '🚀',
    title: 'Hesap Oluştur',
    desc: 'Google hesabınla tek tıkla kayıt ol. Misafir olarak da oynayabilirsin — ama ilerlemen kaydedilmez.',
    detail: 'Google OAuth ile güvenli giriş. Ek bilgi istenmez.',
  },
  {
    num: '02',
    icon: '🎮',
    title: 'Oyun Seç',
    desc: '5 farklı oyun konsolundan birini seç: Matematik, Türkçe, Fen, Sosyal veya İngilizce (WordQuest).',
    detail: 'Her konsol kendi tema rengine, kategorilerine ve liderboard\'una sahiptir.',
  },
  {
    num: '03',
    icon: '⚡',
    title: 'Mod Belirle',
    desc: 'Klasik, Blitz, Maraton, Boss ve Pratik modlarından seviyene uygun olanı seç.',
    detail: 'Klasik: 10 soru / 30sn. Blitz: 5 soru / 15sn. Boss: 5 zor soru / 45sn.',
  },
  {
    num: '04',
    icon: '🧠',
    title: 'Soruları Çöz',
    desc: 'Zamanlı soruları çöz, doğru cevaplarla seri oluştur ve bonus XP kazan.',
    detail: '3+ seri: +5 XP bonus. 5+ seri: +10 XP bonus. 10+ seri: "YANGIN!" modu!',
  },
  {
    num: '05',
    icon: '📊',
    title: 'Sonuçları İncele',
    desc: 'Her oturum sonunda rank (S/A/B/C/D), toplam XP ve detaylı çözüm analizini gör.',
    detail: '%90+ = S rank. Her soru için detaylı açıklama + yorum + hata raporlama.',
  },
  {
    num: '06',
    icon: '🏆',
    title: 'Yüksel & Rekabet Et',
    desc: 'XP biriktir, seviye atla, rozetler topla ve haftalık sıralama listesinde yerinizi alın.',
    detail: '5 seviye: Acemi → Çırak → Bilge → Usta → Efsane. 14 rozet kazanılabilir.',
  },
]

const FEATURES = [
  { icon: '🦉', title: 'Bilge Asistan', desc: 'AI destekli soru çözümü ve konu anlatımı' },
  { icon: '💬', title: 'Soru Yorumları', desc: 'Sorular hakkında yorum yap, tartış, öğren' },
  { icon: '📱', title: 'Her Cihazda', desc: 'Telefon, tablet ve bilgisayarda çalışır' },
  { icon: '🆓', title: 'Tamamen Ücretsiz', desc: 'Sınav bankası dahil her şey ücretsiz' },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Bilge Arena nedir?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Bilge Arena, YKS\'ye hazirlanan ogrenciler icin oyunlastirilmis bir ogrenme platformudur. Matematik, Turkce, Fen, Sosyal ve Ingilizce sorulari cozerek XP kazanir, seviye atlar ve siralamada yukselirsiniz.',
      },
    },
    {
      '@type': 'Question',
      name: 'Bilge Arena ucretli mi?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Hayir, Bilge Arena tamamen ucretsizdir. Soru bankasi, AI asistan ve tum ozellikler ucretsiz olarak sunulmaktadir.',
      },
    },
    {
      '@type': 'Question',
      name: 'Nasil kayit olabilirim?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Google hesabinizla tek tikla giris yapabilirsiniz. Ek bilgi istenmez. Misafir olarak da oynayabilirsiniz ancak ilerlemeniz kaydedilmez.',
      },
    },
    {
      '@type': 'Question',
      name: 'Hangi dersler mevcut?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Matematik, Turkce, Fen Bilimleri (Fizik, Kimya, Biyoloji), Sosyal Bilimler (Tarih, Cografya, Felsefe) ve Ingilizce (WordQuest) oyun konsollari mevcuttur.',
      },
    },
  ],
}

export default function NasilCalisirPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* Hero */}
      <section className="mb-16 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Nasıl Çalışır?
        </h1>
        <p className="mx-auto max-w-[520px] text-base text-[var(--text-sub)]">
          6 adımda YKS hazırlığını oyuna dönüştür. Kayıt ol, oyna, öğren, yüksel!
        </p>
      </section>

      {/* Adımlar */}
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

      {/* Ekstra Özellikler */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Ekstra Özellikler</h2>
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
        <h2 className="mb-4 text-2xl font-bold">Hazır mısın?</h2>
        <p className="mb-6 text-sm text-[var(--text-sub)]">
          Hemen kaydol ve ilk oyununu oynamaya başla!
        </p>
        <Link href="/arena">
          <Button variant="primary" size="lg">
            Oynamaya Başla
          </Button>
        </Link>
      </section>
    </div>
  )
}
