'use client'

import Link from 'next/link'
import { GAME_LIST } from '@/lib/constants/games'

const GAME_EMOJI: Record<string, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

export default function ArenaPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8 xl:max-w-5xl xl:px-6 2xl:max-w-6xl 2xl:py-10">
      {/* Baslik */}
      <div className="mb-6 text-center md:mb-8 xl:mb-10">
        <h1 className="font-display text-2xl font-black md:text-3xl xl:text-4xl 2xl:text-5xl">
          <span className="bg-gradient-to-r from-[var(--focus)] to-[var(--reward)] bg-clip-text text-transparent">
            Bilge Arena
          </span>
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-sub)] md:mt-2 md:text-sm xl:text-base">
          Bir oyun konsolu sec ve maceraya basla
        </p>
      </div>

      {/* Oyun konsollari */}
      <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:gap-5 2xl:gap-6">
        {GAME_LIST.map((game) => (
          <Link
            key={game.slug}
            href={`/arena/${game.slug}`}
            className="group relative overflow-hidden rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--card-bg)] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--border)_50%,white)] hover:shadow-lg md:rounded-2xl md:p-6 xl:p-7 2xl:p-8"
          >
            {/* Glow */}
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20 xl:h-40 xl:w-40"
              style={{ background: game.colorHex }}
            />

            {/* Emoji */}
            <div className="mb-2 text-3xl md:mb-3 md:text-4xl xl:text-5xl 2xl:text-6xl">
              {GAME_EMOJI[game.slug] || '📋'}
            </div>

            {/* Baslik */}
            <h2 className="mb-1 font-display text-base font-bold md:text-lg xl:text-xl 2xl:text-2xl" style={{ color: game.colorHex }}>
              {game.name}
            </h2>

            {/* Aciklama */}
            <p className="mb-3 text-[11px] text-[var(--text-sub)] md:mb-4 md:text-xs xl:text-sm">
              {game.description}
            </p>

            {/* Kategori badge'leri */}
            <div className="flex flex-wrap gap-1 xl:gap-1.5">
              {game.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full px-2 py-0.5 text-[9px] font-medium md:text-[10px] xl:px-2.5 xl:text-xs"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${game.colorHex} 10%, transparent)`,
                    color: game.colorHex,
                  }}
                >
                  {cat}
                </span>
              ))}
            </div>

            {/* Ok */}
            <div className="absolute bottom-3 right-3 text-[var(--text-muted)] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[var(--text-sub)] md:bottom-4 md:right-4 xl:text-lg">
              →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
