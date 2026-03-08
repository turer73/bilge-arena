import { Zap, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CTASection() {
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
          Ucretsiz &bull; Reklamsiz &bull; Sinirsiz
        </div>

        <h2 className="font-display text-4xl font-black leading-tight lg:text-5xl">
          <span className="text-[var(--text)]">Arena Seni </span>
          <span className="shimmer-text">Bekliyor</span>
        </h2>

        <p className="mx-auto mt-5 max-w-[500px] text-lg leading-relaxed text-[var(--text-sub)]">
          Bugun basla. Kredi karti yok, sure siniri yok. Sadece ogren ve kazan.
        </p>

        <div className="mt-10 flex justify-center">
          <Button
            variant="primary"
            size="lg"
            className="animate-glow-pulse text-lg"
          >
            <Zap size={20} />
            Simdi Basla — Ucretsiz
          </Button>
        </div>

        <div className="mt-5 flex justify-center gap-6">
          {['Kayit ucretsiz', 'Kredi karti gerekmez', 'Istedigin zaman birak'].map(
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
