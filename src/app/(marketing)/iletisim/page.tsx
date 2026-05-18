import type { Metadata } from 'next'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'İletişim — Bilge Arena',
  description:
    'Bilge Arena ekibiyle iletişime geçin. Soru, öneri, hata bildirimi ve iş birliği teklifleri için bize yazabilirsiniz.',
  alternates: {
    canonical: `${siteUrl}/iletisim`,
  },
  openGraph: {
    title: 'İletişim | Bilge Arena',
    description: 'Sorularınız ve önerileriniz için Bilge Arena ekibiyle iletişime geçin.',
    url: `${siteUrl}/iletisim`,
  },
}

const CONTACT_ITEMS = [
  {
    icon: '✉️',
    title: 'Genel İletişim',
    desc: 'Platform hakkındaki sorularınız, önerileriniz ve geri bildirimleriniz için.',
    value: 'iletisim@bilgearena.com',
    href: 'mailto:iletisim@bilgearena.com',
  },
  {
    icon: '🛠️',
    title: 'Teknik Destek',
    desc: 'Hesap sorunları, hata bildirimleri ve teknik konular için.',
    value: 'destek@bilgearena.com',
    href: 'mailto:destek@bilgearena.com',
  },
  {
    icon: '🤝',
    title: 'İş Birlikleri',
    desc: 'Kurumsal iş birlikleri, içerik ortaklıkları ve sponsorluk teklifleri için.',
    value: 'iletisim@bilgearena.com',
    href: 'mailto:iletisim@bilgearena.com',
  },
]

const TOPICS = [
  {
    icon: '🐞',
    title: 'Hata Bildirimi',
    desc: 'Platformda karşılaştığınız bir hatayı bize bildirin. Hataların çözülmesi için ekran görüntüsü ve adımlar paylaşmanız süreci hızlandırır.',
  },
  {
    icon: '💡',
    title: 'Öneri & Geri Bildirim',
    desc: 'Yeni bir özellik fikriniz mi var? Platformun daha iyi olması için ne düşündüğünüzü merak ediyoruz. Her öneri değerlendirilir.',
  },
  {
    icon: '❓',
    title: 'Hesap Sorunları',
    desc: 'Giriş yapamıyor, şifrenizi sıfırlamakta sorun yaşıyor ya da hesabınıza erişemiyorsanız destek ekibimize yazabilirsiniz.',
  },
  {
    icon: '📝',
    title: 'Soru Bankası',
    desc: 'Yanlış veya hatalı bir soru mu gördünüz? Soru numarasını ve hatalı kısmı belirterek bize iletin, en kısa sürede düzeltelim.',
  },
  {
    icon: '🏫',
    title: 'Okul & Kurum',
    desc: 'Okulunuzda ya da dershanenizde Bilge Arena\'yı kullanmak mı istiyorsunuz? Kurumsal kullanım ve toplu hesap seçenekleri için iletişime geçin.',
  },
  {
    icon: '📣',
    title: 'Basın & Medya',
    desc: 'Bilge Arena hakkında haber yapmak veya röportaj talep etmek için iletisim@bilgearena.com adresine yazabilirsiniz.',
  },
]

const FAQ = [
  {
    q: 'Yanıt süresi ne kadar?',
    a: 'Tüm iletişim taleplerine en geç 2 iş günü içinde yanıt veriyoruz. Acil teknik sorunlar genellikle aynı gün yanıtlanır.',
  },
  {
    q: 'Soru önermek mümkün mü?',
    a: 'Evet! Doğru kaynaklara dayalı, özgün sorularınızı destek@bilgearena.com adresine gönderebilirsiniz. Soru bankasına katkı sağlayan kullanıcılara özel rozet veriyoruz.',
  },
  {
    q: 'Platform tamamen ücretsiz mi?',
    a: 'Evet, Bilge Arena tamamen ücretsizdir. Kayıt, tüm oyun modları, soru bankası ve yapay zeka asistanı — hepsi ücretsiz. Herhangi bir ücretli abonelik planımız yoktur.',
  },
  {
    q: 'Hesabımı nasıl silebilirim?',
    a: 'Hesabınızı silmek için destek@bilgearena.com adresine kayıtlı e-posta adresinizden yazmanız yeterlidir. Talebiniz 5 iş günü içinde işleme alınır.',
  },
]

export default function IletisimPage() {
  return (
    <div className="mx-auto max-w-[800px] px-6 py-12 lg:px-8">
      {/* Başlık */}
      <section className="mb-16 text-center">
        <div className="mb-4 text-5xl">💬</div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Bize Ulaşın
        </h1>
        <p className="mx-auto max-w-[560px] text-base leading-relaxed text-[var(--text-sub)]">
          Sorularınız, önerileriniz veya sorunlarınız için ekibimize yazabilirsiniz.
          Her mesajı dikkatle okuyoruz ve en kısa sürede yanıt veriyoruz.
        </p>
      </section>

      {/* İletişim Kanalları */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">İletişim Kanalları</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CONTACT_ITEMS.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--focus)]"
            >
              <span className="text-3xl">{item.icon}</span>
              <div>
                <div className="mb-1 font-bold">{item.title}</div>
                <div className="mb-3 text-xs leading-relaxed text-[var(--text-sub)]">{item.desc}</div>
                <div className="text-sm font-medium text-[var(--focus)]">{item.value}</div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Hangi Konularda Yazabilirsiniz */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Hangi Konularda Yazabilirsiniz?</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TOPICS.map((topic) => (
            <div
              key={topic.title}
              className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
            >
              <span className="text-2xl">{topic.icon}</span>
              <div>
                <div className="mb-1 text-sm font-bold">{topic.title}</div>
                <div className="text-xs leading-relaxed text-[var(--text-sub)]">{topic.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sık Sorulan Sorular */}
      <section className="mb-16">
        <h2 className="mb-8 text-center text-2xl font-bold">Sık Sorulan Sorular</h2>
        <div className="flex flex-col gap-4">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="mb-2 font-bold text-sm">{item.q}</div>
              <div className="text-sm leading-relaxed text-[var(--text-sub)]">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Yanıt Süresi Notu */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
        <div className="mb-3 text-3xl">⏱️</div>
        <h2 className="mb-3 text-xl font-bold">Yanıt Süremiz</h2>
        <p className="text-sm leading-relaxed text-[var(--text-sub)]">
          Tüm iletişim taleplerine <strong>en geç 2 iş günü</strong> içinde yanıt veriyoruz.
          Teknik sorunlar ve hata bildirimleri öncelikli olarak değerlendirilir.
          Hafta sonları ve resmi tatillerde yanıt süresi uzayabilir.
        </p>
        <p className="mt-4 text-sm font-medium text-[var(--focus)]">
          iletisim@bilgearena.com
        </p>
      </section>
    </div>
  )
}
