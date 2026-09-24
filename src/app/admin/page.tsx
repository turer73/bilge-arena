'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, CircleAlert, CircleCheck, ClipboardList, Gamepad2, Settings2, Users, type LucideIcon } from 'lucide-react'

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

function buildStatCards(stats: AdminStats): Array<{ label: string; value: number; Icon: LucideIcon; color: string }> {
  return [
    { label: 'Toplam kullanıcı', value: stats.totalUsers, Icon: Users, color: 'var(--focus)' },
    { label: 'Toplam oturum', value: stats.totalSessions, Icon: Gamepad2, color: 'var(--reward)' },
    { label: 'Toplam cevap', value: stats.totalAnswers, Icon: CircleCheck, color: 'var(--growth)' },
    { label: 'Soru sayısı', value: stats.totalQuestions, Icon: BookOpen, color: 'var(--focus)' },
    { label: 'Bekleyen rapor', value: stats.pendingReports, Icon: CircleAlert, color: 'var(--urgency)' },
  ]
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats', { cache: 'no-store' })
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
        <h1 className="text-2xl font-bold">Yönetim paneli</h1>
        <p className="text-sm text-[var(--text-sub)]">İçerik, kullanıcı ve kalite işlemlerine genel bakış.</p>
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
              <stat.Icon aria-hidden="true" className="h-5 w-5" style={{ color: stat.color }} />
            </div>
            <div className="mt-2 font-display text-2xl font-black" style={{ color: stat.color }}>
              {loading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-[var(--border)]" />
              ) : (
                stat.value.toLocaleString()
              )}
            </div>
            <div className="mt-1 text-xs font-semibold text-[var(--text-sub)]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* 2 sutunlu alt alan */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hizli erisim */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
          <h3 className="mb-4 text-xs font-bold tracking-wide text-[var(--text-sub)]">
            HIZLI ÖZET
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-sm">Toplam soru</span>
              <span className="font-bold text-[var(--focus)]">{stats.totalQuestions.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-sm">Toplam oturum</span>
              <span className="font-bold text-[var(--reward)]">{stats.totalSessions.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-sm">Bekleyen rapor</span>
              <span className={`font-bold ${stats.pendingReports > 0 ? 'text-[var(--urgency)]' : 'text-[var(--growth)]'}`}>
                {stats.pendingReports}
              </span>
            </div>
          </div>
        </div>

        {/* Hizli linkler */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
          <h3 className="mb-4 text-xs font-bold tracking-wide text-[var(--text-sub)]">
            HIZLI ERİŞİM
          </h3>
          <div className="flex flex-col gap-2">
            {[
              { label: 'Soru yönetimi', href: '/admin/sorular', Icon: ClipboardList, desc: 'Soruları görüntüle ve düzenle' },
              { label: 'Kullanıcılar', href: '/admin/kullanicilar', Icon: Users, desc: 'Kullanıcı listesi ve yönetimi' },
              { label: 'Soru Kalitesi', href: '/admin/soru-kalite', Icon: CircleAlert, desc: 'Raporları ve kalite kanıtlarını incele' },
              { label: 'Site ayarları', href: '/admin/ayarlar', Icon: Settings2, desc: 'Platform yapılandırması' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-lg bg-[var(--surface)] px-4 py-3 transition-colors hover:bg-[var(--card)]"
              >
                <link.Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--focus)]" />
                <div className="flex-1">
                  <div className="text-sm font-bold">{link.label}</div>
                  <div className="text-xs text-[var(--text-sub)]">{link.desc}</div>
                </div>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-sub)]" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
