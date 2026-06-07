'use client'

/**
 * Mobil "Anasayfa" demosu — prototipteki (Bilge Arena - Mobil) lobby ekranini
 * GERCEK kod tabaninin parcalariyla yeniden kurar: XPBar ve StreakBadge dogrudan
 * production component'leri, geri kalan kompozisyon gercek tema token'lariyla.
 * Backend gerektirmez; /mobil-demo rotasinda ekran goruntusu / inceleme icin.
 */

import { Settings, ChevronRight, Lock, Check, ArrowRight, Clock } from 'lucide-react'
import { XPBar } from '@/components/game/xp-bar'
import { StreakBadge } from '@/components/game/streak-badge'
import { BottomNav } from '@/components/layout/bottom-nav'

const ME = { emoji: '🦊', level: 3, levelName: 'Bilgin', levelBadge: '🎓', xp: 2340, streak: 12 }
const NEXT = { name: 'Üstad', badge: '⚔️', minXP: 3500 }

const QUESTS = [
  { icon: '🎯', t: '5 soru çöz', cur: 3, max: 5, xp: 50, color: 'var(--focus)' },
  { icon: '🔥', t: 'Seriyi koru', cur: 1, max: 1, xp: 20, color: 'var(--reward)', done: true },
  { icon: '⚔️', t: '1 arena maçı', cur: 0, max: 1, xp: 80, color: 'var(--wisdom)' },
]

const GAMES = [
  { slug: 'wordquest', name: 'Kelime Atölyesi', sub: 'İngilizce', emoji: '🌐', color: '#2563EB', count: 635, ready: true },
  { slug: 'matematik', name: 'Matematik Atölyesi', sub: 'TYT Matematik', emoji: '🧮', color: '#D97706', ready: false },
  { slug: 'turkce', name: 'Türkçe Atölyesi', sub: 'TYT Türkçe', emoji: '📝', color: '#059669', ready: false },
  { slug: 'fen', name: 'Fen Atölyesi', sub: 'TYT Fen', emoji: '🔬', color: '#7C3AED', ready: false },
]

const LEADERBOARD = [
  { name: 'zeynep_yks', emoji: '🦉', xp: 9820 },
  { name: 'matkurdu', emoji: '🐺', xp: 8410 },
  { name: 'efe.06', emoji: '🦅', xp: 6730 },
  { name: 'Sen', emoji: '🦊', xp: 2340, me: true },
]

function SegBar({ pct, color = 'var(--focus)' }: { pct: number; color?: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
      {children}
    </div>
  )
}

export function MobileHomeDemo() {
  const xpInto = ME.xp - 1500 // Bilgin minXP
  const xpSpan = NEXT.minXP - 1500
  const xpLeft = NEXT.minXP - ME.xp

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pb-28 pt-6">
      {/* ── Header ── */}
      <header className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
          style={{
            background: 'linear-gradient(135deg, var(--focus-light)44, var(--focus))',
            border: '2.5px solid var(--focus-border)',
          }}
        >
          {ME.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-[var(--text-sub)]">Tekrar hoş geldin 👋</div>
          <div className="text-base font-bold text-[var(--text)]">
            {ME.levelBadge} {ME.levelName}
          </div>
        </div>
        <StreakBadge streak={ME.streak} />
        <button
          aria-label="Ayarlar"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] text-[var(--text-sub)]"
          style={{ background: 'var(--card)' }}
        >
          <Settings size={18} />
        </button>
      </header>

      {/* ── XP / seviye karti ── */}
      <section
        className="anim-fadeUp relative mt-4 overflow-hidden rounded-[18px] border p-4"
        style={{ background: 'linear-gradient(135deg, var(--card), var(--surface))', borderColor: 'var(--border)' }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full"
          style={{ background: 'radial-gradient(circle, var(--focus-bg), transparent 70%)' }}
        />
        <div className="relative mb-3 flex items-baseline justify-between">
          <div>
            <div className="text-[10px] font-extrabold tracking-[0.14em] text-[var(--text-sub)]">TOPLAM XP</div>
            <div className="font-display text-3xl font-black leading-tight tabular-nums" style={{ color: 'var(--reward)' }}>
              {ME.xp.toLocaleString('tr-TR')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[var(--text-sub)]">Sonraki: {NEXT.badge} {NEXT.name}</div>
            <div className="text-xs font-bold tabular-nums text-[var(--text)]">
              {xpLeft.toLocaleString('tr-TR')} XP kaldı
            </div>
          </div>
        </div>
        <XPBar xp={xpInto} level={ME.level} max={xpSpan} />
      </section>

      {/* ── Gunluk gorevler ── */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <SectionLabel>GÜNLÜK GÖREVLER</SectionLabel>
          <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <Clock size={12} /> 14s 22dk
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {QUESTS.map((q) => (
            <div
              key={q.t}
              className="flex items-center gap-3 rounded-[13px] border border-[var(--border)] px-3.5 py-3"
              style={{ background: 'var(--card)', opacity: q.done ? 0.7 : 1 }}
            >
              <span className="text-xl">{q.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]">
                  {q.t}
                  {q.done && <Check size={13} strokeWidth={3} style={{ color: 'var(--growth)' }} />}
                </div>
                <div className="mt-1.5">
                  <SegBar pct={(q.cur / q.max) * 100} color={q.color} />
                </div>
              </div>
              <span
                className="rounded-md border px-2 py-1 text-[9px] font-extrabold tracking-wider"
                style={{
                  color: q.done ? 'var(--growth)' : 'var(--reward)',
                  borderColor: q.done ? 'var(--growth-border)' : 'var(--reward-border)',
                  background: q.done ? 'var(--growth-bg)' : 'var(--reward-bg)',
                }}
              >
                +{q.xp} XP
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Atolyeler ── */}
      <section className="mt-6">
        <SectionLabel>ATÖLYELER</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          {GAMES.map((g) => (
            <button
              key={g.slug}
              disabled={!g.ready}
              className="card-hover relative overflow-hidden rounded-2xl border p-3.5 text-left"
              style={{
                borderColor: g.ready ? `color-mix(in srgb, ${g.color} 35%, var(--border))` : 'var(--border)',
                background: g.ready
                  ? `linear-gradient(150deg, color-mix(in srgb, ${g.color} 12%, var(--card)), var(--card))`
                  : 'var(--card)',
                opacity: g.ready ? 1 : 0.6,
                cursor: g.ready ? 'pointer' : 'not-allowed',
              }}
            >
              <div className="flex items-start justify-between">
                <span className="text-3xl">{g.emoji}</span>
                {g.ready ? (
                  <span
                    className="rounded-md px-2 py-1 text-[9px] font-extrabold tracking-wider text-white"
                    style={{ background: g.color }}
                  >
                    OYNA
                  </span>
                ) : (
                  <Lock size={15} style={{ color: 'var(--text-muted)' }} />
                )}
              </div>
              <div className="mt-2.5 text-sm font-bold text-[var(--text)]">{g.name}</div>
              <div className="mt-0.5 text-[10.5px] text-[var(--text-sub)]">
                {g.ready ? `${g.count} soru hazır` : 'Yakında'}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Mini siralama ── */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <SectionLabel>HAFTALIK SIRA</SectionLabel>
          <button className="text-[11px] font-bold" style={{ color: 'var(--focus)' }}>
            Tümü →
          </button>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-[var(--border)]" style={{ background: 'var(--card)' }}>
          {LEADERBOARD.map((p, i) => {
            const medals = ['🥇', '🥈', '🥉']
            const rankColor = ['var(--reward)', '#CBD5E1', '#CD7F32'][i] || 'var(--text-sub)'
            return (
              <div
                key={p.name}
                className="flex items-center gap-2.5 px-3.5 py-2.5"
                style={{
                  background: p.me ? 'var(--focus-bg)' : 'transparent',
                  borderLeft: `2px solid ${p.me ? 'var(--focus)' : 'transparent'}`,
                }}
              >
                <span className="font-display w-[18px] text-center text-xs font-black" style={{ color: rankColor }}>
                  {medals[i] || i + 1}
                </span>
                <span className="text-[17px]">{p.emoji}</span>
                <span
                  className="flex-1 text-[12.5px]"
                  style={{ fontWeight: p.me ? 700 : 400, color: p.me ? 'var(--text)' : 'var(--text-sub)' }}
                >
                  {p.name}
                  {p.me ? ' (Sen)' : ''}
                </span>
                <span className="font-display text-xs font-bold tabular-nums" style={{ color: 'var(--reward)' }}>
                  {p.xp.toLocaleString('tr-TR')}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Arena CTA ── */}
      <section className="mt-5">
        <button
          className="anim-glow flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left"
          style={{
            borderColor: 'var(--wisdom-border)',
            background: 'linear-gradient(135deg, var(--wisdom-bg), var(--card))',
            color: 'var(--text)',
          }}
        >
          <span className="text-3xl">⚔️</span>
          <div className="flex-1">
            <div className="text-[15px] font-bold">Arena’da yarış</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--text-sub)]">Arkadaşlarınla canlı oda kur</div>
          </div>
          <ArrowRight size={20} style={{ color: 'var(--wisdom-light)' }} />
        </button>
      </section>

      {/* küçük not */}
      <p className="mt-6 text-center text-[10px] text-[var(--text-muted)]">
        /mobil-demo · prototip → gerçek kod köprüsü · <ChevronRight size={9} className="inline" /> XPBar &amp; StreakBadge gerçek component
      </p>

      <BottomNav activeOverride="lobby" />
    </div>
  )
}
