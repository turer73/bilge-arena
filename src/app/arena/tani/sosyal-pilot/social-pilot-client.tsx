'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { useSocialPilot, type SocialPilotAnswerInput } from '@/lib/hooks/use-social-pilot'
import { getCategoryLabel } from '@/lib/constants/games'
import { SOCIAL_DISCOVERY_DESCRIPTION, SOCIAL_DISCOVERY_LABEL } from '@/lib/diagnostic/social-pilot-public'

export default function SocialPilotClient() {
  const { user, loading: authLoading } = useAuthStore()
  const pilot = useSocialPilot(user?.id)
  const session = pilot.response?.session
  const question = session?.question
  const key = question && session ? `${session.id}:${question.id}` : null
  const [choice, setChoice] = useState<{ key: string; index: number } | null>(null)
  const [lockedKey, setLockedKey] = useState<string | null>(null)
  const selected = key && choice?.key === key ? choice.index : null
  const timing = useRef<{ key: string; start: number } | null>(null)
  const pending = useRef<SocialPilotAnswerInput | null>(null)
  const register = useCallback((node: HTMLElement | null) => {
    if (node && key && timing.current?.key !== key) timing.current = { key, start: Date.now() }
  }, [key])
  async function submit() {
    if (!question || !session || selected === null || pilot.submitting) return
    const existing = pending.current
    const request = existing?.sessionId === session.id && existing.questionId === question.id ? existing : {
      sessionId: session.id, questionId: question.id, selectedOption: selected,
      responseTimeMs: Math.min(600_000, Math.max(100, Date.now() - (timing.current?.start ?? Date.now()))),
      requestId: crypto.randomUUID(),
    }
    pending.current = request
    setLockedKey(key)
    if (await pilot.answer(request)) { pending.current = null; setChoice(null); setLockedKey(null) }
  }
  async function reload() {
    if (await pilot.refresh()) { pending.current = null; setChoice(null); setLockedKey(null) }
  }
  const card = 'rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-7'
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-2">
        <Link href="/arena/sosyal" className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--focus)]">Sosyal çalışmasına dön</Link>
        <h1 className="text-xl font-bold text-[var(--text)]">{SOCIAL_DISCOVERY_LABEL}</h1>
        <p className="text-sm leading-6 text-[var(--text-sub)]">{SOCIAL_DISCOVERY_DESCRIPTION}</p>
      </header>
      {authLoading || pilot.loading ? <p role="status" className={card}>Yükleniyor…</p> : !user ? (
        <section className={card}>
          <p>Keşfi başlatmak ve kaldığın yerden devam etmek için giriş yap.</p>
          <Link href="/giris?next=%2Farena%2Ftani%2Fsosyal-pilot" className="btn-primary mt-4 inline-flex min-h-11 items-center rounded-xl px-5">Giriş yap</Link>
        </section>
      ) : pilot.error && !pilot.response ? (
        <section className={card}><p role="alert">Keşif şu an yüklenemedi.</p>
          <button className="mt-3 min-h-11 font-bold text-[var(--focus)]" onClick={() => void pilot.refresh()}>Yeniden dene</button></section>
      ) : pilot.response && !pilot.response.supported ? (
        <p className={card}>Sosyal başlangıç keşfi henüz yayınlanmadı.</p>
      ) : pilot.response ? (
        <>
          {session?.status === 'expired' && <p role="status" className={card}>Önceki keşfin süresi doldu. Yeni bir tur başlatabilirsin.</p>}
          {session?.status === 'abandoned' && <p role="status" className={card}>Önceki tur tamamlanamadı. Yeni bir tur başlatabilirsin.</p>}
          {question && session ? (
            <section ref={register} className={card}>
              <p className="mb-4 text-sm text-[var(--text-sub)]">Soru {session.answeredCount + 1} / 12</p>
              <fieldset disabled={pilot.submitting || lockedKey === key}>
                <legend className="text-base font-bold leading-7 text-[var(--text)]">{question.question}</legend>
                {question.passage && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--surface)] p-4 text-sm leading-6">{question.passage}</p>}
                <div className="mt-5 space-y-3">
                  {question.options.map((option, index) => <label key={index} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-4 text-sm leading-6">
                    <input type="radio" name={`social-${question.id}`} className="mt-1 h-4 w-4 shrink-0" checked={selected === index}
                      onChange={() => setChoice({ key: key!, index })} />
                    <span className="min-w-0 break-words"><strong>{String.fromCharCode(65 + index)}.</strong> {option}</span>
                  </label>)}
                </div>
              </fieldset>
              <button type="button" className="btn-primary mt-5 min-h-12 w-full rounded-xl px-5 py-3 font-bold disabled:opacity-50"
                disabled={selected === null || pilot.submitting} onClick={() => void submit()}>{pilot.submitting ? 'Kaydediliyor…' : 'Cevabı kaydet ve devam et'}</button>
            </section>
          ) : (
            <section className={card}>
              {session?.observations ? <>
                <h2 className="text-lg font-bold">Başlangıç gözlemin</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Her alanda yalnız üç soru yanıtladın. Bunlar çalışma yönünü seçmek için ilk gözlemler; kesin seviye sonucu değildir.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">{session.observations.map(item => (
                  <article key={item.category} className="rounded-xl border border-[var(--border)] p-4">
                    <h3 className="font-bold">{getCategoryLabel(item.category)}</h3>
                    <p className="mt-2 text-sm">{item.correct} / {item.answered} doğru</p>
                  </article>
                ))}</div>
              </> : <p className="text-sm leading-6">12 soruyu tek seferde bitirmek zorunda değilsin. Geri döndüğünde son kayıtlı sorudan devam edebilirsin.</p>}
              <button type="button" disabled={pilot.submitting} onClick={() => void pilot.start()} className="btn-primary mt-5 min-h-12 rounded-xl px-5 font-bold disabled:opacity-50">
                {pilot.submitting ? 'Hazırlanıyor…' : session?.status === 'completed' ? 'Yeni keşif başlat' : '12 soruluk keşfi başlat'}
              </button>
            </section>
          )}
          {pilot.error && <p role="alert" className="text-sm text-[var(--app-danger)]">İşlem tamamlanamadı. Aynı cevabı yeniden gönderebilir veya <button className="min-h-11 underline" onClick={() => void reload()}>son kayıtlı soruyu yükleyebilirsin</button>.</p>}
        </>
      ) : null}
    </div>
  )
}
