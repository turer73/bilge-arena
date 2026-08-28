'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'

export function FriendRequestButton({ targetId }: { targetId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const send = async () => {
    if (state === 'sending' || state === 'sent') return
    setState('sending')
    setError('')

    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId: targetId }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setError(payload.error || 'Arkadaşlık isteği gönderilemedi')
        setState('error')
        return
      }
      setState('sent')
    } catch {
      setError('Bağlantı kurulamadı. Tekrar deneyebilirsin.')
      setState('error')
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={send}
        disabled={state === 'sending' || state === 'sent'}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--focus)] px-5 text-sm font-bold text-white disabled:opacity-65"
      >
        <UserPlus size={18} aria-hidden="true" />
        {state === 'sending' ? 'Gönderiliyor…' : state === 'sent' ? 'İstek gönderildi' : 'Arkadaş ekle'}
      </button>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-[var(--urgency)]">{error}</p>}
    </div>
  )
}
