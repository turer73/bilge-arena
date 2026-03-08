'use client'

import { Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'

const USERS = [
  { rank: 1, name: 'Zeynep K.', city: 'Istanbul', xp: 12840, level: 'Efsane', streak: 28, badge: '\uD83D\uDC51' },
  { rank: 2, name: 'Mert A.', city: 'Ankara', xp: 11200, level: 'Efsane', streak: 21, badge: '\uD83E\uDD48' },
  { rank: 3, name: 'Elif B.', city: 'Izmir', xp: 9650, level: 'Uzman', streak: 15, badge: '\uD83E\uDD49' },
  { rank: 4, name: 'Ahmet Y.', city: 'Bursa', xp: 8120, level: 'Uzman', streak: 12, badge: '4' },
  { rank: 5, name: 'Selin T.', city: 'Antalya', xp: 7340, level: 'Azimli', streak: 9, badge: '5' },
]

export function LeaderboardPreview() {
  return (
    <section className="bg-[var(--bg)] py-24">
      <div className="mx-auto grid max-w-[1200px] items-center gap-16 px-6 lg:grid-cols-2 lg:px-8">
        {/* Sol — Metin */}
        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--reward-light)]">
            Liderboard
          </div>
          <h2 className="font-display text-4xl font-black lg:text-[42px]">
            <span className="text-[var(--text)]">Zirvedeki </span>
            <span className="text-[var(--reward-light)]">Bilgeler</span>
          </h2>
          <p className="mt-4 text-[var(--text-sub)] leading-relaxed lg:text-lg">
            Her hafta sıfırlanan haftalık turnuva. En çok XP kazanan öğrenci zirvede yer alır.
          </p>
          <Button
            variant="gold"
            size="md"
            className="mt-8"
          >
            <Trophy size={16} />
            Sıralamayı Gör
          </Button>
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
          {USERS.map((u) => (
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
                  {u.city} &middot; {u.streak}\uD83D\uDD25 seri
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
            <span className="cursor-pointer text-sm font-semibold text-[var(--focus-light)] hover:underline">
              Tüm listeyi gör &rarr;
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
