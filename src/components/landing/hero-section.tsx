'use client'

import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Zap, ArrowRight, Flame } from 'lucide-react'
import { buttonStyles } from '@/components/ui/button-styles'
import { ArenaBackground } from './arena-background'
import { useUIStore, DARK_THEMES } from '@/stores/ui-store'
import { trackEvent } from '@/lib/utils/plausible'
import {
  ACTIVATION_EXPERIMENT,
  getActivationVariant,
  markActivationExposure,
} from '@/lib/experiments/activation'

const ActivationMicroQuiz = dynamic(
  () => import('./activation-micro-quiz').then((mod) => ({ default: mod.ActivationMicroQuiz })),
  {
    ssr: false,
    loading: ActivationMicroQuizPreview,
  },
)

function ActivationMicroQuizPreview() {
  return (
    <div className="w-full rounded-3xl border border-[var(--focus-border)] bg-[color-mix(in_srgb,var(--card-bg)_94%,transparent)] p-5 shadow-2xl backdrop-blur-xl md:p-7" role="status">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--focus-text)]">
        Üye olmadan hemen dene
      </div>
      <h2 className="mt-3 font-display text-2xl font-black leading-tight text-[var(--text)] md:text-3xl">
        Hedefin hangisi?
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
        Tek seçim, ardından 3 kısa Türkçe sorusu. Yaklaşık 2 dakika.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-hidden="true">
        <div className="min-h-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <span className="block font-display text-xl font-black text-[var(--text)]">LGS</span>
          <span className="mt-1 block text-sm text-[var(--text-sub)]">Ortaokul hedefim</span>
        </div>
        <div className="min-h-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <span className="block font-display text-xl font-black text-[var(--text)]">TYT · AYT</span>
          <span className="mt-1 block text-sm text-[var(--text-sub)]">Üniversite hedefim</span>
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-[var(--text-muted)]">
        Kayıt yok · Kart bilgisi yok · Sonucu görünce karar ver
      </p>
    </div>
  )
}

function ActivationMicroQuizSlot() {
  const enabled = useSyncExternalStore(
    () => () => {},
    () => getActivationVariant() === 'micro',
    () => false,
  )

  if (!enabled) {
    return <ActivationMicroQuizPreview />
  }

  return <ActivationMicroQuiz />
}

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
        <div className="mt-1 text-xs leading-tight text-[var(--text-muted)] xl:text-sm 2xl:text-base">
          {label}
        </div>
      </div>
    </div>
  )
}

interface HeroSectionProps {
  config?: Record<string, unknown>
}

export function HeroSection({ config }: HeroSectionProps = {}) {
  const badge = (config?.badge as string) || "Türkiye'nin YKS · LGS · AYT Oyun Platformu"
  const heading = (config?.heading as string[]) || ['Bilginle', 'yeni dünyalar', 'aç.']
  const managedSubheading = typeof config?.subheading === 'string' && config.subheading.trim()
    ? config.subheading : null
  const logoUrl = (config?.logo_url as string) || '/logo/icon-512-transparent.png'
  const ctaPrimary = (config?.cta_primary as { text?: string; href?: string }) || {}
  const { theme } = useUIStore()
  const isDarkTheme = DARK_THEMES.has(theme)
  const ctaSecondary = (config?.cta_secondary as { text?: string; href?: string }) || {}
  const miniStats = (config?.mini_stats as string[]) || null

  useEffect(() => {
    const variant = getActivationVariant()
    markActivationExposure(variant)
    trackEvent('ActivationExperimentViewed', {
      props: { experiment: ACTIVATION_EXPERIMENT, variant },
    })
  }, [])

  // Anasayfa görseli: marka logosu (logoUrl = /logo/icon-512-transparent.png),
  // dairesel parlayan çerçevede. Bilge Chan maskotu kullanıcı isteğiyle
  // anasayfadan kaldırıldı (hasMascot=false) — mekanizma korundu, gerekirse
  // hasMascot=true ile maskot (chan-wave.webp) + balon + isim etiketi geri açılır.
  const [mascotSrc, setMascotSrc] = useState('/chan/chan-wave.webp')
  const [hasMascot, setHasMascot] = useState(false)

  return (
    <section className="relative flex min-h-screen items-center overflow-hidden">
      <ArenaBackground />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pb-16 pt-24
        md:px-6 md:pb-20 md:pt-28
        lg:px-8 lg:pt-32
        xl:max-w-[1400px]
        2xl:max-w-[1600px]">

        <div className="grid items-center gap-8 md:gap-12 lg:grid-cols-2 lg:gap-16">

          {/* Telefonda başlık ve CTA önce; tablette mevcut görsel sırası korunur. */}
          <div className="activation-control relative order-last flex h-[220px] items-center justify-center
            md:h-[320px]
            md:order-first lg:order-last lg:h-[520px]
            xl:h-[620px]
            2xl:h-[720px]">

            {/* Zemin: platform parlaması */}
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2
                h-6 w-[160px] rounded-full blur-xl opacity-60
                md:h-8 md:w-[220px]
                lg:h-10 lg:w-[300px]"
              style={{ background: 'var(--focus)' }}
            />

            {/* Bilge Chan / Logo merkezi */}
            <div className="relative flex flex-col items-center">

              {/* Konuşma balonu — sadece gerçek maskot varsa */}
              {hasMascot && (
                <div
                  className="animate-float will-change-transform [animation-delay:0.3s] mb-2 rounded-2xl border px-3 py-1.5 text-xs font-bold shadow-md
                    md:mb-3 md:rounded-3xl md:px-4 md:py-2 md:text-sm
                    lg:mb-4 lg:text-base"
                  style={{
                    background: 'var(--card)',
                    borderColor: 'var(--focus-border)',
                    color: 'var(--focus)',
                  }}
                >
                  Hazır mısın? 🎯
                  {/* Balonun oku */}
                  <span
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-0 w-0"
                    style={{
                      borderLeft: '8px solid transparent',
                      borderRight: '8px solid transparent',
                      borderTop: '8px solid var(--focus-border)',
                    }}
                  />
                </div>
              )}

              {/* Maskot görsel — karakter veya logo */}
              <div
                className={`relative animate-glow-pulse ${
                  hasMascot
                    ? 'rounded-none bg-transparent'
                    : 'rounded-full'
                }
                  h-[130px] w-[130px] flex items-center justify-center
                  md:h-[190px] md:w-[190px]
                  lg:h-[300px] lg:w-[300px]
                  xl:h-[380px] xl:w-[380px]
                  2xl:h-[440px] 2xl:w-[440px]`}
                style={
                  hasMascot
                    ? undefined
                    : {
                        background: 'radial-gradient(circle, var(--card) 0%, var(--surface) 70%)',
                        border: '2px solid #2563EB40',
                        boxShadow: '0 0 60px #2563EB30, inset 0 0 40px #2563EB10',
                      }
                }
              >
                <Image
                  src={hasMascot ? mascotSrc : logoUrl}
                  alt={hasMascot ? 'Bilge Chan' : 'Bilge Arena'}
                  width={440}
                  height={440}
                  sizes="(max-width: 767px) 130px, (max-width: 1023px) 190px, (max-width: 1279px) 300px, (max-width: 1535px) 380px, 440px"
                  loading="eager"
                  fetchPriority="high"
                  className={`
                    ${hasMascot
                      ? `drop-shadow-2xl object-contain${isDarkTheme ? ' mix-blend-screen' : ''}`
                      : 'object-contain'}
                    h-full w-full`}
                  onError={() => {
                    if (hasMascot) {
                      setHasMascot(false)
                      setMascotSrc(logoUrl)
                    }
                  }}
                  draggable={false}
                />
              </div>

              {/* Karakter adı — sadece gerçek maskot varsa */}
              {hasMascot && (
                <div
                  className="mt-2 rounded-full border px-3 py-1 text-xs font-extrabold tracking-widest
                    md:mt-3 md:px-4
                    lg:text-sm"
                  style={{
                    background: 'var(--focus-bg)',
                    borderColor: 'var(--focus-border)',
                    color: 'var(--focus)',
                  }}
                >
                  BİLGE CHAN
                </div>
              )}
            </div>

            {/* Orbit kartlar — mobilde gizli, md+ görünür */}
            <FloatCard
              icon={Flame}
              val="12🔥"
              label="Günlük Seri"
              color="var(--urgency-light)"
              className="animate-float will-change-transform absolute hidden md:flex
                md:left-0 md:top-2
                lg:top-5
                xl:left-[-30px] xl:top-8
                2xl:left-[-50px] 2xl:top-12"
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

          </div>

          {/* A/B varyanti: logo alani yerine ilk degeri uyelikten once yasatir. */}
          <div className="activation-micro relative order-first min-h-[28rem] w-full items-center justify-center lg:order-last lg:min-h-[620px] 2xl:min-h-[720px]">
            <ActivationMicroQuizSlot />
          </div>

          {/* ── Sol — Metin ── */}
          <div className="landing-hero-copy text-center lg:text-left">
            {/* Status badge */}
            <div className="animate-fadeUp will-change-[transform,opacity] mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--focus-border)] bg-[var(--focus-bg)] px-3 py-1
              md:mb-6 md:px-4 md:py-1.5
              xl:px-5 xl:py-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--growth)] shadow-[0_0_8px_var(--growth)]" />
              <span className="text-xs font-semibold text-[var(--focus-text)] md:text-sm xl:text-base">
                {badge}
              </span>
            </div>

            {/* Başlık */}
            <h1 className="animate-fadeUp will-change-[transform,opacity] font-display text-4xl font-black leading-[1.1] tracking-tight [animation-delay:100ms]
              md:text-5xl
              lg:text-[58px]
              xl:text-[68px]
              2xl:text-[80px]">
              <span className="text-[var(--text)]">{heading[0]}</span>{' '}
              <br />
              <span className="shimmer-text">{heading[1]}</span>{' '}
              <br />
              <span className="text-[var(--focus-light)]">{heading[2]}</span>
            </h1>

            {/* Alt metin */}
            <p className="animate-fadeUp will-change-[transform,opacity] mx-auto mt-4 max-w-[380px] text-base leading-relaxed text-[var(--text-sub)] [animation-delay:200ms]
              md:mt-5 md:max-w-[460px] md:text-lg
              lg:mx-0
              xl:max-w-[520px] xl:text-xl
              2xl:max-w-[600px] 2xl:text-2xl">
              {managedSubheading ? <>
                {managedSubheading}{' '}
                <strong className="text-[var(--text)]">oyun kadar eğlenceli</strong>. Soruları çöz,
                XP kazan, zirvede yerini al.
              </> : 'Bir oyunla kendine meydan oku, bir dersle hedefine yaklaş. Bilge Arena’da ilerlemenin yolu sana ait.'}
            </p>

            {/* CTA butonları */}
            <div className="animate-fadeUp will-change-[transform,opacity] mt-7 flex flex-col justify-center gap-3 [animation-delay:300ms]
              sm:flex-row
              md:mt-9
              lg:justify-start">
              <Link href={ctaPrimary.href || '/arena'} className={buttonStyles('primary', 'lg', 'min-h-12 w-full whitespace-nowrap sm:w-auto')}>
                <Zap size={18} />
                {ctaPrimary.text || 'Oyunları keşfet'}
              </Link>
              <Link href={ctaSecondary.href || '/arena/calisma'} className={buttonStyles('ghost', 'lg', 'min-h-12 w-full whitespace-nowrap sm:w-auto')}>
                {ctaSecondary.text || 'Ders çalış'}
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Mini istatistikler */}
            <div className="animate-fadeUp will-change-[transform,opacity] mt-8 flex justify-center gap-6 [animation-delay:400ms]
              md:mt-12 md:gap-8
              lg:justify-start
              xl:gap-12">
              {(miniStats ? [
                { val: miniStats[0], label: 'Soru', color: 'var(--focus-light)' },
                { val: miniStats[1], label: 'Oyun', color: 'var(--reward-light)' },
                { val: miniStats[2], label: 'Sonsuza dek', color: 'var(--growth-light)' },
              ] : [
                { val: '3700+', label: 'Soru', color: 'var(--focus-light)' },
                { val: '5', label: 'Oyun', color: 'var(--reward-light)' },
                { val: 'Ücretsiz', label: 'Sonsuza dek', color: 'var(--growth-light)' },
              ]).map(({ val, label, color }) => (
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
