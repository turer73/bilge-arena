'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ErrorReport, ReportType, ReportStatus } from '@/types/database'

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

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ErrorReport[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<ReportStatus | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [adminNoteInput, setAdminNoteInput] = useState('')

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/admin/reports?${params}`)
      if (!res.ok) throw new Error('Raporlar yuklenemedi')
      const data = await res.json()
      setReports(data.reports ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error('Rapor yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const pendingCount = reports.filter((r) => r.status === 'pending').length

  const updateStatus = async (id: string, status: ReportStatus) => {
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: id, status, adminNote: adminNoteInput || undefined }),
      })
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status, admin_note: adminNoteInput || r.admin_note } : r))
        )
        setAdminNoteInput('')
      }
    } catch (err) {
      console.error('Durum guncelleme hatasi:', err)
    }
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
            {status === 'all'
              ? `Tumu (${total})`
              : STATUS_CONFIG[status].label}
          </button>
        ))}
      </div>

      {/* Rapor listesi */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--border)]" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((report) => {
            const typeInfo = REPORT_TYPE_LABELS[report.report_type] || REPORT_TYPE_LABELS.other
            const statusInfo = STATUS_CONFIG[report.status]
            const isExpanded = expandedId === report.id

            return (
              <div
                key={report.id}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] transition-all"
              >
                <button
                  onClick={() => {
                    setExpandedId(isExpanded ? null : report.id)
                    setAdminNoteInput('')
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface)]"
                >
                  <span className="text-lg">{typeInfo.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{typeInfo.label}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-sub)] truncate">
                      {report.description || 'Aciklama yok'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-sub)]">
                      {new Date(report.created_at).toLocaleDateString('tr-TR')}
                    </span>
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

                {isExpanded && (
                  <div className="border-t border-[var(--border)] px-4 py-4">
                    <div className="mb-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-sub)]">
                      {report.description || 'Aciklama yok'}
                    </div>

                    {report.admin_note && (
                      <div className="mb-3 rounded-lg border border-[var(--focus-border)] bg-[var(--focus-bg)] px-3 py-2 text-xs text-[var(--focus)]">
                        Admin: {report.admin_note}
                      </div>
                    )}

                    {report.status === 'pending' && (
                      <div className="mb-3">
                        <input
                          type="text"
                          value={adminNoteInput}
                          onChange={(e) => setAdminNoteInput(e.target.value)}
                          placeholder="Admin notu (opsiyonel)..."
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
                        />
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

          {reports.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--text-sub)]">
              Sonuc bulunamadi
            </div>
          )}
        </div>
      )}
    </div>
  )
}
