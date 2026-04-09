'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface LeaderUser {
  rank: number
  name: string
  xp: number
  streak: number
  badge: string
}

const BADGES = ['👑', '🥈', '🥉', '4', '5']

interface LeaderboardPreviewProps {
  config?: Record<string, unknown>
}

export function LeaderboardPreview({ config }: LeaderboardPreviewProps = {}) {
  const [users, setUsers] = useState<LeaderUser[]>([])
  const title = (config?.title as string) || undefined
  const description = (config?.description as string) || 'Her hafta sıfırlanan haftalık turnuva. En çok XP kazanan öğrenci zirvede yer alır.'
  const buttonText = (config?.button_text as string) || 'Sıralamayı Gör'

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('username, display_name, total_xp, current_streak')
      .order('total_xp', { ascending: false })
      .gt('total_xp', 0)
      .limit(5)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setUsers(data.map((p, i) => ({
            rank: i + 1,
            name: p.username || p.display_name || `Oyuncu ${i + 1}`,
            xp: p.total_xp || 0,
            streak: p.current_streak || 0,
            badge: BADGES[i] || String(i + 1),
          })))
        }
      })
  }, [])
  return (
    <section className="bg-[var(--bg)] py-24">
      <div className="mx-auto grid max-w-[1200px] items-center gap-16 px-6 lg:grid-cols-2 lg:px-8">
        {/* Sol — Metin */}
        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--reward-light)]">
            Liderboard
          </div>
          <h2 className="font-display text-4xl font-black lg:text-[42px]">
            {title ? (
              <span className="text-[var(--text)]">{title}</span>
            ) : (
              <>
                <span className="text-[var(--text)]">Zirvedeki </span>
                <span className="text-[var(--reward-light)]">Bilgeler</span>
              </>
            )}
          </h2>
          <p className="mt-4 text-[var(--text-sub)] leading-relaxed lg:text-lg">
            {description}
          </p>
          <Link href="/arena/siralama">
            <Button
              variant="gold"
              size="md"
              className="mt-8"
            >
              <Trophy size={16} />
              {buttonText}
            </Button>
          </Link>
        </div>

        {/* Sag — Tablo */}
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          {/* Baslik */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <span className="text-sm font-bold">Bu Haftanın Liderleri</span>
            <span className="rounded-full bg-[var(--focus-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--focus-light)]">
              Canlı
            </span>
          </div>

          {/* Satirlar */}
          {users.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">
              Henüz oyuncu yok — ilk sen ol!
            </div>
          )}
          {users.map((u) => (
            <div
              key={u.rank}
              className="flex items-center gap-4 border-b border-[var(--border)] px-6 py-3.5 transition-colors"
              style={u.rank === 1 ? { background: 'var(--reward-bg)' } : undefined}
            >
              {/* Siralama */}
              <div className={`w-8 text-center font-extrabold ${u.rank <= 3 ? 'text-lg' : 'text-sm text-[var(--text-muted)]'}`}>
                {u.badge}
              </div>

              {/* Avatar */}
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--focus)] to-[var(--wisdom)] text-sm font-bold text-white">
                {u.name[0]}
              </div>

              {/* Isim */}
              <div className="flex-1">
                <div className="text-sm font-bold">{u.name}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {u.streak > 0 ? `${u.streak}🔥 seri` : 'Yeni oyuncu'}
                </div>
              </div>

              {/* XP */}
              <div className="text-right">
                <div className="text-sm font-extrabold text-[var(--reward-light)]">
                  {u.xp.toLocaleString('tr-TR')}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">XP</div>
              </div>
            </div>
          ))}

          {/* Tum listeyi gor */}
          <div className="py-3.5 text-center">
            <Link href="/arena/siralama" className="text-sm font-semibold text-[var(--focus-light)] hover:underline">
              Tüm listeyi gör &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
