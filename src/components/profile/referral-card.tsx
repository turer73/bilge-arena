'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

/**
 * Referral (davet) karti. Profil sayfasinda gosterilir.
 * Kullanicinin davet kodunu gosterir ve paylasim/kopyalama saglar.
 */
export function ReferralCard() {
  const { user } = useAuthStore()
  const [code, setCode] = useState<string | null>(null)
  const [totalReferred, setTotalReferred] = useState(0)
  const [inputCode, setInputCode] = useState('')
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!user) return
    fetch('/api/referral')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCode(data.code)
          setTotalReferred(data.totalReferred)
        }
      })
      .catch(() => {})
  }, [user])

  const copyCode = () => {
    if (!code) return
    navigator.clipboard.writeText(code).then(() => {
      toast.success('Davet kodu kopyalandi!')
    })
  }

  const shareCode = () => {
    if (!code || !navigator.share) return
    navigator.share({
      title: 'Bilge Arena Davet',
      text: `Bilge Arena'ya katil, birlikte ogrenelim! Davet kodum: ${code}`,
      url: `${window.location.origin}/giris?ref=${code}`,
    }).catch(() => {})
  }

  const applyCode = async () => {
    if (!inputCode.trim()) return
    setApplying(true)
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inputCode.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Davet kodu uygulandi! +${data.xpAwarded} XP`)
        setInputCode('')
      } else {
        toast.error(data.error || 'Kod uygulanamadi')
      }
    } catch {
      toast.error('Bir hata olustu')
    }
    setApplying(false)
  }

  if (!user) return null

  return (
    <div className="rounded-2xl border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-shadow-accent)]">
      <h3 className="text-sm font-black text-[var(--app-text)]">🤝 Arkadaş Davet Et</h3>
      <p className="mt-1 text-xs font-medium text-[var(--app-text-sub)]">
        Davet ettiğin her arkadaş için ikimize de 100 XP!
      </p>

      {code && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-xl bg-[var(--app-accent-tint)] px-3 py-2 font-mono text-sm font-bold tracking-widest text-[var(--app-accent-text)]">
              {code}
            </div>
            <button
              onClick={copyCode}
              className="rounded-xl border-2 border-[var(--app-disabled)] bg-[var(--app-card)] px-3 py-2 text-xs font-black"
            >
              Kopyala
            </button>
            {'share' in navigator && (
              <button
                onClick={shareCode}
                className="rounded-xl border-2 border-[var(--app-accent-strong)] bg-[var(--app-accent)] px-3 py-2 text-xs font-black text-white"
              >
                Paylas
              </button>
            )}
          </div>
          {totalReferred > 0 && (
            <p className="mt-2 text-xs text-[var(--growth)]">
              {totalReferred} kisi davet ettin! +{totalReferred * 100} XP kazandin
            </p>
          )}
        </div>
      )}

      {/* Baskasinin kodunu girme */}
      <div className="mt-4 border-t-2 border-[var(--app-border)] pt-3">
        <p className="mb-2 text-xs font-semibold text-[var(--app-text-sub)]">Davet kodun var mı?</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            placeholder="XXXXXXXX"
            maxLength={8}
            className="min-w-0 flex-1 rounded-xl border-2 border-[var(--app-disabled)] bg-[var(--app-hover)] px-3 py-2 font-mono text-sm uppercase tracking-widest outline-none focus:border-[var(--app-accent)]"
          />
          <button
            onClick={applyCode}
            disabled={applying || inputCode.length < 4}
            className="rounded-xl border-2 border-[var(--app-warn-strong)] bg-[var(--app-warn)] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {applying ? '...' : 'Uygula'}
          </button>
        </div>
      </div>
    </div>
  )
}
