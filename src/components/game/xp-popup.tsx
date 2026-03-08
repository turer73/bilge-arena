'use client'

interface XPPopupProps {
  total: number
  hasBonus: boolean
  streak: number
}

export function XPPopup({ total, hasBonus, streak }: XPPopupProps) {
  return (
    <div className="pointer-events-none animate-xpFloat">
      <div className="flex flex-col items-end gap-0.5 font-display font-black text-[var(--reward)]"
        style={{
          fontSize: hasBonus ? 24 : 19,
          textShadow: '0 0 12px var(--reward)',
        }}
      >
        <span>+{total} XP</span>
        {hasBonus && (
          <span className="text-[11px] text-[var(--reward)]">
            🔥 x{streak} BONUS!
          </span>
        )}
      </div>
    </div>
  )
}
