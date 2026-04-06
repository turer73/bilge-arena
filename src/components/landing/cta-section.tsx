import Link from 'next/link'
import { Zap, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CTASectionProps {
  config?: Record<string, unknown>
}

export function CTASection({ config }: CTASectionProps = {}) {
  const label = (config?.label as string) || 'Ücretsiz \u2022 Reklamsız \u2022 Sınırsız'
  const heading = (config?.heading as string) || undefined
  const subheading = (config?.subheading as string) || 'Bugün başla. Kredi kartı yok, süre sınırı yok. Sadece öğren ve kazan.'
  const buttonText = (config?.button_text as string) || 'Şimdi Başla — Ücretsiz'
  const trustItems = (config?.trust_items as string[]) || ['Kayıt ücretsiz', 'Kredi kartı gerekmez', 'İstediğin zaman bırak']
  return (
    <section className="relative overflow-hidden py-24">
      {/* Arka plan glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, var(--focus-bg) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(var(--focus-bg) 1px, transparent 1px), linear-gradient(90deg, var(--focus-bg) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.5,
        }}
      />

      <div className="relative mx-auto max-w-[680px] text-center">
        <div className="mb-4 text-sm font-bold uppercase tracking-widest text-[var(--growth-light)]">
          {label}
        </div>

        <h2 className="font-display text-4xl font-black leading-tight lg:text-5xl">
          {heading ? (
            <span className="text-[var(--text)]">{heading}</span>
          ) : (
            <>
              <span className="text-[var(--text)]">Arena Seni </span>
              <span className="shimmer-text">Bekliyor</span>
            </>
          )}
        </h2>

        <p className="mx-auto mt-5 max-w-[500px] text-lg leading-relaxed text-[var(--text-sub)]">
          {subheading}
        </p>

        <div className="mt-10 flex justify-center">
          <Link href="/arena">
            <Button
              variant="primary"
              size="lg"
              className="animate-glow-pulse text-lg"
            >
              <Zap size={20} />
              {buttonText}
            </Button>
          </Link>
        </div>

        <div className="mt-5 flex justify-center gap-6">
          {trustItems.map(
            (t) => (
              <div
                key={t}
                className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]"
              >
                <Check size={14} className="text-[var(--growth)]" />
                {t}
              </div>
            )
          )}
        </div>
      </div>
    </section>
  )
}
