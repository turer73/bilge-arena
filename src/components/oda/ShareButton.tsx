'use client'

/**
 * Bilge Arena Oda: <ShareButton> sosyal paylaşım butonu
 * Sprint 2C Task 8 (Replay & Share) + Codex review fix
 *
 * 4 paylaşım kanalı:
 *   - Clipboard (modern Navigator.clipboard.writeText)
 *   - WhatsApp (wa.me/?text= deep link)
 *   - Telegram (t.me/share/url?url=&text=)
 *   - X / Twitter (twitter.com/intent/tweet — X documented web-intent
 *     endpoint; x.com/intent/post documented DEGIL ve prefilled composer
 *     calismayabilir — Codex P2 PR #65 follow-up fix)
 *
 * Native Web Share API fallback (mobile cihazlarda sistem paylaşım sheet'i).
 *
 * Beklenen etki: viral K-faktor 0.05 -> 0.15 (Sprint 2 plan Task 8).
 *
 * Codex fix paterni:
 *   - aria-haspopup, aria-expanded, role=menu (a11y)
 *   - Esc tuşu ile menü kapanır
 *   - Outside-click ile kapanma (useRef + document listener)
 *   - Item click sonrası menu kapanır (clipboard "Kopyalandı" feedback ile)
 *   - Clipboard fail için error state (sessiz fail değil)
 *   - navigator.share native cast kaldırıldı (lib.dom.d.ts'te zaten var)
 */

import { useEffect, useRef, useState } from 'react'

interface ShareButtonProps {
  /** Paylaşılan oda URL (kanonik) */
  url: string
  /** Paylaşım metni — title + skor + kategori */
  text: string
}

export function ShareButton({ url, text }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Outside-click ile menüyü kapat
  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Esc tuşu ile menüyü kapat
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setError(null)
      setTimeout(() => {
        setCopied(false)
        setOpen(false)
      }, 1500)
    } catch {
      // Clipboard izni yoksa kullanıcıya feedback ver (Codex fix #3)
      setError('Kopyalanamadı — tarayıcı izni gerekli')
      setCopied(false)
    }
  }

  const handleNativeShare = async () => {
    // Native Web Share API tarayıcı tarafindan destekleniyor mu (Codex fix #8)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Bilge Arena', text, url })
        return
      } catch {
        // Kullanıcı iptal etti — menüye düş (Codex fix #2 native iptal sonrasi menu)
        setOpen(true)
        return
      }
    }
    setOpen((v) => !v)
  }

  const handleItemClick = () => {
    // Item click sonrasi menu kapanir (Codex fix #2)
    setOpen(false)
  }

  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    // Codex P2 PR #65 follow-up: twitter.com/intent/tweet X'in documented
    // web-intent endpoint'i. x.com/intent/post documented DEGIL — prefilled
    // composer calismaz. X domain'e gectikten sonra legacy intent URL'leri
    // hala twitter.com altinda yasiyor.
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
  }

  return (
    <div className="relative inline-block" data-testid="share-button" ref={containerRef}>
      <button
        type="button"
        onClick={handleNativeShare}
        aria-haspopup="menu"
        aria-expanded={open}
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
          {error && (
            <p
              role="alert"
              className="px-3 py-1 text-[11px] text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          )}
          <a
            role="menuitem"
            href={shareLinks.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleItemClick}
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
            onClick={handleItemClick}
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
            onClick={handleItemClick}
            className="rounded px-3 py-2 text-left text-sm hover:bg-[var(--surface)]"
            data-testid="share-twitter"
          >
            🐦 X
          </a>
        </div>
      )}
    </div>
  )
}
