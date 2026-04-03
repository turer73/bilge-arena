import type { Metadata } from 'next'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Gizlilik Politikası',
  description: 'Bilge Arena gizlilik politikası — kişisel verilerinizin nasıl toplandığı, işlendiği ve korunduğu hakkında bilgi.',
  alternates: { canonical: `${siteUrl}/gizlilik-politikasi` },
}

export default function GizlilikPolitikasiPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Gizlilik Politikası</h1>
      <p className="mb-10 text-sm text-[var(--text-sub)]">Son güncelleme: 9 Mart 2026</p>

      <div className="prose-custom space-y-8 text-sm leading-relaxed text-[var(--text-muted)]">
        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">1. Giriş</h2>
          <p>
            Bilge Arena (&quot;Platform&quot;, &quot;biz&quot;), kullanıcılarının gizliliğine
            önem verir. Bu Gizlilik Politikası, bilgearena.com üzerinden topladığımız
            kişisel verilerin nasıl işlendiğini, saklandığını ve korunduğunu açıklar.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">2. Toplanan Veriler</h2>
          <p className="mb-2">Platform üzerinden aşağıdaki veriler toplanabilir:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Hesap bilgileri:</strong> E-posta adresi, kullanıcı adı, görünen ad</li>
            <li><strong>Kimlik doğrulama:</strong> Google OAuth ile giriş yapıldığında Google hesap bilgileri</li>
            <li><strong>Kullanım verileri:</strong> Çözülen sorular, oyun istatistikleri, XP puanları, sıralama verileri</li>
            <li><strong>Teknik veriler:</strong> IP adresi, tarayıcı türü, cihaz bilgisi, çerez verileri</li>
            <li><strong>İletişim verileri:</strong> Hata raporları, geri bildirimler</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">3. Verilerin Kullanım Amacı</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Hesap oluşturma ve kimlik doğrulama</li>
            <li>Oyun deneyiminin kişiselleştirilmesi</li>
            <li>Sıralama tabloları ve başarı sistemlerinin işletilmesi</li>
            <li>Platform güvenliğinin sağlanması</li>
            <li>Hata tespiti ve platform iyileştirmesi</li>
            <li>Yasal yükümlülüklerin yerine getirilmesi</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">4. Verilerin Paylaşımı</h2>
          <p>
            Kişisel verileriniz üçüncü taraflarla satılmaz. Aşağıdaki durumlarda
            sınırlı paylaşım yapılabilir:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Hizmet sağlayıcılar:</strong> Supabase (veritabanı ve kimlik doğrulama), Vercel (hosting ve analitik)</li>
            <li><strong>Yasal zorunluluk:</strong> Mahkeme kararı veya yasal talep durumunda</li>
            <li><strong>Kamuya açık veriler:</strong> Kullanıcı adı ve sıralama bilgileri liderlik tablosunda görünür</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">5. Çerezler</h2>
          <p>
            Platform, oturum yönetimi ve kullanıcı tercihlerini hatırlamak için çerezler
            kullanır. Detaylı bilgi için{' '}
            <a href="/cerez-politikasi" className="text-[var(--focus)] underline">
              Çerez Politikası
            </a>{' '}
            sayfamızı inceleyebilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">6. Veri Güvenliği</h2>
          <p>
            Verileriniz SSL/TLS şifreleme ile iletilir. Veritabanı erişimi Row Level Security
            (RLS) politikalarıyla korunur. Şifrelerin saklanması Supabase Auth tarafından
            endüstri standardı bcrypt ile yapılır.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">7. Kullanıcı Hakları</h2>
          <p>KVKK kapsamında aşağıdaki haklara sahipsiniz:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
            <li>Verilerinizin düzeltilmesini veya silinmesini talep etme</li>
            <li>Verilerinizin aktarıldığı üçüncü kişileri öğrenme</li>
            <li>İşleme faaliyetine itiraz etme</li>
          </ul>
          <p className="mt-2">
            Haklarınızı kullanmak için{' '}
            <strong>destek@bilgearena.com</strong> adresine e-posta gönderebilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">8. Çocukların Gizliliği</h2>
          <p>
            Platform, 13 yaş altı çocuklardan bilerek kişisel veri toplamaz. 13 yaş altı
            kullanıcıların veli/vasi izni olmadan hesap oluşturması önerilmez.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">9. Değişiklikler</h2>
          <p>
            Bu politika zaman zaman güncellenebilir. Önemli değişikliklerde kullanıcılar
            bilgilendirilir. Güncel versiyonu her zaman bu sayfada bulabilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">10. İletişim</h2>
          <p>
            Gizlilik ile ilgili sorularınız için: <strong>destek@bilgearena.com</strong>
          </p>
        </section>
      </div>
    </div>
  )
}
