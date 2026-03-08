import { BookOpen, Target, Shield, Zap } from 'lucide-react'

const STATS = [
  { val: '1089+', label: 'Ozgun Soru', icon: BookOpen, color: 'var(--focus-light)' },
  { val: '5', label: 'Ders Alani', icon: Target, color: 'var(--reward-light)' },
  { val: '%100', label: 'Ucretsiz', icon: Shield, color: 'var(--growth-light)' },
  { val: '\u221E', label: 'Tekrar Hakki', icon: Zap, color: 'var(--wisdom-light)' },
]

export function StatsBar() {
  return (
    <section className="border-y border-[var(--border)] bg-gradient-to-br from-[var(--card)] to-[var(--surface)] py-16">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-8 px-6 lg:grid-cols-4 lg:px-8">
        {STATS.map(({ val, label, icon: Icon, color }) => (
          <div key={label} className="text-center">
            <Icon size={28} style={{ color }} className="mx-auto" strokeWidth={1.5} />
            <div
              className="mt-2 font-display text-4xl font-black leading-none lg:text-[44px]"
              style={{ color }}
            >
              {val}
            </div>
            <div className="mt-1 text-sm font-medium text-[var(--text-muted)]">
              {label}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
