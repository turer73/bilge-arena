'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { renderRichText } from '@/lib/utils/rich-text'
import { gradeQuestion } from '@/lib/questions/grade-question'
import { preparationContextSchema, preparationTicketSchema, PREPARATION_DESCRIPTION,
  type PreparationContext, type PreparationRequest, type PreparationTicket } from '@/lib/diagnostic/tyt-social-preparation'

const card = 'rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-5'
const button = 'min-h-12 scroll-mb-32 rounded-xl bg-[var(--app-accent)] px-5 py-3 font-bold text-white disabled:opacity-50'
type Variant = PreparationRequest['variant']

export default function PreparationClient() {
  const { user, loading } = useAuthStore()
  return <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 pb-32 text-[var(--app-text)]">
    <header className="space-y-3">
      <Link className="inline-flex min-h-11 items-center font-bold text-[var(--app-accent-text)]" href="/arena/sosyal?exam_ref=TYT">Sosyal çalışmasına dön</Link>
      <h1 className="text-xl font-black">2027 TYT Sosyal hazırlık pilotu</h1>
      <p className="text-sm leading-6">{PREPARATION_DESCRIPTION}</p>
    </header>
    {loading ? <p role="status">Yükleniyor…</p> : !user
      ? <Link className={button} href="/giris?next=%2Farena%2Ftani%2Fsosyal-hazirlik">Başlamak için giriş yap</Link>
      : <PreparationSession key={user.id} />}
  </main>
}

export function PreparationSession() {
  const [context, setContext] = useState<PreparationContext | null>(null)
  const [variant, setVariant] = useState<Variant | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [ticket, setTicket] = useState<PreparationTicket | null>(null)
  const [position, setPosition] = useState(0)
  const [choice, setChoice] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ correct: number; wrong: number } | null>(null)
  const request = useRef<PreparationRequest | null>(null)
  const pendingChoice = useRef<number | null>(null)
  const flight = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const shownAt = useRef(Date.now())
  const times = useRef<Record<string, number>>({})
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller
    const token = ++generation.current
    void fetch('/api/study/tyt-social-preparation', { cache: 'no-store', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return preparationContextSchema.parse(await r.json()) })
      .then(data => { if (!controller.signal.aborted && token === generation.current) setContext(data) })
      .catch(() => { if (!controller.signal.aborted) setError('Hazırlık yüklenemedi. Sayfayı yenileyerek tekrar deneyebilirsin.') })
    return () => { generation.current = token + 1; controller.abort() }
  }, [])
  const current = ticket?.questions[position]
  const graded = ticket?.progress.find(p => p.questionId === current?.id)
  const expired = ticket ? Date.parse(ticket.expiresAt) <= Date.now() : false
  async function load(r: PreparationRequest) {
    const response = await fetch('/api/study/tyt-social-preparation', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-idempotency-key': r.requestId },
      body: JSON.stringify(r), signal: lifetime.current?.signal,
    })
    if (!response.ok) throw new Error(response.status === 410 ? 'Süre doldu. Sayfayı yenileyerek yeni tur başlat.' : 'İşlem tamamlanamadı. Aynı istekle tekrar deneyebilirsin.')
    return preparationTicketSchema.parse(await response.json())
  }
  async function run(work: (alive: () => boolean) => Promise<void>) {
    if (flight.current) return
    flight.current = true; setBusy(true); setError(null)
    const token = generation.current
    const alive = () => token === generation.current && !lifetime.current?.signal.aborted
    try { await work(alive) } catch (e) { if (alive()) setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.') }
    finally { if (alive()) { flight.current = false; setBusy(false) } }
  }
  function start(resume: boolean) {
    if (!context?.available || (!resume && (!variant || !accepted))) return
    void run(async alive => {
      if (!request.current) request.current = resume && context.resume
        ? { ...context.resume, noticeAccepted: true }
        : { requestId: crypto.randomUUID(), variant: variant!, noticeAccepted: true }
      const data = await load(request.current)
      if (!alive()) return
      setTicket(data)
      const first = data.questions.findIndex(q => !data.progress.some(p => p.questionId === q.id))
      setPosition(first < 0 ? 19 : first); shownAt.current = Date.now()
    })
  }
  function answer() {
    if (!current || !ticket || graded || expired || choice === null || !request.current) return
    void run(async alive => {
      // A lost response can be retried only with the same first choice.
      pendingChoice.current ??= choice
      times.current[current.id] ??= Math.min(300, Math.max(0, (Date.now() - shownAt.current) / 1000))
      await gradeQuestion(current.id, pendingChoice.current, ticket.attemptId, lifetime.current?.signal)
      if (!alive()) return
      const data = await load(request.current!) // canonical first choice, including another tab's prior submission
      if (alive()) { setTicket(data); pendingChoice.current = null }
    })
  }
  function finish() {
    if (!ticket || ticket.progress.length !== 20 || !request.current || expired) return
    void run(async alive => {
      const response = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: lifetime.current?.signal, body: JSON.stringify({ attemptId: ticket.attemptId, clientRequestId: request.current!.requestId,
          game: 'sosyal', mode: 'practice', answers: ticket.progress.map(p => ({ questionId: p.questionId,
            selectedOption: p.selectedOption, isCorrect: p.isCorrect, timeTaken: times.current[p.questionId] ?? 0 })) }),
      })
      if (!response.ok) throw new Error('Sonuç kaydedilemedi. Tekrar dene; ikinci kez puan yazılmaz.')
      const data = await response.json() as { correctCount?: number; wrongCount?: number }
      if (!Number.isInteger(data.correctCount) || !Number.isInteger(data.wrongCount) || data.correctCount! < 0 || data.wrongCount! < 0
        || data.correctCount! + data.wrongCount! !== 20) throw new Error('Sonuç doğrulanamadı. Tekrar dene.')
      if (alive()) setResult({ correct: data.correctCount!, wrong: data.wrongCount! })
    })
  }
  return <>
    {error && <p role="alert" className={card}>{error}</p>}
    {result ? <section className={card}>
      <h2 className="text-lg font-bold">Hazırlık turu kaydedildi</h2>
      <p className="mt-3 text-lg">{result.correct} doğru · {result.wrong} yanlış / 20 soru</p>
      <p className="mt-3 text-sm leading-6">Bu turdaki gözlemin kaydedildi. Aynı havuzla tekrar çalışma yapılabilir; tekrar sonucu bağımsız seviye ölçümü sayılmaz.</p>
      <Link href="/arena/sosyal?exam_ref=TYT" className="mt-4 inline-flex min-h-11 items-center font-bold text-[var(--app-accent-text)]">Çalışmaya dön</Link>
    </section> : ticket && current ? <section className={card}>
      <p className="mb-4 text-sm">Soru {position + 1} / 20 · {ticket.progress.length} yanıt kaydedildi</p>
      {expired && <p role="alert">Oturumun iki saatlik süresi doldu. Yeni bir tur için sayfayı yenile.</p>}
      {current.content.passage && <div className="mb-4 whitespace-pre-wrap text-sm leading-7">{renderRichText(current.content.passage)}</div>}
      {current.content.context && <div className="mb-4 whitespace-pre-wrap text-sm leading-7">{renderRichText(current.content.context)}</div>}
      <fieldset disabled={busy || !!graded || expired || pendingChoice.current !== null}>
        <legend className="text-base font-bold leading-7">{renderRichText(current.content.question || current.content.sentence)}</legend>
        <div className="mt-4 space-y-3">{current.content.options.map((text, index) => <label key={index} className="flex min-h-12 cursor-pointer gap-3 rounded-xl border border-[var(--app-border)] p-4">
          <input className="mt-1 size-4 shrink-0" type="radio" name={current.id} checked={(graded?.selectedOption ?? choice) === index} onChange={() => setChoice(index)} />
          <span className="min-w-0 break-words text-sm leading-6"><strong>{String.fromCharCode(65 + index)}.</strong> {renderRichText(text)}</span>
        </label>)}</div>
      </fieldset>
      {graded ? <div role="status" className="mt-4 space-y-2 text-sm leading-7">
        <p className="font-bold">{graded.isCorrect ? 'Doğru.' : 'Bu kez olmadı.'} Doğru cevap: {renderRichText(current.content.options[graded.correctOption])}</p>
        {graded.solution && <p>{renderRichText(graded.solution)}</p>}
      </div> : <button className={`${button} mt-4 w-full`} disabled={choice === null || busy || expired} onClick={answer}>{busy ? 'Kaydediliyor…' : 'Cevabı kaydet'}</button>}
      {ticket.progress.length === 20 ? <button className={`${button} mt-4 w-full`} disabled={busy || expired} onClick={finish}>{busy ? 'Sonuç kaydediliyor…' : 'Turu tamamla ve kaydet'}</button>
        : graded && <button className={`${button} mt-4 w-full`} disabled={busy} onClick={() => {
          const next = ticket.questions.findIndex(q => !ticket.progress.some(p => p.questionId === q.id))
          setPosition(next); setChoice(null); shownAt.current = Date.now()
        }}>Sonraki soru</button>}
    </section> : context?.available ? <section className={`${card} space-y-4`}>
      <h2 className="font-bold">Cevaplama düzenini seç</h2>
      <p className="text-sm leading-6">İlk 15 soru ortak; son 5 soru seçtiğin düzene göre gelir. Bu seçimden inanç veya muafiyet nedeni çıkarılmaz; neden ya da belge istemiyoruz. Seçim yalnız bu hazırlık turunu etkiler.</p>
      <fieldset disabled={busy || request.current !== null} className="space-y-3">
        <legend className="sr-only">Son beş sorunun düzeni</legend>
        {(['questions_16_20', 'questions_21_25'] as const).map(v => <label key={v} className="flex min-h-12 gap-3 rounded-xl border border-[var(--app-border)] p-3">
          <input type="radio" name="range" checked={variant === v} onChange={() => setVariant(v)} />
          <span>{v === 'questions_16_20' ? '1–15 + 16–20 (Din Kültürü)' : '1–15 + 21–25 (Felsefe)'}</span>
        </label>)}
        <label className="flex min-h-12 items-start gap-3 text-sm leading-6"><input className="mt-1 size-4 shrink-0" type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />Yalnız seçtiğim soru aralığının hesabımla birlikte kaydedileceğini ve bunun resmî sınav onayı olmadığını anladım.</label>
      </fieldset>
      <p className="text-sm">Oturum iki saat geçerlidir. Bu süre içinde sayfayı yenilesen de kayıtlı ilk cevaplarınla devam edebilirsin.</p>
      {context.resume && <button className={`${button} w-full`} disabled={busy} onClick={() => start(true)}>Kayıtlı tura devam et</button>}
      <button className={`${button} w-full`} disabled={busy || !variant || !accepted} onClick={() => start(false)}>{busy ? 'Açılıyor…' : '20 soruluk turu başlat'}</button>
    </section> : context ? <p className={card}>Hazırlık pilotu şu an kullanılamıyor. Serbest pratiğe devam edebilirsin.</p>
      : !error && <p role="status" className={card}>Hazırlık kontrol ediliyor…</p>}
  </>
}
