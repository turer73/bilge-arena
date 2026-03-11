'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '@/types/database'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) throw new Error('Kullanicilar yuklenemedi')
      const data = await res.json()
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error('Kullanici yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchUsers, search])

  const handleRoleChange = async (userId: string, currentRole: string) => {
    setActionLoading(userId)
    try {
      const action = currentRole === 'admin' ? 'demote' : 'promote'
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, role: currentRole === 'admin' ? 'user' : 'admin' } : u
          )
        )
      }
    } catch (err) {
      console.error('Rol degistirme hatasi:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Kullanici Yonetimi</h1>
        <p className="text-sm text-[var(--text-sub)]">{total} kayitli kullanici</p>
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Isim ara..."
          className="w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        />
        <span className="text-xs text-[var(--text-sub)]">{users.length} sonuc</span>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--border)]" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="px-4 py-3 font-bold text-[var(--text-sub)]">Kullanici</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Rol</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">XP</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Dogru/Toplam</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Kayit</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-center">Islemler</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--surface)]"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.display_name || u.username || ''}
                          className="h-8 w-8 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--focus-bg)] text-sm">
                          👤
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{u.display_name || u.username || 'Isimsiz'}</div>
                        <div className="text-[10px] text-[var(--text-sub)] truncate">@{u.username || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        u.role === 'admin'
                          ? 'bg-[var(--reward-bg)] text-[var(--reward)]'
                          : 'bg-[var(--surface)] text-[var(--text-sub)]'
                      }`}
                    >
                      {u.role === 'admin' ? 'Admin' : 'Kullanici'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-[var(--reward)]">
                    {u.total_xp.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--text-sub)]">
                    {u.correct_answers}/{u.total_questions}
                  </td>
                  <td className="px-3 py-3 text-[var(--text-sub)]">
                    {new Date(u.created_at).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleRoleChange(u.id, u.role ?? 'user')}
                        disabled={actionLoading === u.id}
                        className="rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus-bg)] disabled:opacity-40"
                        title={u.role === 'admin' ? 'Kullaniciya dondur' : 'Admin yap'}
                      >
                        {actionLoading === u.id ? '...' : u.role === 'admin' ? '👤' : '⭐'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && users.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--text-sub)]">
            Kullanici bulunamadi
          </div>
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            ← Onceki
          </button>
          <span className="text-xs text-[var(--text-sub)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            Sonraki →
          </button>
        </div>
      )}
    </div>
  )
}
