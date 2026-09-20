'use client'

import Link from 'next/link'
import { BrainCircuit, CalendarCheck2, Gauge, Route } from 'lucide-react'
import { AcademyDialog } from '@/components/academy/academy-dialog'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { useAdaptiveDiagnostic } from '@/lib/hooks/use-adaptive-diagnostic'

interface DiagnosticExplainerDialogProps {
  game: GameSlug
  examRef: string
  userId?: string | null
  onClose: () => void
}

const STEPS = [
  {
    icon: Gauge,
    title: 'Yanıtına uyum sağlar',
    description: 'Sorular yanıtlarına göre bir kademe kolaylaşabilir veya zorlaşabilir.',
  },
  {
    icon: Route,
    title: 'İlk çalışma yönünü çıkarır',
    description: 'Güçlü başlangıçlarını ve önce çalışmanın yararlı olacağı kazanımları gösterir.',
  },
  {
    icon: CalendarCheck2,
    title: 'Planın zamanla netleşir',
    description: 'Tarama ilk adımı seçer; doğrulanmış pratiklerin sonraki günlük planlarını kişiselleştirir.',
  },
] as const

export function DiagnosticExplainerDialog({
  game,
  examRef,
  userId,
  onClose,
}: DiagnosticExplainerDialogProps) {
  const diagnostic = useAdaptiveDiagnostic(game, userId, examRef)
  const policy = diagnostic.response?.policy ?? null
  const subjectName = `${examRef} ${GAMES[game].name}`
  const diagnosticParams = new URLSearchParams({ game, exam_ref: examRef })
  const diagnosticHref = `/arena/tani?${diagnosticParams}`
  const signInHref = `/giris?next=${encodeURIComponent(diagnosticHref)}`
  const estimatedMinutes = policy ? Math.max(3, Math.round(policy.questionCount * 0.8)) : null
  const activeSession = diagnostic.session?.status === 'active'

  return (
    <AcademyDialog title="Seviyeni ölç" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-start gap-4 rounded-2xl border border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--app-card)] text-[var(--app-accent-text)]" aria-hidden="true">
            <BrainCircuit size={25} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">{subjectName}</p>
            <h3 className="mt-1 text-lg font-black text-[var(--app-text)]">Sana özel başlangıç yönünü bul</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--app-text-sub)]">
              Bu bir sınav veya kesin seviye notu değildir. Ödülünü ve sıralamanı etkilemeden ilk çalışma tahminini oluşturur.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, description }, index) => (
            <article key={title} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4">
              <div className="flex items-center justify-between">
                <Icon className="text-[var(--app-accent-text)]" size={21} aria-hidden="true" />
                <span className="text-[10px] font-black text-[var(--app-text-muted)]">0{index + 1}</span>
              </div>
              <h3 className="mt-3 text-sm font-black text-[var(--app-text)]">{title}</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">{description}</p>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4">
          {!userId ? (
            <>
              <strong className="block text-sm text-[var(--app-text)]">Kısa ve uyarlanabilir başlangıç taraması</strong>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">
                Giriş yaptığında seçtiğin ders için yayınlanmış soru sayısını ve tahmini süreyi ölçüm başlamadan önce göreceksin.
              </p>
            </>
          ) : diagnostic.error === 'load' ? (
            <div>
              <p role="alert" className="text-sm font-bold text-[var(--app-text)]">Ölçüm bilgisi şu anda alınamadı.</p>
              <button type="button" onClick={() => void diagnostic.refresh()} className="mt-2 min-h-11 text-xs font-black text-[var(--app-accent-text)] hover:underline">Tekrar dene</button>
            </div>
          ) : diagnostic.loading || !diagnostic.response ? (
            <p role="status" className="text-sm font-bold text-[var(--app-text-sub)]">Bu dersin ölçüm kapsamı kontrol ediliyor…</p>
          ) : !diagnostic.supported || !policy ? (
            <p className="text-sm font-bold text-[var(--app-text-sub)]">Bu ders ve sınav kapsamında başlangıç taraması henüz yayınlanmadı.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong className="block text-sm text-[var(--app-text)]">{policy.questionCount} uyarlanabilir soru · yaklaşık {estimatedMinutes} dakika</strong>
                <p className="mt-1 text-xs font-semibold text-[var(--app-text-sub)]">Tek oturumda bitirmek zorunda değilsin; kaldığın yerden devam edebilirsin.</p>
              </div>
              <span className="rounded-full bg-[var(--app-accent-tint)] px-3 py-1.5 text-[10px] font-black text-[var(--app-accent-text)]">{policy.outcomeCount} kazanım alanı</span>
            </div>
          )}
        </div>

        {!userId ? (
          <Link href={signInHref} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--app-accent)] px-5 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none">
            Giriş yap ve ölçümü aç
          </Link>
        ) : diagnostic.supported && policy ? (
          <Link href={diagnosticHref} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--app-accent)] px-5 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none">
            {activeSession ? 'Kaldığın yerden devam et' : 'Ölçüm ekranına geç'}
          </Link>
        ) : null}
      </div>
    </AcademyDialog>
  )
}
