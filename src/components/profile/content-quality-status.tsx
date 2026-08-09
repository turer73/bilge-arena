'use client'

import { useCallback, useEffect, useState } from 'react'

interface AppealStatusItem {
  status: 'submitted' | 'acknowledged' | 'investigating' | 'resolved' | 'rejected' | 'withdrawn'
  submittedAt: string
  acknowledgmentDueAt: string
  resolutionDueAt: string
  publicMessage: string | null
}
interface CorrectionItem { sessionDate: string; reason: string; scoreDelta: -1 | 1; correctedAt: string }
const statusLabel: Record<AppealStatusItem['status'], string> = {
  submitted: 'Gönderildi', acknowledged: 'Alındı', investigating: 'İnceleniyor', resolved: 'Çözüldü', rejected: 'Reddedildi', withdrawn: 'Geri çekildi',
}

export function ContentQualityStatus() {
  const pilotEnabled = process.env.NEXT_PUBLIC_CONTENT_APPEALS_ENABLED === 'true'
  const [available, setAvailable] = useState(true)
  const [appeals, setAppeals] = useState<AppealStatusItem[]>([])
  const [corrections, setCorrections] = useState<CorrectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!pilotEnabled) return
    setLoading(true); setError('')
    try {
      const [appealsResponse, correctionsResponse] = await Promise.all([
        fetch('/api/questions/appeals', { cache: 'no-store', signal }),
        fetch('/api/questions/corrections', { cache: 'no-store', signal }),
      ])
      if (appealsResponse.status === 503 || correctionsResponse.status === 503) { setAvailable(false); return }
      if (!appealsResponse.ok || !correctionsResponse.ok) throw new Error('Kalite bildirimleri alınamadı')
      const [appealData, correctionData] = await Promise.all([appealsResponse.json(), correctionsResponse.json()])
      setAppeals(appealData.appeals ?? []); setCorrections(correctionData.corrections ?? [])
    } catch (cause) {
      if ((cause as Error)?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Kalite bildirimleri alınamadı')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [pilotEnabled])

  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort() } }, [load])
  if (!pilotEnabled || !available) return null

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 animate-fadeUp" aria-labelledby="quality-status-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="quality-status-title" className="text-sm font-bold">Soru bildirimlerim</h2><p className="mt-1 text-xs text-[var(--text-sub)]">İtiraz incelemeleri ve kanıtlı sonuç düzeltmeleri. Cevap anahtarı veya inceleyen kişi bilgisi gösterilmez.</p></div>
        <button onClick={() => void load()} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-xs font-bold">Yenile</button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] p-3 text-xs text-[var(--urgency)]">{error}</p>}
      {loading ? <p className="mt-4 text-xs text-[var(--text-sub)]">Yükleniyor…</p> : <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><h3 className="text-xs font-bold">İtiraz durumu</h3><div className="mt-2 space-y-2">
          {appeals.map((appeal, index) => <article key={`${appeal.submittedAt}-${index}`} className="rounded-lg bg-[var(--surface)] p-3 text-xs"><p className="font-bold">{statusLabel[appeal.status]}</p><p className="mt-1 text-[var(--text-sub)]">Gönderim: {new Date(appeal.submittedAt).toLocaleString('tr-TR')} · çözüm hedefi: {new Date(appeal.resolutionDueAt).toLocaleDateString('tr-TR')}</p>{appeal.publicMessage && <p className="mt-2">{appeal.publicMessage}</p>}</article>)}
          {appeals.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-sub)]">Henüz bir soru itirazın yok.</p>}
        </div></div>
        <div><h3 className="text-xs font-bold">Sonuç düzeltmeleri</h3><div className="mt-2 space-y-2">
          {corrections.map((correction, index) => <article key={`${correction.correctedAt}-${index}`} className="rounded-lg bg-[var(--growth-bg)] p-3 text-xs"><p className="font-bold text-[var(--growth)]">Doğrulanmış soru hatası için sonuç görünümün güncellendi</p><p className="mt-1 text-[var(--text-sub)]">{new Date(correction.sessionDate).toLocaleDateString('tr-TR')} oturumu · skor etkisi {correction.scoreDelta > 0 ? '+' : ''}{correction.scoreDelta}</p><p className="mt-1 text-[10px] text-[var(--text-sub)]">XP, coin, rozet ve geçmiş ödüller değiştirilmedi.</p></article>)}
          {corrections.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-sub)]">Kayıtlı bir sonuç düzeltmen yok.</p>}
        </div></div>
      </div>}
    </section>
  )
}
