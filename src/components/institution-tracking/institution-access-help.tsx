'use client'

import { ArrowLeft, Building2 } from 'lucide-react'
import { DocumentBoundaryLink } from '@/components/privacy/document-boundary-link'

/**
 * Kurum paneline erisimi olmayan hesaba erisimin NASIL verildigini anlatir.
 * Iki yerde kullanilir: /arena/kurum icindeki 403/404 ekrani ve kurum
 * girisinden hemen sonra (TOTP'den once) gosterilen /hesap/kurum-erisim.
 */
export function InstitutionAccessHelp() {
  return (
    <div className="mx-auto mt-5 max-w-xl rounded-xl border border-white/10 bg-[var(--surface)] p-4 text-left text-sm leading-6 text-[var(--text-sub)]">
      <p className="font-bold text-[var(--text)]">Erişim nasıl açılır?</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Kurum yöneticisiyseniz: Bilge Arena ekibi kurumunuzu tanımlarken bu hesabı yönetici olarak seçer. Giriş yaptığınız Google adresini ekibe iletin.</li>
        <li>Öğretmenseniz: kurum yöneticiniz, giriş yaptığınız e-posta adresini kurum panelinden öğretmen olarak ekler.</li>
        <li>Kuruma başka bir Google hesabıyla tanımlandıysanız çıkış yapıp o hesapla tekrar giriş yapın.</li>
      </ul>
      <p className="mt-3">
        Erişim tanımlandıktan sonra bu sayfayı yenilemeniz yeterlidir; ayrıca bir bildirim gönderilmez.
        Sorularınız için: <a href="mailto:iletisim@bilgearena.com" className="font-bold text-[var(--primary)] underline-offset-2 hover:underline">iletisim@bilgearena.com</a>
      </p>
    </div>
  )
}

/**
 * Kurum girisi sonrasi, iki adimli dogrulama istenmeden once gosterilen
 * tam sayfa. Hesapta kurum yetkisi yoksa kullaniciyi once TOTP kurmaya
 * zorlamak yerine durumu burada aciklariz. "Kurum paneline git" baglantisi
 * yetki sonradan tanimlanan kullanici icin normal (TOTP'li) yolu acik tutar.
 */
export function InstitutionNoAccessPage({ email }: { email: string | null }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center sm:p-10">
        <Building2 className="mx-auto h-10 w-10 text-[var(--primary)]" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-black">Bu hesabın kurum paneli erişimi yok</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">
          {email ? <><strong className="text-[var(--text)]">{email}</strong> hesabıyla giriş yaptınız. </> : null}
          Kurum paneli yalnız kuruma tanımlı yönetici ve öğretmen hesaplarına açıktır; normal kayıt tek başına kurum yetkisi vermez.
          Bu hesap bir kuruma tanımlanmadığı için iki adımlı doğrulama kurulumu da istenmedi.
        </p>
        <InstitutionAccessHelp />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <DocumentBoundaryLink
            href="/arena"
            className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Arenaya dön
          </DocumentBoundaryLink>
          <DocumentBoundaryLink
            href="/arena/kurum"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-bold"
          >
            Kurum paneline git
          </DocumentBoundaryLink>
        </div>
      </section>
    </main>
  )
}
