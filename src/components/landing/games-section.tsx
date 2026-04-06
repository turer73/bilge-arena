'use client'

import Link from 'next/link'
import { Calculator, BookOpen, FlaskConical, Globe, Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const GAMES = [
  {
    slug: 'matematik',
    emoji: '\uD83E\uDDEE',
    icon: Calculator,
    name: 'Matematik Atolyesi',
    sub: 'TYT Mat',
    desc: 'Problemler, geometri, sayilar — en sik cikan konulara odakli alistirmalar.',
    color: { m: 'var(--focus)', l: 'var(--focus-light)', bg: 'var(--focus-bg)', border: 'var(--focus-border)' },
    count: '200 soru',
    ready: true,
    colorKey: 'focus',
  },
  {
    slug: 'turkce',
    emoji: '\uD83D\uDCDD',
    icon: BookOpen,
    name: 'Turkce Atolyesi',
    sub: 'TYT Turkce',
    desc: 'Paragraf, dil bilgisi, sozcuk turleri — TYT Turkce\'nin nabzini tut.',
    color: { m: 'var(--reward)', l: 'var(--reward-light)', bg: 'var(--reward-bg)', border: 'var(--reward-border)' },
    count: '200 soru',
    ready: true,
    colorKey: 'reward',
  },
  {
    slug: 'fen',
    emoji: '\uD83D\uDD2C',
    icon: FlaskConical,
    name: 'Fen Atolyesi',
    sub: 'TYT Fen',
    desc: 'Biyoloji, Fizik, Kimya — TYT Fen Bilimleri sorulariyla hazirlan.',
    color: { m: 'var(--growth)', l: 'var(--growth-light)', bg: 'var(--growth-bg)', border: 'var(--growth-border)' },
    count: '100 soru',
    ready: true,
    colorKey: 'growth',
  },
  {
    slug: 'sosyal',
    emoji: '\uD83C\uDF0D',
    icon: Globe,
    name: 'Sosyal Atolyesi',
    sub: 'TYT Sosyal',
    desc: 'Tarih, Cografya, Felsefe — Sosyal Bilimler sorulariyla pratik yap.',
    color: { m: 'var(--wisdom)', l: 'var(--wisdom-light)', bg: 'var(--wisdom-bg)', border: 'var(--wisdom-border)' },
    count: '100 soru',
    ready: true,
    colorKey: 'wisdom',
  },
  {
    slug: 'wordquest',
    emoji: '\uD83D\uDCD6',
    icon: Languages,
    name: 'Kelime Atolyesi',
    sub: 'Ingilizce',
    desc: 'Vocabulary, grammar, cloze test — 489 ozgun soru ile YDT\'ye tam hazirlik.',
    color: { m: 'var(--focus)', l: 'var(--focus-light)', bg: 'var(--focus-bg)', border: 'var(--focus-border)' },
    count: '489 soru',
    ready: true,
    colorKey: 'focus',
  },
]

interface GamesSectionProps {
  config?: Record<string, unknown>
}

export function GamesSection({ config }: GamesSectionProps = {}) {
  const sectionTitle = (config?.title as string) || undefined
  const sectionSubtitle = (config?.subtitle as string) || undefined
  const gameOverrides = (config?.games as Record<string, { name?: string; desc?: string; count?: string }>) || {}
  const games = GAMES.map(g => ({
    ...g,
    name: gameOverrides[g.slug]?.name || g.name,
    desc: gameOverrides[g.slug]?.desc || g.desc,
    count: gameOverrides[g.slug]?.count || g.count,
  }))
  return (
    <section className="bg-gradient-to-b from-[var(--bg)] to-[var(--surface)] py-24">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        {/* Baslik */}
        <div className="mb-14 text-center">
          <div className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--focus-light)]">
            Platform
          </div>
          <h2 className="font-display text-4xl font-black lg:text-[42px]">
            {sectionTitle ? (
              <span className="text-[var(--text)]">{sectionTitle}</span>
            ) : (
              <>
                <span className="text-[var(--text)]">Arena </span>
                <span className="text-[var(--reward-light)]">Oyunlari</span>
              </>
            )}
          </h2>
          <p className="mx-auto mt-4 max-w-[500px] text-[var(--text-sub)]">
            {sectionSubtitle || 'Her ders kendi arenasinda. Oyna, kazan, siralamada yuksel.'}
          </p>
        </div>

        {/* Oyun kartlari — 5'li grid: ust 3, alt 2 */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <Link
              key={g.slug}
              href={`/arena/${g.slug}`}
              className="card-hover group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 block"
            >
              {/* Arka plan efekti */}
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-[200px] w-[200px] rounded-full"
                style={{
                  background: `radial-gradient(circle, ${g.color.bg} 0%, transparent 70%)`,
                }}
              />

              <div className="relative">
                {/* Ikon + badge */}
                <div className="mb-5 flex items-start justify-between">
                  <div
                    className="game-icon flex h-[72px] w-[72px] items-center justify-center rounded-2xl text-4xl"
                    style={{
                      background: g.color.bg,
                      border: `1px solid ${g.color.border}`,
                    }}
                  >
                    {g.emoji}
                  </div>
                  <Badge color={g.colorKey}>
                    {g.ready ? 'Hazir' : 'Yakinda'}
                  </Badge>
                </div>

                {/* Icerik */}
                <div
                  className="mb-1.5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: g.color.l }}
                >
                  {g.sub}
                </div>
                <h3 className="mb-2.5 font-display text-xl font-extrabold">
                  {g.name}
                </h3>
                <p className="mb-5 text-sm leading-relaxed text-[var(--text-sub)]">
                  {g.desc}
                </p>

                {/* Alt kisim */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)]">{g.count}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    className="text-xs"
                    style={
                      g.ready
                        ? {
                            background: `linear-gradient(135deg, ${g.color.m}, ${g.color.l})`,
                            boxShadow: `0 4px 15px ${g.color.bg}`,
                          }
                        : undefined
                    }
                  >
                    {g.ready ? 'Oyna \u2192' : 'Bildir'}
                  </Button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
