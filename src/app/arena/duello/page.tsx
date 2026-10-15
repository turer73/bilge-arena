'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Clock3,
  Loader2,
  LogIn,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import type { Challenge } from '@/types/database'

const MOBILE_ARENA_STYLE = `
  @media (max-width: 1023px) {
    [data-app-navbar] { display: none !important; }
    [data-arena-main] { background: var(--app-bg) !important; padding: 0 !important; }
  }
`

function profileName(challenge: Challenge, who: 'challenger' | 'opponent') {
  const profile = challenge[who]
  return profile?.username || profile?.display_name || 'Arena oyuncusu'
}

function gameName(challenge: Challenge) {
  return GAMES[challenge.game as GameSlug]?.name || challenge.game
}

function PlayerMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] text-sm font-black uppercase text-[var(--app-accent-text)]"
    >
      {name.trim().charAt(0) || '?'}
    </span>
  )
}

export default function DuelloPage() {
  const { user } = useAuthStore()
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    let active = true
    const loadChallenges = async () => {
      try {
        const response = await fetch('/api/challenges', { cache: 'no-store' })
        if (!response.ok) throw new Error('Duellolar yüklenemedi')
        const data = await response.json() as { challenges?: Challenge[] }
        if (active) setChallenges(data.challenges || [])
      } catch {
        if (active) setLoadError('Düello listesi şu an alınamadı. Biraz sonra yeniden deneyebilirsin.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadChallenges()
    return () => { active = false }
  }, [user])

  const pending = user
    ? challenges.filter((challenge) => challenge.status === 'pending' && challenge.opponent_id === user.id)
    : []
  const activeChallenges = user
    ? challenges.filter((challenge) => challenge.status === 'accepted' || (challenge.status === 'pending' && challenge.challenger_id === user.id))
    : []
  const completed = challenges.filter((challenge) => challenge.status === 'completed')

  const handleAction = async (id: string, action: 'accept' | 'decline') => {
    setActionId(id)
    try {
      const response = await fetch(`/api/challenges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) throw new Error('İşlem tamamlanamadı')
      setChallenges((current) => current.map((challenge) => challenge.id === id
        ? { ...challenge, status: action === 'accept' ? 'accepted' : 'declined' }
        : challenge))
    } catch {
      setLoadError('Meydan okuma güncellenemedi. Lütfen yeniden dene.')
    } finally {
      setActionId(null)
    }
  }

  const getOpponent = (challenge: Challenge) => {
    if (!user) return 'Arena oyuncusu'
    return challenge.challenger_id === user.id
      ? profileName(challenge, 'opponent')
      : profileName(challenge, 'challenger')
  }

  if (!user) {
    return (
      <div data-duel-screen className="mx-auto min-h-dvh w-full max-w-[1180px] overflow-x-clip bg-[var(--app-bg)] px-3 pb-28 pt-3 text-[var(--app-text)] sm:px-4 md:px-5 md:pt-5 lg:bg-transparent lg:px-6 lg:pb-10 lg:pt-8">
        <style>{MOBILE_ARENA_STYLE}</style>
        <section data-duel-hero className="relative min-h-[430px] overflow-hidden rounded-[28px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-5 shadow-[0_7px_0_var(--app-accent-border)] md:min-h-[480px] md:p-9">
          <Image src="/academy/academy-landscape.png" alt="" fill priority sizes="(min-width: 1024px) 1120px, 100vw" className="pointer-events-none object-cover object-center opacity-45" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--app-card)] via-[var(--app-card)]/95 to-[var(--app-card)]/25" />
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border-[52px] border-[var(--app-accent)]/10" />
          <div className="relative z-10 flex min-h-[385px] max-w-2xl flex-col justify-center md:min-h-[405px]">
            <span className="flex h-16 w-16 items-center justify-center rounded-[22px] border-2 border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)] shadow-[0_5px_0_var(--app-warn-border)]"><Swords size={31} strokeWidth={2.4} /></span>
            <p className="mt-6 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--app-accent-text)]"><Sparkles size={14} /> Arena karşılaşması</p>
            <h1 className="mt-2 max-w-xl font-display text-4xl font-black leading-[1.05] md:text-5xl">Bilgini rakibinle karşılaştır.</h1>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-[var(--app-text-sub)] md:text-base">Arkadaşına meydan oku, aynı soruları çöz ve sonucu güvenli sunucu puanlamasıyla gör.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-black">
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)]/90 px-3"><ShieldCheck size={14} /> Aynı sorular</span>
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)]/90 px-3"><Zap size={14} /> XP ödülü</span>
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)]/90 px-3"><Clock3 size={14} /> Asenkron oyun</span>
            </div>
            <Link href="/giris?next=%2Farena%2Fduello" className="mt-7 inline-flex min-h-12 w-fit items-center gap-2 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] transition-transform active:translate-y-1 active:shadow-none"><LogIn size={18} /> Giriş yap ve düelloya katıl</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div data-duel-screen className="mx-auto min-h-dvh w-full max-w-[1180px] overflow-x-clip bg-[var(--app-bg)] px-3 pb-28 pt-3 text-[var(--app-text)] sm:px-4 md:px-5 md:pt-5 lg:bg-transparent lg:px-6 lg:pb-10 lg:pt-8">
      <style>{MOBILE_ARENA_STYLE}</style>

      <header data-duel-hero className="relative min-h-[238px] overflow-hidden rounded-[26px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-5 shadow-[0_6px_0_var(--app-accent-border)] md:min-h-[280px] md:p-7">
        <Image src="/academy/academy-landscape.png" alt="" fill priority sizes="(min-width: 1024px) 1120px, 100vw" className="pointer-events-none object-cover object-center opacity-40" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--app-card)] via-[var(--app-card)]/95 to-[var(--app-card)]/25" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[44px] border-[var(--app-warn)]/10" />
        <div className="relative z-10 max-w-[76%] md:max-w-2xl">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-[var(--app-accent-text)]"><Sparkles size={14} /> Arena karşılaşması</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-3xl font-black md:text-4xl"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]"><Swords size={25} strokeWidth={2.6} /></span>Düello Merkezi</h1>
          <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-[var(--app-text-sub)] md:text-base">Arkadaşlarınla aynı sorularda karşılaş. Sıra sende olduğunda oyna, sonucu iki taraf da bitirince gör.</p>
          <div className="mt-4 hidden flex-wrap gap-2 text-[10px] font-black sm:flex">
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)]/90 px-3"><ShieldCheck size={14} /> Cevaplar gizli</span>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)]/90 px-3"><Zap size={14} /> Kazanana XP</span>
          </div>
        </div>
        <div className="absolute bottom-5 right-4 z-10 flex flex-col items-end gap-2 md:bottom-7 md:right-7">
          <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[var(--app-warn-border)] bg-[var(--app-card)]/90 font-display text-2xl font-black text-[var(--app-warn-ink)] shadow-[0_6px_0_var(--app-warn-border)] md:h-24 md:w-24 md:text-3xl">VS</div>
          <Link href="/arena/arkadaslar" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--app-accent)] px-4 text-xs font-black text-white shadow-[0_4px_0_var(--app-accent-strong)]"><UserPlus size={16} /> <span className="hidden sm:inline">Rakip seç</span><ArrowRight size={15} /></Link>
        </div>
      </header>

      <section data-duel-summary aria-label="Düello özeti" className="mt-5 grid grid-cols-3 gap-2.5 md:gap-4">
        <div className="rounded-[18px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] p-3 shadow-[0_4px_0_var(--app-warn-border)] md:flex md:items-center md:gap-3 md:p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]"><Swords size={18} /></span><div className="mt-2 md:mt-0"><strong className="block text-xl font-black leading-none">{pending.length}</strong><span className="mt-1 block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--app-text-muted)]">Gelen</span></div></div>
        <div className="rounded-[18px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-3 shadow-[0_4px_0_var(--app-accent-border)] md:flex md:items-center md:gap-3 md:p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><Zap size={18} /></span><div className="mt-2 md:mt-0"><strong className="block text-xl font-black leading-none">{activeChallenges.length}</strong><span className="mt-1 block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--app-text-muted)]">Aktif</span></div></div>
        <div className="rounded-[18px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-3 shadow-[0_4px_0_var(--app-border)] md:flex md:items-center md:gap-3 md:p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--app-success-tint)] text-[var(--app-success-ink)]"><Trophy size={18} /></span><div className="mt-2 md:mt-0"><strong className="block text-xl font-black leading-none">{completed.length}</strong><span className="mt-1 block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--app-text-muted)]">Biten</span></div></div>
      </section>

      {loadError && <div role="alert" className="mt-5 rounded-[18px] border-2 border-[var(--app-danger-border)] bg-[var(--app-danger-tint)] p-4 text-xs font-bold text-[var(--app-danger-ink)]">{loadError}</div>}

      {loading ? (
        <div role="status" className="mt-5 flex min-h-[260px] items-center justify-center rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)]"><Loader2 className="h-8 w-8 animate-spin text-[var(--app-accent)]" /><span className="sr-only">Duellolar yükleniyor</span></div>
      ) : pending.length + activeChallenges.length + completed.length === 0 ? (
        <section data-duel-section className="mt-5 flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-[var(--app-accent-border)] bg-[var(--app-card)] px-6 py-10 text-center">
          <span className="relative flex h-20 w-20 items-center justify-center rounded-[26px] bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><Swords size={36} strokeWidth={2.2} /><Sparkles size={16} className="absolute -right-1 -top-1 text-[var(--app-warn-ink)]" /></span>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.17em] text-[var(--app-accent-text)]">İlk karşılaşman</p>
          <h2 className="mt-1 text-xl font-black">Arena seni ve rakibini bekliyor.</h2>
          <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-[var(--app-text-sub)]">Arkadaşlar sayfasından bir oyuncu ve ders seçerek ilk meydan okumanı gönderebilirsin.</p>
          <Link href="/arena/arkadaslar" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)]"><Users size={17} /> Arkadaşlardan rakip seç <ArrowRight size={16} /></Link>
        </section>
      ) : (
        <div className="mt-5 space-y-5">
          {pending.length > 0 && (
            <section data-duel-section aria-labelledby="incoming-duels" className="rounded-[24px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-warn-border)] md:p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-warn-ink)]">Kararını bekliyor</p><h2 id="incoming-duels" className="mt-1 text-lg font-black">Gelen meydan okumalar</h2></div><span className="rounded-xl bg-[var(--app-warn-tint)] px-3 py-1.5 text-xs font-black text-[var(--app-warn-ink)]">{pending.length}</span></div>
              <div className="grid gap-3 md:grid-cols-2">
                {pending.map((challenge) => {
                  const challengerName = profileName(challenge, 'challenger')
                  return (
                    <article key={challenge.id} className="rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4">
                      <div className="flex items-center gap-3"><PlayerMark name={challengerName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{challengerName}</p><p className="mt-0.5 text-[10px] font-bold text-[var(--app-text-muted)]">{gameName(challenge)} · {challenge.question_ids.length} soru</p></div><span className="rounded-lg bg-[var(--app-warn-tint)] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--app-warn-ink)]">Meydan okudu</span></div>
                      <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={actionId === challenge.id} onClick={() => handleAction(challenge.id, 'accept')} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--app-success-solid)] px-3 text-xs font-black text-white shadow-[0_3px_0_var(--app-success)] disabled:opacity-60"><Check size={15} /> Kabul et</button><button type="button" disabled={actionId === challenge.id} onClick={() => handleAction(challenge.id, 'decline')} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-3 text-xs font-black text-[var(--app-text-sub)] disabled:opacity-60"><X size={15} /> Reddet</button></div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {activeChallenges.length > 0 && (
            <section data-duel-section aria-labelledby="active-duels" className="rounded-[24px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-accent-border)] md:p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Karşılaşma alanı</p><h2 id="active-duels" className="mt-1 text-lg font-black">Aktif düellolar</h2></div><span className="rounded-xl bg-[var(--app-accent-tint)] px-3 py-1.5 text-xs font-black text-[var(--app-accent-text)]">{activeChallenges.length}</span></div>
              <div className="space-y-3">
                {activeChallenges.map((challenge) => {
                  const opponentName = getOpponent(challenge)
                  const myScore = challenge.challenger_id === user.id ? challenge.challenger_score : challenge.opponent_score
                  const canPlay = challenge.status === 'accepted' && !myScore
                  const statusText = challenge.status === 'pending' ? 'Rakibin yanıtı bekleniyor' : myScore ? 'Rakibin oyunu bekleniyor' : 'Sıra sende'
                  return (
                    <article key={challenge.id} className="flex flex-wrap items-center gap-3 rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-4 md:flex-nowrap">
                      <PlayerMark name={opponentName} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">Sen <span className="mx-1 text-[var(--app-warn-ink)]">VS</span> {opponentName}</p><p className="mt-0.5 text-[10px] font-bold text-[var(--app-text-muted)]">{gameName(challenge)} · {challenge.question_ids.length} soru</p></div>
                      <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-black ${canPlay ? 'bg-[var(--app-success-tint)] text-[var(--app-success-ink)]' : 'bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]'}`}>{canPlay ? <Zap size={13} /> : <Clock3 size={13} />}{statusText}</span>
                      {canPlay && <Link href={`/arena/duello/${challenge.id}`} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--app-accent)] px-4 text-xs font-black text-white shadow-[0_4px_0_var(--app-accent-strong)]">Düelloyu oyna <ArrowRight size={15} /></Link>}
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section data-duel-section aria-labelledby="completed-duels" className="rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-border)] md:p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Düello geçmişi</p><h2 id="completed-duels" className="mt-1 text-lg font-black">Tamamlananlar</h2></div><Trophy className="text-[var(--app-warn-ink)]" size={23} /></div>
              <div className="grid gap-3 md:grid-cols-2">
                {completed.map((challenge) => {
                  const won = challenge.winner_id === user.id
                  const draw = !challenge.winner_id
                  const resultLabel = won ? `Kazandın · +${challenge.xp_reward} XP` : draw ? 'Berabere' : 'Bu kez rakibin kazandı'
                  return (
                    <article key={challenge.id} className="flex items-center gap-3 rounded-[18px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-3.5">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${won ? 'bg-[var(--app-success-tint)] text-[var(--app-success-ink)]' : draw ? 'bg-[var(--app-hover)] text-[var(--app-text-muted)]' : 'bg-[var(--app-danger-tint)] text-[var(--app-danger-ink)]'}`}><Trophy size={19} /></span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">vs {getOpponent(challenge)}</p><p className={`mt-0.5 text-[10px] font-black ${won ? 'text-[var(--app-success-ink)]' : draw ? 'text-[var(--app-text-muted)]' : 'text-[var(--app-danger-ink)]'}`}>{resultLabel}</p></div>
                      <span aria-label="Düello skoru" className="rounded-xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-3 py-2 font-display text-sm font-black">{challenge.challenger_score?.correct ?? '?'} <span className="text-[var(--app-text-muted)]">–</span> {challenge.opponent_score?.correct ?? '?'}</span>
                    </article>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
