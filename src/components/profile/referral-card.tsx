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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Arkadas Davet Et</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Davet ettigin her arkadas icin ikimize de 100 XP!
      </p>

      {code && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 font-mono text-sm font-bold tracking-widest text-[var(--focus)]">
              {code}
            </div>
            <button
              onClick={copyCode}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--card)]"
            >
              Kopyala
            </button>
            {'share' in navigator && (
              <button
                onClick={shareCode}
                className="rounded-lg bg-[var(--focus)] px-3 py-2 text-xs font-medium text-white"
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
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <p className="mb-2 text-xs text-[var(--muted)]">Davet kodun var mi?</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            placeholder="XXXXXXXX"
            maxLength={8}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-sm uppercase tracking-widest outline-none focus:border-[var(--focus)]"
          />
          <button
            onClick={applyCode}
            disabled={applying || inputCode.length < 4}
            className="rounded-lg bg-[var(--reward)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {applying ? '...' : 'Uygula'}
          </button>
        </div>
      </div>
    </div>
  )
}
