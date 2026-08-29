'use client'

import { useEffect, useState } from 'react'

interface Mission {
  missionId: string
  questionId: string
  revisionId: string
  expiresAt: string
  examRef: string | null
  subject: string
  topic: string | null
  content: { question?: string; sentence?: string; passage?: string; options?: string[] }
}

const REASONS = [
  ['wrong_key', 'Cevap anahtarı'], ['ambiguous', 'Belirsiz ifade'],
  ['invalid_content', 'Eksik / hatalı içerik'], ['outcome_mismatch', 'Kazanım uyumsuzluğu'], ['other', 'Diğer'],
] as const

export default function QualityMissionsClient() {
  const [mission, setMission] = useState<Mission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [locking, setLocking] = useState(false)
  const [verdict, setVerdict] = useState<'clean' | 'flawed' | null>(null)
  const [reason, setReason] = useState('wrong_key')
  const [proposed, setProposed] = useState<number | null>(null)
  const [correction, setCorrection] = useState('')
  const [explanation, setExplanation] = useState('')
  const [confidence, setConfidence] = useState(70)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/questions/quality-missions', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { mission?: Mission | null; error?: string }
        if (!response.ok) throw new Error(body.error ?? 'Görev alınamadı')
        if (!controller.signal.aborted) setMission(body.mission ?? null)
      })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Görev alınamadı') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function lockAnswer() {
    if (!mission || selected == null || locked || locking) return
    setLocking(true); setError(null)
    try {
      const response = await fetch('/api/questions/quality-missions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: mission.missionId,
          selectedAnswerIndex: selected,
          requestId: crypto.randomUUID(),
        }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Çözüm seçeneği kilitlenemedi')
      setLocked(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Çözüm seçeneği kilitlenemedi') }
    finally { setLocking(false) }
  }

  async function submit() {
    if (!mission || selected == null || !locked || !verdict || busy) return
    if (verdict === 'flawed' && explanation.trim().length < 20) {
      setError('Hata gerekçesi en az 20 karakter olmalı.')
      return
    }
    if (verdict === 'flawed' && proposed == null && !correction.trim()) {
      setError('Önerilen doğru seçeneği veya düzeltme metnini eklemelisin.')
      return
    }
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/questions/quality-missions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: mission.missionId, selectedAnswerIndex: selected, verdict,
          reasonCode: verdict === 'flawed' ? reason : null,
          proposedAnswerIndex: verdict === 'flawed' ? proposed : null,
          correctionText: verdict === 'flawed' ? correction.trim() || null : null,
          explanation: verdict === 'flawed' ? explanation.trim() : '', confidence,
          requestId: crypto.randomUUID(),
        }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Değerlendirme gönderilemedi')
      setSubmitted(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Değerlendirme gönderilemedi') }
    finally { setBusy(false) }
  }

  const options = Array.isArray(mission?.content.options) ? mission.content.options : []
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 text-[var(--text)]">
      <h1 className="text-2xl font-black">Kalite Görevi</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
        Soruyu önce bağımsız çöz. Başka kullanıcıların, modellerin ve seçenek istatistiklerinin sonuçları gösterilmez.
      </p>
      {loading && <p role="status" className="mt-8">Görev hazırlanıyor…</p>}
      {!loading && !mission && !error && <p className="mt-8 rounded-2xl border border-[var(--border)] p-5">Şu anda bekleyen görev yok.</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
      {mission && !submitted && (
        <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-lg">
          <div className="text-xs font-bold text-[var(--text-sub)]">{mission.examRef ?? 'SINAV'} · {mission.subject}{mission.topic ? ` · ${mission.topic}` : ''}</div>
          {mission.content.passage && <p className="mt-4 rounded-xl bg-[var(--surface)] p-3 text-sm leading-6">{mission.content.passage}</p>}
          <h2 className="mt-4 text-base font-bold leading-7">{mission.content.question ?? mission.content.sentence}</h2>
          <div className="mt-4 grid gap-2">
            {options.map((option, index) => (
              <button key={index} type="button" disabled={locked} onClick={() => setSelected(index)}
                className={`min-h-12 rounded-xl border px-4 text-left text-sm ${selected === index ? 'border-[var(--focus)] bg-[var(--focus-bg)]' : 'border-[var(--border)]'}`}>
                <strong>{String.fromCharCode(65 + index)}.</strong> {option}
              </button>
            ))}
          </div>
          {!locked ? (
            <button type="button" disabled={selected == null || locking} onClick={lockAnswer}
              className="mt-5 min-h-11 w-full rounded-xl bg-[var(--focus)] px-4 font-bold text-white disabled:opacity-40">
              {locking ? 'Kilitleniyor…' : 'Çözümümü kilitle'}
            </button>
          ) : (
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <fieldset>
                <legend className="text-sm font-bold">Sorunun kendisi akademik olarak sağlam mı?</legend>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setVerdict('clean')} className={`min-h-11 rounded-xl border ${verdict === 'clean' ? 'border-[var(--growth)] bg-[var(--growth-bg)]' : 'border-[var(--border)]'}`}>Sağlam</button>
                  <button type="button" onClick={() => setVerdict('flawed')} className={`min-h-11 rounded-xl border ${verdict === 'flawed' ? 'border-[var(--urgency)] bg-red-500/10' : 'border-[var(--border)]'}`}>Hatalı</button>
                </div>
              </fieldset>
              {verdict === 'flawed' && (
                <div className="mt-4 grid gap-3">
                  <label className="text-xs font-bold">Hata türü<select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-normal">{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="text-xs font-bold">Önerilen seçenek<select value={proposed ?? ''} onChange={(event) => setProposed(event.target.value === '' ? null : Number(event.target.value))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-normal"><option value="">Seçiniz</option>{options.map((_, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)}</option>)}</select></label>
                  <label className="text-xs font-bold">Düzeltme metni<input value={correction} onChange={(event) => setCorrection(event.target.value)} maxLength={1000} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-normal" /></label>
                  <label className="text-xs font-bold">Gerekçe<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={2000} rows={4} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-normal" /></label>
                </div>
              )}
              {verdict && <label className="mt-4 block text-xs font-bold">Güven: {confidence}/100<input type="range" min={0} max={100} value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="mt-2 w-full accent-[var(--focus)]" /></label>}
              <button type="button" onClick={submit} disabled={selected == null || !locked || !verdict || busy} className="mt-5 min-h-11 w-full rounded-xl bg-[var(--reward)] px-4 font-bold text-white disabled:opacity-40">{busy ? 'Gönderiliyor…' : 'Bağımsız değerlendirmeyi gönder'}</button>
            </div>
          )}
        </section>
      )}
      {submitted && <section role="status" className="mt-6 rounded-2xl border border-[var(--growth)] bg-[var(--growth-bg)] p-5"><h2 className="font-bold">Kanıtın kaydedildi</h2><p className="mt-2 text-sm leading-6">Gönderim tek başına ödül üretmez. Hata bağımsız kanıtlarla kesinleşirse uygun katkılar idempotent olarak ödüllendirilir.</p></section>}
    </main>
  )
}
