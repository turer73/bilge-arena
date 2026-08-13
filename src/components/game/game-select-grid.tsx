'use client'

import Link from 'next/link'
import {
  ArrowRight,
  BookOpenText,
  Calculator,
  FlaskConical,
  Globe2,
  Languages,
  type LucideIcon,
} from 'lucide-react'
import { getCategoryLabel, type GameDefinition, type GameSlug } from '@/lib/constants/games'

interface GameSelectGridProps {
  games: GameDefinition[]
  examType?: string | null
}

interface GamePresentation {
  icon: LucideIcon
  kicker: string
  cta: string
}

const GAME_PRESENTATION: Record<GameSlug, GamePresentation> = {
  matematik: {
    icon: Calculator,
    kicker: 'HESAPLA & FETHET',
    cta: 'Matematiğe başla',
  },
  turkce: {
    icon: BookOpenText,
    kicker: 'OKU & YORUMLA',
    cta: 'Türkçeye başla',
  },
  fen: {
    icon: FlaskConical,
    kicker: 'DENE & KEŞFET',
    cta: 'Fen turuna başla',
  },
  sosyal: {
    icon: Globe2,
    kicker: 'DÜNYAYI ÇÖZ',
    cta: 'Sosyal turuna başla',
  },
  wordquest: {
    icon: Languages,
    kicker: 'KELİME & İLETİŞİM',
    cta: 'İngilizceye başla',
  },
}

export function visibleExamTags(tags: string[], examType?: string | null): string[] {
  if (examType === 'lgs') return tags.filter((tag) => tag === 'LGS')
  if (examType === 'yks') return tags.filter((tag) => tag !== 'LGS')
  return tags
}

export function gameCardGridSpan(total: number, index: number): string {
  if (total === 4) return 'lg:col-span-3'
  if (total === 5 && index >= 3) return 'lg:col-span-3'
  return 'lg:col-span-2'
}

export function GameSelectGrid({ games, examType }: GameSelectGridProps) {
  return (
    <div data-testid="game-select-grid" className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-6 xl:gap-5">
      {games.map((game, index) => {
        const presentation = GAME_PRESENTATION[game.slug]
        const Icon = presentation.icon
        const examTags = visibleExamTags(game.examTags, examType)
        const visibleTopics = game.categories.slice(0, 3)
        const remainingTopicCount = game.categories.length - visibleTopics.length

        return (
          <Link
            key={game.slug}
            href={`/arena/${game.slug}`}
            aria-label={`${presentation.cta} — ${game.name} oyun konsolunu aç`}
            data-testid={`game-card-${game.slug}`}
            className={`group relative isolate flex min-h-[272px] flex-col overflow-hidden rounded-2xl border p-4 pl-5 transition duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] sm:min-h-[294px] md:p-5 md:pl-6 ${gameCardGridSpan(games.length, index)}`}
            style={{
              borderColor: `color-mix(in srgb, ${game.colorHex} 34%, var(--border))`,
              background: `radial-gradient(circle at 88% 6%, color-mix(in srgb, ${game.colorHex} 24%, transparent) 0%, transparent 36%), linear-gradient(145deg, color-mix(in srgb, ${game.colorHex} 21%, var(--card-bg)) 0%, var(--card-bg) 56%, color-mix(in srgb, ${game.colorHex} 9%, var(--card-bg)) 100%)`,
              boxShadow: `inset 0 1px 0 color-mix(in srgb, ${game.colorHex} 12%, white), 0 14px 36px color-mix(in srgb, ${game.colorHex} 8%, transparent)`,
            }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-2"
              style={{
                background: `linear-gradient(90deg, color-mix(in srgb, ${game.colorHex} 70%, black), ${game.colorHex}, color-mix(in srgb, ${game.colorHex} 58%, black))`,
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[7px] -z-10 rounded-[13px] border opacity-50"
              style={{ borderColor: `color-mix(in srgb, ${game.colorHex} 24%, transparent)` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 bottom-0 h-px opacity-90"
              style={{
                background: `linear-gradient(90deg, transparent, ${game.colorHex}, transparent)`,
                boxShadow: `0 -3px 14px ${game.colorHex}`,
              }}
            />
            <Icon
              aria-hidden="true"
              className="pointer-events-none absolute -right-5 top-7 -z-10 h-28 w-28 rotate-6 opacity-[0.06] transition duration-300 group-hover:rotate-0 group-hover:scale-105 group-hover:opacity-10"
              style={{ color: game.colorHex }}
              strokeWidth={1.25}
            />

            <div className="mb-4 flex items-start justify-between gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 sm:h-14 sm:w-14"
                style={{
                  borderColor: `color-mix(in srgb, ${game.colorHex} 38%, transparent)`,
                  background: `linear-gradient(145deg, color-mix(in srgb, ${game.colorHex} 25%, var(--card-bg)), color-mix(in srgb, ${game.colorHex} 10%, var(--card-bg)))`,
                  color: game.colorHex,
                  boxShadow: `inset 0 0 0 3px color-mix(in srgb, ${game.colorHex} 7%, var(--card-bg)), 0 8px 18px color-mix(in srgb, ${game.colorHex} 14%, transparent)`,
                }}
              >
                <Icon aria-hidden="true" className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.2} />
              </div>

              <div data-testid={`${game.slug}-exam-tags`} className="flex max-w-[66%] flex-wrap justify-end gap-1.5">
                {examTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-b-md rounded-t-sm border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] shadow-sm sm:text-[11px]"
                    style={{
                      borderColor: `color-mix(in srgb, ${game.colorHex} 34%, var(--border))`,
                      backgroundColor: `color-mix(in srgb, ${game.colorHex} 12%, var(--card-bg))`,
                      color: `color-mix(in srgb, ${game.colorHex} 76%, var(--text))`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div
              className="mb-1.5 text-[10px] font-black tracking-[0.16em] sm:text-[11px]"
              style={{ color: `color-mix(in srgb, ${game.colorHex} 78%, var(--text))` }}
            >
              {presentation.kicker}
            </div>
            <h2 className="font-display text-xl font-black leading-tight text-[var(--text)] sm:text-2xl">
              {game.name}
            </h2>
            <div
              className="mt-3 rounded-xl border p-2.5"
              style={{
                borderColor: `color-mix(in srgb, ${game.colorHex} 18%, var(--border))`,
                background: `linear-gradient(135deg, color-mix(in srgb, ${game.colorHex} 7%, var(--card-bg)), color-mix(in srgb, var(--card-bg) 88%, transparent))`,
              }}
            >
              <p className="line-clamp-2 text-xs leading-5 text-[var(--text-sub)] sm:text-[13px]">
                {game.description}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label={`${game.name} konuları`}>
                {visibleTopics.map((category) => (
                  <span
                    key={category}
                    className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card-bg)_76%,transparent)] px-2 py-1 text-[10px] font-semibold text-[var(--text-sub)] sm:text-[11px]"
                  >
                    {getCategoryLabel(category)}
                  </span>
                ))}
                {remainingTopicCount > 0 && (
                  <span
                    className="rounded-lg px-2 py-1 text-[10px] font-bold sm:text-[11px]"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${game.colorHex} 12%, var(--card-bg))`,
                      color: `color-mix(in srgb, ${game.colorHex} 74%, var(--text))`,
                    }}
                  >
                    +{remainingTopicCount} konu
                  </span>
                )}
              </div>
            </div>

            <div
              className="mt-auto flex min-h-11 items-center justify-between gap-3 border-t pt-4 text-sm font-extrabold text-[var(--text)]"
              style={{ borderColor: `color-mix(in srgb, ${game.colorHex} 22%, var(--border))` }}
            >
              <span>{presentation.cta}</span>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition duration-200 group-hover:translate-x-0.5"
                style={{
                  backgroundColor: game.colorHex,
                  color: '#ffffff',
                  boxShadow: `0 8px 20px color-mix(in srgb, ${game.colorHex} 30%, transparent)`,
                }}
              >
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
