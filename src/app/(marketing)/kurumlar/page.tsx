import type { Metadata } from 'next'
import { ArrowRight, BookOpenCheck, Building2, CalendarDays, ChartNoAxesCombined, Check, ClipboardCheck, FileText, GraduationCap, ShieldCheck, UsersRound } from 'lucide-react'
import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import styles from './partnership.module.css'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()
const description = 'Sınav koçları ve küçük dershaneler için Bilge Arena: öğrenci kazanım takibi, haftalık çalışma planları, sınıf öncelikleri, gelişim raporları ve pilot işbirliği.'

export const metadata: Metadata = {
  title: 'Sınav Koçları ve Dershaneler İçin',
  description,
  alternates: { canonical: `${siteUrl}/kurumlar` },
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Bilge Arena ile öğrenci takibi ve kurum işbirliği',
    description,
    url: `${siteUrl}/kurumlar`,
    images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: 'Bilge Arena — Koçlar ve Kurumlar' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena ile öğrenci takibi ve kurum işbirliği',
    description,
    images: [`${siteUrl}/og-image.png`],
  },
}

const sections = [
  ['#workflow', 'Nasıl işler?'],
  ['#kimler-icin', 'Kimler kullanır?'],
  ['#ogrenci-deneyimi', 'Öğrenci nasıl çalışır?'],
  ['#neler-takip-edilir', 'Neleri takip edersiniz?'],
  ['#gelisim-ve-rapor', 'Gelişim ve raporlar'],
  ['#pilot-paketleri', 'Pilot paketleri'],
  ['#sik-sorulanlar', 'Sık sorulanlar'],
] as const

const workflow = [
  { title: 'Öğrenciyi tanıyın', body: 'Seçilen ders ve sınav kapsamında öğrencinin mevcut kazanım durumunu inceleyin. Veri azsa önce çalışma ve ölçümle bilgi toplayın.' },
  { title: 'Çalışmayı planlayın', body: 'Sistemin hazırladığı haftalık taslağı inceleyin. Konuları, görevleri ve çalışma süresini öğrencinize göre düzenleyip yayınlayın.' },
  { title: 'Uygulamayı takip edin', body: 'Öğrenci planını kendi hesabında görür. Hangi görevlerin başladığını, tamamlandığını veya beklediğini panelden izleyin.' },
  { title: 'Gerektiğinde destek verin', body: 'Zorlanılan kazanım için destek takibi açın. Etüt, tekrar veya birebir görüşme sonrası yaptığınız değerlendirmeyi kaydedin.' },
  { title: 'Sonraki sonuçları görün', body: 'Çalışma öncesindeki durumla program haftası ve izleyen dönemin sonuçlarını karşılaştırın. Sonraki planı bu gözlemlerle şekillendirin.' },
]

const roles = [
  {
    icon: GraduationCap, title: 'Öğrenci', description: 'Kendi hesabında öğrenmeye devam eder.',
    items: ['Sınıf davetiyle grubunuza katılır; kuruma özel yeni bir hesap açması gerekmez.', 'Konu ve kazanım çalışmaları, günlük öneriler ve tekrarlarla ilerler.', 'Koçunun veya öğretmeninin yayınladığı haftalık görevleri görür ve başlatır.', 'Pratik, ipucu ve Bilge Asistan desteğinden yararlanabilir; oyun ve oda seçenekleriyle de çalışabilir.'],
  },
  {
    icon: BookOpenCheck, title: 'Koç veya öğretmen', description: 'Veriyi rehberlik ve ders planına dönüştürür.',
    items: ['Yetkili olduğu öğrencinin kazanım durumunu ve çalışma kanıtlarını inceler.', 'Haftalık plan taslağını onaylar veya öğrencinin ihtiyacına göre düzenler.', 'Desteğe ihtiyaç duyulan alanlarda takip açar, not alır ve değerlendirme yapar.', 'Öğrenci görüşmeleri için durum raporu oluşturur; sonraki çalışmayı belirler.'],
  },
  {
    icon: Building2, title: 'Kurum yöneticisi', description: 'Ekibi ve sınıfları tek alanda organize eder.',
    items: ['Kurum kapasitesini, sınıfları ve aktif öğrenci sayılarını görür.', 'Personeli, sınıf sorumlularını ve görevlerine uygun erişimleri yönetir.', 'Sınıf özetlerinden ortak çalışma ihtiyaçlarını ve destek önceliklerini takip eder.', 'Kurum içindeki önemli işlemlerin kayıtlarını ve destek erişimini yönetir.'],
  },
] as const

const tracking = [
  { title: 'Kazanım durumu', body: 'Güçlü, Gelişiyor ve Kanıt yetersiz ayrımıyla öğrencinin hangi alanlarda çalışmaya ihtiyaç duyduğunu görün.', use: 'Görüşmeye veya derse nereden başlayacağınızı belirleyin.' },
  { title: 'Çalışma kanıtı', body: 'Kazanım için biriken cevapları, bağımsız çalışma oturumlarını ve kararın dayandığı veriyi inceleyin.', use: 'Bir doğru cevabı kalıcı öğrenmeyle karıştırmadan değerlendirin.' },
  { title: 'Haftalık görevler', body: 'Yayınlanan plandaki bekleyen, başlanan ve tamamlanan görevleri takip edin.', use: 'Öğrenciyle yapamadığı ya da yarım bıraktığı çalışmayı konuşun.' },
  { title: 'Destek takipleri', body: 'Hangi kazanım için destek başlatıldığını, takip notlarını ve değerlendirmesini görün.', use: 'Birebir görüşme ve etütlerin devamını düzenli yürütün.' },
  { title: 'Sınıf öncelikleri', body: 'Yeterli veri bulunan sınıflarda ortak kazanım ihtiyaçlarını ve destek gerektiren alanları görün.', use: 'Grup dersine ve tekrar oturumuna konu seçin.' },
  { title: 'Program sonrası gözlem', body: 'Çalışma öncesi, program haftası ve sonraki dönemde oluşan kanıtları birlikte inceleyin.', use: 'İlerlemeyi değerlendirin; gerekiyorsa planı değiştirin.' },
] as const

const learningTools = [
  { title: 'Öğrenme yolu ve pratik', body: 'Öğrenci seçilen dersin konu ve kazanımlarında çalışır. Sorularla kendini dener, yanlışlarına geri döner ve gerektiğinde ipucu kullanır.' },
  { title: 'Günlük öneri ve tekrar', body: 'Mevcut çalışma verileri kişisel günlük önerilere yön verir. Tekrar zamanı gelen alanlara ve geliştirilmesi gereken kazanımlara yeniden dönülür. Öneri için yeterli veri bulunmayan alanlar ayrıca belirtilir.' },
  { title: 'Koçun veya öğretmenin programı', body: 'Yayınladığınız haftalık görevler öğrencinin çalışma alanına gelir. Öğrenci görevi oradan başlatır; başlangıç ve tamamlanma durumu kurum takibine yansır.' },
  { title: 'Oyun ve yardımcı araçlar', body: 'Arena, arkadaş odaları ve pratik seçenekleri farklı çalışma biçimleri sunar. Bilge Asistan açıklama ve ipucunda yardımcı olabilir. Akademik takipte oyun ödülleriyle öğrenme kanıtı ayrı tutulur.' },
] as const

const faqs = [
  { question: 'Tek başına çalışan bir sınav koçu kullanabilir mi?', answer: 'Evet, koçluk grubunuz için pilot görüşmesi yapabiliriz. Öğrenci sayısını, çalışma şeklinizi ve panelde ihtiyaç duyacağınız erişimi birlikte belirleriz. Başlangıç paketleri toplam bir yönetici ve bir öğretmen hesabıyla sınırlıdır; hesapların nasıl kullanılacağı kurulumda netleştirilir.' },
  { question: 'Öğrenciler yeni bir hesap açmak zorunda mı?', answer: 'Mevcut Bilge Arena hesaplarını kullanabilirler. Yeni öğrenciler normal kayıt akışıyla hesap açar ve sınıf davetine katılır. Sınıfa katılım ve çalışma verilerinin paylaşımı öğrenciye açıklanır.' },
  { question: 'Her ders ve sınav için aynı analiz var mı?', answer: 'Takip ve raporlama, pilotta seçilen ve panelde kullanıma açılan dersler için yapılır. LGS, YKS veya YDT hedefinizi görüşmede belirtin; kullanacağınız ders ve kazanım kapsamını başlamadan önce birlikte seçelim.' },
  { question: 'Günlük plan ile öğretmen planı aynı şey mi?', answer: 'Günlük plan öğrencinin kişisel çalışma önerisidir. Kurumun haftalık programı ise koç veya öğretmen tarafından incelenip yayınlanır. Öğrenci kendi çalışma alanında her ikisine de erişebilir.' },
  { question: 'Raporu veli görüşmesinde kullanabilir miyim?', answer: 'Öğrenci durum raporunu yazdırabilir veya tarayıcının yazdırma seçeneğiyle PDF olarak kaydedebilirsiniz. Rapor kazanım durumu ve çalışma kanıtını içerir; kurum içi destek notları ve iletişim bilgileri rapora eklenmez. Paylaşımı öğrencinin bilgilendirildiği kapsamda yaparsınız.' },
  { question: 'Veri az olduğunda ne gösteriliyor?', answer: 'Sistem Kanıt yetersiz durumunu gösterir. Bu, öğrencinin başarısız olduğu anlamına gelmez. Sınıf toplu analizleri de yeterli öğrenci ve çalışma verisi oluştuğunda gösterilir; başlangıçta önce veri toplamak gerekebilir.' },
  { question: 'Bilge Asistan ve oyun puanları değerlendirmeyi nasıl etkiliyor?', answer: 'Bilge Asistan çalışma sırasında açıklama ve ipucu desteği sağlar. AI yanıtı tek başına öğrenme kanıtı sayılmaz. XP ve lig puanı da akademik kazanım durumundan ayrı değerlendirilir; kurum takibi öğrencinin çalışma ve ölçüm verilerine dayanır.' },
  { question: 'Pilot sonunda ne olacak?', answer: 'Kullanımı, ekibin iş akışını ve oluşan öğrenci verilerini birlikte değerlendiririz. Devam kapsamını veya kurum erişiminin sonlandırılmasını görüşürüz. Öğrencinin kişisel Bilge Arena hesabı kurum erişiminden ayrıdır. Pilot kapsamında sınav sonucu veya başarı garantisi verilmez.' },
] as const

export default function InstitutionsPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="institution-title">
        <div>
          <p className={styles.eyebrow}>Sınav koçları · Küçük dershaneler · Etüt grupları</p>
          <h1 id="institution-title">Rehberliğinizin yanında,<br /><span>düzenli öğrenci takibi.</span></h1>
          <p className={styles.lead}>Öğrenciniz ne çalıştı, nerede zorlandı, sonraki adım ne olmalı? Bilge Arena, öğrenme ve çalışma verilerini koçluk görüşmelerinize ve derslerinize taşır.</p>
          <p className={styles.heroDetail}>Öğrenci kendi hesabında çalışır. Siz kazanım durumunu inceler, haftalık planı düzenler, uygulamayı takip eder ve sonraki sonuçları birlikte değerlendirirsiniz.</p>
          <div className={styles.actions}>
            <Link href="/iletisim#kurumsal-pilot" className="btn-primary">Pilotu birlikte planlayalım <ArrowRight size={17} aria-hidden="true" /></Link>
            <a href="#neler-takip-edilir" className={styles.secondary}>Takip alanlarını keşfet</a>
          </div>
        </div>
        <aside className={styles.example} aria-label="Örnek öğrenci takip görünümü">
          <p className={styles.exampleLabel}><ChartNoAxesCombined size={18} aria-hidden="true" /> Öğrenci çalışma alanı</p>
          <h2>Bir öğrencinin takibine bakış</h2>
          <p className={styles.exampleNote}>Temsili gösterim · Gerçek öğrenci verisi içermez.</p>
          <div className={styles.sampleRows}>
            <div><span>Sayı basamakları</span><strong data-status="strong">Güçlü</strong></div>
            <div><span>Denklem çözme</span><strong data-status="developing">Gelişiyor</strong></div>
            <div><span>Problemler</span><strong data-status="insufficient">Kanıt yetersiz</strong></div>
          </div>
          <div className={styles.samplePlan}><CalendarDays size={19} aria-hidden="true" /><div><h3>Bu haftanın planı</h3><p>Konu tekrarı → kazanım çalışması → yeni sorularda ölçüm</p></div></div>
          <p className={styles.exampleFoot}>Koçun veya öğretmenin değerlendirmesi sonraki plana yön verir.</p>
        </aside>
      </section>

      <nav className={styles.contents} aria-label="Kurum tanıtımı bölümleri">{sections.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</nav>

      <section id="workflow" className={styles.section} aria-labelledby="workflow-title">
        <header className={styles.heading}><p className={styles.eyebrow}>Gör · Planla · Uygula · Değerlendir</p><h2 id="workflow-title">Çalışma ile takip aynı döngüde.</h2><p>Paneldeki bilgi, sonraki ders veya görüşme için bir başlangıçtır. Planı öğrencinizin koşullarına göre siz şekillendirirsiniz.</p></header>
        <ol className={styles.workflow}>{workflow.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
      </section>

      <section id="kimler-icin" className={styles.section} aria-labelledby="roles-title">
        <header className={styles.heading}><p className={styles.eyebrow}>Birlikte çalışan üç alan</p><h2 id="roles-title">Herkes kendi işine odaklanır.</h2></header>
        <div className={styles.roles}>{roles.map(({ icon: Icon, title, description: roleDescription, items }) => <article className={styles.card} key={title}><Icon className={styles.icon} size={26} aria-hidden="true" /><h3>{title}</h3><p>{roleDescription}</p><ul className={styles.checklist}>{items.map(item => <li key={item}><Check size={17} aria-hidden="true" /><span>{item}</span></li>)}</ul></article>)}</div>
        <div className={styles.note}><ShieldCheck size={22} aria-hidden="true" /><p><strong>Çalışma paylaşımı, görevle sınırlı erişim.</strong> Öğrenci sınıf davetine katılır. Koç ve öğretmenler yetkili oldukları sınıfları ve paylaşılan öğrenme verilerini görür. Kurumlar birbirlerinin öğrenci verilerine erişemez.</p></div>
      </section>

      <section id="ogrenci-deneyimi" className={styles.section} aria-labelledby="learning-tools-title">
        <header className={styles.heading}><p className={styles.eyebrow}>Çalışmanın öğrenci tarafı</p><h2 id="learning-tools-title">Bir takip panelinden önce, bir çalışma alanı.</h2><p>Öğrencinin yapacağı çalışma ve sizin takip edeceğiniz sonuç aynı sistemde buluşur. Araçları öğrencinin seviyesine, ihtiyacına ve pilotta belirlenen kapsama göre kullanırsınız.</p></header>
        <div className={styles.learningTools}>{learningTools.map(tool => <article className={styles.card} key={tool.title}><h3>{tool.title}</h3><p>{tool.body}</p></article>)}</div>
        <p className={styles.small}>Soru içerikleri kalite incelemesi ve revizyon sürecinden geçer. Öğrenci hata bildirebilir; soru itirazları kalite takibine alınır. AI açıklaması tek başına doğrulanmış soru veya öğrenme kanıtı yerine geçmez.</p>
      </section>

      <section id="neler-takip-edilir" className={styles.section} aria-labelledby="tracking-title">
        <header className={styles.heading}><p className={styles.eyebrow}>Panelde görecekleriniz</p><h2 id="tracking-title">Hangi bilgiyi, hangi karar için kullanırsınız?</h2><p>Takip, pilotta seçilen ve panelde açık olan ders ve sınav kapsamıyla yürür. Başlamadan önce sizin grubunuzun kapsamını birlikte belirleriz.</p></header>
        <div className={styles.tracking}>{tracking.map(item => <article className={styles.card} key={item.title}><h3>{item.title}</h3><p>{item.body}</p><p className={styles.use}><ArrowRight size={16} aria-hidden="true" /><span>{item.use}</span></p></article>)}</div>
      </section>

      <section id="gelisim-ve-rapor" className={styles.section} aria-labelledby="reports-title">
        <div className={styles.reportGrid}>
          <div><p className={styles.eyebrow}>Görüşmeye taşınabilen bilgi</p><h2 id="reports-title">Raporu açın, öğrencinizle birlikte değerlendirin.</h2><p className={styles.lead}>“Ne kadar soru çözdün?” görüşmesini kazanım, çalışma düzeni ve sonraki ihtiyaç üzerinden geliştirin.</p><p>Durum raporu o andaki öğrenme analizinin kaydıdır. Öğrenci, sınıf ve seçilen ders kapsamıyla birlikte kazanım durumlarını ve çalışma kanıtlarını gösterir. Yazdırabilir veya PDF olarak kaydedebilirsiniz.</p></div>
          <div className={styles.card}><FileText size={26} className={styles.icon} aria-hidden="true" /><h3>Raporda ve değerlendirmede</h3><ul className={styles.checklist}>{['Güçlü, gelişen ve henüz yeterli veri bulunmayan kazanımlar.', 'Kararın dayandığı çalışma sayısı ve bağımsız oturumlar.', 'Program geçmişinde çalışma öncesi ve izleyen dönemin karşılaştırması.', 'Koçun veya öğretmenin gözlemi ve sonraki çalışma kararı.'].map(item => <li key={item}><Check size={17} aria-hidden="true" /><span>{item}</span></li>)}</ul><p className={styles.small}>Program karşılaştırması ve öğretmen değerlendirmesi paneldeki program geçmişindedir. Yazdırılan durum raporu kurum içi takip notlarını veya iletişim bilgilerini içermez.</p></div>
        </div>
        <div className={styles.note}><ClipboardCheck size={22} aria-hidden="true" /><p><strong>Öğrenmeyi dikkatle yorumlayın.</strong> Tek doğru cevap, yüksek XP veya uzun ekran süresi kalıcı öğrenme anlamına gelmez. Veri azsa sistem bunu belirtir; çalışmanın etkisini sonraki bağımsız sorularla ve kendi gözleminizle birlikte değerlendirirsiniz.</p></div>
      </section>

      <section id="pilot-paketleri" className={styles.section} aria-labelledby="pilot-title">
        <header className={styles.heading}><p className={styles.eyebrow}>İşbirliğine küçük bir grupla başlayın</p><h2 id="pilot-title">Önce sizin çalışma düzeninizde deneyelim.</h2><p>Koçluk veya dershane iş akışınızı konuşalım. Bir öğrenci grubu, sorumlu kişi ve ders kapsamı seçerek pilotu birlikte planlayalım.</p></header>
        <div className={styles.packages}>
          {[{ name: 'Başlangıç Pilotu', days: '30 gün', students: 'En fazla 30 öğrenci', body: 'Kurum panelini ve öğrenci takip akışını küçük bir grupla denemek için.' }, { name: 'Gelişim Pilotu', days: '60 gün', students: 'En fazla 40 öğrenci', body: 'Haftalık çalışma düzenini ve sonraki gelişim gözlemlerini daha uzun süre izlemek için.' }].map((pack, index) => <article className={styles.card} key={pack.name}><p className={styles.eyebrow}>Paket {index + 1}</p><h3>{pack.name}</h3><strong className={styles.duration}>{pack.days}</strong><p>{pack.students} · 1 yönetici + 1 öğretmen</p><p>{pack.body}</p></article>)}
        </div>
        <div className={styles.pilotSteps}><h3>Başlangıçta ne yapıyoruz?</h3><ol><li><strong>Sizi tanıyoruz.</strong> Çalışma şekliniz, öğrenci sayınız ve sınav hedefinizi konuşuyoruz.</li><li><strong>Kapsamı seçiyoruz.</strong> Paketi, dersleri, sorumluları ve takip edeceğiniz çalışmaları belirliyoruz.</li><li><strong>Grubu hazırlıyoruz.</strong> Yönetici hesabı, personel, sınıf davetleri ve öğrenci bilgilendirmesiyle başlayıyoruz. Paket belgesi yöneticiye e-posta ile gönderilir.</li><li><strong>Kullanımı değerlendiriyoruz.</strong> Planları, takip görüşmelerini ve oluşan veriyi inceleyerek sonraki adımı birlikte seçiyoruz.</li></ol></div>
        <p className={styles.small}>Bu iki paket ücretsiz pilot içindir. Erişim ve başlangıç tarihi görüşmeyle planlanır. Paket PDF’inde kapsam, taraflardan beklenenler ve kullanım şartları yer alır.</p>
        <div className={styles.actions}><Link href="/iletisim#kurumsal-pilot" className="btn-primary">Pilot için bize ulaş <ArrowRight size={17} aria-hidden="true" /></Link><a href="/documents/bilge-arena-kurum-paketleri-v1.pdf" className={styles.secondary}><FileText size={17} aria-hidden="true" /> Paket PDF’ini incele</a></div>
      </section>

      <section id="sik-sorulanlar" className={styles.section} aria-labelledby="faq-title">
        <header className={styles.heading}><p className={styles.eyebrow}>Başlamadan önce</p><h2 id="faq-title">Aklınızdaki sorular</h2></header>
        <div className={styles.faqs}>{faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div>
      </section>

      <section className={styles.final} aria-labelledby="partnership-contact-title"><UsersRound size={30} className={styles.icon} aria-hidden="true" /><h2 id="partnership-contact-title">Sizin öğrencilerinizle, sizin çalışma düzeninizde.</h2><p>Bize yaklaşık öğrenci sayınızı, sınav hedefinizi ve takip etmek istediğiniz çalışmaları yazın. İlk görüşme için öğrenci isimlerini paylaşmanız gerekmez.</p><Link href="/iletisim#kurumsal-pilot" className="btn-primary">İşbirliğini konuşalım <ArrowRight size={17} aria-hidden="true" /></Link></section>
    </div>
  )
}
