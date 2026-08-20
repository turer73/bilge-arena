import type { Metadata } from 'next'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Sınıf Katılımı Aydınlatma Metni',
  description: 'Bilge Arena kurum sınıfına katılım ve öğrenci ilerleme verilerinin işlenmesi hakkında aydınlatma metni.',
  alternates: { canonical: `${siteUrl}/hukuk/sinif-aydinlatma` },
}

export default function ClassroomNoticePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--focus)]">Sürüm: notice-v1</p>
      <h1 className="mb-2 text-3xl font-bold">Sınıf Katılımı Aydınlatma Metni</h1>
      <p className="mb-10 text-sm text-[var(--text-sub)]">Son güncelleme: 20 Ağustos 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-[var(--text-muted)]">
        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">1. Veri sorumlusu ve kapsam</h2>
          <p>
            Bu metin, Bilge Arena hesabınızla bir kurum sınıfına katılmanız halinde sınıf üyeliğinizin ve
            katılım sonrasındaki öğrenme göstergelerinizin nasıl işlendiğini açıklar. Veri sorumlusu Bilge
            Arena&apos;dır. Genel veri işleme faaliyetleri için{' '}
            <a href="/kvkk" className="font-bold text-[var(--focus)] underline underline-offset-2">KVKK Aydınlatma Metni</a>
            {' '}ayrıca geçerlidir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">2. İşlenen veriler</h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>Sınıf üyeliği, sınıf adı, güvenli öğrenci takma adı, katılım ve ayrılma zamanları.</li>
            <li>Katılımdan sonra oluşan ders, ünite, konu ve kazanım bazlı soru/kanıt sayıları.</li>
            <li>Toplu doğruluk, bağımsız çalışma, gecikmeli tekrar, süre, ipucu ve hızlı yanlış göstergeleri.</li>
            <li>Bu göstergelerden açıklanabilir kurallarla üretilen skor, güven ve “kanıt yetersiz / gelişiyor / güçlü” durumları.</li>
            <li>Öğretmenin oluşturduğu çalışma programları, takip kayıtları, raporlar ve program değerlendirmeleri.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">3. İşleme amaçları</h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>Sınıf katılımını ve öğrenci–öğretmen ilişkisinin güvenli biçimde kurulmasını sağlamak.</li>
            <li>Öğrencinin konu ve kazanım düzeyindeki durumunu yeterli kanıtla izlemek.</li>
            <li>Öğretmenin incelemesine tabi çalışma programı, takip ve öğrenci durum raporu hazırlamak.</li>
            <li>Yetkisiz erişimi önlemek, rıza/aydınlatma kayıtlarını ve işlem güvenliğini ispatlamak.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">4. Kimler görebilir?</h2>
          <p>
            Sınıfa atanmış öğretmen ile aynı kurumun yetkili yöneticisi, yalnız yetkili oldukları kurum ve
            sınıf kapsamında bu göstergeleri görebilir. Diğer öğretmenler ayrıntılı öğrenci analizine erişemez.
            Teknik hizmet sağlayıcılar verileri yalnız hizmetin işletilmesi ve güvenliği için, genel KVKK
            metninde açıklanan kapsamda işler.
          </p>
          <p className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-[var(--text)]">
            Kurum ekranında e-posta adresiniz, telefonunuz, profil UUID&apos;niz, ham cevaplarınız, tek tek yanlış
            soru ayrıntılarınız ve XP&apos;niz gösterilmez.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">5. Toplama yöntemi ve hukuki sebep</h2>
          <p>
            Veriler, davet bağlantısını kendi hesabınızla açmanız ve sınıfa katılmanız sonrasında Bilge Arena
            üzerindeki çalışmalarınızdan otomatik yollarla elde edilir. Kurum yöneticisi ve öğretmenle ilerleme
            paylaşımı, davet ekranında ayrı olarak vereceğiniz açık rızaya dayanır. Güvenlik, işlem kayıtları ve
            temel platform hizmetlerine ilişkin diğer hukuki sebepler genel KVKK metninde açıklanır.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">6. Saklama ve rızayı geri çekme</h2>
          <p>
            Paylaşım, aktif sınıf üyeliğiniz ve açık rızanız sürdüğü müddetçe devam eder. Sınıflarım ekranından
            ayrıldığınızda kurumun yeni ilerleme verilerinize erişimi ve yeni ödev erişiminiz kesilir. Rıza ve
            güvenlik olay kayıtları, hukuki yükümlülük ve uyuşmazlık süreleriyle sınırlı olarak saklanabilir.
            Geri çekme işlemi ileriye yönelik sonuç doğurur.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">7. Haklarınız ve başvuru</h2>
          <p>
            KVKK&apos;nın 11. maddesindeki haklarınızı kullanmak veya sınıf verileriniz hakkında bilgi istemek için{' '}
            <strong>destek@bilgearena.com</strong> adresine başvurabilirsiniz. Ayrı paylaşım tercihinizin kapsamı
            için{' '}
            <a href="/hukuk/sinif-paylasim-rizasi" className="font-bold text-[var(--focus)] underline underline-offset-2">
              Sınıf İlerleme Paylaşımı Açık Rıza Metni
            </a>
            &apos;ni inceleyin.
          </p>
        </section>

        <p className="border-t border-[var(--border)] pt-6 text-xs text-[var(--text-sub)]">
          Bu metin, aydınlatma ile açık rızayı ayrı süreçler olarak sunar. Resmî bilgi için Kişisel Verileri
          Koruma Kurumunun{' '}
          <a
            href="https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-[var(--focus)] underline underline-offset-2"
          >
            aydınlatma yükümlülüğü açıklamasına
          </a>
          {' '}bakabilirsiniz.
        </p>
      </div>
    </div>
  )
}
