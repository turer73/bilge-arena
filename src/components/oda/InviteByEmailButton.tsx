'use client'

/**
 * Bilge Arena Oda: <InviteByEmailButton> host email davet
 * 2026-05-03 oda invite email flow
 *
 * Native <dialog> ile modal — kullanici email girer, submit POST
 * /api/rooms/[id]/invite. Backend Resend ile mail yollar.
 *
 * Sadece host gorur (parent HostActions component'inde isHost guard var).
 * Loading state, success/error feedback.
 */

import { useRef, useState } from 'react'

interface InviteByEmailButtonProps {
  roomId: string
  disabled?: boolean
}

export function InviteByEmailButton({ roomId, disabled }: InviteByEmailButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({ type: 'success', msg: 'Davet gönderildi ✓' })
        setEmail('')
        setTimeout(() => {
          dialogRef.current?.close()
          setFeedback(null)
        }, 1500)
      } else {
        setFeedback({ type: 'error', msg: data.error || 'Davet gönderilemedi' })
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Ağ hatası, tekrar dene' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        disabled={disabled}
        className="rounded-lg border border-[var(--focus)]/30 bg-[var(--focus-bg)] px-4 py-2 text-sm font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus)]/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ✉️ Email Davet
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Email ile odaya davet"
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 backdrop:bg-black/40 min-w-[320px]"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <h3 className="text-sm font-bold">Email ile Davet Et</h3>
          <p className="text-xs text-[var(--text-sub)]">
            Davet etmek istediğin kişinin email adresini gir. Oda kodunu içeren mail gönderilecek.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@email.com"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
            aria-label="Email adresi"
          />
          {feedback && (
            <p
              role="alert"
              className={
                feedback.type === 'success'
                  ? 'rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300'
                  : 'rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300'
              }
            >
              {feedback.msg}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                dialogRef.current?.close()
                setFeedback(null)
                setEmail('')
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={loading || !email}
              className="rounded-lg bg-[var(--focus)] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Gönderiliyor…' : 'Davet Gönder'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
