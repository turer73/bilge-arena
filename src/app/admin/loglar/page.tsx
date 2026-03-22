'use client'

import { useCallback, useEffect, useState } from 'react'

interface LogEntry {
  id: string
  admin_id: string
  admin_name: string
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  update_question: { label: 'Soru guncelle', icon: '📝', color: 'var(--focus)' },
  update_user_role: { label: 'Rol degistir', icon: '👥', color: 'var(--wisdom)' },
  update_report: { label: 'Rapor guncelle', icon: '🐛', color: 'var(--reward)' },
  update_setting: { label: 'Ayar degistir', icon: '⚙️', color: 'var(--growth)' },
  resolve_report: { label: 'Rapor coz', icon: '✅', color: 'var(--growth)' },
  reject_report: { label: 'Rapor reddet', icon: '❌', color: 'var(--urgency)' },
}

const fallbackAction = { label: 'Islem', icon: '📋', color: 'var(--text-sub)' }

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const limit = 20

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (filterAction !== 'all') params.set('action', filterAction)
      const res = await fetch(`/api/admin/logs?${params}`)
      if (!res.ok) throw new Error('Loglar yuklenemedi')
      const data = await res.json()
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error('Log yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }, [page, filterAction])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin Loglari</h1>
        <p className="text-sm text-[var(--text-sub)]">
          Tum admin islemlerinin kaydi — {total} islem
        </p>
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['all', 'update_question', 'update_user_role', 'update_report', 'update_setting'].map((action) => {
          const cfg = action === 'all' ? null : (ACTION_CONFIG[action] || fallbackAction)
          return (
            <button
              key={action}
              onClick={() => { setFilterAction(action); setPage(1) }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filterAction === action
                  ? 'bg-[var(--focus)] text-white'
                  : 'bg-[var(--surface)] text-[var(--text-sub)] hover:bg-[var(--card)]'
              }`}
            >
              {action === 'all' ? `Tumu` : `${cfg?.icon} ${cfg?.label}`}
            </button>
          )
        })}
      </div>

      {/* Log listesi */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--border)]" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map((log) => {
            const cfg = ACTION_CONFIG[log.action] || fallbackAction
            const isExpanded = expandedId === log.id

            return (
              <div
                key={log.id}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] transition-all"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
                >
                  <span className="text-base">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                      {log.target_id && (
                        <span className="truncate text-[10px] font-mono text-[var(--text-sub)]">
                          {log.target_id.length > 20 ? log.target_id.slice(0, 8) + '...' : log.target_id}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-sub)]">
                      {log.admin_name} — {log.target_type}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--text-sub)] whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('tr-TR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className={`text-xs text-[var(--text-sub)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>

                {isExpanded && log.details && (
                  <div className="border-t border-[var(--border)] px-4 py-3">
                    <pre className="overflow-x-auto rounded-lg bg-[var(--surface)] p-3 text-[11px] font-mono text-[var(--text-sub)]">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}

          {logs.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--text-sub)]">
              Log bulunamadi
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-xs text-[var(--text-sub)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
