'use client'

import { useId, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check, ChevronRight } from 'lucide-react'
import type { GameSlug } from '@/lib/constants/games'
import { TodayPlanFocus } from '@/components/study/today-plan-focus'
import { AcademyDialog } from './academy-dialog'
import type { TytSocialExamPolicyState } from '@/lib/hooks/use-tyt-social-exam-policy'
import styles from './academy.module.css'

interface DesktopDailyPlanProps {
  tytSocialPolicy?: TytSocialExamPolicyState
  mode: 'demo' | 'live'
  game: GameSlug
  examRef: string | null
  userId: string | null
}

interface PlanSummary {
  status: 'ready' | 'loading' | 'unavailable' | 'guest'
  total: number
  completed: number
}

const DEMO_COMPOSITION = [
  ['5 tekrar', 'Hatırlamanı güçlendirmek için.'],
  ['5 geliştirilecek', 'Takıldığın kazanımlara yeniden bakmak için.'],
  ['3 yeni konu', 'Bilgine küçük bir adım eklemek için.'],
  ['1 meydan okuma', 'Biraz daha zor bir soruyu denemek için.'],
  ['1 senin seçimin', 'Çalışmak istediğin konuya yer açmak için.'],
]

/** Desktop-only summary. The modal reuses the same live plan, not a second fetch. */
export function DesktopDailyPlan({ mode, game, examRef, userId, tytSocialPolicy }: DesktopDailyPlanProps) {
  const [open, setOpen] = useState(false)
  const headingId = useId()

  const renderSummary = ({ status, total, completed }: PlanSummary, content: ReactNode) => {
    const ready = status === 'ready'
    const done = ready && total > 0 && completed >= total
    const title = ready
      ? done ? 'Bugünkü planını tamamladın' : completed > 0 ? 'Planına kaldığın yerden devam et' : 'Dengeli planın hazır'
      : status === 'loading' ? 'Günlük planın yükleniyor…'
        : status === 'guest' ? 'Sana özel günlük plan' : 'Planına şu an ulaşılamıyor'
    const description = ready
      ? 'Tekrar zamanı gelenler, gelişmekte olan konular ve yeni sorular bir arada.'
      : status === 'loading' ? 'Bu ders ve sınav kapsamındaki planın kontrol ediliyor.'
        : status === 'guest' ? 'Tekrar ve gelişim planını görmek için hesabına giriş yap.'
          : 'Ayrıntıları inceleyebilir veya aşağıdan konunu seçerek çalışabilirsin.'

    return <>
      <section id="gunluk-plan" className={styles.dailyPlan} aria-label="Sana özel günlük plan" aria-labelledby={headingId} data-complete={done} data-ready={ready}>
        <div className={styles.dailyPlanIcon} aria-hidden="true">
          <Image src="/academy/daily-plan-trophy-v1.png" alt="" width={96} height={96}
            sizes={done ? '56px' : '(max-width: 1200px) 72px, 88px'} className={styles.dailyPlanTrophy} />
          {done && <span className={styles.dailyPlanCompleteBadge}><Check size={16} /></span>}
        </div>
        <div className={styles.dailyPlanCopy}>
          <p className={styles.eyebrow}>Sana özel günlük plan{mode === 'demo' ? ' · Örnek' : ''}</p>
          <h2 id={headingId}>{title}</h2>
          {!done && <p role={ready || status === 'guest' ? undefined : 'status'}>{description}</p>}
        </div>
        {ready && <div className={styles.dailyPlanCount} role="group" aria-label="Tamamlanan günlük plan soruları">
          <span className={styles.dailyPlanCountRing}
            role="progressbar" aria-label="Günlük plan ilerlemesi"
            aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}
            aria-valuetext={`${total} sorudan ${completed} tamamlandı`}
            style={{ background: `conic-gradient(var(--app-accent) ${Math.min(100, completed / Math.max(1, total) * 100)}%, var(--app-border) 0)` }}>
            <strong>{completed} / {total}</strong>
          </span>
          <small>soru tamamlandı</small>
        </div>}
        <button type="button" className={styles.dailyPlanAction} onClick={() => setOpen(true)}>Planı incele <ChevronRight size={18} aria-hidden="true" /></button>
      </section>
      {open && <AcademyDialog title="Sana özel günlük plan" onClose={() => setOpen(false)}>
        <p className={styles.dialogIntro}>Bu plan, tekrarını ve gelişimini tek bir kısa çalışmada birleştirir. Soru dağılımını ve ilerlemeni incele; hazır olduğunda aşağıdan başla.</p>
        {content}
      </AcademyDialog>}
    </>
  }

  if (mode === 'demo') {
    return renderSummary({ status: 'ready', completed: 0, total: 15 }, <>
      <p className={styles.status}>Bu ekran tasarım örneğidir; örnek ilerlemeden gerçek bir günlük plan oluşturulmaz.</p>
      <dl className={styles.planComposition}>
        {DEMO_COMPOSITION.map(([label, description]) => <div key={label}><dt>{label}</dt><dd>{description}</dd></div>)}
      </dl>
      <p className={styles.secondary}>Gerçek hesabında burada planın soru sayısına göre başlat veya devam et düğmesi görünür.</p>
    </>)
  }

  if (!userId) {
    return <section className={styles.guestPlan} aria-label="Sana özel günlük plan">
      <Image src="/academy/daily-plan-trophy-v1.png" alt="" width={56} height={56} sizes="56px" />
      <div><h2>Kendi çalışma planını oluştur</h2><p>Giriş yaptığında tekrarlarını ve gelişimini birlikte takip edebilirsin.</p></div>
      <Link href="/giris?next=%2Farena%2Fcalisma" className={styles.textLink}>Giriş yap <ChevronRight size={18} /></Link>
    </section>
  }

  return <TodayPlanFocus game={game} examRef={examRef} userId={userId} selectedCategory={null} showStickyMobileAction={false}
    tytSocialPolicy={tytSocialPolicy}
    render={({ plan, loading, content }) => {
      const total = plan?.questions.length ?? 0
      const completedIds = new Set(plan?.completedIds ?? [])
      const completed = plan?.questions.filter(question => completedIds.has(question.id)).length ?? 0
      return renderSummary({ status: loading ? 'loading' : total > 0 ? 'ready' : 'unavailable', completed, total }, content)
    }}
  />
}
