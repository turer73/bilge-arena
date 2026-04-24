'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Profile, Role } from '@/types/database'

interface UserWithRoles extends Profile {
  assigned_roles?: { role_id: string; role_slug: string; role_name: string }[]
}

const SLUG_ICONS: Record<string, string> = {
  super_admin: '👑',
  editor: '✏️',
  moderator: '🛡️',
  viewer: '👁️',
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // RBAC: Roller
  const [roles, setRoles] = useState<Role[]>([])
  const [roleModalUser, setRoleModalUser] = useState<UserWithRoles | null>(null)
  const [roleModalLoading, setRoleModalLoading] = useState(false)

  // Kullanıcı Ekleme
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', displayName: '', roleId: '' })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  // Rolleri yükle
  useEffect(() => {
    fetch('/api/admin/roles')
      .then(r => r.ok ? r.json() : { roles: [] })
      .then(data => setRoles(data.roles || []))
      .catch(() => setRoles([]))
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) throw new Error('Kullanıcılar yüklenemedi')
      const data = await res.json()
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error('Kullanıcı yükleme hatası:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchUsers, search])

  // Rol atama
  const handleAssignRole = async (userId: string, roleId: string) => {
    setRoleModalLoading(true)
    try {
      const res = await fetch('/api/admin/roles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roleId }),
      })
      if (res.ok) {
        // Modal kullanıcısının rollerini güncelle
        const role = roles.find(r => r.id === roleId)
        if (roleModalUser && role) {
          const updated = {
            ...roleModalUser,
            assigned_roles: [
              ...(roleModalUser.assigned_roles || []),
              { role_id: roleId, role_slug: role.slug as string, role_name: role.name },
            ],
          }
          setRoleModalUser(updated)
          setUsers(prev => prev.map(u => u.id === userId ? updated : u))
        }
      } else {
        const err = await res.json()
        alert(err.error || 'Rol atama başarısız')
      }
    } catch {
      alert('Bir hata oluştu')
    } finally {
      setRoleModalLoading(false)
    }
  }

  // Rol kaldırma
  const handleRemoveRole = async (userId: string, roleId: string) => {
    setRoleModalLoading(true)
    try {
      const res = await fetch('/api/admin/roles/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roleId }),
      })
      if (res.ok) {
        if (roleModalUser) {
          const updated = {
            ...roleModalUser,
            assigned_roles: (roleModalUser.assigned_roles || []).filter(r => r.role_id !== roleId),
          }
          setRoleModalUser(updated)
          setUsers(prev => prev.map(u => u.id === userId ? updated : u))
        }
      } else {
        const err = await res.json()
        alert(err.error || 'Rol kaldırma başarısız')
      }
    } catch {
      alert('Bir hata oluştu')
    } finally {
      setRoleModalLoading(false)
    }
  }

  // Kullanıcı oluşturma
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateLoading(true)
    setCreateError(null)
    setCreateSuccess(null)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email,
          displayName: createForm.displayName || undefined,
          roleId: createForm.roleId || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setCreateError(data.error || 'Kullanıcı oluşturulamadı')
        return
      }

      setCreateSuccess(`${createForm.email} adresine davet gönderildi`)
      setCreateForm({ email: '', displayName: '', roleId: '' })
      fetchUsers()
    } catch {
      setCreateError('Bir hata oluştu')
    } finally {
      setCreateLoading(false)
    }
  }

  // Rol modal açmak için kullanıcının mevcut rollerini çek
  const openRoleModal = async (user: UserWithRoles) => {
    setRoleModalUser(user)
    if (!user.assigned_roles) {
      // Kullanıcının rollerini henüz bilmiyoruz, çekelim
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(user.username)}&page=1`)
        if (res.ok) {
          const data = await res.json()
          // Basit yaklaşım: user_roles tablosundan çek
          const rolesRes = await fetch('/api/admin/roles')
          if (rolesRes.ok) {
            const rolesData = await rolesRes.json()
            // Şimdilik assigned_roles boş başlat, user profili üzerinden kontrol
            const userRoles = data.users?.find((u: UserWithRoles) => u.id === user.id)
            if (userRoles) {
              setRoleModalUser({ ...user, assigned_roles: userRoles.assigned_roles || [] })
            }
            setRoles(rolesData.roles || [])
          }
        }
      } catch {
        // Hata durumunda boş roller ile devam
      }
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Kullanıcı Yönetimi</h1>
        <p className="text-sm text-[var(--text-sub)]">{total} kayıtlı kullanıcı</p>
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="İsim ara..."
          className="w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        />
        <span className="text-xs text-[var(--text-sub)]">{users.length} sonuç</span>
        <button
          onClick={() => { setCreateModalOpen(true); setCreateError(null); setCreateSuccess(null) }}
          className="ml-auto rounded-lg bg-[var(--focus)] px-3 py-2 text-xs font-bold text-white transition-colors hover:opacity-90"
        >
          + Kullanıcı Ekle
        </button>
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
                <th className="px-4 py-3 font-bold text-[var(--text-sub)]">Kullanıcı</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Roller</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">XP</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Doğru/Toplam</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Kayıt</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-center">İşlemler</th>
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
                        <div className="font-medium truncate">{u.display_name || u.username || 'İsimsiz'}</div>
                        <div className="text-[10px] text-[var(--text-sub)] truncate">@{u.username || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.assigned_roles && u.assigned_roles.length > 0 ? (
                        u.assigned_roles.map((r) => (
                          <span
                            key={r.role_id}
                            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--reward-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--reward)]"
                          >
                            {SLUG_ICONS[r.role_slug] || '🔹'} {r.role_name}
                          </span>
                        ))
                      ) : u.role === 'admin' ? (
                        <span className="rounded-full bg-[var(--reward-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--reward)]">
                          👑 Admin (eski)
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-sub)]">
                          Kullanıcı
                        </span>
                      )}
                    </div>
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
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => openRoleModal(u)}
                        className="rounded-lg bg-[var(--focus-bg)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus-border)]"
                        title="Rol Yönet"
                      >
                        🔐 Rol Ata
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
            Kullanıcı bulunamadı
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
            ← Önceki
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

      {/* ─── Rol Atama Modal ─── */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
            {/* Başlık */}
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Rol Yönetimi</h3>
                <p className="text-xs text-[var(--text-sub)]">
                  {roleModalUser.display_name || roleModalUser.username} — @{roleModalUser.username}
                </p>
              </div>
              <button
                onClick={() => setRoleModalUser(null)}
                className="rounded-lg p-1.5 text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>

            {/* Mevcut Roller */}
            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sub)]">Mevcut Roller</p>
              {roleModalUser.assigned_roles && roleModalUser.assigned_roles.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {roleModalUser.assigned_roles.map((r) => (
                    <div
                      key={r.role_id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {SLUG_ICONS[r.role_slug] || '🔹'} {r.role_name}
                      </span>
                      <button
                        onClick={() => handleRemoveRole(roleModalUser.id, r.role_id)}
                        disabled={roleModalLoading}
                        className="rounded px-2 py-0.5 text-[10px] font-bold text-[var(--urgency)] transition-colors hover:bg-[var(--urgency-bg)] disabled:opacity-40"
                      >
                        {roleModalLoading ? '...' : 'Kaldır'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-sub)]">Henüz rol atanmamış</p>
              )}
            </div>

            {/* Rol Ata */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sub)]">Rol Ata</p>
              <div className="flex flex-col gap-2">
                {roles
                  .filter(r => !(roleModalUser.assigned_roles || []).some(ar => ar.role_id === r.id))
                  .map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleAssignRole(roleModalUser.id, role.id)}
                      disabled={roleModalLoading}
                      className="flex items-center justify-between rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-left transition-colors hover:border-[var(--focus)] hover:bg-[var(--focus-bg)] disabled:opacity-40"
                    >
                      <div>
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {SLUG_ICONS[role.slug as string] || '🔹'} {role.name}
                        </span>
                        {role.description && (
                          <p className="mt-0.5 text-[10px] text-[var(--text-sub)]">{role.description}</p>
                        )}
                      </div>
                      <span className="text-xs font-bold text-[var(--focus)]">
                        {roleModalLoading ? '...' : '+ Ata'}
                      </span>
                    </button>
                  ))}
                {roles.length > 0 &&
                  roles.filter(r => !(roleModalUser.assigned_roles || []).some(ar => ar.role_id === r.id)).length === 0 && (
                    <p className="text-center text-xs text-[var(--text-sub)]">Tüm roller zaten atanmış</p>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Kullanıcı Ekleme Modal ─── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold">Kullanıcı Ekle</h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="rounded-lg p-1.5 text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-sub)]">
                  E-posta Adresi *
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="kullanici@ornek.com"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-sub)]">
                  Ad Soyad (opsiyonel)
                </label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="Ahmet Yılmaz"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-sub)]">
                  Rol (opsiyonel)
                </label>
                <select
                  value={createForm.roleId}
                  onChange={(e) => setCreateForm(f => ({ ...f, roleId: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
                >
                  <option value="">Rol seçin...</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} — {role.description || role.slug}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">
                  {createError}
                </div>
              )}

              {createSuccess && (
                <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-400">
                  {createSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={createLoading || !createForm.email}
                className="rounded-lg bg-[var(--focus)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
              >
                {createLoading ? 'Davet gönderiliyor...' : 'Davet Gönder'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
