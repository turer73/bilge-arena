import { ArrowRight, ChartNoAxesCombined, ClipboardList, FileText, UsersRound } from 'lucide-react'
import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'

const trackingAreas = [
  {
    icon: ChartNoAxesCombined,
    title: 'Öğrenci neye ihtiyaç duyuyor?',
    description: 'Pilotun kapsadığı derslerde güçlü, gelişen ve yeniden çalışılması gereken kazanımları görün. Yeterli veri oluşmayan alanlar ayrıca belirtilir.',
  },
  {
    icon: ClipboardList,
    title: 'Haftalık çalışma nasıl ilerliyor?',
    description: 'Önerilen çalışma planını inceleyip düzenleyin, öğrenciye atayın. Başlanan ve tamamlanan görevleri takip ederek görüşmelerinizi somut çalışmalar üzerinden yapın.',
  },
  {
    icon: UsersRound,
    title: 'Grubun ortak ihtiyacı ne?',
    description: 'Yeterli veri oluştuğunda sınıfın ortak kazanım ihtiyaçlarını ve desteğe ihtiyaç duyan öğrencileri görün. Etüt ve tekrar çalışmalarınızın önceliğini belirleyin.',
  },
  {
    icon: FileText,
    title: 'Çalışma sonrası ne değişti?',
    description: 'Çalışma öncesi ve sonraki sonuçları, izleyen dönemdeki ölçümlerle birlikte değerlendirin. Öğrenci görüşmelerinde kullanmak için durum raporunu yazdırın veya PDF olarak kaydedin.',
  },
] as const

export function InstitutionPartnership() {
  return (
    <section id="kurumsal-isbirligi" aria-labelledby="institution-partnership-title" className="w-full scroll-mt-24 py-14">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8 lg:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--focus-text)]">Sınav koçları · Küçük dershaneler · Etüt grupları</p>
        <h2 id="institution-partnership-title" className="mt-3 max-w-3xl text-2xl font-bold leading-tight text-[var(--text)] sm:text-3xl">
          Öğrencinizin çalışmasını görün, sonraki adımı birlikte belirleyin.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--text-sub)] sm:text-base">
          Öğrencileriniz Bilge Arena’da çalışırken siz de öğrenme durumlarını ve haftalık planlarını takip edin.
          Koçluk görüşmelerinizi, derslerinizi ve etütlerinizi öğrencinin ihtiyaçlarına göre şekillendirin.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {trackingAreas.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <Icon size={22} className="text-[var(--focus-text)]" aria-hidden="true" />
              <h3 className="mt-3 text-base font-bold text-[var(--text)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{description}</p>
            </article>
          ))}
        </div>

        <div className="mt-7 border-t border-[var(--border)] pt-6">
          <h3 className="text-lg font-bold text-[var(--text)]">Küçük bir grupla birlikte başlayalım.</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-sub)]">
            Bize çalışma şeklinizi, yaklaşık öğrenci sayınızı ve sınav hedefinizi anlatın.
            Pilot kapsamını birlikte belirleyelim; kurum paneliniz ve sınıf davetlerinizle takibe başlayın.
            Öğrenciler kendi hesaplarıyla katılır, yetkili koç ve öğretmenler paylaşılan çalışma verilerini görür.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/kurumlar" className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold">
              Koçlar ve kurumlar için keşfet <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href="/documents/bilge-arena-kurum-paketleri-v1.pdf" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-semibold text-[var(--text)] hover:border-[var(--focus)]">
              <FileText size={17} aria-hidden="true" /> Pilot paketlerini incele
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
