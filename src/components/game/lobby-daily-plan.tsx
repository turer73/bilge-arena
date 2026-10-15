'use client'

import { useId, useState, type ComponentProps } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { AcademyDialog } from '@/components/academy/academy-dialog'
import { TODAY_PLAN_CONTENT_UNAVAILABLE_MESSAGE } from '@/lib/study/today-plan-contract'
import { TodayPlanCard } from './today-plan-card'
import styles from './lobby-daily-plan.module.css'

type LobbyDailyPlanProps = Omit<ComponentProps<typeof TodayPlanCard>, 'onStart' | 'showStickyMobileAction'> & {
  onStart: () => boolean
  unavailableReason?: string | null
}

/** Secondary desktop/tablet action; the engine keeps ownership of the plan and its start gates. */
export function LobbyDailyPlan({ onStart, unavailableReason, ...cardProps }: LobbyDailyPlanProps) {
  const [open, setOpen] = useState(false)
  const descriptionId = useId()
  const available = Boolean(cardProps.plan?.questions.length)
  const total = cardProps.plan?.questions.length ?? 0
  const completedIds = new Set(cardProps.plan?.completedIds ?? [])
  const completed = cardProps.plan?.questions.filter(question => completedIds.has(question.id)).length ?? 0
  const status = unavailableReason ? 'Plan durumunu gör'
    : cardProps.loading ? 'Planın hazırlanıyor…'
    : !available ? 'Plan durumunu gör'
    : completed >= total ? 'Bugünkü hedef tamamlandı'
    : completed > 0 ? `${completed}/${total} soru tamamlandı`
    : `${total} soruluk kişisel tur`

  return <>
    <button
      type="button"
      aria-label="Günlük planın"
      aria-describedby={descriptionId}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className={styles.shortcut}
      data-lobby-daily-plan
    >
      <span className={styles.trophy} aria-hidden="true">
        <Image src="/academy/daily-plan-trophy-v1.png" alt="" width={80} height={80} sizes="80px" />
      </span>
      <span className={styles.copy}>
        <strong>Günlük planın</strong>
        <span id={descriptionId}>{status}</span>
      </span>
      <span className={styles.action}>Planı incele <ChevronRight size={16} aria-hidden="true" /></span>
    </button>
    {open && <AcademyDialog title="Sana özel günlük plan" size="compact" onClose={() => setOpen(false)}>
      <p className="mb-4 text-sm leading-relaxed text-[var(--app-text-sub)]">
        Bu ders için tekrar ve gelişim turu. Planı başlattığında zamansız pratik moduna geçersin.
      </p>
      {unavailableReason || (!cardProps.loading && !available) ? (
        <p role="status" className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4 text-sm text-[var(--app-text-sub)]">
          {unavailableReason ? TODAY_PLAN_CONTENT_UNAVAILABLE_MESSAGE : 'Bu ders ve sınav için günlük plan şu anda hazır değil. Oyununa normal şekilde başlayabilirsin.'}
        </p>
      ) : (
        <TodayPlanCard {...cardProps} onStart={() => {
          // Also dismiss before an existing premium gate is shown. A blocked
          // start keeps the plan open; it must never bypass engine safeguards.
          if (onStart()) setOpen(false)
        }} />
      )}
      <Link href="/arena/calisma" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--app-accent-text)]">
        Ders Çalış ekranına git →
      </Link>
    </AcademyDialog>}
  </>
}
