'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, Printer, ShieldCheck } from 'lucide-react'
import { renderRichText } from '@/lib/utils/rich-text'
import { TR_TIME_ZONE } from '@/lib/utils/tr-date'
import type { PaperPackView } from '@/lib/paper-mode/server-contract'
import { PaperPackQr } from './paper-pack-qr'

const OPTION_LETTERS = 'ABCDEFGHIJ'.split('')

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TR_TIME_ZONE,
  }).format(new Date(value))
}

function OpticalForm({ pack }: { pack: PaperPackView }) {
  const maxOptions = Math.max(...pack.items.map((item) => item.question.content.options.length))
  const letters = OPTION_LETTERS.slice(0, maxOptions)

  return (
    <section aria-labelledby="optical-form-title" className="paper-optical-form break-before-page rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
      <h2 id="optical-form-title" className="text-lg font-black text-[var(--text)]">Optik cevap formu</h2>
      <p className="mt-1 text-xs text-[var(--text-sub)]">Her soru için tek daireyi doldur. Boş bırakmak için hiçbirini işaretleme.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-center text-sm" aria-label="Kağıt paketi optik cevap formu">
          <thead>
            <tr>
              <th scope="col" className="border border-[var(--border)] px-2 py-2 text-left">Soru</th>
              {letters.map((letter) => (
                <th key={letter} scope="col" className="border border-[var(--border)] px-2 py-2">{letter}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pack.items.map((item) => (
              <tr key={item.question.id}>
                <th scope="row" className="border border-[var(--border)] px-2 py-2 text-left tabular-nums">{item.position}</th>
                {letters.map((letter, index) => (
                  <td key={letter} className="paper-optical-cell border border-[var(--border)] px-2 py-2">
                    {index < item.question.content.options.length ? (
                      <span aria-label={`${item.position}. soru ${letter} seçeneği`} className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-current text-[10px] font-bold">{letter}</span>
                    ) : (
                      <span aria-hidden="true" className="text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PaperPackPrintView({ pack }: { pack: PaperPackView }) {
  useEffect(() => {
    document.body.classList.add('paper-print-page')
    return () => document.body.classList.remove('paper-print-page')
  }, [])

  const shortCode = pack.packId.slice(0, 8).toLocaleUpperCase('tr-TR')
  const answerHref = `/arena/kagit/${pack.packId}/cevap`
  const unavailable = pack.status === 'expired'

  return (
    <div className="paper-print-root mx-auto max-w-4xl px-4 py-5 text-[var(--text)] md:px-6 md:py-8">
      <nav aria-label="Kağıt paketi işlemleri" className="paper-screen-only mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/arena/calisma" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Çalışmaya dön
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href={answerHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold hover:bg-[var(--cardHover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
            <FileText className="h-4 w-4" aria-hidden="true" /> Cevapları gir
          </Link>
          <button type="button" onClick={() => window.print()} className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
            <Printer className="h-4 w-4" aria-hidden="true" /> Yazdır / PDF kaydet
          </button>
        </div>
      </nav>

      {unavailable && (
        <p role="alert" className="paper-screen-only mb-5 rounded-xl border border-[var(--urgency)]/30 bg-[var(--urgency)]/5 px-4 py-3 text-sm text-[var(--text)]">
          Bu paketin cevap gönderme süresi doldu. Soruları hâlâ yazdırabilirsin; yeni kayıt için bugünün planından yeni paket oluştur.
        </p>
      )}

      <header className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-7">
        <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">BİLGE ARENA · BUGÜNÜN 15&apos;İ</p>
            <h1 className="mt-2 text-2xl font-black">Kağıt çalışma paketi</h1>
            <dl className="mt-4 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="inline font-bold">Ders: </dt><dd className="inline">{pack.plan.game}</dd></div>
              <div><dt className="inline font-bold">Sınav: </dt><dd className="inline">{pack.plan.examRef ?? 'Genel'}</dd></div>
              <div><dt className="inline font-bold">Soru: </dt><dd className="inline">{pack.items.length}</dd></div>
              <div><dt className="inline font-bold">Paket: </dt><dd className="inline font-mono">{shortCode}</dd></div>
              <div className="sm:col-span-2"><dt className="inline font-bold">Cevap süresi: </dt><dd className="inline">{formatDate(pack.expiresAt)}</dd></div>
            </dl>
            <p className="mt-4 inline-flex items-start gap-2 rounded-xl border border-[var(--growth)]/30 bg-[var(--growth)]/5 px-3 py-2 text-xs leading-5 text-[var(--text-sub)]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--growth)]" aria-hidden="true" />
              Yalnız sana özeldir. Kağıt cevapları XP, coin, seri, görev veya sıralama puanı kazandırmaz.
            </p>
          </div>
          <PaperPackQr packId={pack.packId} />
        </div>
      </header>

      <div className="space-y-4">
        {pack.items.map((item) => (
          <article key={item.question.id} aria-labelledby={`paper-question-${item.position}`} className="paper-print-question break-inside-avoid rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 md:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-sub)]">
              <span className="font-black tracking-wide">SORU {item.position}</span>
              <span>{item.question.topic ?? item.question.category ?? 'Genel'} · Zorluk {item.question.difficulty}</span>
            </div>
            {item.question.content.passage && (
              <p className="mb-3 whitespace-pre-line text-sm leading-6 text-[var(--text-sub)]">{renderRichText(item.question.content.passage)}</p>
            )}
            {item.question.content.context && (
              <p className="mb-3 whitespace-pre-line rounded-lg bg-[var(--surface)] px-3 py-2 text-sm leading-6">{renderRichText(item.question.content.context)}</p>
            )}
            <h2 id={`paper-question-${item.position}`} className="whitespace-pre-line text-base font-bold leading-7">
              {renderRichText(item.question.content.question || item.question.content.sentence)}
            </h2>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {item.question.content.options.map((option, optionIndex) => (
                <li key={optionIndex} className="flex items-start gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm leading-6">
                  <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-black">{OPTION_LETTERS[optionIndex]}</span>
                  <span>{renderRichText(option)}</span>
                </li>
              ))}
            </ol>
            {pack.status === 'submitted' && item.correctOption !== null && (
              <p className="mt-3 text-xs font-bold text-[var(--growth)]">Cevap: {OPTION_LETTERS[item.correctOption]}</p>
            )}
          </article>
        ))}
      </div>

      <div className="mt-6">
        <OpticalForm pack={pack} />
      </div>
      <footer className="mt-5 text-center text-[10px] leading-4 text-[var(--text-sub)]">
        Paket {shortCode} · QR yalnız owner-auth cevap giriş URL&apos;sini taşır · Çevrimdışı kopya kaydettiğin PDF veya basılı sayfadır.
      </footer>
    </div>
  )
}
