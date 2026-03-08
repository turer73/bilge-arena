'use client'

import { Zap, ArrowRight, Flame, Trophy, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArenaBackground } from './arena-background'

/** Orbit etrafında süzen mini kart — tüm breakpoint'lere uyumlu */
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
      className={`flex items-center gap-1.5 rounded-md border bg-[var(--card)] p-1.5 backdrop-blur-sm
        md:gap-2 md:rounded-lg md:p-2.5
        lg:gap-3 lg:rounded-xl lg:p-3.5
        xl:gap-4 xl:p-4
        2xl:p-5 ${className}`}
      style={{
        borderColor: `${color}40`,
        boxShadow: `0 8px 30px ${color}25`,
      }}
    >
      <div
        className="flex h-6 w-6 items-center justify-center rounded
          md:h-8 md:w-8 md:rounded-md
          lg:h-10 lg:w-10 lg:rounded-lg
          xl:h-12 xl:w-12
          2xl:h-14 2xl:w-14"
        style={{ background: `${color}20` }}
      >
        <Icon
          className="h-3 w-3 md:h-4 md:w-4 lg:h-[18px] lg:w-[18px] xl:h-5 xl:w-5 2xl:h-6 2xl:w-6"
          style={{ color }}
        />
      </div>
      <div>
        <div className="text-xs font-extrabold leading-none text-[var(--text)] md:text-sm lg:text-lg xl:text-xl 2xl:text-2xl">
          {val}
        </div>
        <div className="mt-0.5 text-[8px] text-[var(--text-muted)] md:text-[10px] lg:text-xs xl:text-sm 2xl:text-base">
          {label}
        </div>
      </div>
    </div>
  )
}

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden">
      <ArenaBackground />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pb-16 pt-24
        md:px-6 md:pb-20 md:pt-28
        lg:px-8 lg:pt-32
        xl:max-w-[1400px]
        2xl:max-w-[1600px]">

        <div className="grid items-center gap-8 md:gap-12 lg:grid-cols-2 lg:gap-16">

          {/* ── Arena görseli ── */}
          {/* Mobilde üstte ortalı, lg+ sağda */}
          <div className="relative order-first flex h-[220px] items-center justify-center
            md:h-[320px]
            lg:order-last lg:h-[520px]
            xl:h-[620px]
            2xl:h-[720px]">

            {/* Merkez arena dairesi */}
            <div
              className="absolute flex h-[140px] w-[140px] items-center justify-center rounded-full animate-glow-pulse
                md:h-[200px] md:w-[200px]
                lg:h-[300px] lg:w-[300px]
                xl:h-[380px] xl:w-[380px]
                2xl:h-[440px] 2xl:w-[440px]"
              style={{
                background: 'radial-gradient(circle, var(--card) 0%, var(--surface) 70%)',
                border: '2px solid #2563EB40',
                boxShadow: '0 0 60px #2563EB30, inset 0 0 40px #2563EB10',
              }}
            >
              <img
                src="/logo/icon-512-transparent.png"
                alt="Bilge Arena"
                className="h-[100px] w-[100px]
                  md:h-[150px] md:w-[150px]
                  lg:h-[220px] lg:w-[220px]
                  xl:h-[280px] xl:w-[280px]
                  2xl:h-[340px] 2xl:w-[340px]"
                draggable={false}
              />
            </div>

            {/* Orbit kartlar — mobilde gizli, md+ görünür */}
            <FloatCard
              icon={Flame}
              val="12🔥"
              label="Günlük Seri"
              color="var(--urgency-light)"
              className="animate-float absolute hidden md:flex
                md:left-0 md:top-2
                lg:top-5
                xl:left-[-30px] xl:top-8
                2xl:left-[-50px] 2xl:top-12"
            />
            <FloatCard
              icon={Trophy}
              val="#3"
              label="Liderboard"
              color="var(--reward-light)"
              className="animate-float [animation-delay:1s] absolute hidden md:flex
                md:right-0 md:top-6
                lg:top-10
                xl:right-[-30px] xl:top-14
                2xl:right-[-50px] 2xl:top-16"
            />
            <FloatCard
              icon={Zap}
              val="+30 XP"
              label="Doğru Cevap"
              color="var(--focus-light)"
              className="animate-float [animation-delay:2s] absolute hidden md:flex
                md:bottom-6 md:left-0
                lg:bottom-20 lg:left-[-20px]
                xl:bottom-28 xl:left-[-40px]
                2xl:bottom-36 2xl:left-[-60px]"
            />
            <FloatCard
              icon={Star}
              val="Uzman"
              label="Seviye"
              color="var(--wisdom-light)"
              className="animate-float absolute hidden md:flex
                md:bottom-2 md:right-0
                lg:bottom-16
                xl:bottom-24 xl:right-[-20px]
                2xl:bottom-32 2xl:right-[-40px]"
            />

            {/* Yüzde kartı — mobilde gizli, lg+ görünür */}
            <div
              className="animate-float [animation-delay:1.5s] absolute hidden lg:block
                lg:right-[-40px] lg:top-1/2 lg:w-40 lg:rounded-xl lg:p-4
                xl:right-[-60px] xl:w-48 xl:p-5
                2xl:right-[-80px] 2xl:w-52
                rounded-lg border border-[var(--growth-border)] bg-[var(--card)] p-3"
              style={{ boxShadow: '0 8px 30px var(--growth-bg)' }}
            >
              <div className="text-[10px] text-[var(--text-muted)] lg:text-xs xl:text-sm">Doğruluk Oranı</div>
              <div className="mt-1 text-2xl font-extrabold text-[var(--growth-light)] lg:text-3xl xl:text-4xl">
                %84
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)] xl:h-2">
                <div className="xp-bar-fill h-full" style={{ width: '84%' }} />
              </div>
            </div>
          </div>

          {/* ── Sol — Metin ── */}
          <div className="text-center lg:text-left">
            {/* Status badge */}
            <div className="animate-fadeUp mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--focus-border)] bg-[var(--focus-bg)] px-3 py-1
              md:mb-6 md:px-4 md:py-1.5
              xl:px-5 xl:py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--growth)] shadow-[0_0_8px_var(--growth)]" />
              <span className="text-xs font-semibold text-[var(--focus-light)] md:text-sm xl:text-base">
                Türkiye&apos;nin YKS Oyun Platformu
              </span>
            </div>

            {/* Başlık */}
            <h1 className="animate-fadeUp font-display text-4xl font-black leading-[1.1] tracking-tight [animation-delay:100ms]
              md:text-5xl
              lg:text-[58px]
              xl:text-[68px]
              2xl:text-[80px]">
              <span className="text-[var(--text)]">Öğren.</span>
              <br />
              <span className="shimmer-text">Kazan.</span>
              <br />
              <span className="text-[var(--focus-light)]">Yüksel.</span>
            </h1>

            {/* Alt metin */}
            <p className="animate-fadeUp mx-auto mt-4 max-w-[380px] text-base leading-relaxed text-[var(--text-sub)] [animation-delay:200ms]
              md:mt-5 md:max-w-[460px] md:text-lg
              lg:mx-0
              xl:max-w-[520px] xl:text-xl
              2xl:max-w-[600px] 2xl:text-2xl">
              YKS&apos;ye hazırlanmak artık{' '}
              <strong className="text-[var(--text)]">oyun kadar eğlenceli</strong>. Soruları çöz,
              XP kazan, zirvede yerini al.
            </p>

            {/* CTA butonları */}
            <div className="animate-fadeUp mt-7 flex justify-center gap-3 [animation-delay:300ms]
              md:mt-9
              lg:justify-start">
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
            <div className="animate-fadeUp mt-8 flex justify-center gap-6 [animation-delay:400ms]
              md:mt-12 md:gap-8
              lg:justify-start
              xl:gap-12">
              {[
                { val: '1089+', label: 'Soru', color: 'var(--focus-light)' },
                { val: '5', label: 'Oyun', color: 'var(--reward-light)' },
                { val: 'Ücretsiz', label: 'Sonsuza dek', color: 'var(--growth-light)' },
              ].map(({ val, label, color }) => (
                <div key={label}>
                  <div
                    className="font-display text-xl font-extrabold md:text-2xl xl:text-3xl 2xl:text-4xl"
                    style={{ color }}
                  >
                    {val}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] md:text-sm xl:text-base">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
