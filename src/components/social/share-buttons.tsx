'use client'

import { trackEvent } from '@/lib/utils/plausible'

interface ShareButtonsProps {
  rank: string
  score: number
  total: number
  xp: number
  gameName?: string
}

export function ShareButtons({ rank, score, total, xp, gameName }: ShareButtonsProps) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const text = gameName
    ? `Bilge Arena'da ${gameName} oyununda ${rank} rank aldım! ${score}/${total} doğru (%${pct}) - ${xp} XP kazandım! 🏆`
    : `Bilge Arena'da ${rank} rank aldım! ${score}/${total} doğru (%${pct}) - ${xp} XP kazandım! 🏆`

  const url = 'https://bilgearena.com'
  const encodedText = encodeURIComponent(text)
  const encodedUrl = encodeURIComponent(url)

  const shareWhatsApp = () => {
    trackEvent('ShareClick', { props: { platform: 'whatsapp', rank, pct } })
    window.open(`https://wa.me/?text=${encodedText}%20${encodedUrl}`, '_blank')
  }

  const shareTwitter = () => {
    trackEvent('ShareClick', { props: { platform: 'twitter', rank, pct } })
    window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank')
  }

  const shareFacebook = () => {
    trackEvent('ShareClick', { props: { platform: 'facebook', rank, pct } })
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`, '_blank')
  }

  const shareNative = async () => {
    trackEvent('ShareClick', { props: { platform: 'native', rank, pct } })
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Bilge Arena Sonuc', text, url })
      } catch {
        // Kullanici iptal etti
      }
    } else {
      // Fallback: panoya kopyala (Clipboard API izin gerektirebilir)
      try {
        await navigator.clipboard.writeText(`${text} ${url}`)
        alert('Sonuc panoya kopyalandi!')
      } catch {
        alert('Panoya kopyalanamadi. Lutfen manuel kopyalayin.')
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold tracking-wider text-[var(--text-sub)]">PAYLAS</span>

      {/* WhatsApp */}
      <button
        onClick={shareWhatsApp}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-lg transition-all hover:scale-110 hover:border-[#25D366] hover:bg-[#25D366]/10"
        aria-label="WhatsApp'ta paylas"
        title="WhatsApp"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </button>

      {/* Twitter / X */}
      <button
        onClick={shareTwitter}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-lg transition-all hover:scale-110 hover:border-[var(--focus)] hover:bg-[var(--focus-bg)]"
        aria-label="X'te paylas"
        title="X (Twitter)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--text)]">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      </button>

      {/* Facebook */}
      <button
        onClick={shareFacebook}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-lg transition-all hover:scale-110 hover:border-[#1877F2] hover:bg-[#1877F2]/10"
        aria-label="Facebook'ta paylas"
        title="Facebook"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      </button>

      {/* Genel paylas / Kopyala */}
      <button
        onClick={shareNative}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card-bg)] text-lg transition-all hover:scale-110 hover:border-[var(--reward)] hover:bg-[var(--reward-bg)]"
        aria-label="Paylas"
        title="Diger / Kopyala"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text)]">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>
    </div>
  )
}
