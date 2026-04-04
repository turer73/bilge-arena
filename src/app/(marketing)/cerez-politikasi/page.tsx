import type { Metadata } from 'next'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Çerez Politikası',
  description: 'Bilge Arena çerez politikası — kullandığımız çerezler, amaçları ve tercihleriniz hakkında bilgi.',
  alternates: { canonical: `${siteUrl}/cerez-politikasi` },
}

export default function CerezPolitikasiPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">Çerez Politikası</h1>
      <p className="mb-10 text-sm text-[var(--text-sub)]">Son güncelleme: 9 Mart 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-[var(--text-muted)]">
        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">1. Çerez Nedir?</h2>
          <p>
            Çerezler (cookies), web sitelerinin tarayıcınıza kaydettiği küçük metin
            dosyalarıdır. Bu dosyalar, sizi tanımamıza, tercihlerinizi hatırlamamıza
            ve size daha iyi bir deneyim sunmamıza yardımcı olur.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">2. Kullandığımız Çerez Türleri</h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pr-4 text-left font-bold text-[var(--text)]">Çerez Türü</th>
                  <th className="py-2 pr-4 text-left font-bold text-[var(--text)]">Amaç</th>
                  <th className="py-2 text-left font-bold text-[var(--text)]">Süre</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4 font-medium text-[var(--text)]">Zorunlu Çerezler</td>
                  <td className="py-2 pr-4">Oturum yönetimi, kimlik doğrulama, güvenlik</td>
                  <td className="py-2">Oturum süresi</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4 font-medium text-[var(--text)]">İşlevsel Çerezler</td>
                  <td className="py-2 pr-4">Tema tercihi (açık/koyu), dil ayarları</td>
                  <td className="py-2">1 yıl</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4 font-medium text-[var(--text)]">Analitik Çerezler</td>
                  <td className="py-2 pr-4">Plausible Analytics — anonim sayfa görüntüleme istatistikleri</td>
                  <td className="py-2">Oturum süresi</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium text-[var(--text)]">Supabase Auth</td>
                  <td className="py-2 pr-4">Kullanıcı oturumunun korunması ve token yenileme</td>
                  <td className="py-2">7 gün</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">3. Üçüncü Taraf Çerezleri</h2>
          <p>Platform aşağıdaki üçüncü taraf hizmetlerini kullanır:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>
              <strong>Plausible Analytics:</strong> Anonim kullanım istatistikleri toplar.
              Çerez kullanmaz, GDPR uyumludur.
            </li>
            <li>
              <strong>Supabase Auth:</strong> Kimlik doğrulama için oturum çerezleri
              kullanır. Yalnızca giriş yapmış kullanıcılara uygulanır.
            </li>
          </ul>
          <p className="mt-2">
            Platform reklam çerezleri kullanmaz ve kullanıcıları izleme amaçlı
            üçüncü taraf çerezleri bulunmaz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">4. Çerez Tercihleri</h2>
          <p>
            Zorunlu çerezler platformun çalışması için gereklidir ve devre dışı
            bırakılamaz. Diğer çerezleri tarayıcı ayarlarınızdan yönetebilirsiniz:
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li><strong>Chrome:</strong> Ayarlar → Gizlilik ve Güvenlik → Çerezler</li>
            <li><strong>Firefox:</strong> Ayarlar → Gizlilik ve Güvenlik → Çerezler</li>
            <li><strong>Safari:</strong> Tercihler → Gizlilik → Çerezler</li>
            <li><strong>Edge:</strong> Ayarlar → Çerezler ve site izinleri</li>
          </ul>
          <p className="mt-2">
            Çerezleri devre dışı bırakmanız halinde platformun bazı özellikleri
            düzgün çalışmayabilir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">5. Değişiklikler</h2>
          <p>
            Bu politika zaman zaman güncellenebilir. Güncel versiyonu her zaman
            bu sayfada bulabilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">6. İletişim</h2>
          <p>
            Çerez politikası hakkında sorularınız için:{' '}
            <strong>destek@bilgearena.com</strong>
          </p>
        </section>
      </div>
    </div>
  )
}
