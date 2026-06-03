'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { OptionButton } from '@/components/game/option-button'
import { playSound } from '@/lib/utils/sounds'
import { toast } from '@/stores/toast-store'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import type { Question, Challenge } from '@/types/database'
import type { OptionState } from '@/components/game/option-button'
import { Loader2, Swords, Trophy, Clock } from 'lucide-react'

export default function DuelloGamePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()

  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<{ questionId: string; selectedOption: number; timeTaken: number }[]>([])
  const [state, setState] = useState<'loading' | 'playing' | 'answered' | 'result' | 'error'>('loading')
  const [selectedOption, setSelectedOption] = useState(-1)
  const [startTime, setStartTime] = useState(Date.now())
  const [submitResult, setSubmitResult] = useState<{ score: { correct: number; total: number }; result: string; winnerId?: string } | null>(null)

  // Shuffle mapping: shuffledIndex → originalIndex (sunucuya orijinal index gondermek icin)
  const shuffleMapRef = useRef<Map<string, number[]>>(new Map())

  // Duello ve sorulari yukle
  useEffect(() => {
    if (!user || !id) return

    const load = async () => {
      try {
        // Madde 9 #9: tek payload /api/challenges/[id] — challenge + questions
        const res = await fetch(`/api/challenges/${encodeURIComponent(id)}`, {
          cache: 'no-store',
        })
        if (!res.ok) { setState('error'); return }
        const data = await res.json() as { challenge: Challenge; questions: Question[] }

        if (!data.challenge) { setState('error'); return }
        setChallenge(data.challenge)

        const ordered = data.questions ?? []
        if (ordered.length === 0) { setState('error'); return }

        // Sik sirasini karistir + mapping kaydet.
        // Dogru cevap client'a gelmiyor (server strip ediyor); shuffle yalniz
        // secenek sirasini bozar, mapping ile orijinal index sunucuya gonderilir.
        const maps = new Map<string, number[]>()
        const shuffled = ordered.map(q => {
          const indices = q.content.options.map((_: string, i: number) => i)
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[indices[i], indices[j]] = [indices[j], indices[i]]
          }
          maps.set(q.id, indices)
          return {
            ...q,
            content: {
              ...q.content,
              options: indices.map((i: number) => q.content.options[i]),
            },
          }
        })
        shuffleMapRef.current = maps

        setQuestions(shuffled)
        setState('playing')
        setStartTime(Date.now())
      } catch {
        setState('error')
      }
    }
    load()
  }, [user, id])

  const question = questions[currentIndex]

  const handleAnswer = useCallback((optionIndex: number) => {
    if (state !== 'playing' || !question) return

    const timeTaken = (Date.now() - startTime) / 1000

    setSelectedOption(optionIndex)
    setState('answered')

    // Dogru cevap client'ta yok — duello sirasinda dogru/yanlis gosterilmez
    // (rekabet butunlugu). Notr secim sesi; kazandi/kaybetti sesi duello sonunda.
    playSound('click')

    // Sunucuya orijinal index gonder (shuffle mapping ile)
    const originalOption = shuffleMapRef.current.get(question.id)?.[optionIndex] ?? optionIndex

    setAnswers(prev => [...prev, {
      questionId: question.id,
      selectedOption: originalOption,
      timeTaken,
    }])

    // 1.5 sn sonra sonraki soruya gec
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1)
        setSelectedOption(-1)
        setState('playing')
        setStartTime(Date.now())
      } else {
        // Tum sorular bitti — sonuclari gonder
        submitAnswers([...answers, { questionId: question.id, selectedOption: originalOption, timeTaken }])
      }
    }, 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, question, currentIndex, questions.length, answers, startTime])

  const submitAnswers = async (finalAnswers: typeof answers) => {
    setState('result')
    try {
      const res = await fetch(`/api/challenges/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers }),
      })
      const data = await res.json()
      setSubmitResult(data)

      if (data.result === 'completed' && data.winnerId === user?.id) {
        playSound('level_up')
        toast.success(`Duello kazandin! +${challenge?.xp_reward || 50} XP`)
      } else if (data.result === 'completed') {
        playSound('game_over')
      }
    } catch {
      toast.error('Sonuc gonderilemedi')
    }
  }

  const getOptionState = (idx: number): OptionState => {
    if (state !== 'answered') return 'idle'
    // Duello sirasinda dogru cevap gosterilmez (cevap client'a gelmiyor).
    // Secilen sik vurgulanir, digerleri soner.
    if (idx === selectedOption) return 'selected'
    return 'dim'
  }

  // Loading
  if (state === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--focus)]" />
      </div>
    )
  }

  // Error
  if (state === 'error') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-[var(--urgency)]">Duello bulunamadi veya yuklenmedi.</p>
        <button onClick={() => router.push('/arena/duello')} className="mt-4 rounded-lg bg-[var(--focus)] px-5 py-2 text-xs font-bold text-white">
          Duellolara Don
        </button>
      </div>
    )
  }

  // Result
  if (state === 'result') {
    // Skor sunucudan gelir (client dogru cevabi bilmez); gelene kadar '…'
    const correct = submitResult?.score.correct ?? null
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <Swords className="mx-auto mb-4 h-12 w-12 text-[var(--reward)]" />
        <h1 className="font-display text-2xl font-bold mb-2">Duello Tamamlandi!</h1>
        <div className="mb-4 text-4xl font-black text-[var(--focus)]">
          {correct}/{questions.length}
        </div>

        {submitResult?.result === 'completed' ? (
          <div className={`mb-4 rounded-xl p-4 ${submitResult.winnerId === user?.id ? 'bg-[var(--growth)]/15 text-[var(--growth)]' : submitResult.winnerId ? 'bg-[var(--urgency)]/15 text-[var(--urgency)]' : 'bg-[var(--surface)] text-[var(--text-sub)]'}`}>
            <Trophy className="mx-auto mb-2 h-8 w-8" />
            <p className="font-bold">
              {submitResult.winnerId === user?.id ? `Kazandin! +${challenge?.xp_reward || 50} XP` : submitResult.winnerId ? 'Kaybettin!' : 'Berabere!'}
            </p>
          </div>
        ) : submitResult?.result === 'waiting_opponent' ? (
          <div className="mb-4 rounded-xl bg-[var(--surface)] p-4 text-[var(--text-sub)]">
            <Clock className="mx-auto mb-2 h-8 w-8" />
            <p className="font-bold">Rakibin oynamasini bekliyorsun</p>
          </div>
        ) : null}

        <button onClick={() => router.push('/arena/duello')} className="rounded-xl bg-[var(--focus)] px-8 py-3 text-sm font-bold text-white">
          Duellolara Don
        </button>
      </div>
    )
  }

  // Playing
  if (!question) return null
  const gameDef = GAMES[challenge?.game as GameSlug]
  const questionText = question.content.question || question.content.sentence || ''

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-[var(--reward)]" />
          <span className="text-sm font-bold">Duello</span>
          {gameDef && (
            <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${gameDef.colorHex}20`, color: gameDef.colorHex }}>
              {gameDef.name}
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-[var(--text-sub)]">
          {currentIndex + 1}/{questions.length}
        </span>
      </div>

      {/* Soru */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <p className="text-sm font-medium leading-relaxed">{questionText}</p>
      </div>

      {/* Secenekler */}
      <div className="flex flex-col gap-2">
        {question.content.options.map((opt, idx) => (
          <OptionButton
            key={`${currentIndex}-${idx}`}
            index={idx}
            text={opt}
            state={getOptionState(idx)}
            onClick={() => handleAnswer(idx)}
            delay={idx * 55}
          />
        ))}
      </div>
    </div>
  )
}
