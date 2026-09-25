'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, CircleCheck, CircleX, ClipboardList, Flag, Settings2, Users, type LucideIcon } from 'lucide-react'
import { AdminRecordId, shortAdminId } from '@/components/admin/admin-record-id'

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

const ACTION_CONFIG: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  update_question: { label: 'Soru güncellendi', Icon: BookOpen, color: 'var(--focus)' },
  update_user_role: { label: 'Rol değiştirildi', Icon: Users, color: 'var(--wisdom)' },
  update_report: { label: 'Rapor güncellendi', Icon: Flag, color: 'var(--reward)' },
  update_setting: { label: 'Ayar değiştirildi', Icon: Settings2, color: 'var(--growth)' },
  resolve_report: { label: 'Rapor çözüldü', Icon: CircleCheck, color: 'var(--growth)' },
  reject_report: { label: 'Rapor reddedildi', Icon: CircleX, color: 'var(--text-sub)' },
}

const fallbackAction = { label: 'İşlem', Icon: ClipboardList, color: 'var(--text-sub)' }

const targetLabels: Record<string, string> = { question: 'Soru', report: 'Rapor', setting: 'Ayar', user: 'Kullanıcı', background_asset: 'Arka plan', cosmetic_badge: 'Rozet', question_submission: 'Soru gönderimi' }

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
        <h1 className="text-2xl font-bold">Yönetim kayıtları</h1>
        <p className="text-sm text-[var(--text-sub)]">
          Tüm yönetim işlemlerinin kaydı — {total} işlem
        </p>
      </div>

      {/* Filtreler */}
      <div className="sticky top-14 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-bg)]/95 p-3 backdrop-blur lg:top-0">
        {['all', 'update_question', 'update_user_role', 'update_report', 'update_setting'].map((action) => {
          const cfg = action === 'all' ? null : (ACTION_CONFIG[action] || fallbackAction)
          return (
            <button
              key={action}
              onClick={() => { setFilterAction(action); setPage(1) }}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                filterAction === action
                  ? 'bg-[var(--focus)] text-white'
                  : 'bg-[var(--surface)] text-[var(--text-sub)] hover:bg-[var(--card)]'
              }`}
            >
              {action === 'all' ? `Tümü` : <span className="inline-flex items-center gap-2">{cfg && <cfg.Icon aria-hidden="true" className="h-4 w-4" />}{cfg?.label}</span>}
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
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={`log-detail-${log.id}`}
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
                >
                  <cfg.Icon aria-hidden="true" className="h-5 w-5 shrink-0" style={{ color: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                      {log.target_id && (
                        <span className="truncate text-xs font-mono text-[var(--text-sub)]">
                          {shortAdminId(log.target_id)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-sub)]">
                      {log.admin_name} — {targetLabels[log.target_type] ?? 'Diğer'} <code className="ml-1 font-mono">({log.target_type})</code>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--text-sub)] whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('tr-TR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className={`text-xs text-[var(--text-sub)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>

                {isExpanded && (
                  <div id={`log-detail-${log.id}`} className="border-t border-[var(--border)] px-4 py-3">
                    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2"><AdminRecordId label="Kayıt" id={log.id} /><AdminRecordId label="Hedef" id={log.target_id} /></div>
                    {log.details && <pre className="overflow-x-auto rounded-lg bg-[var(--surface)] p-3 text-xs font-mono text-[var(--text-sub)]">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>}
                  </div>
                )}
              </div>
            )
          })}

          {logs.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--text-sub)]">
              Kayıt bulunamadı
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
