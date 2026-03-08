'use client'

// Mock istatistikler — Supabase baglaninca gercek veri gelecek
const MOCK_STATS = {
  totalUsers: 847,
  activeToday: 123,
  totalSessions: 4_291,
  totalAnswers: 38_720,
  totalQuestions: 1_089,
  pendingReports: 7,
  avgAccuracy: 64,
  weeklyGrowth: 12,
}

const STAT_CARDS = [
  { label: 'Toplam Kullanici', value: MOCK_STATS.totalUsers, icon: '👥', color: 'var(--focus)', change: `+${MOCK_STATS.weeklyGrowth}%` },
  { label: 'Bugun Aktif', value: MOCK_STATS.activeToday, icon: '🟢', color: 'var(--growth)' },
  { label: 'Toplam Oturum', value: MOCK_STATS.totalSessions, icon: '🎮', color: 'var(--reward)' },
  { label: 'Toplam Cevap', value: MOCK_STATS.totalAnswers, icon: '✅', color: 'var(--growth)' },
  { label: 'Soru Sayisi', value: MOCK_STATS.totalQuestions, icon: '📝', color: 'var(--focus)' },
  { label: 'Bekleyen Rapor', value: MOCK_STATS.pendingReports, icon: '🐛', color: 'var(--urgency)' },
]

const RECENT_ACTIVITY = [
  { time: '5dk', action: 'Yeni kayit', detail: 'Zeynep K. hesap olusturdu', icon: '👤' },
  { time: '12dk', action: 'Hata raporu', detail: 'Matematik #142 — yanlis cevap', icon: '🐛' },
  { time: '23dk', action: 'Oturum', detail: 'Emre T. — Turkce Classic — A rank', icon: '🎮' },
  { time: '45dk', action: 'Basari', detail: 'Selin M. — "100 Dogru" rozeti', icon: '🏆' },
  { time: '1sa', action: 'Yeni kayit', detail: 'Kaan O. hesap olusturdu', icon: '👤' },
]

export default function AdminDashboard() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-[var(--text-sub)]">Bilge Arena yonetim paneli</p>
      </div>

      {/* Stat kartlari */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {STAT_CARDS.map((stat, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xl">{stat.icon}</span>
              {stat.change && (
                <span className="rounded-full bg-[var(--growth-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--growth)]">
                  {stat.change}
                </span>
              )}
            </div>
            <div className="mt-2 font-display text-2xl font-black" style={{ color: stat.color }}>
              {stat.value.toLocaleString()}
            </div>
            <div className="mt-1 text-[10px] font-bold tracking-wider text-[var(--text-sub)]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* 2 sutunlu alt alan */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Son aktivite */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
          <h3 className="mb-4 text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            SON AKTIVITE
          </h3>
          <div className="flex flex-col gap-3">
            {RECENT_ACTIVITY.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-0.5 text-base">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">{item.action}</div>
                  <div className="text-[11px] text-[var(--text-sub)] truncate">{item.detail}</div>
                </div>
                <span className="flex-shrink-0 text-[10px] text-[var(--text-sub)]">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hizli erisim */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5">
          <h3 className="mb-4 text-[10px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            HIZLI OZET
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-xs">Ortalama Basari</span>
              <span className="font-bold text-[var(--growth)]">%{MOCK_STATS.avgAccuracy}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-xs">Gunluk Ort. Oturum</span>
              <span className="font-bold text-[var(--focus)]">~52</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-xs">En Populer Oyun</span>
              <span className="font-bold text-[var(--reward)]">Matematik</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
              <span className="text-xs">Haftalik Buyume</span>
              <span className="font-bold text-[var(--growth)]">+{MOCK_STATS.weeklyGrowth}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
