'use client'

import Link from 'next/link'
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'

type Role = 'öğrenci' | 'öğretmen' | 'yönetici'

const roleViews: Record<Role, { label: string; title: string; body: string; bullets: string[] }> = {
  öğrenci: {
    label: 'Öğrenci',
    title: 'Bir sonraki küçük adım görünür.',
    body: 'Konu yolunda sıradaki örnek çalışmayı seçer, yayınlanmış soruları çözer ve gerektiğinde tekrar araçlarına dönersin.',
    bullets: ['Kısa ders ve soru pratiği', 'Kişisel ilerleme, seri ve XP', 'Yanlışlardan güvenli tekrar'],
  },
  öğretmen: {
    label: 'Öğretmen / koç',
    title: 'Takip, yönlendirmeye dönüşür.',
    body: 'Yetkili olduğun sınıfta görev ve ilerleme durumunu görür; öğrenciyi utandırmadan bir sonraki çalışmaya yönlendirirsin.',
    bullets: ['Yayınlanmış bankadan görev', 'Başlamadı / devam ediyor / tamamladı', 'Sınırlı, işe yarar takip sinyali'],
  },
  yönetici: {
    label: 'Kurum yöneticisi',
    title: 'Kullanımın nerede aksadığını anlarsın.',
    body: 'Kurum ve sınıf düzeyinde, tanımı belli toplu göstergelerle aktivasyon ve çalışma ritmini izlersin.',
    bullets: ['Aktivasyon ve haftalık aktiflik', 'Görev tamamlama eğilimi', 'Rol ve tenant sınırları içinde özet'],
  },
}

const roleOrder = Object.keys(roleViews) as Role[]

const faqs = [
  {
    question: 'Bu sayfadaki kurum ekranı gerçek bir kurum verisi mi?',
    answer: 'Hayır. Kurum alanı sentetik bir ürün anlatımıdır; gerçek tenant, öğrenci veya canlı pilot verisi içermez. Gerçek kurum kabulü ayrıca Tenant A/B oturum, hukuk ve operasyon kapılarından geçer.',
  },
  {
    question: 'Küçük dershane canary’si herkese açık ve ücretsiz mi?',
    answer: 'Canary süresince ücret alınmaz; ancak herkese açık veya otomatik başlayan bir deneme değildir. Uygunluğu önceden değerlendirilen tek küçük kurum, 14–60 gün, en fazla 40 öğrenci ve toplam 2 personel sınırıyla davet edilir. Ücretli kurum onboarding’i kapalı kalır.',
  },
  {
    question: 'Bilge Arena bir okul otomasyonu veya ERP mi?',
    answer: 'Hayır. İlk kapsam öğrenciyi ders dışında çalışmaya döndürmek, öğretmene uygulanabilir takip vermek ve kuruma toplu kullanım içgörüsü sunmaktır. Muhasebe, yoklama, SMS ve ERP entegrasyonu bu demoda yoktur.',
  },
  {
    question: 'Soru kalitesi nasıl ele alınıyor?',
    answer: 'Soru yayınlama, sorun bildirme, inceleme ve yeniden yayın kararları kayıtlı bir yönetişim akışıyla ele alınır. Kazanım eşlemesi bütün bankada tamamlanmış sayılmaz; kapsam ayrı bir kalite hattında ölçülerek genişletilir.',
  },
]

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--focus-text)]">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--text-sub)] sm:text-base">{body}</p>
    </div>
  )
}

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-[var(--border)] bg-[var(--card)] ${className}`}>{children}</div>
}

export function NewHomeDemo() {
  const [activeRole, setActiveRole] = useState<Role>('öğrenci')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const role = roleViews[activeRole]

  function handleRoleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentRole: Role) {
    const currentIndex = roleOrder.indexOf(currentRole)
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % roleOrder.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + roleOrder.length) % roleOrder.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = roleOrder.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    const nextRole = roleOrder[nextIndex]
    setActiveRole(nextRole)
    document.getElementById(`role-tab-${nextRole}`)?.focus()
  }

  return (
    <div data-new-home-demo className="bg-[var(--bg)] text-[var(--text)]">
      <section className="relative overflow-hidden px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(circle_at_70%_10%,rgba(37,99,235,.18),transparent_52%)]" />
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--focus-border)] bg-[var(--focus-bg)] px-3 py-1.5 text-xs font-black text-[var(--focus-text)]">
              <Sparkles aria-hidden="true" size={14} /> Yeni ana sayfa · demo
            </p>
            <h1 className="mt-5 text-4xl font-black leading-[1.04] tracking-tight sm:text-6xl">
              Bugün için <span className="text-[var(--focus-text)]">bir sonraki adımın</span> hazır.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--text-sub)] sm:text-lg">
              Öğrenci için kısa çalışma ve oyunlaştırılmış soru pratiği; öğretmen ve kurum için rol ile tenant sınırlarında takip. Aynı öğrenme ritmi, üç farklı ihtiyaca dönüşür.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/arena" className="btn-primary min-h-12 px-5" data-primary-cta>
                Öğrenci olarak dene <ArrowRight aria-hidden="true" size={18} />
              </Link>
              <a href="#kurumsal-pilot" className="btn-ghost min-h-12 px-5">Küçük dershane pilotu</a>
            </div>
            <a href="#isleyis" className="mt-4 inline-flex min-h-11 items-center text-sm font-black text-[var(--focus-text)] underline-offset-4 hover:underline">
              Öğrenme işleyişini gör
            </a>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Bu sayfa ürün yönünü anlatan bir demodur; canlı kurum, kişiselleştirilmiş öneri veya başarı garantisi değildir.</p>
          </div>

          <Surface className="relative overflow-hidden p-4 shadow-[0_18px_60px_rgba(37,99,235,.18)] sm:p-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Örnek rota · kişisel veri değil</p>
                <p className="mt-1 text-lg font-black">TYT Matematik</p>
              </div>
              <span className="rounded-2xl bg-[var(--reward-bg)] px-3 py-2 text-sm font-black text-[var(--reward-text)]">4 dk</span>
            </div>
            <div className="mt-5 rounded-2xl border border-[var(--focus-border)] bg-[var(--focus-bg)] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--focus)] text-white"><Target aria-hidden="true" size={20} /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[var(--focus-text)]">Örnek çalışma</p>
                  <p className="mt-1 font-black">Bölme ve Bölünebilme</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Kısa anlatım → soru pratiği → tekrar araçları</p>
                </div>
              </div>
              <Link href="/arena/matematik" className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-[var(--focus)] px-4 text-sm font-black text-white transition hover:bg-[var(--focus-dark)] motion-reduce:transition-none">Matematik örneğini aç</Link>
            </div>
            <ol className="mt-4 grid grid-cols-3 gap-2 text-center">
              {['Öğren', 'Çöz', 'Tekrar et'].map((step, index) => (
                <li key={step} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3">
                  <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-[var(--growth-bg)] text-xs font-black text-[var(--growth-text)]">{index + 1}</span>
                  <span className="mt-2 block text-xs font-bold text-[var(--text-sub)]">{step}</span>
                </li>
              ))}
            </ol>
          </Surface>
        </div>

        <ul className="relative z-10 mx-auto mt-9 grid max-w-6xl gap-2 text-xs font-bold text-[var(--text-sub)] sm:grid-cols-3">
          {['Öğrenci başlangıcı ücretsiz', 'Kurum erişimi otomatik açılmaz', 'Self-servis tenant açılışı yok'].map((item) => (
            <li key={item} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              <Check aria-hidden="true" className="shrink-0 text-[var(--growth-text)]" size={16} /> {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="isleyis" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Öğrenme döngüsü" title="Öğrenciyi bugünkü çalışmaya geri getirir." body="Gösterişli bir içerik kataloğu yerine; seç, çöz, yanlışını gör ve tekrar aracına dön akışını görünür kılarız." />
        <ol className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: GraduationCap, title: 'Yolunu seç', body: 'Sınav ve derse göre konu yolunda kısa bir çalışma seç.' },
            { icon: BookOpenCheck, title: 'Soruyu çöz', body: 'Yayınlanmış soru bankasından gelen pratiği kendi temponda tamamla.' },
            { icon: RefreshCcw, title: 'Yanlışını gör', body: 'Hata ve ilerleme kaydını daha sonra dönebileceğin bir çalışma sinyaline çevir.' },
            { icon: Sparkles, title: 'Ritmini koru', body: 'XP, seri ve olumlu geri bildirim çalışma alışkanlığını görünür kılar.' },
          ].map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <Surface className="h-full p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--focus-bg)] text-[var(--focus-text)]"><Icon aria-hidden="true" size={21} /></span>
                <p className="mt-5 text-xs font-black text-[var(--focus-text)]">0{index + 1}</p>
                <h3 className="mt-1 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{body}</p>
              </Surface>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Mühendislik sınırı" title="Güven, sayfa sözünden çok katmanlarla kurulur." body="İçerik değişikliği, hassas yetki ve kurum verisi aynı kapıdan geçmez. Her yüzey kendi dar yetki ve kayıt modeline sahiptir." />
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-2">
          {[
            { icon: ClipboardCheck, title: 'Yayın yönetişimi', body: 'Soru değişiklikleri revizyon, inceleme ve yayın kararlarıyla yönetilir. Kazanım kapsamı ölçülür; eksik eşlemeler tamamlanmış sayılmaz.' },
            { icon: LockKeyhole, title: 'Cevap ve yazma sınırı', body: 'Cevap anahtarı genel soru yanıtından ayrılır; doğrudan istemci soru yazması kapalıdır. Değişiklikler yönetişim akışına gider.' },
            { icon: KeyRound, title: 'Personel güvenliği', body: 'Hassas yönetim işlemleri AAL2, sunucu tarafı oran sınırlama ve denetim kaydıyla korunur.' },
            { icon: ShieldCheck, title: 'Tenant kabul kanıtı', body: 'Rol ve kurum sınırları veritabanı/RPC katmanında uygulanır; gerçek kurum kabulü ayrıca Tenant A/B gerçek oturum matrisiyle doğrulanır.' },
          ].map(({ icon: Icon, title, body }) => (
            <Surface key={title} className="flex gap-4 p-5 sm:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--focus-bg)] text-[var(--focus-text)]"><Icon aria-hidden="true" size={21} /></span>
              <div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{body}</p></div>
            </Surface>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Kurumsal çalışma alanı" title="Aynı öğrenme ritmi, doğru rolde doğru sinyali üretir." body="Aşağıdaki panel sentetik bir ürün akışıdır. Gerçek tenant, kullanıcı veya canlı kurum verisi göstermez." />
        <div className="mx-auto mt-10 max-w-5xl">
          <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Kurumsal rol görünümü">
            {roleOrder.map((item) => (
              <button
                key={item}
                id={`role-tab-${item}`}
                type="button"
                role="tab"
                aria-selected={activeRole === item}
                aria-controls="role-panel"
                tabIndex={activeRole === item ? 0 : -1}
                onClick={() => setActiveRole(item)}
                onKeyDown={(event) => handleRoleKeyDown(event, item)}
                className={`min-h-11 rounded-xl border px-4 text-sm font-black transition motion-reduce:transition-none ${activeRole === item ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus-text)]' : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-sub)] hover:border-[var(--focus-border)]'}`}
              >
                {roleViews[item].label}
              </button>
            ))}
          </div>
          <Surface className="mt-5 grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_.8fr]">
            <div id="role-panel" role="tabpanel" aria-live="polite" aria-labelledby={`role-tab-${activeRole}`}>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--focus-text)]">Sentetik kurum akışı</p>
              <h3 className="mt-3 text-2xl font-black">{role.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">{role.body}</p>
              <ul className="mt-5 space-y-3">{role.bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-sm font-bold"><Check aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--growth-text)]" size={17} /> {bullet}</li>)}</ul>
            </div>
            <div className="rounded-2xl border border-dashed border-[var(--focus-border)] bg-[var(--focus-bg)] p-5">
              <div className="flex items-center gap-2 text-sm font-black text-[var(--focus-text)]"><ShieldCheck aria-hidden="true" size={18} /> Veri ve kanıt sınırı</div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">Rol ve tenant kontrolleri teknik temeldir. Gerçek müşteri kabulü; iki tenant, gerçek oturum, AAL2 ve BOLA matrisi geçmeden tamamlanmış sayılmaz.</p>
              <div className="mt-5 border-t border-[var(--focus-border)] pt-4"><p className="text-xs font-black uppercase tracking-wide text-[var(--text-muted)]">Kapsam dışı</p><p className="mt-2 text-sm font-bold">Muhasebe · yoklama · SMS · ERP entegrasyonu</p></div>
            </div>
          </Surface>
        </div>
      </section>

      <section id="kurumsal-pilot" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-3xl border border-[var(--focus-border)] bg-[linear-gradient(135deg,rgba(37,99,235,.16),rgba(124,58,237,.11))] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:p-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--focus-text)]">Davetli ücretsiz sistem canary’si</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Küçük dershanede, küçük ve ölçülebilir başlayalım.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--text-sub)] sm:text-base">Bu bir herkese açık deneme veya satış kampanyası değildir. Tek küçük kurumun güvenlik, kullanım ve operasyon akışını kontrollü biçimde doğrulamak içindir.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { icon: Clock3, value: '14–60 gün', label: 'değerlendirme' },
                { icon: UsersRound, value: 'En fazla 40', label: 'davetli öğrenci' },
                { icon: Building2, value: '1 küçük kurum', label: 'aynı anda' },
                { icon: KeyRound, value: 'Toplam 2', label: 'yönetici + öğretmen' },
              ].map(({ icon: Icon, value, label }) => (
                <div key={value} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <Icon aria-hidden="true" className="text-[var(--focus-text)]" size={19} />
                  <p className="mt-3 text-sm font-black">{value}</p>
                  <p className="mt-1 text-xs text-[var(--text-sub)]">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <Surface className="p-5 sm:p-6">
            <h3 className="font-black">Başlamadan önce</h3>
            <ul className="mt-5 space-y-4">
              {[
                'Kurum sorumlusu, amaç, kapsam ve başarı ölçüsü yazılıdır.',
                'KVKK aydınlatması, DPA, saklama-imha ve destek sorumlusu hazırdır.',
                'Personel TOTP/AAL2 kurar; Tenant A/B ve geri dönüş testleri geçer.',
                'Süre dolduğunda kurum erişimi fail-closed kapanır; normal öğrenci hesabı çalışmaya devam eder.',
              ].map((item) => <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--text-sub)]"><Check aria-hidden="true" className="mt-1 shrink-0 text-[var(--growth-text)]" size={17} /><span>{item}</span></li>)}
            </ul>
            <p className="mt-5 rounded-xl border border-[var(--reward-border)] bg-[var(--reward-bg)] p-3 text-xs font-bold leading-5 text-[var(--reward-text)]">Ticari onboarding ve public/self-servis kurum açılışı kapalı kalır. Canary erişimi otomatik verilmez.</p>
            <Link href="/iletisim#kurumsal-pilot" className="btn-primary mt-5 min-h-12 w-full px-5">Pilot kapsamını ilet <ArrowRight aria-hidden="true" size={17} /></Link>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-[var(--focus-text)]"><Link href="/kvkk" className="underline-offset-4 hover:underline">KVKK aydınlatma</Link><Link href="/gizlilik-politikasi" className="underline-offset-4 hover:underline">Gizlilik politikası</Link></div>
          </Surface>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Sık sorulanlar" title="Kapsamı açık söyleyelim." body="Demo, mevcut teknik temeli ve gerçek kurum kabulünden önce kalan kanıt kapılarını aynı yerde gösterir." />
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index
            const questionId = `faq-question-${index}`
            const answerId = `faq-answer-${index}`
            return (
              <div key={faq.question} className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <button id={questionId} type="button" className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left text-sm font-black sm:px-5" aria-expanded={isOpen} aria-controls={answerId} onClick={() => setOpenFaq(isOpen ? null : index)}>{faq.question}<ChevronDown aria-hidden="true" className={`shrink-0 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180 text-[var(--focus-text)]' : 'text-[var(--text-muted)]'}`} size={18} /></button>
                {isOpen && <div id={answerId} role="region" aria-labelledby={questionId} className="border-t border-[var(--border)] px-4 pb-5 pt-4 text-sm leading-6 text-[var(--text-sub)] sm:px-5">{faq.answer}</div>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-9 md:flex-row md:items-center">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--focus-text)]">Sıradaki adım</p><h2 className="mt-2 text-2xl font-black">Öğrenci deneyimini aç veya canary kapsamını incele.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-sub)]">Kurum katmanı, öğrencinin gerçek çalışma deneyimini güçlendirdiğinde anlam kazanır. İki yol birbirinden açıkça ayrılır.</p></div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><Link href="/arena" className="btn-primary min-h-11 px-5">Arena’ya git <ArrowRight aria-hidden="true" size={17} /></Link><a href="#kurumsal-pilot" className="btn-ghost min-h-11 px-5">Canary sınırları</a></div>
        </div>
      </section>
    </div>
  )
}
