'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock3, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react'
import type { InstitutionSupportAccess } from '@/lib/institution-pilot/support-contract'
import { TR_TIME_ZONE } from '@/lib/utils/tr-date'

function formatExpiry(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TR_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function SupportAccessPanel() {
  const [state, setState] = useState<InstitutionSupportAccess | null>(null)
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [reason, setReason] = useState('Kurulum ve teknik kontrol için geçici destek erişimi.')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/institution/support-access', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Destek erişimi alınamadı')
      setState(data)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Destek erişimi alınamadı')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function update(method: 'POST' | 'DELETE') {
    setSaving(true)
    setError(null)
    try {
      const body = method === 'POST'
        ? { durationMinutes, reason, requestId: crypto.randomUUID() }
        : { requestId: crypto.randomUUID() }
      const response = await fetch('/api/institution/support-access', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Destek erişimi güncellenemedi')
      setState(data)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Destek erişimi güncellenemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4 sm:p-5" aria-labelledby="support-access-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {state?.active ? <ShieldCheck className="h-5 w-5 text-emerald-300" /> : <ShieldOff className="h-5 w-5 text-sky-300" />}
            <h2 id="support-access-title" className="text-base font-black">Bilge Arena destek erişimi</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-sub)]">
            Varsayılan olarak kapalıdır. Açtığınızda platform yöneticisi yalnız destek ve inceleme amacıyla, salt-okunur ve süreli erişim alır. İstediğiniz anda kapatabilirsiniz.
          </p>
        </div>
        {loading && <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-sub)]" aria-label="Yükleniyor" />}
      </div>

      {state?.active ? (
        <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3">
          <div className="flex items-center gap-2 text-sm font-black text-emerald-200">
            <Clock3 className="h-4 w-4" /> Erişim {formatExpiry(state.expiresAt)} tarihine kadar açık
          </div>
          <p className="mt-2 break-words text-xs leading-5 text-[var(--text-sub)]">Gerekçe: {state.reason}</p>
          <button type="button" disabled={saving} onClick={() => void update('DELETE')} className="mt-3 min-h-11 w-full rounded-xl border border-red-400/30 bg-red-400/10 px-4 text-sm font-bold text-red-200 disabled:opacity-50 sm:w-auto">
            {saving ? 'Kapatılıyor…' : 'Erişimi hemen kapat'}
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-end">
          <label className="text-xs font-bold text-[var(--text-sub)]">
            Süre
            <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[var(--surface)] px-3 text-sm text-[var(--text)]">
              <option value={15}>15 dakika</option>
              <option value={60}>1 saat</option>
              <option value={1440}>24 saat</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-bold text-[var(--text-sub)]">
            Gerekçe
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[var(--surface)] px-3 text-sm text-[var(--text)]" />
          </label>
          <button type="button" disabled={saving || loading || reason.trim().length < 10} onClick={() => void update('POST')} className="min-h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-black text-white disabled:opacity-50">
            {saving ? 'Açılıyor…' : 'Süreli erişim aç'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-300">{error}</p>}
    </section>
  )
}
