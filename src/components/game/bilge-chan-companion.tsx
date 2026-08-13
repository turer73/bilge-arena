'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BilgeChan, type ChanPose } from '@/components/ui/bilge-chan'
import { getOptionLetter } from '@/lib/utils/question'
import { supportsStagedCoachPublicQuestion } from '@/lib/coach/question-shape'
import { parseCoachPublicResponse } from '@/lib/coach/public-contract'
import { trackLearningEvent } from '@/lib/analytics/learning-events'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { CHAN_LINES, pickLine } from '@/lib/constants/chan-dialogue'
import { isTtsSupported, speakChanLine, stopChanSpeech } from '@/lib/utils/chan-tts'
import { BilgeTahtaDialog } from '@/components/bilge-tahta'
import { useBilgeTahtaEnabled } from '@/lib/bilge-tahta/client'
import type { BilgeTahtaLesson, BilgeTahtaStage } from '@/lib/bilge-tahta/contract'
import { trackBilgeBoardEvent } from '@/lib/bilge-tahta/analytics'

function Typewriter({ text, speed = 18 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])
  return <span className="whitespace-pre-wrap">{shown}</span>
}

interface BilgeChanCompanionProps {
  attemptId?: string | null
  quizState: string
  lastIsCorrect: boolean | null
  question: PublicQuestion | null
  correctOption?: number | null
  height?: number
  compact?: boolean
  priority?: boolean
  onHelpToggle?: (open: boolean) => void
  className?: string
}

type GuidanceStage = 'hint1' | 'hint2' | 'hint3'
type CoachRequestStage = GuidanceStage | 'solution' | 'transfer'
type Phase =
  | 'intro'
  | 'offered'
  | 'attempt'
  | 'loading'
  | GuidanceStage
  | 'solution'
  | 'transfer'
  | 'transferResult'
  | 'check'
  | 'declined'
  | 'error'

const OFFER_DELAY = 6000

const BOARD_STAGE: Partial<Record<Phase, { stage: BilgeTahtaStage; title: string }>> = {
  hint1: { stage: 'hint1', title: 'İlk ipucu' },
  hint2: { stage: 'hint2', title: 'İkinci ipucu' },
  hint3: { stage: 'small-example', title: 'Küçük örnek' },
  solution: { stage: 'solution', title: 'Çözüm' },
  transferResult: { stage: 'transfer-result', title: 'Transfer sonucu' },
}

function secureRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  throw new Error('secure_request_id_unavailable')
}

export function BilgeChanCompanion({
  attemptId = null,
  quizState,
  lastIsCorrect,
  question,
  correctOption = null,
  height = 240,
  compact = false,
  priority = false,
  onHelpToggle,
  className,
}: BilgeChanCompanionProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [helpMsg, setHelpMsg] = useState('')
  const [sourceLabel, setSourceLabel] = useState<string | null>(null)
  const [policyVersion, setPolicyVersion] = useState<string | null>(null)
  const [transferQuestion, setTransferQuestion] = useState<PublicQuestion | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const progressTokenRef = useRef<string | null>(null)
  const requestIdsRef = useRef<Partial<Record<CoachRequestStage, string>>>({})
  const retryRef = useRef<{ stage: CoachRequestStage; selectedOption?: number } | null>(null)
  const [ttsReady, setTtsReady] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const boardOpenedAtRef = useRef<number | null>(null)

  useEffect(() => {
    setTtsReady(isTtsSupported())
    return () => {
      requestRef.current?.abort()
      stopChanSpeech()
    }
  }, [])

  const easy = question?.difficulty === 1
  const answered = quizState === 'answered'
  const coachEnabled = process.env.NEXT_PUBLIC_COACH_ENABLED === 'true'
  const boardEnabled = useBilgeTahtaEnabled()

  useEffect(() => {
    if (!coachEnabled || !attemptId || phase !== 'intro' || quizState !== 'playing'
      || !supportsStagedCoachPublicQuestion(question?.content)) return
    const timer = setTimeout(() => setPhase('offered'), OFFER_DELAY)
    return () => clearTimeout(timer)
  }, [attemptId, coachEnabled, phase, question?.content, quizState])

  const introMsg = useMemo(
    () => (easy ? pickLine(CHAN_LINES.easyJoke) : pickLine(CHAN_LINES.greet)),
    [easy],
  )
  const answerMsg = useMemo(() => {
    if (!answered || !question || correctOption === null) return ''
    if (correctOption < 0) return 'Süre doldu; sıradaki soruda yeniden dene. 💙'
    const letter = getOptionLetter(correctOption)
    return lastIsCorrect
      ? pickLine(CHAN_LINES.correct).replace('{harf}', letter)
      : pickLine(CHAN_LINES.wrong).replace('{harf}', letter)
  }, [answered, correctOption, lastIsCorrect, question])

  const requestIdFor = (stage: CoachRequestStage) => {
    const existing = requestIdsRef.current[stage]
    if (existing) return existing
    const created = secureRequestId()
    requestIdsRef.current[stage] = created
    return created
  }

  const requestCoach = async (stage: CoachRequestStage, selectedOption?: number) => {
    if (!attemptId || !question || !supportsStagedCoachPublicQuestion(question.content)) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    retryRef.current = { stage, selectedOption }
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 10_000)
    setPhase('loading')
    setSourceLabel(null)
    setPolicyVersion(null)
    setHelpMsg(stage === 'transfer' ? 'Transfer cevabın kontrol ediliyor...' : 'Koç aşaması hazırlanıyor...')

    try {
      const response = await fetch('/api/coach/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          questionId: question.id,
          requestId: requestIdFor(stage),
          stage,
          ...(stage === 'hint1' || stage === 'transfer' ? { selectedOption } : {}),
          ...(stage === 'hint1' ? {} : { token: progressTokenRef.current }),
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('coach_failed')
      const body = parseCoachPublicResponse(await response.json())
      if (!body || body.stage !== stage) throw new Error('invalid_coach_response')
      if (controller.signal.aborted || requestRef.current !== controller) return

      setSourceLabel(body.sourceLabel)
      setPolicyVersion(body.evaluation.policyVersion)
      progressTokenRef.current = body.nextToken
      if (body.stage === 'transfer') {
        const letter = getOptionLetter(body.correctOption)
        setHelpMsg(body.isCorrect
          ? `Transfer sorusu doğru. Yöntemi yeni soruya bağımsız taşıdın. ${body.solution ?? ''}`.trim()
          : `Transfer sorusunda doğru seçenek ${letter}. ${body.solution ?? 'Çözümü yeniden inceleyip asıl soruya dön.'}`.trim())
        setPhase('transferResult')
        trackLearningEvent('CoachTransferResult', {
          game: question.game,
          result: body.isCorrect ? 'correct' : 'incorrect',
          coachDepth: 4,
          timing: 'same_session',
        })
      } else {
        setHelpMsg(body.hint.trim())
        if (body.stage === 'solution') setTransferQuestion(body.transferQuestion)
        setPhase(body.stage)
        trackLearningEvent('CoachStageViewed', {
          game: question.game,
          stage: body.stage,
          result: 'shown',
        })
      }
      retryRef.current = null
    } catch {
      if (requestRef.current !== controller || (controller.signal.aborted && !timedOut)) return
      setHelpMsg('Şu an bu Koç aşaması alınamadı. Aynı isteği güvenle yeniden deneyebilirsin.')
      setPhase('error')
      if (stage !== 'transfer') {
        trackLearningEvent('CoachStageViewed', {
          game: question.game,
          stage,
          result: 'error',
        })
      }
    } finally {
      window.clearTimeout(timeoutId)
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  const handleYes = () => {
    progressTokenRef.current = null
    onHelpToggle?.(true)
    setHelpMsg('Önce kendi ilk denemeni işaretle; bu seçim normal cevabını göndermez.')
    setPhase('attempt')
  }
  const handleNo = () => {
    setHelpMsg(pickLine(CHAN_LINES.encourage))
    setPhase('declined')
  }
  const handleContinue = () => {
    requestRef.current?.abort()
    requestRef.current = null
    retryRef.current = null
    setPhase('check')
    onHelpToggle?.(false)
  }
  const handleNext = () => {
    if (phase === 'hint1') void requestCoach('hint2')
    else if (phase === 'hint2') void requestCoach('hint3')
    else if (phase === 'hint3') void requestCoach('solution')
    else if (phase === 'solution') setPhase('transfer')
  }
  const handleRetry = () => {
    const retry = retryRef.current
    if (retry) void requestCoach(retry.stage, retry.selectedOption)
  }
  if (!question) return null

  let pose: ChanPose
  let message: string
  if (answered) {
    pose = lastIsCorrect ? 'victory' : 'sad'
    message = answerMsg
  } else if (phase === 'attempt') {
    pose = 'reading'
    message = helpMsg
  } else if (phase === 'transfer') {
    pose = 'reading'
    message = 'Şimdi aynı kazanımı yeni bir soruda bağımsız uygula.'
  } else if (['loading', 'hint1', 'hint2', 'hint3', 'solution', 'transferResult', 'error'].includes(phase)) {
    pose = 'reading'
    message = helpMsg
  } else if (phase === 'check') {
    pose = 'idle'
    message = CHAN_LINES.check
  } else if (phase === 'declined') {
    pose = 'idle'
    message = helpMsg
  } else if (phase === 'offered') {
    pose = 'idle'
    message = CHAN_LINES.offer
  } else {
    pose = easy ? 'angry' : 'wave'
    message = introMsg
  }

  const playing = quizState === 'playing'
  const showOfferButtons = phase === 'offered' && playing
  const showGuidanceActions = ['hint1', 'hint2', 'hint3', 'solution'].includes(phase) && playing
  const showReturn = ['loading', 'transferResult', 'error'].includes(phase) && playing
  const bubbleWidth = compact ? 'max-w-[220px]' : 'max-w-[300px]'
  const boardStage = BOARD_STAGE[phase]
  const boardLesson: BilgeTahtaLesson | null = boardStage && helpMsg
    ? {
        mode: 'game',
        subjectLabel: [question.category, question.topic].filter(Boolean).join(' · ') || question.game,
        title: question.topic || question.category || 'Konu anlatımı',
        steps: [{
          id: `coach-${phase}`,
          stage: boardStage.stage,
          title: boardStage.title,
          content: helpMsg,
          ...(sourceLabel ? { sourceLabel } : {}),
          ...(policyVersion ? { guardrailLabel: 'Koruyucu kontrol geçti' } : {}),
        }],
      }
    : null
  const handleBoardOpen = () => {
    boardOpenedAtRef.current = Date.now()
    trackBilgeBoardEvent('BilgeBoardOpened', {
      surface: 'game',
      game: question.game,
      entryPoint: 'coach_stage',
    })
    setBoardOpen(true)
  }
  const handleBoardReturn = () => {
    trackBilgeBoardEvent('BilgeBoardReturnedToQuestion', {
      surface: 'game',
      game: question.game,
      elapsedMs: boardOpenedAtRef.current === null ? -1 : Date.now() - boardOpenedAtRef.current,
    })
    handleContinue()
  }
  const handleBoardComplete = () => {
    trackBilgeBoardEvent('BilgeBoardCompleted', {
      surface: 'game',
      game: question.game,
      stepCount: boardLesson?.steps.length ?? 0,
    })
    handleContinue()
  }

  return (
    <div className={`flex ${compact ? 'flex-row items-center gap-2' : 'flex-col items-center'} ${className ?? ''}`}>
      {message && (
        <div
          aria-live="polite"
          className={`relative ${compact ? 'order-2' : 'mb-2'} w-full ${bubbleWidth} rounded-2xl border border-[var(--focus-border)] bg-[var(--card)] px-3 py-2 text-xs leading-relaxed text-[var(--text)] shadow-md`}
        >
          <Typewriter key={message} text={message} />
          {ttsReady && message && (
            <button
              onClick={() => speakChanLine(message)}
              aria-label="Repliği sesli oku"
              title="Bilge Chan konuşsun"
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--focus-border)] bg-[var(--card)] text-[11px] shadow transition-transform hover:scale-110 active:scale-95"
            >
              🔉
            </button>
          )}

          {sourceLabel && policyVersion && (
            <div className="mt-2 rounded-md bg-[var(--surface)] px-2 py-1 text-[10px] text-[var(--text-sub)]">
              Kaynak: {sourceLabel} · Koruyucu kontrol geçti
            </div>
          )}

          {boardEnabled && boardLesson && playing && (
            <button
              type="button"
              onClick={handleBoardOpen}
              className="mt-2 min-h-11 w-full rounded-lg border border-emerald-300/30 bg-emerald-700 px-2 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              🧑‍🏫 Tahtada anlat
            </button>
          )}

          {showOfferButtons && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleYes}
                className="min-h-11 flex-1 rounded-lg bg-[var(--growth)] px-2 py-2 text-[11px] font-bold text-white transition-transform hover:scale-105 active:scale-95"
              >
                Evet
              </button>
              <button
                onClick={handleNo}
                className="min-h-11 flex-1 rounded-lg bg-[var(--urgency)] px-2 py-2 text-[11px] font-bold text-white transition-transform hover:scale-105 active:scale-95"
              >
                Hayır
              </button>
            </div>
          )}

          {phase === 'attempt' && (
            <fieldset className="mt-2">
              <legend className="sr-only">Koç öncesi ilk denemeni seç</legend>
              <div className="grid grid-cols-2 gap-2">
                {question.content.options.map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => void requestCoach('hint1', index)}
                    aria-label={`İlk deneme ${getOptionLetter(index)}: ${option}`}
                    className="min-h-11 rounded-lg border border-[var(--focus-border)] bg-[var(--surface)] px-2 py-2 text-left text-[11px] font-semibold hover:bg-[var(--cardHover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  >
                    <span className="mr-1 font-black">{getOptionLetter(index)}</span>
                    <span className="line-clamp-2">{option}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {showGuidanceActions && (
            <div className="mt-2 flex flex-col gap-2">
              <button
                onClick={handleNext}
                className="min-h-11 w-full rounded-lg bg-[var(--wisdom)] px-2 py-2 text-[11px] font-bold text-white transition-transform hover:scale-[1.02] active:scale-95"
              >
                {phase === 'hint1'
                  ? 'İkinci ipucunu al'
                  : phase === 'hint2'
                    ? 'Küçük örneği gör'
                    : phase === 'hint3'
                      ? 'Çözümü göster'
                      : 'Transfer sorusuna geç'}
              </button>
              <button
                onClick={handleContinue}
                className="min-h-11 w-full rounded-lg bg-[var(--focus)] px-2 py-2 text-[11px] font-bold text-white transition-transform hover:scale-[1.02] active:scale-95"
              >
                Soruyu çözmeye dön →
              </button>
            </div>
          )}

          {phase === 'transfer' && transferQuestion && (
            <fieldset className="mt-2">
              <legend className="mb-2 font-semibold">{transferQuestion.content.question}</legend>
              <div className="flex flex-col gap-2">
                {transferQuestion.content.options.map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => void requestCoach('transfer', index)}
                    className="min-h-11 rounded-lg border border-[var(--focus-border)] bg-[var(--surface)] px-2 py-2 text-left text-[11px] font-semibold hover:bg-[var(--cardHover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  >
                    <span className="mr-1 font-black">{getOptionLetter(index)}</span>{option}
                  </button>
                ))}
              </div>
              <button
                onClick={handleContinue}
                className="mt-2 min-h-11 w-full rounded-lg bg-[var(--focus)] px-2 py-2 text-[11px] font-bold text-white"
              >
                Transferi atla ve soruya dön
              </button>
            </fieldset>
          )}

          {phase === 'error' && retryRef.current && (
            <button
              onClick={handleRetry}
              className="mt-2 min-h-11 w-full rounded-lg bg-[var(--wisdom)] px-2 py-2 text-[11px] font-bold text-white"
            >
              Aynı aşamayı yeniden dene
            </button>
          )}
          {showReturn && (
            <button
              onClick={handleContinue}
              className="mt-2 min-h-11 w-full rounded-lg bg-[var(--focus)] px-2 py-2 text-[11px] font-bold text-white"
            >
              Soruyu çözmeye dön →
            </button>
          )}

          {!compact && (
            <span
              className="absolute -bottom-2 left-8 h-0 w-0"
              style={{
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop: '8px solid var(--card)',
              }}
            />
          )}
        </div>
      )}
      <BilgeChan
        pose={pose}
        height={height}
        priority={priority}
        className={`animate-chan-idle motion-reduce:animate-none ${compact ? 'order-1' : ''}`}
      />
      {boardLesson && (
        <BilgeTahtaDialog
          open={boardOpen && playing}
          lesson={boardLesson}
          onOpenChange={setBoardOpen}
          onReturn={handleBoardReturn}
          onComplete={handleBoardComplete}
          onStepViewed={(index) => trackBilgeBoardEvent('BilgeBoardStageViewed', {
            surface: 'game',
            game: question.game,
            stage: boardLesson.steps[index].stage,
            stepIndex: index,
          })}
        />
      )}
    </div>
  )
}

export default BilgeChanCompanion
