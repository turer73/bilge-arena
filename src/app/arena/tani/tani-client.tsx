'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, BrainCircuit, RefreshCw, Target } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { useAdaptiveDiagnostic } from '@/lib/hooks/use-adaptive-diagnostic'
import type { DiagnosticOutcomeSummaryPublic } from '@/lib/diagnostic/public-contract'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { parseDiagnosticPageScope } from '@/lib/diagnostic/scope'

interface PendingAnswer {
  sessionId: string
  questionId: string
  selectedOption: number
  responseTimeMs: number
  requestId: string
}

const BAND_LABELS = {
  foundation: 'Temel desteği gerekli',
  developing: 'Gelişiyor',
  strong: 'Güçlü başlangıç',
} as const

const BAND_STYLES = {
  foundation: 'border-[var(--danger)]/30 bg-[var(--danger)]/5 text-[var(--danger)]',
  developing: 'border-[var(--reward)]/30 bg-[var(--reward)]/5 text-[var(--reward)]',
  strong: 'border-[var(--growth)]/30 bg-[var(--growth)]/5 text-[var(--growth)]',
} as const

function IntroCard({
  hasSummary,
  questionCount,
  outcomeCount,
  subjectName,
  submitting,
  onStart,
}: {
  hasSummary: boolean
  questionCount: number
  outcomeCount: number
  subjectName: string
  submitting: boolean
  onStart: () => void
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-[var(--focus)]/10 p-3 text-[var(--focus)]" aria-hidden="true">
          <BrainCircuit className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--text-sub)]">
            {questionCount} SORU · YAKLAŞIK {Math.max(3, Math.round(questionCount * 0.8))} DAKİKA
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text)]">
            {hasSummary ? 'Başlangıç tahminini yeniden yokla' : 'Nereden başlayacağını birlikte bulalım'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
            {outcomeCount} {subjectName} kazanım alanını kısa bir taramayla yoklarız. Sorular yanıtına göre bir kademe
            kolaylaşabilir veya zorlaşabilir; bu bir hâkimiyet ölçümü değildir ve sonuç ödül ya da sıralamayı etkilemez.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={submitting}
            className="btn-primary mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Hazırlanıyor...' : hasSummary ? 'Yeniden tara' : 'Kısa taramayı başlat'}
            {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  )
}

function SummaryCard({
  outcomes,
  game,
  examRef,
  onPractice,
}: {
  outcomes: DiagnosticOutcomeSummaryPublic[]
  game: GameSlug
  examRef: string
  onPractice: (outcome: DiagnosticOutcomeSummaryPublic) => void
}) {
  const weakest = [...outcomes].sort((left, right) => (
    left.score - right.score || left.code.localeCompare(right.code)
  ))[0]

  return (
    <section aria-labelledby="diagnostic-summary-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--text-sub)]">KEŞİF ADIMI TAMAM · BAŞLANGIÇ TAHMİNİ</p>
          <h2 id="diagnostic-summary-title" className="mt-1 text-lg font-bold text-[var(--text)]">Kazanım özeti</h2>
        </div>
        <Link href={`/arena/hakimiyet?${new URLSearchParams({ game, exam_ref: examRef })}`} className="text-xs font-bold text-[var(--focus)] hover:underline">
          Hâkimiyet haritası
        </Link>
      </div>
      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs leading-5 text-[var(--text-sub)]">
        Bu sonuç yalnız kısa başlangıç taraması tahminidir. Keşif Seviyesi 2, farklı günlerdeki doğrulanmış pratik kanıtlarıyla ilerler; kalıcı hâkimiyet bu kanıtlarla oluşur.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {outcomes.map((outcome) => (
          <article key={outcome.code} className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">{outcome.title}</h3>
                <p className="mt-1 text-[11px] text-[var(--text-sub)]">
                  {outcome.correctAttempts}/{outcome.attempts} doğru · önerilen zorluk {outcome.recommendedDifficulty}
                </p>
              </div>
              <span className="text-lg font-black tabular-nums text-[var(--text)]">%{Math.round(outcome.score)}</span>
            </div>
            <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${BAND_STYLES[outcome.band]}`}>
              {BAND_LABELS[outcome.band]}
            </span>
          </article>
        ))}
      </div>
      {weakest && (
        <button
          type="button"
          onClick={() => onPractice(weakest)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[var(--focus)]/30 bg-[var(--focus)]/5 px-4 py-3 text-left text-sm font-bold text-[var(--focus)] hover:bg-[var(--focus)]/10"
        >
          <span className="flex items-center gap-2">
            <Target className="h-4 w-4" aria-hidden="true" />
            Önce {weakest.title} çalış
          </span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </section>
  )
}

export default function TaniClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuthStore()
  const gameStore = useGameStore()
  const requestedScope = parseDiagnosticPageScope(
    searchParams.get('game'),
    searchParams.get('exam_ref'),
  )
  const diagnostic = useAdaptiveDiagnostic(requestedScope?.game ?? null, user?.id, requestedScope?.examRef)
  const [selection, setSelection] = useState<{ questionKey: string; option: number } | null>(null)
  const questionTiming = useRef<{ questionKey: string; startedAt: number } | null>(null)
  const pendingAnswer = useRef<PendingAnswer | null>(null)
  const questionId = diagnostic.session?.question?.id ?? null
  const questionKey = diagnostic.session && questionId
    ? `${diagnostic.session.id}:${questionId}`
    : null
  const selectedOption = selection?.questionKey === questionKey ? selection.option : null
  const registerQuestion = useCallback((node: HTMLElement | null) => {
    if (node && questionKey && questionTiming.current?.questionKey !== questionKey) {
      questionTiming.current = { questionKey, startedAt: Date.now() }
    }
  }, [questionKey])

  const session = diagnostic.session
  const activeQuestion = session?.status === 'active' ? session.question : null
  const progressPercent = session
    ? Math.round((session.progress.answered / session.progress.total) * 100)
    : 0
  const showIntro = !session || session.status !== 'active'
  const statusNote = useMemo(() => {
    if (session?.status === 'expired') return 'Önceki kısa taramanın süresi doldu. Yeni ve temiz bir tur başlatabilirsin.'
    if (session?.status === 'abandoned') return 'Önceki tur tamamlanamadı. Son kayıtlı kazanım özetin korunuyor.'
    if (session?.status === 'completed') return 'Kısa tarama tamamlandı. Başlangıç tahmini aşağıda; istersen yeniden yoklayabilirsin.'
    return null
  }, [session?.status])

  const handleSubmit = async () => {
    if (!activeQuestion || !session || selectedOption === null || diagnostic.submitting) return
    const existing = pendingAnswer.current
    const now = Date.now()
    const activeQuestionKey = `${session.id}:${activeQuestion.id}`
    const startedAt = questionTiming.current?.questionKey === activeQuestionKey
      ? questionTiming.current.startedAt
      : now
    const pending = existing?.sessionId === session.id && existing.questionId === activeQuestion.id
      ? existing
      : {
        sessionId: session.id,
        questionId: activeQuestion.id,
        selectedOption,
        responseTimeMs: Math.min(600_000, Math.max(100, now - startedAt)),
        requestId: crypto.randomUUID(),
      }
    pendingAnswer.current = pending
    const succeeded = await diagnostic.answer(pending)
    if (succeeded) pendingAnswer.current = null
  }

  const handlePractice = (outcome: DiagnosticOutcomeSummaryPublic) => {
    if (!requestedScope) return
    gameStore.setGame(requestedScope.game)
    gameStore.setCategory(outcome.category)
    if (requestedScope.game !== 'wordquest') gameStore.setExamRef(requestedScope.examRef)
    gameStore.setDifficulty(outcome.recommendedDifficulty)
    gameStore.setMode('practice')
    router.push(`/arena/${requestedScope.game}`)
  }

  if (authLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">Yükleniyor...</div>
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl" aria-hidden="true">🔒</div>
        <h1 className="mb-2 text-xl font-bold">Giriş Yapmanız Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">Kısa tarama sonucu yalnızca kendi öğrenme kaydına eklenir.</p>
        <Link href="/giris" className="btn-primary inline-block rounded-xl px-8 py-3 text-sm font-bold">Giriş Yap</Link>
      </div>
    )
  }

  if (!requestedScope) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-[var(--text)]">Geçersiz tarama kapsamı</h1>
        <p className="mt-2 text-sm text-[var(--text-sub)]">
          Ders ve sınav kapsamı birlikte, yayınlandığı biçimde belirtilmelidir.
        </p>
        <Link href="/arena/calisma" className="mt-5 inline-flex text-sm font-bold text-[var(--focus)] hover:underline">
          Çalışmaya dön
        </Link>
      </main>
    )
  }

  const subjectName = `${requestedScope.examRef} ${GAMES[requestedScope.game].name}`

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--text-sub)]">{subjectName.toLocaleUpperCase('tr-TR')} · İÇ TAKSONOMİ</p>
          <h1 className="mt-1 text-xl font-bold text-[var(--text)]">Kısa Başlangıç Taraması</h1>
        </div>
        <Link href="/arena/calisma" className="text-xs font-bold text-[var(--focus)] hover:underline">Çalışmaya dön</Link>
      </header>

      {diagnostic.loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-10 text-center text-sm text-[var(--text-sub)]">
          Kısa tarama durumun yükleniyor...
        </div>
      ) : diagnostic.error === 'load' || !diagnostic.response ? (
        <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-5 text-sm text-[var(--text)]">
          <p>Kısa tarama şu an yüklenemedi.</p>
          <button type="button" onClick={() => void diagnostic.refresh()} className="mt-3 inline-flex items-center gap-2 font-bold text-[var(--focus)]">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
          </button>
        </div>
      ) : !diagnostic.supported ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-sm text-[var(--text-sub)]">
          Bu ders ve sınav kapsamında kısa başlangıç taraması henüz yayınlanmadı.
        </div>
      ) : (
        <>
          {statusNote && (
            <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-sub)]">
              {statusNote}
            </p>
          )}

          {showIntro && (
            <IntroCard
              hasSummary={Boolean(diagnostic.summary)}
              questionCount={diagnostic.response.policy?.questionCount ?? 0}
              outcomeCount={diagnostic.response.policy?.outcomeCount ?? 0}
              subjectName={subjectName}
              submitting={diagnostic.submitting}
              onStart={() => void diagnostic.start()}
            />
          )}

          {activeQuestion && session && (
            <section ref={registerQuestion} aria-labelledby="diagnostic-question-title" className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-sm md:p-7">
              <div className="mb-5">
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-sub)]">
                  <span>Soru {session.progress.answered + 1} / {session.progress.total}</span>
                  <span>{session.progress.coveredOutcomes} / {session.progress.totalOutcomes} kazanım yoklandı</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Kısa tarama ilerlemesi"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]"
                >
                  <div className="h-full rounded-full bg-[var(--focus)] transition-[width]" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              <fieldset disabled={diagnostic.submitting}>
                <legend id="diagnostic-question-title" className="text-base font-bold leading-7 text-[var(--text)]">
                  {activeQuestion.content.question}
                </legend>
                {activeQuestion.content.passage && (
                  <p className="mt-3 rounded-xl bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--text-sub)]">
                    {activeQuestion.content.passage}
                  </p>
                )}
                <div className="mt-5 space-y-2.5">
                  {activeQuestion.content.options.map((option, index) => (
                    <label
                      key={`${activeQuestion.id}-${index}`}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                        selectedOption === index
                          ? 'border-[var(--focus)] bg-[var(--focus)]/8 text-[var(--text)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-sub)] hover:border-[var(--focus)]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`diagnostic-${activeQuestion.id}`}
                        value={index}
                        checked={selectedOption === index}
                        onChange={() => setSelection({ questionKey: `${session.id}:${activeQuestion.id}`, option: index })}
                        className="h-4 w-4 accent-[var(--focus)]"
                      />
                      <span><span className="mr-2 font-bold">{String.fromCharCode(65 + index)}.</span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {diagnostic.error === 'action' && (
                <p role="alert" className="mt-4 text-xs text-[var(--danger)]">
                  Cevap kaydedilemedi. Aynı cevabı güvenle yeniden gönderebilirsin.
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={selectedOption === null || diagnostic.submitting}
                className="btn-primary mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {diagnostic.submitting ? 'Kaydediliyor...' : 'Cevabı kaydet ve devam et'}
                {!diagnostic.submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
              <p className="mt-3 text-center text-[10px] leading-4 text-[var(--text-sub)]">
                Doğru cevap ve çözüm kısa tarama sırasında gösterilmez; böylece sonraki soru seçimi etkilenmez.
              </p>
            </section>
          )}

          {diagnostic.summary && (
            <SummaryCard
              outcomes={diagnostic.summary.outcomes}
              game={requestedScope.game}
              examRef={requestedScope.examRef}
              onPractice={handlePractice}
            />
          )}
        </>
      )}
    </main>
  )
}
