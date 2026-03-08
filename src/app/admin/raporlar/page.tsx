'use client'

import { useState } from 'react'

type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'rejected'
type ReportType = 'wrong_answer' | 'typo' | 'unclear' | 'duplicate' | 'offensive' | 'other'

interface MockReport {
  id: string
  userName: string
  userAvatar: string
  questionPreview: string
  questionGame: string
  reportType: ReportType
  description: string
  status: ReportStatus
  createdAt: string
  adminNote: string
}

const REPORT_TYPE_LABELS: Record<ReportType, { label: string; icon: string }> = {
  wrong_answer: { label: 'Yanlis cevap', icon: '❌' },
  typo: { label: 'Yazim hatasi', icon: '✏️' },
  unclear: { label: 'Anlasilmiyor', icon: '❓' },
  duplicate: { label: 'Tekrar', icon: '♻️' },
  offensive: { label: 'Uygunsuz', icon: '🚫' },
  other: { label: 'Diger', icon: '📝' },
}

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Bekliyor', color: 'var(--reward)', bg: 'var(--reward-bg)' },
  reviewed: { label: 'Incelendi', color: 'var(--focus)', bg: 'var(--focus-bg)' },
  resolved: { label: 'Cozuldu', color: 'var(--growth)', bg: 'var(--growth-bg)' },
  rejected: { label: 'Reddedildi', color: 'var(--text-sub)', bg: 'var(--surface)' },
}

const MOCK_REPORTS: MockReport[] = [
  { id: 'r1', userName: 'Emre T.', userAvatar: '🐉', questionPreview: 'Bir isi Ahmet 6 gunde...', questionGame: 'matematik', reportType: 'wrong_answer', description: 'Dogru cevap 4 gun degil 3 gun olmali', status: 'pending', createdAt: '2sa once', adminNote: '' },
  { id: 'r2', userName: 'Zeynep K.', userAvatar: '🦊', questionPreview: 'Asagidakilerden hangisi...', questionGame: 'turkce', reportType: 'typo', description: 'B sikkinda yazim hatasi var', status: 'pending', createdAt: '5sa once', adminNote: '' },
  { id: 'r3', userName: 'Selin M.', userAvatar: '🌟', questionPreview: 'Newton ikinci yasasi...', questionGame: 'fen', reportType: 'unclear', description: 'Soru metni cok karisik', status: 'reviewed', createdAt: '1g once', adminNote: 'Soru metni guncellendi' },
  { id: 'r4', userName: 'Kaan O.', userAvatar: '⚔️', questionPreview: 'Malazgirt Savasi...', questionGame: 'sosyal', reportType: 'duplicate', description: 'Bu soru zaten var', status: 'resolved', createdAt: '2g once', adminNote: 'Tekrar eden soru deaktif edildi' },
  { id: 'r5', userName: 'Deniz A.', userAvatar: '🦉', questionPreview: 'What is abundant?', questionGame: 'wordquest', reportType: 'wrong_answer', description: 'Cevap yanlis isaretlenmis', status: 'rejected', createdAt: '3g once', adminNote: 'Cevap dogru, rapor gecersiz' },
]

export default function AdminReportsPage() {
  const [reports, setReports] = useState(MOCK_REPORTS)
  const [filterStatus, setFilterStatus] = useState<ReportStatus | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = reports.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    return true
  })

  const pendingCount = reports.filter((r) => r.status === 'pending').length

  const updateStatus = (id: string, status: ReportStatus) => {
    setReports((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hata Raporlari</h1>
          <p className="text-sm text-[var(--text-sub)]">
            {pendingCount > 0 ? `${pendingCount} bekleyen rapor` : 'Tum raporlar incelendi'}
          </p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'pending', 'reviewed', 'resolved', 'rejected'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              filterStatus === status
                ? 'bg-[var(--focus)] text-white'
                : 'bg-[var(--surface)] text-[var(--text-sub)] hover:bg-[var(--card)]'
            }`}
          >
            {status === 'all' ? `Tumu (${reports.length})` : `${STATUS_CONFIG[status].label} (${reports.filter((r) => r.status === status).length})`}
          </button>
        ))}
      </div>

      {/* Rapor listesi */}
      <div className="flex flex-col gap-3">
        {filtered.map((report) => {
          const typeInfo = REPORT_TYPE_LABELS[report.reportType]
          const statusInfo = STATUS_CONFIG[report.status]
          const isExpanded = expandedId === report.id

          return (
            <div
              key={report.id}
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] transition-all"
            >
              {/* Ana satir */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : report.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface)]"
              >
                <span className="text-lg">{typeInfo.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{typeInfo.label}</span>
                    <span className="text-[10px] text-[var(--text-sub)]">·</span>
                    <span className="text-[10px] text-[var(--text-sub)]">{report.questionGame}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-sub)] truncate">
                    {report.questionPreview}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-sub)]">{report.createdAt}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
                  >
                    {statusInfo.label}
                  </span>
                </div>
                <span className={`text-xs text-[var(--text-sub)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>

              {/* Detay */}
              {isExpanded && (
                <div className="border-t border-[var(--border)] px-4 py-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-sm">{report.userAvatar}</span>
                    <span className="text-xs font-bold">{report.userName}</span>
                  </div>
                  <div className="mb-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-sub)]">
                    {report.description || 'Aciklama yok'}
                  </div>
                  {report.adminNote && (
                    <div className="mb-3 rounded-lg border border-[var(--focus-border)] bg-[var(--focus-bg)] px-3 py-2 text-xs text-[var(--focus)]">
                      Admin: {report.adminNote}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(report.id, 'resolved')}
                      className="rounded-lg bg-[var(--growth)] px-3 py-1.5 text-[10px] font-bold text-white transition-opacity hover:opacity-90"
                    >
                      Coz
                    </button>
                    <button
                      onClick={() => updateStatus(report.id, 'rejected')}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[10px] font-bold text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)]"
                    >
                      Reddet
                    </button>
                    <button
                      onClick={() => updateStatus(report.id, 'reviewed')}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus-bg)]"
                    >
                      Incelendi
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--text-sub)]">
            Sonuc bulunamadi
          </div>
        )}
      </div>
    </div>
  )
}
