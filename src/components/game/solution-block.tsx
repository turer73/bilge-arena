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

  return (
    <div
      className="mt-2.5 rounded-lg px-3 py-2 text-xs leading-relaxed"
      style={{
        background: isFixed
          ? 'color-mix(in srgb, var(--growth) 10%, var(--card-bg))'
          : 'color-mix(in srgb, var(--urgency) 8%, var(--card-bg))',
        color: 'var(--text-sub)',
        border: `1px solid ${
          isFixed
            ? 'color-mix(in srgb, var(--growth) 25%, transparent)'
            : 'color-mix(in srgb, var(--urgency) 20%, transparent)'
        }`,
      }}
    >
      📌 {solution}
    </div>
  )
}
