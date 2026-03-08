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
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Baslik */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-black">
          <span className="bg-gradient-to-r from-[var(--focus)] to-[var(--reward)] bg-clip-text text-transparent">
            Bilge Arena
          </span>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-sub)]">
          Bir oyun konsolu sec ve maceraya basla
        </p>
      </div>

      {/* Oyun konsollari */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAME_LIST.map((game) => (
          <Link
            key={game.slug}
            href={`/arena/${game.slug}`}
            className="group relative overflow-hidden rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--card-bg)] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--border)_50%,white)] hover:shadow-lg"
          >
            {/* Glow */}
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
              style={{ background: game.colorHex }}
            />

            {/* Emoji */}
            <div className="mb-3 text-4xl">
              {GAME_EMOJI[game.slug] || '📋'}
            </div>

            {/* Baslik */}
            <h2 className="mb-1 font-display text-lg font-bold" style={{ color: game.colorHex }}>
              {game.name}
            </h2>

            {/* Aciklama */}
            <p className="mb-4 text-xs text-[var(--text-sub)]">
              {game.description}
            </p>

            {/* Kategori badge'leri */}
            <div className="flex flex-wrap gap-1">
              {game.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
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
            <div className="absolute bottom-4 right-4 text-[var(--text-muted)] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[var(--text-sub)]">
              →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
