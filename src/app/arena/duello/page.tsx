'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import type { Challenge } from '@/types/database'
import { Swords, Clock, Trophy, X, Check, Loader2 } from 'lucide-react'

export default function DuelloPage() {
  const { user } = useAuthStore()
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetch('/api/challenges')
      .then(r => r.json())
      .then(d => setChallenges(d.challenges || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Swords className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
        <h1 className="text-xl font-bold">Giris yaparak duello yapabilirsin</h1>
        <Link href="/giris" className="mt-4 inline-block rounded-lg bg-[var(--focus)] px-6 py-2 text-sm font-bold text-white">
          Giris Yap
        </Link>
      </div>
    )
  }

  const pending = challenges.filter(c => c.status === 'pending' && c.opponent_id === user.id)
  const active = challenges.filter(c => c.status === 'accepted' || (c.status === 'pending' && c.challenger_id === user.id))
  const completed = challenges.filter(c => c.status === 'completed')

  const handleAction = async (id: string, action: 'accept' | 'decline') => {
    const res = await fetch(`/api/challenges/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      setChallenges(prev => prev.map(c => c.id === id ? { ...c, status: action === 'accept' ? 'accepted' : 'declined' } : c))
    }
  }

  const getName = (c: Challenge, who: 'challenger' | 'opponent') => {
    const p = c[who]
    if (!p) return 'Bilinmeyen'
    return p.username || p.display_name || 'Bilinmeyen'
  }

  const getOpponent = (c: Challenge) => {
    return c.challenger_id === user.id ? getName(c, 'opponent') : getName(c, 'challenger')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <Swords className="h-6 w-6 text-[var(--reward)]" />
        <h1 className="font-display text-2xl font-bold">Duellolar</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--focus)]" />
        </div>
      ) : challenges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <Swords className="mx-auto mb-3 h-10 w-10 text-[var(--text-muted)]" />
          <p className="text-sm font-medium">Henuz duello yok</p>
          <p className="mt-1 text-xs text-[var(--text-sub)]">
            Arkadaslar sayfasindan birini sec ve meydan oku!
          </p>
          <Link
            href="/arena/arkadaslar"
            className="mt-4 inline-block rounded-lg bg-[var(--focus)] px-5 py-2 text-xs font-bold text-white"
          >
            Arkadaslarima Git
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Gelen meydan okumalar */}
          {pending.length > 0 && (
            <section>
              <h2 className="mb-2 text-[10px] font-extrabold tracking-widest text-[var(--reward)]">
                GELEN MEYDAN OKUMALAR ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map(c => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--reward)]/30 bg-[var(--reward)]/5 p-3">
                    <Swords className="h-5 w-5 text-[var(--reward)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{getName(c, 'challenger')}</p>
                      <p className="text-[10px] text-[var(--text-sub)]">
                        {GAMES[c.game as GameSlug]?.name || c.game} · {c.question_ids.length} soru
                      </p>
                    </div>
                    <button onClick={() => handleAction(c.id, 'accept')} className="rounded-lg bg-[var(--growth)] px-3 py-1.5 text-[10px] font-bold text-white">
                      <Check size={12} className="inline mr-1" />Kabul
                    </button>
                    <button onClick={() => handleAction(c.id, 'decline')} className="rounded-lg bg-[var(--urgency)]/20 px-3 py-1.5 text-[10px] font-bold text-[var(--urgency)]">
                      <X size={12} className="inline mr-1" />Reddet
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Aktif duellolar */}
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 text-[10px] font-extrabold tracking-widest text-[var(--focus)]">
                AKTIF ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map(c => {
                  const myScore = c.challenger_id === user.id ? c.challenger_score : c.opponent_score
                  const canPlay = c.status === 'accepted' && !myScore
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3">
                      <Clock className="h-5 w-5 text-[var(--focus)]" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">vs {getOpponent(c)}</p>
                        <p className="text-[10px] text-[var(--text-sub)]">
                          {GAMES[c.game as GameSlug]?.name || c.game} · {c.status === 'pending' ? 'Cevap bekleniyor' : myScore ? 'Rakip bekleniyor' : 'Senin siran'}
                        </p>
                      </div>
                      {canPlay && (
                        <Link href={`/arena/duello/${c.id}`} className="rounded-lg bg-[var(--focus)] px-4 py-1.5 text-[10px] font-bold text-white">
                          Oyna →
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Tamamlananlar */}
          {completed.length > 0 && (
            <section>
              <h2 className="mb-2 text-[10px] font-extrabold tracking-widest text-[var(--text-sub)]">
                TAMAMLANAN ({completed.length})
              </h2>
              <div className="space-y-2">
                {completed.map(c => {
                  const won = c.winner_id === user.id
                  const draw = !c.winner_id
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3 opacity-80">
                      <Trophy className={`h-5 w-5 ${won ? 'text-[var(--reward)]' : draw ? 'text-[var(--text-muted)]' : 'text-[var(--urgency)]'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">vs {getOpponent(c)}</p>
                        <p className="text-[10px] text-[var(--text-sub)]">
                          {GAMES[c.game as GameSlug]?.name || c.game} · {won ? `Kazandin! +${c.xp_reward} XP` : draw ? 'Berabere' : 'Kaybettin'}
                        </p>
                      </div>
                      <span className={`text-xs font-bold ${won ? 'text-[var(--reward)]' : draw ? 'text-[var(--text-muted)]' : 'text-[var(--urgency)]'}`}>
                        {c.challenger_score?.correct ?? '?'} - {c.opponent_score?.correct ?? '?'}
                      </span>
                    </div>
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
