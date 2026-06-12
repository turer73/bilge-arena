'use client'

import { useState, useEffect, useMemo } from 'react'
import { BilgeChan, type ChanPose } from '@/components/ui/bilge-chan'
import { getCorrectIndex, getOptionLetter } from '@/lib/utils/question'
import type { Question } from '@/types/database'
import { CHAN_LINES, pickLine } from '@/lib/constants/chan-dialogue'

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
  className?: string
}

/**
 * Faz akışı. Parent her yeni soruda `key={currentIndex}` ile remount eder,
 * böylece her soru 'intro' fazından taze başlar.
 */
type Phase = 'intro' | 'offered' | 'help' | 'check' | 'declined'

/** Yardım teklifi gecikmesi (ms). */
const OFFER_DELAY = 6000
/** Açıklamadan sonra "anlayabildin mi?" gecikmesi (ms). */
const CHECK_DELAY = 7000

/**
 * Bilge Chan — kişilikli quiz companion. Soru akışına göre pose + konuşma
 * balonu (typewriter); "yardıma ihtiyacın var mı?" → EVET çözümü gösterir,
 * sonra "anlayabildin mi?" diye kontrol eder. Cevap verilince victory/sad.
 */
export function BilgeChanCompanion({
  quizState,
  lastIsCorrect,
  question,
  height = 240,
  compact = false,
  priority = false,
  className,
}: BilgeChanCompanionProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [helpMsg, setHelpMsg] = useState('')

  const easy = question?.difficulty === 1
  const answered = quizState === 'answered'

  // intro → offered: setState yalnızca timer callback'inde
  useEffect(() => {
    if (phase !== 'intro' || quizState !== 'playing') return
    const t = setTimeout(() => setPhase('offered'), OFFER_DELAY)
    return () => clearTimeout(t)
  }, [phase, quizState])

  // help → check ("anlayabildin mi?")
  useEffect(() => {
    if (phase !== 'help') return
    const t = setTimeout(() => setPhase('check'), CHECK_DELAY)
    return () => clearTimeout(t)
  }, [phase])

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

  const handleYes = () => {
    const sol = question?.content.solution
    setHelpMsg(sol ? `${CHAN_LINES.explainIntro} ${sol}` : CHAN_LINES.noSolution)
    setPhase('help')
  }
  const handleNo = () => {
    setHelpMsg(pickLine(CHAN_LINES.encourage))
    setPhase('declined')
  }

  if (!question) return null

  // Pose + mesaj türetimi (effect yok) — cevap verildiyse reaksiyon önceliklidir
  let pose: ChanPose
  let message: string
  if (answered) {
    pose = lastIsCorrect ? 'victory' : 'sad'
    message = answerMsg
  } else if (phase === 'help') {
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
      <BilgeChan pose={pose} height={height} priority={priority} className={compact ? 'order-1' : ''} />
    </div>
  )
}

export default BilgeChanCompanion
