'use client'

import { useEffect, useState } from 'react'

interface AdminStats {
  totalUsers: number
  totalQuestions: number
  totalSessions: number
  totalAnswers: number
  pendingReports: number
}

const DEFAULT_STATS: AdminStats = {
  totalUsers: 0,
  totalQuestions: 0,
  totalSessions: 0,
  totalAnswers: 0,
  pendingReports: 0,
}

function buildStatCards(stats: AdminStats) {
  return [
    { label: 'Toplam Kullanici', value: stats.totalUsers, icon: '👥', color: 'var(--focus)' },
    { label: 'Toplam Oturum', value: stats.totalSessions, icon: '🎮', color: 'var(--reward)' },
    { label: 'Toplam Cevap', value: stats.totalAnswers, icon: '✅', color: 'var(--growth)' },
    { label: 'Soru Sayisi', value: stats.totalQuestions, icon: '📝', color: 'var(--focus)' },
    { label: 'Bekleyen Rapor', value: stats.pendingReports, icon: '🐛', color: 'var(--urgency)' },
  ]
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats')
        if (!res.ok) throw new Error('Istatistikler yuklenemedi')
        const data = await res.json()
        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const statCards = buildStatCards(stats)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-[var(--text-sub)]">Bilge Arena yonetim paneli</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--urgency)] bg-[color-mix(in_srgb,var(--urgency)_10%,transparent)] p-3 text-xs text-[var(--urgency)]">
          {error}
        </div>
      )}

      {/* Stat kartlari */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {statCards.map((stat, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl">{stat.icon}</span>
            </div>
            <div className="mt-2 font-display text-2xl font-black" style={{ color: stat.color }}>
              {loading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-[var(--border)]" />
              ) : (
                stat.value.toLocaleString()
              )}
            </div>
            <div className="mt-1 text-[10px] font-bold tracking-wider text-[var(--text-sub)]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* 2 sutunlu alt alan */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hizli erisim */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
          <h3 className="mb-4 text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            HIZLI OZET
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-xs">Toplam Soru</span>
              <span className="font-bold text-[var(--focus)]">{stats.totalQuestions.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-xs">Toplam Oturum</span>
              <span className="font-bold text-[var(--reward)]">{stats.totalSessions.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-xs">Bekleyen Rapor</span>
              <span className={`font-bold ${stats.pendingReports > 0 ? 'text-[var(--urgency)]' : 'text-[var(--growth)]'}`}>
                {stats.pendingReports}
              </span>
            </div>
          </div>
        </div>

        {/* Hizli linkler */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
          <h3 className="mb-4 text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            HIZLI ERISIM
          </h3>
          <div className="flex flex-col gap-2">
            {[
              { label: 'Soru Yonetimi', href: '/admin/sorular', icon: '📝', desc: 'Sorulari goruntule ve duzenle' },
              { label: 'Kullanicilar', href: '/admin/kullanicilar', icon: '👥', desc: 'Kullanici listesi ve yonetimi' },
              { label: 'Hata Raporlari', href: '/admin/raporlar', icon: '🐛', desc: 'Bekleyen raporlari incele' },
              { label: 'Site Ayarlari', href: '/admin/ayarlar', icon: '⚙️', desc: 'Platform yapilandirmasi' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-lg bg-[var(--surface)] px-4 py-3 transition-colors hover:bg-[var(--card)]"
              >
                <span className="text-lg">{link.icon}</span>
                <div className="flex-1">
                  <div className="text-xs font-bold">{link.label}</div>
                  <div className="text-[10px] text-[var(--text-sub)]">{link.desc}</div>
                </div>
                <span className="text-[10px] text-[var(--text-sub)]">→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
