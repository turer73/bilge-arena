'use client'

import { Zap, ArrowRight, Flame, Trophy, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArenaBackground } from './arena-background'
import { Logo } from '@/components/layout/logo'

/** Orbit etrafında süzen mini kart — viewport'a göre ölçeklenir */
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
      className={`flex items-center gap-2 rounded-lg border bg-[var(--card)] p-2.5 backdrop-blur-sm lg:gap-3 lg:rounded-xl lg:p-3.5 ${className}`}
      style={{
        borderColor: `${color}40`,
        boxShadow: `0 8px 30px ${color}25`,
      }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-md lg:h-10 lg:w-10 lg:rounded-lg"
        style={{ background: `${color}20` }}
      >
        <Icon className="h-4 w-4 lg:h-[18px] lg:w-[18px]" style={{ color }} />
      </div>
      <div>
        <div className="text-sm font-extrabold leading-none text-[var(--text)] lg:text-lg">{val}</div>
        <div className="mt-0.5 text-[10px] text-[var(--text-muted)] lg:text-xs">{label}</div>
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
                Türkiye&apos;nin YKS Oyun Platformu
              </span>
            </div>

            {/* Baslik */}
            <h1 className="animate-fadeUp font-display text-5xl font-black leading-[1.1] tracking-tight [animation-delay:100ms] lg:text-[58px]">
              <span className="text-[var(--text)]">Öğren.</span>
              <br />
              <span className="shimmer-text">Kazan.</span>
              <br />
              <span className="text-[var(--focus-light)]">Yüksel.</span>
            </h1>

            {/* Alt metin */}
            <p className="animate-fadeUp mt-5 max-w-[460px] text-lg leading-relaxed text-[var(--text-sub)] [animation-delay:200ms]">
              YKS&apos;ye hazırlanmak artık{' '}
              <strong className="text-[var(--text)]">oyun kadar eğlenceli</strong>. Soruları çöz,
              XP kazan, zirvede yerini al.
            </p>

            {/* CTA butonlari */}
            <div className="animate-fadeUp mt-9 flex gap-3 [animation-delay:300ms]">
              <Button variant="primary" size="lg">
                <Zap size={18} />
                Ücretsiz Başla
              </Button>
              <Button variant="ghost" size="lg">
                Nasıl Çalışır?
                <ArrowRight size={16} />
              </Button>
            </div>

            {/* Mini istatistikler */}
            <div className="animate-fadeUp mt-12 flex gap-8 [animation-delay:400ms]">
              {[
                { val: '1089+', label: 'Soru', color: 'var(--focus-light)' },
                { val: '5', label: 'Oyun', color: 'var(--reward-light)' },
                { val: 'Ücretsiz', label: 'Sonsuza dek', color: 'var(--growth-light)' },
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

          {/* Sağ — Arena görseli */}
          <div className="relative hidden h-[380px] items-center justify-center md:flex lg:h-[520px]">
            {/* Merkez arena */}
            <div
              className="absolute flex h-[200px] w-[200px] items-center justify-center rounded-full animate-glow-pulse lg:h-[300px] lg:w-[300px]"
              style={{
                background:
                  'radial-gradient(circle, var(--card) 0%, var(--surface) 70%)',
                border: '2px solid #2563EB40',
                boxShadow:
                  '0 0 60px #2563EB30, inset 0 0 40px #2563EB10',
              }}
            >
              <Logo size={80} showText={false} />
            </div>

            {/* Orbit kartlar */}
            <FloatCard
              icon={Flame}
              val="12🔥"
              label="Günlük Seri"
              color="var(--urgency-light)"
              className="animate-float absolute left-0 top-5 lg:top-5"
            />
            <FloatCard
              icon={Trophy}
              val="#3"
              label="Liderboard"
              color="var(--reward-light)"
              className="animate-float [animation-delay:1s] absolute right-0 top-10 lg:top-10"
            />
            <FloatCard
              icon={Zap}
              val="+30 XP"
              label="Doğru Cevap"
              color="var(--focus-light)"
              className="animate-float [animation-delay:2s] absolute bottom-10 left-0 lg:bottom-20 lg:left-[-20px]"
            />
            <FloatCard
              icon={Star}
              val="Uzman"
              label="Seviye"
              color="var(--wisdom-light)"
              className="animate-float absolute bottom-5 right-0 lg:bottom-16"
            />

            {/* Yüzde kartı */}
            <div
              className="animate-float [animation-delay:1.5s] absolute right-[-10px] top-1/2 w-32 rounded-lg border border-[var(--growth-border)] bg-[var(--card)] p-3 lg:right-[-40px] lg:w-40 lg:rounded-xl lg:p-4"
              style={{ boxShadow: '0 8px 30px var(--growth-bg)' }}
            >
              <div className="text-[10px] text-[var(--text-muted)] lg:text-xs">Doğruluk Oranı</div>
              <div className="mt-1 text-2xl font-extrabold text-[var(--growth-light)] lg:text-3xl">%84</div>
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
