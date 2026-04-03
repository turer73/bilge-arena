import type { Metadata } from 'next'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Kullanım Koşulları',
  description: 'Bilge Arena kullanım koşulları — platform kuralları, sorumluluklar ve hizmet şartları.',
  alternates: { canonical: `${siteUrl}/kullanim-kosullari` },
}

export default function KullanimKosullariPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Kullanım Koşulları</h1>
      <p className="mb-10 text-sm text-[var(--text-sub)]">Son güncelleme: 9 Mart 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-[var(--text-muted)]">
        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">1. Kabul</h2>
          <p>
            Bilge Arena platformuna (&quot;Platform&quot;) erişerek veya kullanarak bu
            Kullanım Koşullarını kabul etmiş olursunuz. Koşulları kabul etmiyorsanız
            platformu kullanmayınız.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">2. Hizmet Tanımı</h2>
          <p>
            Bilge Arena, YKS (Yükseköğretim Kurumları Sınavı) hazırlığı için
            oyunlaştırılmış bir eğitim platformudur. Platform, çeşitli ders
            kategorilerinde interaktif sorular, sıralama tabloları, başarı
            sistemi ve ilerleme takibi sunar.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">3. Hesap Oluşturma</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Hesap oluşturmak için geçerli bir e-posta adresi gereklidir</li>
            <li>Hesap bilgilerinizin güvenliğinden siz sorumlusunuz</li>
            <li>13 yaş altı kullanıcılar veli/vasi izni olmadan hesap oluşturmamalıdır</li>
            <li>Hesabınızı başkalarıyla paylaşmamalısınız</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">4. Kullanıcı Yükümlülükleri</h2>
          <p>Platform kullanımında aşağıdaki kurallara uymanız gerekmektedir:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Platformu yalnızca eğitim amaçlı kullanmak</li>
            <li>Diğer kullanıcılara saygılı davranmak</li>
            <li>Hile, bot veya otomatik araçlar kullanmamak</li>
            <li>Platformun teknik altyapısına zarar verecek faaliyetlerde bulunmamak</li>
            <li>Yanıltıcı veya sahte bilgi paylaşmamak</li>
            <li>Başka kullanıcıların hesaplarına izinsiz erişmeye çalışmamak</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">5. Fikri Mülkiyet</h2>
          <p>
            Platform üzerindeki tüm içerik (sorular, görseller, tasarım, kod, metin)
            Bilge Arena&apos;ya aittir veya lisanslıdır. İçeriklerin izinsiz kopyalanması,
            dağıtılması veya ticari amaçla kullanılması yasaktır.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">6. İçerik ve Doğruluk</h2>
          <p>
            Platform eğitim desteği amaçlıdır ve resmi bir eğitim kurumu değildir.
            Soruların doğruluğu için azami özen gösterilmekle birlikte, hatalı
            içerik bulunması halinde sorumluluk kabul edilmez. Hatalı soruları
            &quot;Hata Bildir&quot; özelliği ile raporlayabilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">7. Ücretsiz Hizmet</h2>
          <p>
            Bilge Arena şu anda tamamen ücretsizdir. İleride ücretli özellikler
            eklenebilir; bu durumda mevcut ücretsiz özellikler korunacak ve
            kullanıcılar önceden bilgilendirilecektir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">8. Hesap Askıya Alma ve Silme</h2>
          <p>
            Bilge Arena, bu koşulları ihlal eden kullanıcıların hesaplarını önceden
            bildirimde bulunarak veya ağır ihlallerde derhal askıya alma ya da
            silme hakkını saklı tutar. Kullanıcılar hesaplarını istedikleri zaman
            silebilir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">9. Sorumluluk Sınırı</h2>
          <p>
            Platform &quot;olduğu gibi&quot; sunulmakta olup, kesintisiz veya hatasız
            çalışacağı garanti edilmez. Bilge Arena, platformun kullanımından
            doğabilecek doğrudan veya dolaylı zararlardan sorumlu tutulamaz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">10. Değişiklikler</h2>
          <p>
            Bu koşullar önceden bildirilmeksizin güncellenebilir. Önemli
            değişikliklerde kullanıcılar platform üzerinden bilgilendirilir.
            Değişiklik sonrasında platformu kullanmaya devam etmeniz, güncel
            koşulları kabul ettiğiniz anlamına gelir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">11. Uygulanacak Hukuk</h2>
          <p>
            Bu koşullar Türkiye Cumhuriyeti kanunlarına tabidir. Uyuşmazlıklarda
            Türkiye Cumhuriyeti mahkemeleri yetkilidir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">12. İletişim</h2>
          <p>
            Kullanım koşulları hakkında sorularınız için:{' '}
            <strong>destek@bilgearena.com</strong>
          </p>
        </section>
      </div>
    </div>
  )
}
