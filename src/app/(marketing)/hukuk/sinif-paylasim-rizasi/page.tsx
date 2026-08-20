import type { Metadata } from 'next'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Sınıf İlerleme Paylaşımı Açık Rıza Metni',
  description: 'Bilge Arena kurum sınıfında öğrenci ilerleme göstergelerinin yetkili yönetici ve öğretmenle paylaşılmasına ilişkin açık rıza metni.',
  alternates: { canonical: `${siteUrl}/hukuk/sinif-paylasim-rizasi` },
}

export default function ClassroomSharingConsentPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--focus)]">Sürüm: sharing-v1</p>
      <h1 className="mb-2 text-3xl font-bold">Sınıf İlerleme Paylaşımı Açık Rıza Metni</h1>
      <p className="mb-10 text-sm text-[var(--text-sub)]">Son güncelleme: 20 Ağustos 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-[var(--text-muted)]">
        <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-5">
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">Rızanın konusu</h2>
          <p>
            Davet ekranındaki ayrı açık rıza kutusunu seçip “Sınıfa katıl” düğmesine basmanız halinde, sınıfa
            katıldıktan sonra oluşan öğrenme göstergelerinizin aşağıdaki sınırlar içinde paylaşılmasına rıza
            vermiş olursunuz. Bu metin, bilgi verme amaçlı{' '}
            <a href="/hukuk/sinif-aydinlatma" className="font-bold text-[var(--focus)] underline underline-offset-2">
              Sınıf Katılımı Aydınlatma Metni
            </a>
            &apos;nden ayrıdır.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">1. Paylaşılacak veriler</h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>Güvenli öğrenci takma adınız ve sınıfa katılım zamanınız.</li>
            <li>Ders, ünite, konu ve kazanım başlıkları altında toplulaştırılmış çalışma ve doğruluk göstergeleri.</li>
            <li>Kanıt sayısı/tarihi, skor, güven seviyesi ve “kanıt yetersiz / gelişiyor / güçlü” durumları.</li>
            <li>Toplu süre, ipucu kullanımı, hızlı yanlış ve öz değerlendirme göstergelerinden türetilen çalışma eğilimleri.</li>
            <li>Bu göstergelere dayalı çalışma programı, takip, değerlendirme ve öğrenci durum raporları.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">2. Paylaşımın alıcıları ve amacı</h2>
          <p>
            Veriler yalnız sınıfa atanmış öğretmen ve aynı kurumdaki yetkili yöneticiyle; öğrenci durumunu izleme,
            destek ihtiyacını belirleme, öğretmen incelemesine tabi çalışma programı hazırlama ve durum raporu
            oluşturma amaçlarıyla paylaşılır. Bilge Arena veli iletişim adresi saklamaz ve otomatik e-posta veya
            WhatsApp göndermez; ekrandaki taslağın platform dışında kullanılması kurumun ayrıca değerlendireceği
            bir işlemdir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">3. Paylaşım dışında kalanlar</h2>
          <p>
            E-posta adresiniz, telefonunuz, profil UUID&apos;niz, ham cevaplarınız, tek tek yanlış soru ayrıntılarınız,
            XP&apos;niz ve sınıfa katılmadan önceki öğrenme kanıtlarınız kurum ekranına aktarılmaz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">4. Özgür irade ve sonuçları</h2>
          <p>
            Rıza vermek zorunlu değildir. Rıza vermezseniz bu kurum sınıfına katılım tamamlanmaz; kişisel Bilge
            Arena hesabınızı sınıf dışındaki özelliklerle kullanmaya devam edebilirsiniz. Rıza yalnız bu sınıf ve
            belirtilen paylaşım için geçerlidir; reklam veya pazarlama izni değildir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">5. Rızayı geri çekme</h2>
          <p>
            Sınıflarım ekranından sınıftan ayrılarak rızanızı istediğiniz zaman geri çekebilirsiniz. Kurumun yeni
            ilerleme verilerinize erişimi ve yeni ödev erişiminiz bu işlemle kesilir. Geri çekme ileriye yönelik
            sonuç doğurur; daha önce hukuka uygun gerçekleştirilen işlemleri geçersiz kılmaz. Ayrıca{' '}
            <strong>destek@bilgearena.com</strong> adresine başvurabilirsiniz.
          </p>
        </section>

        <p className="border-t border-[var(--border)] pt-6 text-xs text-[var(--text-sub)]">
          Açık rızanın belirli, bilgilendirmeye dayalı ve özgür iradeyle verilmesi; aydınlatmadan ayrı alınması
          gerekir. Resmî bilgi için Kişisel Verileri Koruma Kurumunun{' '}
          <a
            href="https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[var(--focus)] underline underline-offset-2"
          >
            2026/347 sayılı ilke kararı duyurusunu
          </a>
          {' '}inceleyebilirsiniz.
        </p>
      </div>
    </div>
  )
}
