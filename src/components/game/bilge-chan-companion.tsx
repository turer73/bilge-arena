'use client'

import { useState, useEffect, useMemo } from 'react'
import { BilgeChan, type ChanPose } from '@/components/ui/bilge-chan'
import { getCorrectIndex, getOptionLetter } from '@/lib/utils/question'
import type { Question } from '@/types/database'
import { CHAN_LINES, pickLine } from '@/lib/constants/chan-dialogue'

interface BilgeChanCompanionProps {
  /** quizStore.state: 'playing' | 'answered' | 'completed' */
  quizState: string
  /** Son cevap doğru mu (answered iken anlamlı) */
  lastIsCorrect: boolean | null
  /** Aktif soru */
  question: Question | null
  className?: string
}

/**
 * Faz akışı. Parent her yeni soruda `key={currentIndex}` ile remount eder,
 * böylece her soru 'intro' fazından taze başlar (effect-içi setState yok).
 */
type Phase = 'intro' | 'offered' | 'help' | 'declined'

/** Yardım teklifinin görüneceği gecikme (ms). */
const OFFER_DELAY = 6000

/**
 * Bilge Chan — quiz companion. Soru akışına göre pose + konuşma balonu;
 * "yardıma ihtiyacın var mı?" → EVET ise çözümü gösterir.
 * Pose/mesaj render-time türetilir; tek effect yalnızca teklif zamanlayıcısıdır.
 */
export function BilgeChanCompanion({
  quizState,
  lastIsCorrect,
  question,
  className,
}: BilgeChanCompanionProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [helpMsg, setHelpMsg] = useState('')

  const easy = question?.difficulty === 1
  const answered = quizState === 'answered'

  // intro → offered: setState yalnızca timer callback'inde (effect-body'de değil)
  useEffect(() => {
    if (phase !== 'intro' || quizState !== 'playing') return
    const t = setTimeout(() => setPhase('offered'), OFFER_DELAY)
    return () => clearTimeout(t)
  }, [phase, quizState])

  // Rastgele replikler: mount başına sabit (key-remount her soruda tazeler)
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

  return (
    <div className={`flex flex-col items-center ${className ?? ''}`}>
      {message && (
        <div className="relative mb-2 w-full max-w-[240px] rounded-2xl border border-[var(--focus-border)] bg-[var(--card)] px-3 py-2 text-xs leading-relaxed text-[var(--text)] shadow-md">
          {message}
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
          {/* Balon oku (sol-alt, karaktere doğru) */}
          <span
            className="absolute -bottom-2 left-8 h-0 w-0"
            style={{
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '8px solid var(--card)',
            }}
          />
        </div>
      )}
      <BilgeChan pose={pose} height={240} />
    </div>
  )
}

export default BilgeChanCompanion
