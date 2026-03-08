'use client'

import { Zap, ArrowRight, Flame, Trophy, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArenaBackground } from './arena-background'
import { Logo } from '@/components/layout/logo'

/** Orbit etrafinda suzen mini kart */
function FloatCard({
  icon: Icon,
  val,
  label,
  color,
  className = '',
}: {
  icon: React.ElementType
  val: string
  label: string
  color: string
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-[var(--card)] p-3.5 backdrop-blur-sm ${className}`}
      style={{
        borderColor: `${color}40`,
        boxShadow: `0 8px 30px ${color}25`,
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ background: `${color}20` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div className="text-lg font-extrabold leading-none text-[var(--text)]">{val}</div>
        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{label}</div>
      </div>
    </div>
  )
}

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden">
      <ArenaBackground />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6 pb-20 pt-32 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Sol — Metin */}
          <div>
            {/* Status badge */}
            <div className="animate-fadeUp mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--focus-border)] bg-[var(--focus-bg)] px-4 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--growth)] shadow-[0_0_8px_var(--growth)]" />
              <span className="text-sm font-semibold text-[var(--focus-light)]">
                Turkiye&apos;nin YKS Oyun Platformu
              </span>
            </div>

            {/* Baslik */}
            <h1 className="animate-fadeUp font-display text-5xl font-black leading-[1.1] tracking-tight [animation-delay:100ms] lg:text-[58px]">
              <span className="text-[var(--text)]">Ogren.</span>
              <br />
              <span className="shimmer-text">Kazan.</span>
              <br />
              <span className="text-[var(--focus-light)]">Yuksel.</span>
            </h1>

            {/* Alt metin */}
            <p className="animate-fadeUp mt-5 max-w-[460px] text-lg leading-relaxed text-[var(--text-sub)] [animation-delay:200ms]">
              YKS&apos;ye hazirlanmak artik{' '}
              <strong className="text-[var(--text)]">oyun kadar eglenceli</strong>. Sorular coz,
              XP kazan, zirvede yerini al.
            </p>

            {/* CTA butonlari */}
            <div className="animate-fadeUp mt-9 flex gap-3 [animation-delay:300ms]">
              <Button variant="primary" size="lg">
                <Zap size={18} />
                Ucretsiz Basla
              </Button>
              <Button variant="ghost" size="lg">
                Nasil Calisir?
                <ArrowRight size={16} />
              </Button>
            </div>

            {/* Mini istatistikler */}
            <div className="animate-fadeUp mt-12 flex gap-8 [animation-delay:400ms]">
              {[
                { val: '1089+', label: 'Soru', color: 'var(--focus-light)' },
                { val: '5', label: 'Oyun', color: 'var(--reward-light)' },
                { val: 'Ucretsiz', label: 'Sonsuza dek', color: 'var(--growth-light)' },
              ].map(({ val, label, color }) => (
                <div key={label}>
                  <div
                    className="font-display text-2xl font-extrabold"
                    style={{ color }}
                  >
                    {val}
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sag — Arena gorseli */}
          <div className="relative hidden h-[520px] items-center justify-center lg:flex">
            {/* Merkez arena */}
            <div
              className="absolute flex h-[300px] w-[300px] items-center justify-center rounded-full border-2 border-[var(--focus-border)] animate-glow-pulse"
              style={{
                background:
                  'radial-gradient(circle, var(--card) 0%, var(--surface) 70%)',
                boxShadow:
                  '0 0 60px var(--focus-bg), inset 0 0 40px var(--focus-bg)',
              }}
            >
              <Logo size={80} />
            </div>

            {/* Orbit kartlar */}
            <FloatCard
              icon={Flame}
              val="12\uD83D\uDD25"
              label="Gunluk Seri"
              color="var(--urgency-light)"
              className="animate-float absolute left-0 top-5"
            />
            <FloatCard
              icon={Trophy}
              val="#3"
              label="Liderboard"
              color="var(--reward-light)"
              className="animate-float [animation-delay:1s] absolute right-0 top-10"
            />
            <FloatCard
              icon={Zap}
              val="+30 XP"
              label="Dogru Cevap"
              color="var(--focus-light)"
              className="animate-float [animation-delay:2s] absolute bottom-20 left-[-20px]"
            />
            <FloatCard
              icon={Star}
              val="Uzman"
              label="Seviye"
              color="var(--wisdom-light)"
              className="animate-float absolute bottom-16 right-0"
            />

            {/* Yuzde karti */}
            <div
              className="animate-float [animation-delay:1.5s] absolute right-[-40px] top-1/2 w-40 rounded-xl border border-[var(--growth-border)] bg-[var(--card)] p-4"
              style={{ boxShadow: '0 8px 30px var(--growth-bg)' }}
            >
              <div className="text-xs text-[var(--text-muted)]">Dogruluk Orani</div>
              <div className="mt-1 text-3xl font-extrabold text-[var(--growth-light)]">%84</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
                <div className="xp-bar-fill h-full" style={{ width: '84%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
