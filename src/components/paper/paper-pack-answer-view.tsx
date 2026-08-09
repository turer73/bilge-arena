'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, CircleSlash2, FileText, RefreshCw, XCircle } from 'lucide-react'
import { renderRichText } from '@/lib/utils/rich-text'
import { usePaperPack } from '@/lib/hooks/use-paper-pack'
import type { PaperPackSubmitInput } from '@/lib/paper-mode/server-contract'
import { PaperScratchpad } from './paper-scratchpad'

const OPTION_LETTERS = 'ABCDEFGHIJ'.split('')

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === true) return <CheckCircle2 className="h-5 w-5 text-[var(--growth)]" aria-hidden="true" />
  if (isCorrect === false) return <XCircle className="h-5 w-5 text-[var(--urgency)]" aria-hidden="true" />
  return <CircleSlash2 className="h-5 w-5 text-[var(--text-sub)]" aria-hidden="true" />
}

export function PaperPackAnswerView({ packId }: { packId: string }) {
  return <PaperPackAnswerContent key={packId} packId={packId} />
}

function PaperPackAnswerContent({ packId }: { packId: string }) {
  const paper = usePaperPack(packId)
  const [selections, setSelections] = useState<Record<number, number | null>>({})
  const pendingRef = useRef<{ fingerprint: string; requestId: string } | null>(null)

  const answers = useMemo<PaperPackSubmitInput['answers']>(() => (
    (paper.pack?.items ?? []).map((item) => ({
      position: item.position,
      selectedOption: Object.prototype.hasOwnProperty.call(selections, item.position)
        ? selections[item.position]
        : item.selectedOption,
    }))
  ), [paper.pack?.items, selections])
  const answeredCount = answers.filter((answer) => answer.selectedOption !== null).length

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!paper.pack || paper.pack.status !== 'active' || paper.submitting) return
    const fingerprint = JSON.stringify(answers)
    const pending = pendingRef.current?.fingerprint === fingerprint
      ? pendingRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    pendingRef.current = pending
    const succeeded = await paper.submit({ requestId: pending.requestId, answers })
    if (succeeded) pendingRef.current = null
  }

  if (paper.loading) {
    return <div role="status" className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">Kağıt paketin yükleniyor...</div>
  }

  if (paper.error === 'load' || !paper.pack) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">Paket açılamadı</h1>
        <p role="alert" className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Paket sana ait olmayabilir veya geçici bir bağlantı sorunu oluşmuş olabilir.</p>
        <button type="button" onClick={() => void paper.refresh()} className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
        </button>
      </div>
    )
  }

  const pack = paper.pack
  const submitted = pack.status === 'submitted'
  const expired = pack.status === 'expired'

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 md:px-6 md:py-8">
      <header className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">KAĞIT PAKETİ · {pack.packId.slice(0, 8).toUpperCase()}</p>
            <h1 className="mt-1 text-2xl font-black">Cevaplarını gir</h1>
          </div>
          <Link href={`/arena/kagit/${pack.packId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Pakete dön
          </Link>
        </div>
        <p className="text-sm leading-6 text-[var(--text-sub)]">
          Kağıtta işaretlediğin seçenekleri buraya aktar. Notlandırma sunucuda yapılır; sonuçlar XP, coin, görev, seri veya sıralamayı etkilemez.
        </p>
        {submitted && pack.summary && (
          <div role="status" className="grid gap-2 rounded-xl border border-[var(--growth)]/30 bg-[var(--growth)]/5 p-4 sm:grid-cols-3">
            <div><span className="block text-[10px] font-bold text-[var(--text-sub)]">YANITLANAN</span><strong className="text-xl">{pack.summary.answeredCount}/{pack.items.length}</strong></div>
            <div><span className="block text-[10px] font-bold text-[var(--text-sub)]">DOĞRU</span><strong className="text-xl">{pack.summary.correctCount}</strong></div>
            <div><span className="block text-[10px] font-bold text-[var(--text-sub)]">KAĞIT SKORU</span><strong className="text-xl">%{pack.summary.scorePercent}</strong></div>
          </div>
        )}
        {expired && (
          <p role="alert" className="rounded-xl border border-[var(--urgency)]/30 bg-[var(--urgency)]/5 px-4 py-3 text-sm">
            Bu paketin 7 günlük cevap süresi doldu. Yeni kayıt için bugünün planından yeni paket oluştur.
          </p>
        )}
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {pack.items.map((item) => {
          const selected = Object.prototype.hasOwnProperty.call(selections, item.position)
            ? selections[item.position]
            : item.selectedOption
          return (
            <fieldset key={item.question.id} disabled={submitted || expired || paper.submitting} className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 disabled:opacity-90 md:p-6">
              <legend className="px-1 text-xs font-black tracking-wide text-[var(--text-sub)]">SORU {item.position}</legend>
              {item.question.content.passage && (
                <p className="mb-3 whitespace-pre-line text-sm leading-6 text-[var(--text-sub)]">{renderRichText(item.question.content.passage)}</p>
              )}
              {item.question.content.context && (
                <p className="mb-3 whitespace-pre-line rounded-lg bg-[var(--surface)] px-3 py-2 text-sm leading-6">{renderRichText(item.question.content.context)}</p>
              )}
              <p className="whitespace-pre-line text-base font-bold leading-7">{renderRichText(item.question.content.question || item.question.content.sentence)}</p>

              {submitted && (
                <p className={`mt-3 inline-flex items-center gap-2 text-sm font-bold ${item.isCorrect === true ? 'text-[var(--growth)]' : item.isCorrect === false ? 'text-[var(--urgency)]' : 'text-[var(--text-sub)]'}`}>
                  <ResultIcon isCorrect={item.isCorrect} />
                  {item.isCorrect === true ? 'Doğru' : item.isCorrect === false ? 'Yanlış' : 'Boş bırakıldı'}
                  {item.correctOption !== null && ` · Doğru cevap ${OPTION_LETTERS[item.correctOption]}`}
                </p>
              )}

              <div className="mt-4 grid gap-2">
                {item.question.content.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-3 text-sm leading-6 has-[:checked]:border-[var(--focus)] has-[:checked]:bg-[var(--focus)]/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
                    <input
                      type="radio"
                      name={`paper-answer-${item.position}`}
                      value={optionIndex}
                      checked={selected === optionIndex}
                      onChange={() => {
                        pendingRef.current = null
                        setSelections((current) => ({ ...current, [item.position]: optionIndex }))
                      }}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--focus)]"
                    />
                    <span><strong className="mr-2">{OPTION_LETTERS[optionIndex]}.</strong>{' '}{renderRichText(option)}</span>
                  </label>
                ))}
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--text-sub)] has-[:checked]:border-[var(--focus)] has-[:checked]:bg-[var(--focus)]/5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
                  <input
                    type="radio"
                    name={`paper-answer-${item.position}`}
                    value="blank"
                    checked={selected === null}
                    onChange={() => {
                      pendingRef.current = null
                      setSelections((current) => ({ ...current, [item.position]: null }))
                    }}
                    className="h-5 w-5 shrink-0 accent-[var(--focus)]"
                  />
                  Boş bırak
                </label>
              </div>
            </fieldset>
          )
        })}

        {!submitted && !expired && (
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]/95 p-4 shadow-xl backdrop-blur md:bottom-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--text-sub)]"><strong className="text-[var(--text)]">{answeredCount}/{pack.items.length}</strong> soru işaretlendi · {pack.items.length - answeredCount} boş</p>
              <button type="submit" disabled={paper.submitting} className="btn-primary inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {paper.submitting ? 'Notlandırılıyor...' : 'Cevapları notlandır'}
              </button>
            </div>
            {paper.error === 'submit' && (
              <p role="alert" className="mt-3 text-sm text-[var(--urgency)]">Cevaplar kaydedilemedi. Aynı seçimlerle güvenle yeniden deneyebilirsin.</p>
            )}
          </div>
        )}
      </form>

      {!submitted && <PaperScratchpad />}
    </div>
  )
}
