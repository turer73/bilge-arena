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
        text: 'Bilge Arena, YKS\'ye hazırlanan öğrenciler için oyunlaştırılmış bir öğrenme platformudur. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularını çözerek XP kazanır, seviye atlar ve sıralamada yükselirsiniz.',
      },
    },
    {
      '@type': 'Question',
      name: 'Bilge Arena ücretli mi?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Hayır, Bilge Arena tamamen ücretsizdir. Soru bankası, AI asistan ve tüm özellikler ücretsiz olarak sunulmaktadır.',
      },
    },
    {
      '@type': 'Question',
      name: 'Nasıl kayıt olabilirim?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Google hesabınızla tek tıkla giriş yapabilirsiniz. Ek bilgi istenmez. Misafir olarak da oynayabilirsiniz ancak ilerlemeniz kaydedilmez.',
      },
    },
    {
      '@type': 'Question',
      name: 'Hangi dersler mevcut?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Matematik, Türkçe, Fen Bilimleri (Fizik, Kimya, Biyoloji), Sosyal Bilimler (Tarih, Coğrafya, Felsefe) ve İngilizce (WordQuest) oyun konsolları mevcuttur.',
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

      {/* Soru Bankasi */}
      <section className="mb-16">
        <h2 className="mb-3 text-center text-2xl font-bold">Soru Bankası</h2>
        <p className="mb-8 text-center text-sm text-[var(--text-sub)]">
          3700+ özgün soru, 5 ders, 20+ kategori. Sürekli büyüyor.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { name: 'Matematik', count: 960, cats: 'Sayılar, Problemler, Geometri, Denklemler, Fonksiyonlar, Olasılık', color: '#2563EB', icon: '🧮' },
            { name: 'Türkçe', count: 920, cats: 'Paragraf, Dil Bilgisi, Sözcük, Anlam, Yazım', color: '#D97706', icon: '📖' },
            { name: 'Fen', count: 600, cats: 'Fizik, Kimya, Biyoloji', color: '#059669', icon: '🔬' },
            { name: 'Sosyal', count: 604, cats: 'Tarih, Coğrafya, Felsefe', color: '#7C3AED', icon: '🌍' },
            { name: 'İngilizce', count: 635, cats: 'Vocabulary, Grammar, Cloze, Dialogue', color: '#3B82F6', icon: '🌐' },
          ].map((d) => (
            <div
              key={d.name}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-center"
            >
              <div className="mb-2 text-2xl">{d.icon}</div>
              <div className="text-sm font-bold">{d.name}</div>
              <div className="font-display text-2xl font-black" style={{ color: d.color }}>
                {d.count}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">soru</div>
              <div className="mt-2 text-[10px] leading-relaxed text-[var(--text-sub)]">
                {d.cats}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Zorluk Sistemi */}
      <section className="mb-16">
        <h2 className="mb-3 text-center text-2xl font-bold">Zorluk Sistemi</h2>
        <p className="mb-8 text-center text-sm text-[var(--text-sub)]">
          Her soru 5 kademeli zorluk seviyesinde. Sistem başarına göre otomatik ayarlar.
        </p>

        <div className="space-y-3">
          {[
            { level: 1, name: 'Kolay', color: '#22C55E', desc: 'Temel bilgi ve doğrudan hatırlatma. Konuya yeni başlayanlar için.', xp: '10 XP', example: '"Aşağıdakilerden hangisi asal sayıdır?"' },
            { level: 2, name: 'Orta', color: '#3B82F6', desc: 'Basit uygulama gerektiren tek adımlı sorular. Konuyu bilenler için.', xp: '20 XP', example: '"3 basamaklı 5A7 sayısı 9\'a bölünüyorsa A kaçtır?"' },
            { level: 3, name: 'Zor', color: '#F59E0B', desc: 'Birden fazla adım ve işlem gerektiren sorular. Pratik yapmak isteyenler için.', xp: '30 XP', example: '"Bir işin 1/3\'ü yapılmış, kalanın 2/5\'i daha yapılırsa tamamlanma oranı nedir?"' },
            { level: 4, name: 'Çok Zor', color: '#EF4444', desc: 'Analiz ve sentez gerektiren, tuzak seçenekli sorular. Sınava hazırlananlar için.', xp: '40 XP', example: '"f(x)=2x+1 ve g(x)=x²-3 ise (fog)(2) kaçtır?"' },
            { level: 5, name: 'Uzman', color: '#DC2626', desc: 'Çok adımlı, derin düşünce gerektiren sorular. Ustalar için.', xp: '50 XP', example: '"Dairesel bir havuzun çevresi 62.8m ise alanı kaç m²?"' },
          ].map((d) => (
            <div
              key={d.level}
              className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-black text-white"
                style={{ backgroundColor: d.color }}
              >
                {d.level}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold" style={{ color: d.color }}>{d.name}</h3>
                  <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold text-[var(--reward)]">
                    {d.xp}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-sub)]">{d.desc}</p>
                <p className="mt-1.5 text-xs italic text-[var(--text-muted)]">Örnek: {d.example}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-5">
          <h3 className="mb-2 text-sm font-bold text-[var(--focus)]">Adaptif Zorluk</h3>
          <p className="text-xs leading-relaxed text-[var(--text-sub)]">
            Bilge Arena, başarı oranına göre zorluğu otomatik ayarlar. Çok başarılıysan zorlar,
            zorlanıyorsan kolaylaştırır. Ayrıca yanlış yaptığın soruları tekrar karşılar —
            böylece zayıf noktalarını güçlendirir. Zorluk seçimini kendin de yapabilirsin.
          </p>
        </div>
      </section>

      {/* Oda Modu — Cok Oyunculu */}
      <section className="mb-16">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="rounded-full bg-[var(--urgency)] px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
            YENİ
          </span>
          <h2 className="text-2xl font-bold">Oda Modu — Arkadaşlarınla Yarış</h2>
        </div>
        <p className="mb-8 text-center text-sm text-[var(--text-sub)]">
          Eş zamanlı çoklu oyuncu turnuva sistemi. Oda kur, arkadaşlarına kod paylaş, aynı soruları aynı anda çözün.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { num: '1', icon: '🎯', title: 'Oda Aç', desc: 'Ders, mod, soru sayısı seç. Sistem 6 haneli oda kodu üretir.' },
            { num: '2', icon: '🔗', title: 'Kodu Paylaş', desc: 'Arkadaşlarına kodu gönder, /oda/kod sayfasından girsinler.' },
            { num: '3', icon: '⚔️', title: 'Eş Zamanlı Çöz', desc: 'Tüm oyuncular aynı soruyu aynı anda görür, hızlı doğru = yüksek puan.' },
            { num: '4', icon: '🏆', title: 'Sonucu Gör', desc: 'Her tur sonunda doğru cevap + skor tablosu, oyun sonunda kazanan ilan edilir.' },
          ].map((s) => (
            <div
              key={s.num}
              className="rounded-xl border border-[var(--focus)]/20 bg-[var(--focus-bg)] p-5 text-center"
            >
              <div className="mb-2 text-3xl">{s.icon}</div>
              <div className="mb-1 text-[10px] font-bold tracking-widest text-[var(--focus)]">
                ADIM {s.num}
              </div>
              <h3 className="mb-2 font-bold">{s.title}</h3>
              <p className="text-xs leading-relaxed text-[var(--text-sub)]">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">⚡ Hızlı doğru = bonus puan</span>
          <span className="flex items-center gap-1.5">👥 2-8 oyuncu</span>
          <span className="flex items-center gap-1.5">📲 Realtime sync</span>
          <span className="flex items-center gap-1.5">🔁 Tekrar oyna</span>
        </div>

        <div className="mt-6 text-center">
          <Link href="/oda/yeni">
            <Button variant="primary" size="md">
              Oda Aç
            </Button>
          </Link>
          <Link href="/oda/kod" className="ml-2">
            <Button variant="ghost" size="md">
              Odaya Katıl
            </Button>
          </Link>
        </div>
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
