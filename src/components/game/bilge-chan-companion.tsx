'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { BilgeChan, type ChanPose } from '@/components/ui/bilge-chan'
import { getCorrectIndex, getOptionLetter } from '@/lib/utils/question'
import { supportsStagedCoachQuestion } from '@/lib/coach/question-shape'
import type { Question } from '@/types/database'
import { CHAN_LINES, pickLine } from '@/lib/constants/chan-dialogue'
import { isTtsSupported, speakChanLine, stopChanSpeech } from '@/lib/utils/chan-tts'

/**
 * Typewriter — metni harf harf yazar. Parent `key={text}` ile remount eder;
 * setState yalnızca interval callback'inde (effect-body değil) → React19 temiz.
 */
function Typewriter({ text, speed = 26 }: { text: string; speed?: number }) {
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
  return <span>{shown}</span>
}

interface BilgeChanCompanionProps {
  /** quizStore.state: 'playing' | 'answered' | 'completed' */
  quizState: string
  /** Son cevap doğru mu (answered iken anlamlı) */
  lastIsCorrect: boolean | null
  /** Aktif soru */
  question: Question | null
  /** Pose yüksekliği (px) */
  height?: number
  /** Mobil/dar yerleşim: balon yanda, daha küçük */
  compact?: boolean
  /**
   * next/image preload (LCP). Varsayılan kapalı: quiz'de iki instance da
   * mount olur (lg:hidden + hidden lg:flex), breakpoint'te gizli olan
   * preload edilmemeli (Codex P2).
   */
  priority?: boolean
  /** 'yardim' balonu açılınca/kapanınca — parent per-soru sayacını duraklatır */
  onHelpToggle?: (open: boolean) => void
  className?: string
}

/**
 * Faz akışı. Parent her yeni soruda `key={currentIndex}` ile remount eder,
 * böylece her soru 'intro' fazından taze başlar.
 */
type Phase =
  | 'intro'
  | 'offered'
  | 'loading'
  | 'hint1'
  | 'hint2'
  | 'hint3'
  | 'solution'
  | 'check'
  | 'declined'
  | 'error'

/** Yardım teklifi gecikmesi (ms). */
const OFFER_DELAY = 6000

/**
 * Bilge Chan — kişilikli quiz companion. Soru akışına göre pose + konuşma
 * balonu (typewriter); "yardıma ihtiyacın var mı?" → kademeli 3 ipucu →
 * kullanıcı isterse çözüm. Client serbest prompt göndermez; server yalnız
 * questionId+stage ve sonraki aşamalar için imzalı token kabul eder. Cevap
 * verilince victory/sad.
 */
export function BilgeChanCompanion({
  quizState,
  lastIsCorrect,
  question,
  height = 240,
  compact = false,
  priority = false,
  onHelpToggle,
  className,
}: BilgeChanCompanionProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [helpMsg, setHelpMsg] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const progressTokenRef = useRef<string | null>(null)
  // TTS destegi hydration-sonrasi belirlenir (SSR'da speechSynthesis yok)
  const [ttsReady, setTtsReady] = useState(false)
  useEffect(() => {
    setTtsReady(isTtsSupported())
    // Soru degisiminde (remount) yarim kalan konusmayi kes
    return () => {
      requestRef.current?.abort()
      stopChanSpeech()
    }
  }, [])

  const easy = question?.difficulty === 1
  const answered = quizState === 'answered'

  // intro → offered: setState yalnızca timer callback'inde
  useEffect(() => {
    if (phase !== 'intro' || quizState !== 'playing' || !supportsStagedCoachQuestion(question?.content)) return
    const t = setTimeout(() => setPhase('offered'), OFFER_DELAY)
    return () => clearTimeout(t)
  }, [phase, question?.content, quizState])

  // Yardım fazları OTOMATİK geçmez: öğrenci ipuçları arasında kendi ilerler;
  // bu sırada per-soru sayacı parent'ta durur.

  const introMsg = useMemo(
    () => (easy ? pickLine(CHAN_LINES.easyJoke) : pickLine(CHAN_LINES.greet)),
    [easy],
  )
  const answerMsg = useMemo(() => {
    if (!answered || !question) return ''
    const letter = getOptionLetter(getCorrectIndex(question.content))
    return lastIsCorrect
      ? pickLine(CHAN_LINES.correct).replace('{harf}', letter)
      : pickLine(CHAN_LINES.wrong).replace('{harf}', letter)
  }, [answered, lastIsCorrect, question])

  const requestHint = async (stage: 'hint1' | 'hint2' | 'hint3' | 'solution') => {
    if (!question || !supportsStagedCoachQuestion(question.content)) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 10_000)
    setPhase('loading')
    setHelpMsg('İpucu hazırlanıyor...')
    try {
      const response = await fetch('/api/coach/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          stage,
          ...(stage === 'hint1' ? {} : { token: progressTokenRef.current }),
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('hint_failed')
      const body = (await response.json()) as { stage?: string; hint?: string; nextToken?: string | null }
      if (body.stage !== stage || !body.hint?.trim()
        || (stage !== 'solution' && !body.nextToken)) throw new Error('invalid_hint')
      if (controller.signal.aborted || requestRef.current !== controller) return
      progressTokenRef.current = body.nextToken ?? null
      setHelpMsg(body.hint.trim())
      setPhase(stage)
    } catch (error) {
      if (requestRef.current !== controller || (controller.signal.aborted && !timedOut)) return
      setHelpMsg('Şu an ipucu alınamadı. Biraz sonra yeniden deneyebilirsin.')
      setPhase('error')
    } finally {
      window.clearTimeout(timeoutId)
      if (requestRef.current === controller) requestRef.current = null
    }
  }
  const handleYes = () => {
    progressTokenRef.current = null
    onHelpToggle?.(true) // sayaç kademeli yardım boyunca dursun
    void requestHint('hint1')
  }
  const handleNo = () => {
    setHelpMsg(pickLine(CHAN_LINES.encourage))
    setPhase('declined')
  }
  const handleContinue = () => {
    requestRef.current?.abort()
    requestRef.current = null
    setPhase('check')
    onHelpToggle?.(false) // sayaç kaldığı yerden devam etsin
  }
  const handleNextHint = () => {
    if (phase === 'hint1') void requestHint('hint2')
    else if (phase === 'hint2') void requestHint('hint3')
    else if (phase === 'hint3') void requestHint('solution')
  }

  if (!question) return null

  // Pose + mesaj türetimi (effect yok) — cevap verildiyse reaksiyon önceliklidir
  let pose: ChanPose
  let message: string
  if (answered) {
    pose = lastIsCorrect ? 'victory' : 'sad'
    message = answerMsg
  } else if (['loading', 'hint1', 'hint2', 'hint3', 'solution', 'error'].includes(phase)) {
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
  const showButtons = phase === 'offered' && !answered
  const showHelpActions = ['loading', 'hint1', 'hint2', 'hint3', 'solution', 'error'].includes(phase) && !answered

  const bubbleWidth = compact ? 'max-w-[190px]' : 'max-w-[260px]'

  return (
    <div
      className={`flex ${compact ? 'flex-row items-center gap-2' : 'flex-col items-center'} ${className ?? ''}`}
    >
      {message && (
        <div
          className={`relative ${compact ? 'order-2' : 'mb-2'} w-full ${bubbleWidth} rounded-2xl border border-[var(--focus-border)] bg-[var(--card)] px-3 py-2 text-xs leading-relaxed text-[var(--text)] shadow-md`}
        >
          <Typewriter key={message} text={message} />
          {ttsReady && message && (
            <button
              onClick={() => speakChanLine(message)}
              aria-label="Repliği sesli oku"
              title="Bilge Chan konuşsun"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--focus-border)] bg-[var(--card)] text-[10px] shadow transition-transform hover:scale-110 active:scale-95"
            >
              🔉
            </button>
          )}
          {showButtons && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleYes}
                className="flex-1 rounded-lg bg-[var(--growth)] px-2 py-1 text-[11px] font-bold text-white transition-transform hover:scale-105 active:scale-95"
              >
                Evet
              </button>
              <button
                onClick={handleNo}
                className="flex-1 rounded-lg bg-[var(--urgency)] px-2 py-1 text-[11px] font-bold text-white transition-transform hover:scale-105 active:scale-95"
              >
                Hayır
              </button>
            </div>
          )}
          {/* Kademeli yardım boyunca süre durur; öğrenci ipucu/çözüm arasında
              kendi ilerler veya istediği anda soruya döner. */}
          {showHelpActions && (
            <div className="mt-2 flex flex-col gap-1.5">
              {['hint1', 'hint2', 'hint3'].includes(phase) && (
                <button
                  onClick={handleNextHint}
                  className="w-full rounded-lg bg-[var(--wisdom)] px-2 py-1.5 text-[11px] font-bold text-white transition-transform hover:scale-105 active:scale-95"
                >
                  {phase === 'hint3' ? 'Çözümü göster' : 'Bir ipucu daha'}
                </button>
              )}
              <button
                onClick={handleContinue}
                className="w-full rounded-lg bg-[var(--focus)] px-2 py-1.5 text-[11px] font-bold text-white transition-transform hover:scale-105 active:scale-95"
              >
                Soruyu çözmeye dön →
              </button>
            </div>
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
      {/* Idle nefes animasyonu — reduced-motion tercihine saygili */}
      <BilgeChan
        pose={pose}
        height={height}
        priority={priority}
        className={`animate-chan-idle motion-reduce:animate-none ${compact ? 'order-1' : ''}`}
      />
    </div>
  )
}

export default BilgeChanCompanion
