/**
 * Bilge Arena Oda: <ShareCodeButton> kod paylas dropdown
 * Sprint 1 PR4b Task 6 + 2026-05-03 paylasim kanalları (WhatsApp, Email mailto, Native)
 *
 * 5 paylasim kanali:
 *   1. Clipboard (default action — code'a tıklayınca kopyala)
 *   2. WhatsApp (wa.me deep link, mesaj prefilled)
 *   3. Email mailto: (compose acar, konu+body prefilled)
 *   4. Telegram (t.me share)
 *   5. Native Share API (mobile — Instagram/SMS/system share sheet)
 *
 * Instagram için: public link share endpoint yok, sadece Native Share ile DM/story.
 * Desktop'ta Native Share desteklenmiyor → menu görünür.
 *
 * SSR-safe: navigator yok ise dropdown items disabled.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface ShareCodeButtonProps {
  code: string
  className?: string
}

export function ShareCodeButton({ code, className }: ShareCodeButtonProps) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Outside-click ile kapat
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Esc ile kapat
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // sessiz fail
    }
  }

  // Codex P2 PR #90 fix: hardcoded prod URL yerine NEXT_PUBLIC_SITE_URL env var.
  // Staging/preview deploy'larinda dogru host'a paylasilsin (https://staging.bilgearena.com gibi).
  // Env yoksa production fallback.
  const SITE_URL =
    (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').replace(/\/$/, '')

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Bilge Arena Oda Daveti',
          text: `Bilge Arena'da bana katıl! Oda kodu: ${code}`,
          url: `${SITE_URL}/oda/kod?code=${encodeURIComponent(code)}`,
        })
        setOpen(false)
      } catch {
        // kullanıcı iptal etti
      }
    }
  }

  const shareText = `Bilge Arena'da odama katıl! Kod: ${code}`
  const shareUrl = `${SITE_URL}/oda/kod?code=${encodeURIComponent(code)}`
  const encodedText = encodeURIComponent(shareText)
  const encodedUrl = encodeURIComponent(shareUrl)

  const links = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    email: `mailto:?subject=${encodeURIComponent('Bilge Arena oda daveti')}&body=${encodedText}%0A%0A${encodedUrl}`,
  }

  const hasNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div className="relative inline-block" ref={containerRef}>
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-medium',
          className,
        )}
      >
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Oda kodunu kopyala: ${code}`}
          className="flex items-center gap-2 rounded-l-lg px-3 py-2 transition-colors hover:bg-[var(--card)]"
        >
          <code className="font-mono">{code}</code>
          <span className="text-[var(--text-sub)]">
            {copied ? '✓ Kopyalandı' : 'Kopyala'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Diğer paylaşım seçenekleri"
          className="border-l border-[var(--border)] px-2.5 py-2 transition-colors hover:bg-[var(--card)]"
        >
          🔗
        </button>
      </div>

      {open && (
        <div
          role="menu"
          aria-label="Paylaşım seçenekleri"
          className="absolute right-0 top-full z-10 mt-1 flex flex-col gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg min-w-[160px]"
        >
          <a
            role="menuitem"
            href={links.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-code-whatsapp"
          >
            🟢 WhatsApp
          </a>
          <a
            role="menuitem"
            href={links.email}
            onClick={() => setOpen(false)}
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-code-email-mailto"
          >
            ✉️ Email
          </a>
          <a
            role="menuitem"
            href={links.telegram}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-code-telegram"
          >
            ✈️ Telegram
          </a>
          {hasNativeShare && (
            <button
              type="button"
              role="menuitem"
              onClick={handleNativeShare}
              className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
              data-testid="share-code-native"
            >
              📱 Diğer (Instagram, SMS…)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
