'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Clock3,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { OptionButton } from '@/components/game/option-button'
import { playSound } from '@/lib/utils/sounds'
import { renderRichText } from '@/lib/utils/rich-text'
import { toast } from '@/stores/toast-store'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import type { Question, Challenge } from '@/types/database'
import type { OptionState } from '@/components/game/option-button'

const MOBILE_ARENA_STYLE = `
  @media (max-width: 1023px) {
    [data-app-navbar] { display: none !important; }
    [data-arena-main] { background: var(--app-bg) !important; padding: 0 !important; }
  }
`

function DuelStage({ children }: { children: ReactNode }) {
  return (
    <div data-duel-game className="mx-auto min-h-dvh w-full max-w-[1060px] overflow-x-clip bg-[var(--app-bg)] px-3 pb-28 pt-3 text-[var(--app-text)] sm:px-4 md:px-5 md:pt-5 lg:bg-transparent lg:px-6 lg:pb-10 lg:pt-8">
      <style>{MOBILE_ARENA_STYLE}</style>
      {children}
    </div>
  )
}

function playerName(challenge: Challenge | null, userId?: string) {
  if (!challenge || !userId) return 'Rakibin'
  const profile = challenge.challenger_id === userId ? challenge.opponent : challenge.challenger
  return profile?.username || profile?.display_name || 'Arena oyuncusu'
}

function PlayerBadge({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[18px] border-2 p-3 ${active ? 'border-[var(--app-accent-border)] bg-[var(--app-accent-tint)]' : 'border-[var(--app-border)] bg-[var(--app-card-sunken)]'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${active ? 'bg-[var(--app-accent)] text-white' : 'bg-[var(--app-card)] text-[var(--app-text-muted)]'}`}><UserRound size={19} /></span>
      <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.13em] text-[var(--app-text-muted)]">{active ? 'Sıra sende' : 'Rakip'}</p><p className="truncate text-xs font-black">{label}</p></div>
    </div>
  )
}

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

  // Shuffle mapping: shuffledIndex → originalIndex (sunucuya orijinal index göndermek için)
  const shuffleMapRef = useRef<Map<string, number[]>>(new Map())

  // Düello ve soruları tek güvenli payload ile yükle.
  useEffect(() => {
    if (!user || !id) return

    let active = true
    const load = async () => {
      try {
        const response = await fetch(`/api/challenges/${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (!response.ok) {
          if (active) setState('error')
          return
        }
        const data = await response.json() as { challenge: Challenge; questions: Question[] }
        if (!data.challenge || !data.questions?.length) {
          if (active) setState('error')
          return
        }

        const maps = new Map<string, number[]>()
        const shuffled = data.questions.map((question) => {
          const indices = question.content.options.map((_: string, index: number) => index)
          for (let index = indices.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1))
            ;[indices[index], indices[randomIndex]] = [indices[randomIndex], indices[index]]
          }
          maps.set(question.id, indices)
          return {
            ...question,
            content: {
              ...question.content,
              options: indices.map((index: number) => question.content.options[index]),
            },
          }
        })

        if (!active) return
        shuffleMapRef.current = maps
        setChallenge(data.challenge)
        setQuestions(shuffled)
        setState('playing')
        setStartTime(Date.now())
      } catch {
        if (active) setState('error')
      }
    }

    load()
    return () => { active = false }
  }, [user, id])

  const question = questions[currentIndex]

  const submitAnswers = async (finalAnswers: typeof answers) => {
    setState('result')
    try {
      const response = await fetch(`/api/challenges/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers }),
      })
      if (!response.ok) throw new Error('Sonuç gönderilemedi')
      const data = await response.json()
      setSubmitResult(data)

      if (data.result === 'completed' && data.winnerId === user?.id) {
        playSound('level_up')
        toast.success(`Düelloyu kazandın! +${challenge?.xp_reward || 50} XP`)
      } else if (data.result === 'completed') {
        playSound('game_over')
      }
    } catch {
      toast.error('Sonuç gönderilemedi')
    }
  }

  const handleAnswer = useCallback((optionIndex: number) => {
    if (state !== 'playing' || !question) return

    const timeTaken = (Date.now() - startTime) / 1000
    const originalOption = shuffleMapRef.current.get(question.id)?.[optionIndex] ?? optionIndex
    const latestAnswer = { questionId: question.id, selectedOption: originalOption, timeTaken }

    setSelectedOption(optionIndex)
    setState('answered')
    playSound('click')
    setAnswers((current) => [...current, latestAnswer])

    // Rekabet bütünlüğü için doğru cevap gösterilmeden kısa bir kayıt anı bırakılır.
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((current) => current + 1)
        setSelectedOption(-1)
        setState('playing')
        setStartTime(Date.now())
      } else {
        submitAnswers([...answers, latestAnswer])
      }
    }, 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, question, currentIndex, questions.length, answers, startTime])

  const getOptionState = (index: number): OptionState => {
    if (state !== 'answered') return 'idle'
    return index === selectedOption ? 'selected' : 'dim'
  }

  if (state === 'loading') {
    return (
      <DuelStage>
        <section role="status" className="flex min-h-[520px] flex-col items-center justify-center rounded-[28px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] px-6 text-center shadow-[0_7px_0_var(--app-accent-border)]">
          <span className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><Loader2 className="h-9 w-9 animate-spin" /></span>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-accent-text)]">Arena hazırlanıyor</p>
          <h1 className="mt-1 text-xl font-black">Sorular güvenli biçimde yükleniyor.</h1>
        </section>
      </DuelStage>
    )
  }

  if (state === 'error') {
    return (
      <DuelStage>
        <section role="alert" className="flex min-h-[520px] flex-col items-center justify-center rounded-[28px] border-2 border-[var(--app-danger-border)] bg-[var(--app-card)] px-6 text-center shadow-[0_7px_0_var(--app-danger-border)]">
          <span className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-[var(--app-danger-tint)] text-[var(--app-danger-ink)]"><Swords size={36} /></span>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-danger-ink)]">Karşılaşma açılamadı</p>
          <h1 className="mt-1 text-xl font-black">Düello bulunamadı veya henüz hazır değil.</h1>
          <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-[var(--app-text-sub)]">Meydan okumanın kabul edildiğini kontrol edip Düello Merkezi’nden tekrar deneyebilirsin.</p>
          <button type="button" onClick={() => router.push('/arena/duello')} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)]"><ArrowLeft size={17} /> Düello Merkezi’ne dön</button>
        </section>
      </DuelStage>
    )
  }

  if (state === 'result') {
    const correct = submitResult?.score.correct
    const isComplete = submitResult?.result === 'completed'
    const won = isComplete && submitResult?.winnerId === user?.id
    const draw = isComplete && !submitResult?.winnerId
    const waiting = submitResult?.result === 'waiting_opponent'

    return (
      <DuelStage>
        <section data-duel-result className="relative overflow-hidden rounded-[28px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] px-5 py-10 text-center shadow-[0_7px_0_var(--app-accent-border)] md:px-10 md:py-14">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border-[46px] border-[var(--app-warn)]/10" />
          <span className={`relative mx-auto flex h-24 w-24 items-center justify-center rounded-[30px] border-2 shadow-[0_6px_0_var(--app-border)] ${won ? 'border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]' : 'border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] text-[var(--app-accent)]'}`}>{won ? <Trophy size={44} /> : waiting ? <Clock3 size={42} /> : <Swords size={42} />}</span>
          <p className="mt-7 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-accent-text)]">Düello turun tamamlandı</p>
          <h1 className="mt-2 font-display text-3xl font-black md:text-4xl">{won ? 'Zafer senin!' : draw ? 'Başa baş mücadele!' : isComplete ? 'Bu kez rakibin önde.' : waiting ? 'Hamleni yaptın.' : 'Sonuç hesaplanıyor.'}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-6 text-[var(--app-text-sub)]">{waiting ? `${playerName(challenge, user?.id)} oynadığında kesin sonuç burada oluşacak.` : isComplete ? 'Her iki oyuncunun puanı sunucuda hesaplandı ve karşılaşma tamamlandı.' : 'Cevapların güvenli şekilde gönderiliyor.'}</p>

          <div className="mx-auto mt-7 grid max-w-xl grid-cols-2 gap-3">
            <div className="rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4"><p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--app-text-muted)]">Doğru cevap</p><strong className="mt-1 block font-display text-3xl font-black text-[var(--app-accent-text)]">{correct ?? '…'}<span className="text-base text-[var(--app-text-muted)]">/{questions.length}</span></strong></div>
            <div className="rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4"><p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--app-text-muted)]">Ödül</p><strong className="mt-1 flex items-center justify-center gap-1.5 font-display text-3xl font-black text-[var(--app-warn-ink)]"><Zap size={21} fill="currentColor" />{won ? challenge?.xp_reward || 50 : 0}<span className="text-xs">XP</span></strong></div>
          </div>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => router.push('/arena/duello')} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] sm:w-auto"><Swords size={17} /> Düello Merkezi</button>
            <button type="button" onClick={() => router.push('/arena/arkadaslar')} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-6 text-sm font-black text-[var(--app-text-sub)] sm:w-auto">Yeni rakip bul <ArrowRight size={17} /></button>
          </div>
        </section>
      </DuelStage>
    )
  }

  if (!question) return null

  const gameDefinition = GAMES[challenge?.game as GameSlug]
  const questionText = question.content.question || question.content.sentence || ''
  const opponent = playerName(challenge, user?.id)
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0

  return (
    <DuelStage>
      <header data-duel-battle-header className="overflow-hidden rounded-[24px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-accent-border)]">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--app-border-soft)] px-4 py-3 md:px-5">
          <button type="button" onClick={() => router.push('/arena/duello')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl text-xs font-black text-[var(--app-text-sub)] hover:text-[var(--app-accent-text)]"><ArrowLeft size={16} /> <span className="hidden sm:inline">Düello Merkezi</span></button>
          <div className="flex items-center gap-2"><Swords size={19} className="text-[var(--app-warn-ink)]" /><span className="font-display text-base font-black">Düello</span>{gameDefinition && <span className="rounded-lg px-2 py-1 text-[9px] font-black" style={{ backgroundColor: `${gameDefinition.colorHex}18`, color: gameDefinition.colorHex }}>{gameDefinition.name}</span>}</div>
          <span className="rounded-xl bg-[var(--app-accent-tint)] px-3 py-2 text-xs font-black text-[var(--app-accent-text)]">{currentIndex + 1}/{questions.length}</span>
        </div>
        <div className="px-4 py-4 md:px-5">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--app-text-muted)]"><ShieldCheck size={13} className="text-[var(--app-success-ink)]" /> Cevaplar tur bitene kadar gizli</div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--app-border-soft)]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--app-accent)] to-[var(--app-warn)] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
        </div>
      </header>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <main data-duel-question className="min-w-0 rounded-[26px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_6px_0_var(--app-border)] md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]"><Sparkles size={14} /> Düello sorusu</p><p className="mt-1 text-xs font-bold text-[var(--app-text-muted)]">{state === 'answered' ? 'Cevabın kaydedildi' : 'Hamleni seç'}</p></div>
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${state === 'answered' ? 'bg-[var(--app-success-tint)] text-[var(--app-success-ink)]' : 'bg-[var(--app-accent-tint)] text-[var(--app-accent)]'}`}>{state === 'answered' ? <ShieldCheck size={22} /> : <Zap size={21} />}</span>
          </div>

          <div className="my-5 h-px bg-[var(--app-border-soft)]" />
          <h1 className="text-lg font-black leading-7 md:text-xl md:leading-8">{renderRichText(questionText)}</h1>

          <div className="mt-6 flex flex-col gap-3">
            {question.content.options.map((option, index) => (
              <OptionButton key={`${currentIndex}-${index}`} index={index} text={option} state={getOptionState(index)} onClick={() => handleAnswer(index)} delay={index * 55} />
            ))}
          </div>

          <p aria-live="polite" className="mt-5 flex min-h-6 items-center justify-center gap-1.5 text-center text-[10px] font-bold text-[var(--app-text-muted)]">{state === 'answered' ? <><Loader2 size={13} className="animate-spin" /> Sonraki hamle hazırlanıyor…</> : <><ShieldCheck size={13} /> Doğru cevap rakibine gösterilmez.</>}</p>
        </main>

        <aside data-duel-versus className="rounded-[24px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-warn-border)] lg:sticky lg:top-[calc(var(--navbar-h)+1.5rem)]">
          <p className="text-center text-[9px] font-black uppercase tracking-[0.17em] text-[var(--app-warn-ink)]">Karşılaşma</p>
          <div className="mt-3 space-y-2.5"><PlayerBadge label="Sen" active /><div className="relative flex items-center justify-center"><div className="h-px flex-1 bg-[var(--app-border)]" /><span className="mx-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] font-display text-sm font-black text-[var(--app-warn-ink)]">VS</span><div className="h-px flex-1 bg-[var(--app-border)]" /></div><PlayerBadge label={opponent} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-[var(--app-card-sunken)] p-3 text-center"><Award size={17} className="mx-auto text-[var(--app-warn-ink)]" /><p className="mt-1 text-[9px] font-black uppercase text-[var(--app-text-muted)]">Ödül</p><p className="mt-0.5 text-xs font-black">{challenge?.xp_reward || 50} XP</p></div>
            <div className="rounded-2xl bg-[var(--app-card-sunken)] p-3 text-center"><Clock3 size={17} className="mx-auto text-[var(--app-accent)]" /><p className="mt-1 text-[9px] font-black uppercase text-[var(--app-text-muted)]">Biçim</p><p className="mt-0.5 text-xs font-black">Sıralı</p></div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--app-accent-tint)] p-3 text-[10px] font-semibold leading-4 text-[var(--app-accent-text)]"><RotateCcw size={14} className="mt-0.5 shrink-0" /><span>Her iki oyuncu da aynı soru setini çözer; şık sıraları değişebilir.</span></div>
        </aside>
      </div>
    </DuelStage>
  )
}
