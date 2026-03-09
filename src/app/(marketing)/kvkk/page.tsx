import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'KVKK Aydınlatma Metni',
  description: 'Bilge Arena — 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında aydınlatma metni.',
}

export default function KVKKPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold">KVKK Aydınlatma Metni</h1>
      <p className="mb-2 text-sm text-[var(--text-sub)]">
        6698 Sayılı Kişisel Verilerin Korunması Kanunu Kapsamında
      </p>
      <p className="mb-10 text-sm text-[var(--text-sub)]">Son güncelleme: 9 Mart 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-[var(--text-muted)]">
        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">1. Veri Sorumlusu</h2>
          <p>
            6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) uyarınca,
            kişisel verileriniz veri sorumlusu sıfatıyla Bilge Arena tarafından
            aşağıda açıklanan kapsamda işlenecektir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">2. İşlenen Kişisel Veriler</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pr-4 text-left font-bold text-[var(--text)]">Veri Kategorisi</th>
                  <th className="py-2 text-left font-bold text-[var(--text)]">Veriler</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">Kimlik Bilgileri</td>
                  <td className="py-2">Kullanıcı adı, görünen ad</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">İletişim Bilgileri</td>
                  <td className="py-2">E-posta adresi</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">Kullanım Verileri</td>
                  <td className="py-2">Oyun istatistikleri, XP puanları, sıralama, başarılar</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2 pr-4">Teknik Veriler</td>
                  <td className="py-2">IP adresi, tarayıcı bilgisi, cihaz türü</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Çerez Verileri</td>
                  <td className="py-2">Oturum çerezleri, tercih çerezleri</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">3. Kişisel Verilerin İşlenme Amaçları</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>Üyelik işlemlerinin gerçekleştirilmesi ve hesap güvenliğinin sağlanması</li>
            <li>Platform hizmetlerinin sunulması ve iyileştirilmesi</li>
            <li>Oyun performansının takibi ve sıralama tablolarının oluşturulması</li>
            <li>Hata raporlarının incelenmesi ve teknik destek sağlanması</li>
            <li>Yasal yükümlülüklerin yerine getirilmesi</li>
            <li>Platform güvenliğinin sağlanması ve kötüye kullanımın önlenmesi</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">4. Hukuki Sebepler</h2>
          <p>Kişisel verileriniz KVKK&apos;nın 5. maddesi kapsamında aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Açık rızanız (hesap oluşturma sırasında)</li>
            <li>Sözleşmenin ifası (platform hizmetlerinin sunulması)</li>
            <li>Meşru menfaat (platform güvenliği ve iyileştirmesi)</li>
            <li>Hukuki yükümlülük (yasal taleplere uyum)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">5. Verilerin Aktarılması</h2>
          <p>Kişisel verileriniz aşağıdaki taraflara aktarılabilir:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li><strong>Supabase Inc. (ABD):</strong> Veritabanı ve kimlik doğrulama hizmetleri</li>
            <li><strong>Vercel Inc. (ABD):</strong> Web hosting ve analitik hizmetleri</li>
            <li><strong>Yetkili kamu kurum ve kuruluşları:</strong> Yasal zorunluluk halinde</li>
          </ul>
          <p className="mt-2">
            Yurt dışına veri aktarımı, KVKK&apos;nın 9. maddesi kapsamında açık rızanıza
            dayanılarak gerçekleştirilmektedir.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">6. Veri Saklama Süresi</h2>
          <p>
            Kişisel verileriniz, işlenme amaçlarının gerektirdiği süre boyunca saklanır.
            Hesabınızı silmeniz halinde kişisel verileriniz makul süre içinde silinir
            veya anonim hale getirilir. Yasal saklama yükümlülükleri saklıdır.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">7. KVKK Kapsamındaki Haklarınız</h2>
          <p>KVKK&apos;nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
            <li>Kişisel verileriniz işlenmişse buna ilişkin bilgi talep etme</li>
            <li>Kişisel verilerin işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme</li>
            <li>Yurt içinde veya yurt dışında kişisel verilerinizin aktarıldığı üçüncü kişileri bilme</li>
            <li>Kişisel verilerin eksik veya yanlış işlenmiş olması halinde düzeltilmesini isteme</li>
            <li>KVKK&apos;nın 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme</li>
            <li>Düzeltme veya silme işlemlerinin, kişisel verilerinizin aktarıldığı üçüncü kişilere bildirilmesini isteme</li>
            <li>İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme</li>
            <li>Kişisel verilerin kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-[var(--text)]">8. Başvuru</h2>
          <p>
            Yukarıdaki haklarınızı kullanmak için <strong>destek@bilgearena.com</strong>{' '}
            adresine kimliğinizi tespit edici bilgilerle birlikte yazılı olarak
            başvurabilirsiniz. Başvurular en geç 30 gün içinde ücretsiz olarak
            sonuçlandırılır.
          </p>
        </section>
      </div>
    </div>
  )
}
