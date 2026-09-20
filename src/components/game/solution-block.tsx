/**
 * Kucuk, bagimsiz cozum-metni paneli — "Yanlislarim" ekraninda kullanilir.
 *
 * ExplanationPanel BILEREK kullanilmadi: o komponent quiz-akisina bagimli
 * (zorunlu onNext/isLastQuestion prop'lari + mount'ta scrollIntoView) ve bu
 * ekran statik bir gecmis listesi — akis bagimliligi anlamsiz olurdu.
 */
interface SolutionBlockProps {
  solution?: string | null
  tone: 'acik' | 'duzeltildi'
}

export function SolutionBlock({ solution, tone }: SolutionBlockProps) {
  if (!solution) return null

  const isFixed = tone === 'duzeltildi'

  const Icon = isFixed ? CheckCircle2 : Lightbulb

  return (
    <div className={`mt-4 flex items-start gap-3 rounded-[20px] border-2 p-4 ${isFixed ? 'border-[var(--app-success-border)] bg-[var(--app-success-tint)]' : 'border-[var(--app-warn-border)] bg-[var(--app-warn-tint)]'}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-card)] ${isFixed ? 'text-[var(--app-success-ink)]' : 'text-[var(--app-warn-ink)]'}`}>
        <Icon size={18} strokeWidth={2.6} aria-hidden="true" />
      </span>
      <div>
        <p className={`text-[9px] font-black uppercase tracking-[0.14em] ${isFixed ? 'text-[var(--app-success-ink)]' : 'text-[var(--app-warn-ink)]'}`}>Çözüm notu</p>
        <p className="mt-1 text-xs font-semibold leading-6 text-[var(--app-text-sub)]">{solution}</p>
      </div>
    </div>
  )
}
import { CheckCircle2, Lightbulb } from 'lucide-react'
