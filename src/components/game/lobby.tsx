'use client'

import { GAMES, type GameSlug } from '@/lib/constants/games'
import { MODES, type QuizMode, DENEME_CONFIGS } from '@/lib/constants/modes'
import { ModeSelector } from './mode-selector'
import { StreakBadge } from './streak-badge'
import { XPBar } from './xp-bar'
import { getLevelFromXP, getLevelProgress } from '@/lib/constants/levels'

interface LobbyProps {
  game: GameSlug
  selectedMode: string
  onSelectMode: (mode: QuizMode) => void
  onStart: () => void
  userXP?: number
  userStreak?: number
}

export function Lobby({
  game,
  selectedMode,
  onSelectMode,
  onStart,
  userXP = 0,
  userStreak = 0,
}: LobbyProps) {
  const gameDef = GAMES[game]
  const level = getLevelFromXP(userXP)
  const mode = MODES.find(m => m.id === selectedMode) || MODES[0]

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4 animate-scaleIn md:max-w-lg md:gap-4 md:p-6 xl:max-w-xl xl:gap-5 xl:p-8 2xl:max-w-2xl">
      {/* Baslik */}
      <div className="text-center">
        <h1 className="font-display text-2xl font-black md:text-3xl xl:text-4xl 2xl:text-5xl" style={{ color: gameDef.colorHex }}>
          {gameDef.name}
        </h1>
        <p className="mt-1 text-xs text-[var(--text-sub)] md:text-sm xl:text-base">{gameDef.description}</p>
      </div>

      {/* Kullanici bilgi */}
      <div className="animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3 md:rounded-2xl md:p-4 xl:p-5 2xl:p-6" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        <div className="mb-3 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] text-lg md:h-[46px] md:w-[46px] md:text-[22px] xl:h-14 xl:w-14 xl:text-2xl"
            style={{
              background: `linear-gradient(135deg, ${gameDef.colorHex}44, ${gameDef.colorHex})`,
              borderColor: `${gameDef.colorHex}55`,
            }}
          >
            {level.badge}
          </div>
          <div>
            <div className="text-xs font-bold md:text-sm xl:text-base">{level.name}</div>
            <div className="text-[9px] text-[var(--text-sub)] md:text-[10px] xl:text-xs">{userXP.toLocaleString()} XP</div>
          </div>
          <div className="flex-1" />
          <StreakBadge streak={userStreak} />
        </div>
        <XPBar
          xp={userXP - level.minXP}
          level={level.level}
          max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
        />
      </div>

      {/* Mod secimi */}
      <div className="animate-fadeUp" style={{ animationDelay: '0.35s', animationFillMode: 'both' }}>
        <h2 className="mb-2 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          OYUN MODU
        </h2>
        <ModeSelector selectedMode={selectedMode} onSelect={onSelectMode} />
      </div>

      {/* Deneme sinavi detaylari */}
      {mode.isDeneme && DENEME_CONFIGS[game] && (
        <div className="animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ animationDelay: '0.45s', animationFillMode: 'both' }}>
          <div className="mb-2 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            DENEME SINAVI FORMATI
          </div>
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--text)]">
            <span>Toplam Sure:</span>
            <span className="font-bold" style={{ color: gameDef.colorHex }}>
              {Math.floor(DENEME_CONFIGS[game].totalTime / 60)} dakika
            </span>
          </div>
          <div className="space-y-1">
            {Object.entries(DENEME_CONFIGS[game].questionDistribution).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-sub)]">
                  {cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}
                </span>
                <span className="font-bold text-[var(--text)]">{count} soru</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-sub)]">
            TYT formatinda — Net: Dogru - (Yanlis / 4)
          </div>
        </div>
      )}

      {/* Basla butonu */}
      <button
        onClick={onStart}
        className="btn-primary mt-2 w-full rounded-[10px] py-2.5 font-display text-xs font-bold tracking-wider shadow-lg transition-transform hover:scale-[1.02] animate-fadeUp md:py-3 md:text-sm xl:py-3.5 xl:text-base xl:rounded-xl"
        style={{ animationDelay: '0.55s', animationFillMode: 'both' }}
      >
        {mode.isDeneme ? '📋' : '⚔️'} {mode.name} Baslat — {mode.questionCount} Soru
      </button>
    </div>
  )
}
