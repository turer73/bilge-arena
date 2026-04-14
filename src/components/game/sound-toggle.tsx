'use client'

import { useState } from 'react'
import { toggleSound, getSoundEnabled, playSound } from '@/lib/utils/sounds'

interface SoundToggleProps {
  size?: 'sm' | 'md'
}

/**
 * Ses açma/kapama butonu.
 * localStorage'dan durumu okur, tıklanınca toggle eder.
 */
export function SoundToggle({ size = 'sm' }: SoundToggleProps) {
  const [enabled, setEnabled] = useState(() =>
    typeof window === 'undefined' ? true : getSoundEnabled()
  )

  const handleToggle = () => {
    const next = toggleSound()
    setEnabled(next)
    if (next) playSound('click')
  }

  const iconSize = size === 'md' ? 'text-base' : 'text-sm'
  const padding = size === 'md' ? 'p-2' : 'p-1.5'

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`${padding} rounded-lg transition-all hover:bg-[var(--surface)] active:scale-90`}
      title={enabled ? 'Sesi kapat' : 'Sesi aç'}
      aria-label={enabled ? 'Sesi kapat' : 'Sesi aç'}
    >
      <span className={iconSize}>
        {enabled ? '🔊' : '🔇'}
      </span>
    </button>
  )
}
