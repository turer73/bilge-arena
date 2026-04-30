/**
 * Bilge Arena Oda: <ShareCodeButton> kod paylas butonu
 * Sprint 1 PR4b Task 6
 *
 * Client component. clipboard.writeText + 2sn "Kopyalandi" toast.
 * SSR-safe: navigator yok ise clipboard fallback degil, button disabled.
 */

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface ShareCodeButtonProps {
  code: string
  className?: string
}

export function ShareCodeButton({ code, className }: ShareCodeButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard izni reddedildi, sessiz fail
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Oda kodunu kopyala: ${code}`}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--card)]',
        className,
      )}
    >
      <code className="font-mono">{code}</code>
      <span className="text-[var(--text-sub)]">
        {copied ? '✓ Kopyalandi' : 'Kopyala'}
      </span>
    </button>
  )
}
