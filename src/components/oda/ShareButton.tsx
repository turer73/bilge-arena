'use client'

/**
 * Bilge Arena Oda: <ShareButton> sosyal paylaşım butonu
 * Sprint 2C Task 8 (Replay & Share)
 *
 * 4 paylaşım kanalı:
 *   - Clipboard (modern Navigator.clipboard.writeText)
 *   - WhatsApp (wa.me/?text= deep link)
 *   - Telegram (t.me/share/url?url=&text=)
 *   - X / Twitter (twitter.com/intent/tweet?text=&url=)
 *
 * Native Web Share API fallback (mobile cihazlarda sistem paylaşım sheet'i).
 *
 * Beklenen etki: viral K-faktor 0.05 -> 0.15 (Sprint 2 plan Task 8).
 */

import { useState } from 'react'

interface ShareButtonProps {
  /** Paylaşılan oda URL (kanonik) */
  url: string
  /** Paylaşım metni — title + skor + kategori */
  text: string
}

export function ShareButton({ url, text }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard izni yoksa fallback yok, sessiz fail
    }
  }

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: 'Bilge Arena',
          text,
          url,
        })
      } catch {
        // Kullanici iptal etti, sessiz
      }
    } else {
      setOpen(!open)
    }
  }

  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
  }

  return (
    <div className="relative inline-block" data-testid="share-button">
      <button
        type="button"
        onClick={handleNativeShare}
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--card)]"
      >
        🔗 Paylaş
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Paylaşım seçenekleri"
          className="absolute right-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-clipboard"
          >
            {copied ? '✓ Kopyalandı' : '📋 Kopyala'}
          </button>
          <a
            role="menuitem"
            href={shareLinks.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-whatsapp"
          >
            🟢 WhatsApp
          </a>
          <a
            role="menuitem"
            href={shareLinks.telegram}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-telegram"
          >
            ✈️ Telegram
          </a>
          <a
            role="menuitem"
            href={shareLinks.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-twitter"
          >
            🐦 X / Twitter
          </a>
        </div>
      )}
    </div>
  )
}
