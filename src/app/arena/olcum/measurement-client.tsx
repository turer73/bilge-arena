'use client'

import { useEffect, useRef, useState } from 'react'
import { DocumentBoundaryLink } from '@/components/privacy/document-boundary-link'
import { useAuthStore } from '@/stores/auth-store'
import { renderRichText } from '@/lib/utils/rich-text'
import { MEASUREMENT_NOTICE, RENDER_VERSION, measurementContextSchema, measurementSessionSchema,
  type MeasurementContext, type MeasurementRequest, type MeasurementSession } from '@/lib/measurement/contracts'

const btn = 'min-h-12 rounded-xl bg-[var(--app-accent)] px-4 py-3 font-bold text-white disabled:opacity-50'
const names = { matematik: 'Matematik', turkce: 'Türkçe', fen: 'Fen Bilimleri', sosyal: 'Sosyal Bilimler' }
export default function MeasurementClient() {
  const { user, loading } = useAuthStore()
  return <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 pb-32 text-[var(--app-text)]">
    <DocumentBoundaryLink href="/arena" className="inline-flex min-h-11 items-center">Çalışmaya dön</DocumentBoundaryLink>
    <h1 className="text-2xl font-bold">Gönüllü ölçüm turu</h1>
    <p className="leading-7">{MEASUREMENT_NOTICE}</p>
    {loading ? <p role="status">Yükleniyor…</p> : !user
      ? <DocumentBoundaryLink href="/giris?next=%2Farena%2Folcum">Giriş yap</DocumentBoundaryLink>
      : <MeasurementSessionView key={user.id} />}
  </main>
}
export function MeasurementSessionView() {
  const [context, setContext] = useState<MeasurementContext | null>(null)
  const [session, setSession] = useState<MeasurementSession | null>(null)
  const [form, setForm] = useState('')
  const [consent, setConsent] = useState(false)
  const [choice, setChoice] = useState<number | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [assistance, setAssistance] = useState(false)
  const [renderProblem, setRenderProblem] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retryLocked, setRetryLocked] = useState(false)
  const lifecycle = useRef<AbortController | null>(null)
  const flight = useRef(false)
  const pending = useRef<MeasurementRequest | null>(null)
  const interrupted = useRef(false)
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller
    const hidden = () => { if (document.hidden) interrupted.current = true }
    document.addEventListener('visibilitychange', hidden)
    void fetch('/api/study/measurement', { cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return measurementContextSchema.parse(await r.json()) })
      .then(c => { if (!controller.signal.aborted) { setContext(c); setSession(c.session) } })
      .catch(() => { if (!controller.signal.aborted) setError('Tur yüklenemedi. Sayfayı yenileyerek tekrar deneyebilirsin.') })
    return () => { controller.abort(); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  async function send(body: MeasurementRequest) {
    if (flight.current) return
    // Lost replies retry the exact original answer, never a newly chosen option.
    if (body.action === 'abandon') pending.current = body
    else pending.current ??= body
    const request = pending.current
    const controller = lifecycle.current
    if (!controller || controller.signal.aborted) return
    flight.current = true; setBusy(true); setError(null); setRetryLocked(request.action === 'answer')
    try {
      const response = await fetch('/api/study/measurement', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal })
      if (!response.ok) throw new Error('İşlem tamamlanamadı. Aynı isteği tekrar deneyebilir veya turu bırakabilirsin.')
      const next = measurementSessionSchema.parse(await response.json())
      if (controller.signal.aborted) return
      setSession(next)
      if (request.action === 'acknowledge' && next.question?.position === request.position) setAcknowledged(true)
      else { setAcknowledged(false); setChoice(null); setAssistance(false); setRenderProblem(false); interrupted.current = false }
      pending.current = null; setRetryLocked(false)
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Bağlantı kesildi.') }
    finally { if (!controller.signal.aborted) { flight.current = false; setBusy(false) } }
  }
  const q = session?.question
  function event(action: 'acknowledge' | 'answer') {
    if (!session || !q || (action === 'answer' && choice === null)) return
    const common = { sessionId: session.id, position: q.position, requestId: crypto.randomUUID(),
      renderVersion: RENDER_VERSION, renderOk: !renderProblem,
      assistanceUsed: assistance, interrupted: interrupted.current }
    void send(action === 'answer' ? { ...common, action, selectedOption: choice! } : { ...common, action })
  }
  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl border p-4">{error}</p>}
    {!context && !error && <p role="status">Yükleniyor…</p>}
    {session?.status === 'active' && q ? <>
      <p aria-live="polite">{names[session.game]} · {session.examRef} · Soru {q.position} / {session.questionCount}</p>
      <div className="space-y-4 overflow-x-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-5">
        {q.passage && <div className="whitespace-pre-wrap">{renderRichText(q.passage)}</div>}
        <h2 className="whitespace-pre-wrap font-semibold">{renderRichText(q.text)}</h2>
        <fieldset disabled={!acknowledged || busy || retryLocked} className="space-y-3">
          <legend className="sr-only">Cevabın</legend>
          {q.options.map((option, index) => <label key={index} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--app-border)] p-3">
            <input type="radio" name="choice" checked={choice === index} onChange={() => setChoice(index)} />
            <span>{String.fromCharCode(65 + index)}. {renderRichText(option)}</span>
          </label>)}
          <label className="flex min-h-11 items-center gap-3"><input type="radio" name="choice" checked={choice === -1} onChange={() => setChoice(-1)} />Boş bırak</label>
        </fieldset>
      </div>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={renderProblem} disabled={busy || retryLocked} onChange={e => setRenderProblem(e.target.checked)} />Soru veya seçenekler düzgün görünmüyor</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={assistance} disabled={busy || retryLocked} onChange={e => setAssistance(e.target.checked)} />Bu soruda dışarıdan yardım kullandım</label>
      {!acknowledged ? <button className={btn} disabled={busy} onClick={() => event('acknowledge')}>Gösterim durumunu kaydet ve cevapla</button>
        : <button className={btn} disabled={busy || choice === null} onClick={() => event('answer')}>{retryLocked ? 'Aynı cevabı tekrar gönder' : 'Cevabı kilitle ve devam et'}</button>}
      <p className="text-sm">Doğru cevap ve çözüm bu tur tamamlanana kadar açılmaz. Sekmeden ayrılma süre verisinde işaretlenir; içerik veya ekran kaydı alınmaz.</p>
    </> : session?.status === 'completed' ? <>
      <h2 className="text-xl font-semibold">Tur tamamlandı</h2>
      <p>Bu sonuç seviye veya kalibrasyon kararı değildir.</p>
      {session.feedback?.map(f => <article key={f.questionId} className="space-y-3 rounded-xl border p-4">
        <h3>{f.position}. {renderRichText(f.text)}</h3><p>{f.isCorrect ? 'Doğru' : 'Yanlış / boş'} · Cevabın: {f.selectedText ?? 'Boş'}</p>
        <p>Doğru cevap: {renderRichText(f.correctText)}</p>{f.solution && <div>{renderRichText(f.solution)}</div>}
      </article>)}
    </> : session && <p role="status">Tur {session.status === 'withdrawn' ? 'inceleme için kapatıldı' : session.status === 'expired' ? 'süresi dolduğu için kapandı' : 'bırakıldı'}. Eksik tur kalibrasyon örneklemine alınmaz.</p>}
    {session && ['active', 'withdrawn', 'expired'].includes(session.status) && <button className="min-h-12 rounded-xl border px-4" disabled={busy}
      onClick={() => void send({ action: 'abandon', sessionId: session.id })}>Turu bırak</button>}
    {context && session?.status !== 'active' && session?.status !== 'withdrawn' && <>
      {context.forms.length === 0 ? <p>Kaynak, kazanım ve ölçüm formu kabulü tamamlandığında katılım açılacak. Mevcut kısa tarama ve pratik kullanılabilir.</p> : <>
        <label className="block">Ölçüm formu<select aria-label="Ölçüm formu" value={form} disabled={busy} onChange={e => setForm(e.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border bg-[var(--app-card)] p-3">
          <option value="">Form seç</option>{context.forms.map(f => <option value={f.id} key={f.id}>{names[f.game]} · {f.examRef} {f.examYear} · {f.questionCount} soru</option>)}
        </select></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />Açıklamayı okudum, gönüllü olarak katılıyorum.</label>
        <button className={btn} disabled={busy || !form || !consent} onClick={() => void send({ action: 'start', formId: form, requestId: crypto.randomUUID(), noticeAccepted: true })}>Turu başlat</button>
      </>}
    </>}
  </section>
}
