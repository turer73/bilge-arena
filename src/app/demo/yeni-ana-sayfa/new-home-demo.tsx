'use client'

import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Database,
  GraduationCap,
  Layers3,
  LockKeyhole,
  MessageCircleQuestion,
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
    body: 'Konu yolunda sıradaki dersi seçer, doğrulanmış soruları çözer ve gerektiğinde aralıklı tekrara dönersin.',
    bullets: ['Kısa ders ve soru pratiği', 'Kişisel ilerleme, seri ve XP', 'Yanlışlardan güvenli tekrar'],
  },
  öğretmen: {
    label: 'Öğretmen / koç',
    title: 'Takip, yönlendirmeye dönüşür.',
    body: 'Yetkili olduğun sınıfta görev ve ilerleme durumunu görür; öğrenciyi utandırmadan bir sonraki çalışmaya yönlendirirsin.',
    bullets: ['Onaylı bankadan görev', 'Başlamadı / devam ediyor / tamamladı', 'Sınırlı, işe yarar takip sinyali'],
  },
  yönetici: {
    label: 'Kurum yöneticisi',
    title: 'Kullanımın nerede aksadığını anlarsın.',
    body: 'Kurum ve sınıf düzeyinde toplu, tanımı belli göstergelerle aktivasyon ve çalışma ritmini izlersin.',
    bullets: ['Aktivasyon ve haftalık aktiflik', 'Görev tamamlama eğilimi', 'Rol ve tenant sınırları içinde özet'],
  },
}

const faqs = [
  {
    question: 'Bu sayfadaki kurum ekranı gerçek bir kurum verisi mi?',
    answer: 'Hayır. Kurum alanı sentetik bir akıştır; gerçek tenant, öğrenci veya canlı pilot verisi içermez. Üretim erişimi için ayrıca pilot çıkış kapıları gerekir.',
  },
  {
    question: 'Bilge Arena bir okul otomasyonu veya ERP mi?',
    answer: 'Hayır. İlk kapsam öğrenciyi ders dışında çalışmaya döndürmek, öğretmene uygulanabilir takip vermek ve kuruma toplu kullanım içgörüsü sunmaktır. Muhasebe, yoklama, SMS ve ERP entegrasyonu bu demoda yoktur.',
  },
  {
    question: 'Soru kalitesi nasıl ele alınıyor?',
    answer: 'İçerik, yayın öncesi doğrulama ve yönetişim adımlarından geçen soru bankasından gelir. Sorun bildirimi, inceleme ve yeniden yayın kararı tek bir kalite akışında tutulur.',
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

  return (
    <div data-new-home-demo className="overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <section className="relative px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16">
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
              Bilge Arena, sınav hazırlığını tek bir büyük hedef gibi değil; kısa ders, doğrulanmış soru ve zamanında tekrar döngüsü olarak tasarlar.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/arena" className="btn-primary min-h-12 px-5" data-primary-cta>
                Öğrenmeye başla <ArrowRight aria-hidden="true" size={18} />
              </Link>
              <a href="#isleyis" className="btn-ghost min-h-12 px-5">İşleyişi gör</a>
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">Bu sayfa ürün yönünü anlatan bir demodur; canlı kurum veya başarı garantisi değildir.</p>
          </div>

          <Surface className="relative overflow-hidden p-4 shadow-[0_18px_60px_rgba(37,99,235,.18)] sm:p-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Bugünkü rota</p>
                <p className="mt-1 text-lg font-black">TYT Matematik</p>
              </div>
              <span className="rounded-2xl bg-[var(--reward-bg)] px-3 py-2 text-sm font-black text-[var(--reward-text)]">4 dk</span>
            </div>
            <div className="mt-5 rounded-2xl border border-[var(--focus-border)] bg-[var(--focus-bg)] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--focus)] text-white"><Target aria-hidden="true" size={20} /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[var(--focus-text)]">Sıradaki ders</p>
                  <p className="mt-1 font-black">Bölme ve Bölünebilme</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Kısa anlatım → soru pratiği → tekrar önerisi</p>
                </div>
              </div>
              <Link href="/arena/matematik" className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-[var(--focus)] px-4 text-sm font-black text-white transition hover:bg-[var(--focus-dark)]">Derse geç</Link>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {['Öğren', 'Çöz', 'Tekrar et'].map((step, index) => <div key={step} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3"><span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-[var(--growth-bg)] text-xs font-black text-[var(--growth-text)]">{index + 1}</span><span className="mt-2 block text-[11px] font-bold text-[var(--text-sub)]">{step}</span></div>)}
            </div>
          </Surface>
        </div>
      </section>

      <section id="isleyis" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Öğrenme döngüsü" title="İçerik, davranışa dönüşen bir akışta buluşur." body="Her adım bir sonrakini besler. Gösterişli bir katalog yerine, öğrencinin bugün ne yapacağını ve yarın neyi tekrar edeceğini görünür kılarız." />
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: GraduationCap, title: 'Yolunu seç', body: 'Sınav ve derse göre konu yolunda sıradaki kısa adımı gör.' },
            { icon: BookOpenCheck, title: 'Soruyu çöz', body: 'Onaylı soru bankasından gelen pratiği, kendi temponda tamamla.' },
            { icon: RefreshCcw, title: 'Yanlıştan dön', body: 'Hata ve ilerleme sinyali, uygun tekrar için bir sonraki öneriyi şekillendirir.' },
            { icon: Sparkles, title: 'Serini koru', body: 'XP, seri ve olumlu geri bildirim çalışma ritmini görünür kılar.' },
          ].map(({ icon: Icon, title, body }, index) => (
            <Surface key={title} className="p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--focus-bg)] text-[var(--focus-text)]"><Icon aria-hidden="true" size={21} /></span>
              <p className="mt-5 text-xs font-black text-[var(--focus-text)]">0{index + 1}</p>
              <h3 className="mt-1 text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{body}</p>
            </Surface>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Dört temel" title="Altyapı, vaat değil işleyiş üzerinden anlatılır." body="Bu demo; öğrencinin deneyimini, içerik güvenini ve kurum sınırlarını aynı ürün mantığında birleştirir." />
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-2">
          {[
            { icon: Layers3, title: 'Öğrenme yolu', body: 'Konu ilerlemesi, günlük öneri ve tekrar sinyali aynı rotada buluşur.', color: 'var(--focus-text)' },
            { icon: ShieldCheck, title: 'Kalite kapısı', body: 'İçerik yayınlanmadan önce doğrulama, bildirim ve yönetişim adımlarından geçer.', color: 'var(--growth-text)' },
            { icon: UsersRound, title: 'Kurum çalışma alanı', body: 'Öğrenci, öğretmen ve yönetici rolleri; yetki ve veri sınırı açık bir akışta ayrılır.', color: 'var(--wisdom-text)' },
            { icon: BarChart3, title: 'Ölçülü içgörü', body: 'Toplu kullanım göstergeleri yönlendirme içindir; not veya sınav başarısı garantisi değildir.', color: 'var(--reward-text)' },
          ].map(({ icon: Icon, title, body, color }) => (
            <Surface key={title} className="flex gap-4 p-5 sm:p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}><Icon aria-hidden="true" size={21} /></span>
              <div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{body}</p></div>
            </Surface>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Soru güveni" title="Kalite hattı, öğrencinin karşısına çıkmadan başlar." body="Kullanıcıya görünen soru yalnızca çözüm ekranı değildir; arkasında izlenebilir bir inceleme ve yayın kararı vardır." />
        <div className="mx-auto mt-10 grid max-w-5xl gap-3 md:grid-cols-4">
          {[
            { icon: Database, title: 'Kaynak', body: 'Kapsamı belli soru bankası' },
            { icon: ClipboardCheck, title: 'Doğrulama', body: 'İçerik ve cevap kontrolü' },
            { icon: MessageCircleQuestion, title: 'Bildirim', body: 'Sorun için güvenli geri dönüş' },
            { icon: LockKeyhole, title: 'Yayın kararı', body: 'Yönetişim ve kayıt izi' },
          ].map(({ icon: Icon, title, body }, index) => <div key={title} className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-center md:p-5"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--growth-bg)] text-[var(--growth-text)]"><Icon aria-hidden="true" size={19} /></span><p className="mt-4 text-sm font-black">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">{body}</p>{index < 3 && <ArrowRight aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-[var(--surface)] text-[var(--text-muted)] md:block" size={20} />}</div>)}
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-[var(--text-muted)]">Bu akış kalite yönetişimini görünür kılar; tek başına akademik başarı veya sınav sonucu iddiası taşımaz.</p>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Kurumsal katman" title="Aynı öğrenme döngüsü, doğru rolde doğru sinyali üretir." body="Aşağıdaki panel sentetik bir ürün akışıdır. Gerçek tenant, kullanıcı veya canlı kurum verisi göstermez." />
        <div className="mx-auto mt-10 max-w-5xl">
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Kurumsal rol görünümü">
            {(Object.keys(roleViews) as Role[]).map((item) => <button key={item} aria-pressed={activeRole === item} onClick={() => setActiveRole(item)} className={`min-h-11 rounded-xl border px-4 text-sm font-black transition ${activeRole === item ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus-text)]' : 'border-[var(--border)] bg-[var(--card)] text-[var(--text-sub)] hover:border-[var(--focus-border)]'}`}>{roleViews[item].label}</button>)}
          </div>
          <Surface className="mt-5 grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_.8fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--focus-text)]">Sentetik kurum akışı</p>
              <h3 className="mt-3 text-2xl font-black">{role.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">{role.body}</p>
              <ul className="mt-5 space-y-3">{role.bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-sm font-bold"><Check aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--growth-text)]" size={17} /> {bullet}</li>)}</ul>
            </div>
            <div className="rounded-2xl border border-dashed border-[var(--focus-border)] bg-[var(--focus-bg)] p-5">
              <div className="flex items-center gap-2 text-sm font-black text-[var(--focus-text)]"><ShieldCheck aria-hidden="true" size={18} /> Veri sınırı</div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-sub)]">Rolün yetkisi kadarını görür. Öğrenci ham cevaplarının veya kurum dışı kayıtların bu vitrine taşındığı varsayılmaz.</p>
              <div className="mt-5 border-t border-[var(--focus-border)] pt-4"><p className="text-xs font-black uppercase tracking-wide text-[var(--text-muted)]">Kapsam dışı</p><p className="mt-2 text-sm font-bold">Muhasebe · yoklama · SMS · ERP entegrasyonu</p></div>
            </div>
          </Surface>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)] px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Pilot yolu" title="Kurumsal üretim, kontrollü bir kapıdan geçer." body="Demo ile canlı kullanım aynı şey değildir. Üretim erişimi; güvenlik, veri sözlüğü, hukuk, smoke ve operasyon kontrollerinden sonra açılır." />
        <div className="mx-auto mt-10 grid max-w-5xl gap-3 md:grid-cols-4">
          {['Kapsamı netleştir', 'Yetki ve veriyi doğrula', 'Dar pilotu ölç', 'Kararı kanıtla'].map((item, index) => <div key={item} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"><span className="text-xs font-black text-[var(--focus-text)]">ADIM {index + 1}</span><h3 className="mt-3 font-black">{item}</h3><p className="mt-2 text-xs leading-5 text-[var(--text-sub)]">{['Hedef kullanıcı, rol ve başarı tanımı yazılı hale gelir.', 'Tenant sınırı, erişim ve veri işleme kapıları kontrol edilir.', 'Tek ve dar kapsamlı pilot, canlı veriyle ölçülür.', 'Kullanım ve operasyon kanıtı olmadan genişleme yapılmaz.'][index]}</p></div>)}
        </div>
        <div className="mx-auto mt-6 flex max-w-5xl items-start gap-3 rounded-2xl border border-[var(--reward-border)] bg-[var(--reward-bg)] p-4 text-sm leading-6 text-[var(--text-sub)]"><CircleHelp aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--reward-text)]" size={19} /><p><strong className="text-[var(--reward-text)]">Sınır:</strong> Bu rota pilot veya üretim erişimi sözü değildir. Bugün görünen kurum ekranı yalnızca sentetik bir ürün anlatımıdır.</p></div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="Sık sorulanlar" title="Kapsamı birlikte netleştirelim." body="Demo sayfası, nelerin çalıştığını ve nelerin henüz üretim iddiası olmadığını aynı yerde söyler." />
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {faqs.map((faq, index) => { const isOpen = openFaq === index; return <div key={faq.question} className="rounded-2xl border border-[var(--border)] bg-[var(--card)]"><button className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left text-sm font-black sm:px-5" aria-expanded={isOpen} onClick={() => setOpenFaq(isOpen ? null : index)}>{faq.question}<ChevronDown aria-hidden="true" className={`shrink-0 transition-transform ${isOpen ? 'rotate-180 text-[var(--focus-text)]' : 'text-[var(--text-muted)]'}`} size={18} /></button>{isOpen && <p className="border-t border-[var(--border)] px-4 pb-5 pt-4 text-sm leading-6 text-[var(--text-sub)] sm:px-5">{faq.answer}</p>}</div> })}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-3xl border border-[var(--focus-border)] bg-[linear-gradient(135deg,rgba(37,99,235,.18),rgba(124,58,237,.14))] p-6 sm:p-9 md:flex-row md:items-center">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--focus-text)]">Sıradaki adım</p><h2 className="mt-2 text-2xl font-black">Öğrenme akışını dene veya pilot kapsamını konuş.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-sub)]">Kurum katmanı, öğrencinin gerçek çalışma deneyimini güçlendirdiğinde anlam kazanır; panel erişimi ancak ayrı pilot kapılarından sonra açılır.</p></div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><Link href="/arena" className="btn-primary min-h-11 px-5">Arena’ya git <ArrowRight aria-hidden="true" size={17} /></Link><Link href="/iletisim" className="btn-ghost min-h-11 px-5">Kurumsal pilotu konuşalım</Link></div>
        </div>
      </section>
    </div>
  )
}
