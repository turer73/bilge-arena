'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Types ──────────────────────────────────────────────
interface Role {
  id: string
  name: string
  slug: string
  description: string | null
  is_system: boolean
  permissions: string[]
  user_count: number
  created_at: string
}

interface UserResult {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface AssignedUser extends UserResult {
  role_id: string
}

// ── Constants ──────────────────────────────────────────
const SLUG_ICONS: Record<string, string> = {
  super_admin: '\u{1F451}',
  editor: '\u{270F}\u{FE0F}',
  moderator: '\u{1F6E1}\u{FE0F}',
  viewer: '\u{1F441}\u{FE0F}',
}

const PERMISSION_GROUPS: { label: string; permissions: { key: string; label: string }[] }[] = [
  { label: 'Dashboard', permissions: [
    { key: 'admin.dashboard.view', label: 'Goruntule' },
  ]},
  { label: 'Sorular', permissions: [
    { key: 'admin.questions.view', label: 'Goruntule' },
    { key: 'admin.questions.edit', label: 'Duzenle' },
    { key: 'admin.questions.generate', label: 'Uret (AI)' },
  ]},
  { label: 'Kullanicilar', permissions: [
    { key: 'admin.users.view', label: 'Goruntule' },
    { key: 'admin.users.manage', label: 'Yonet' },
  ]},
  { label: 'Raporlar', permissions: [
    { key: 'admin.reports.view', label: 'Goruntule' },
    { key: 'admin.reports.manage', label: 'Yonet' },
  ]},
  { label: 'Loglar', permissions: [
    { key: 'admin.logs.view', label: 'Goruntule' },
  ]},
  { label: 'Ayarlar', permissions: [
    { key: 'admin.settings.view', label: 'Goruntule' },
    { key: 'admin.settings.edit', label: 'Duzenle' },
  ]},
  { label: 'Roller', permissions: [
    { key: 'admin.roles.view', label: 'Goruntule' },
    { key: 'admin.roles.manage', label: 'Yonet' },
  ]},
  { label: 'Anasayfa', permissions: [
    { key: 'admin.homepage.view', label: 'Goruntule' },
    { key: 'admin.homepage.edit', label: 'Duzenle' },
  ]},
]

// ── Component ──────────────────────────────────────────
export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // User assignment
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<UserResult[]>([])
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [assignLoading, setAssignLoading] = useState<string | null>(null)

  // ── Fetch roles ──
  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/roles')
      if (!res.ok) throw new Error('Roller yuklenemedi')
      const data = await res.json()
      setRoles(data.roles ?? [])
    } catch (err) {
      console.error('Rol yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  // ── Select role ──
  const selectRole = (role: Role) => {
    setSelectedRole(role)
    setEditPerms(new Set(role.permissions))
    setAssignedUsers([])
    setUserSearch('')
    setUserResults([])
    fetchAssignedUsers(role.id)
  }

  // ── Fetch assigned users for a role ──
  const fetchAssignedUsers = async (roleId: string) => {
    try {
      const res = await fetch(`/api/admin/users?search=&page=1`)
      if (!res.ok) return
      // We will show assigned user info from the roles data
      // For now keep empty until we can query user_roles
    } catch {
      // silent
    }
  }

  // ── Toggle permission ──
  const togglePerm = (perm: string) => {
    setEditPerms(prev => {
      const next = new Set(prev)
      if (next.has(perm)) next.delete(perm)
      else next.add(perm)
      return next
    })
  }

  // ── Save permissions ──
  const savePermissions = async () => {
    if (!selectedRole) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: Array.from(editPerms) }),
      })
      if (!res.ok) {
        const data = await res.json()
        console.error('Kaydetme hatasi:', data.error)
        return
      }
      // Update local state
      setRoles(prev =>
        prev.map(r =>
          r.id === selectedRole.id
            ? { ...r, permissions: Array.from(editPerms) }
            : r
        )
      )
      setSelectedRole(prev =>
        prev ? { ...prev, permissions: Array.from(editPerms) } : null
      )
    } catch (err) {
      console.error('Izin kaydetme hatasi:', err)
    } finally {
      setSaving(false)
    }
  }

  // ── Search users for assignment ──
  useEffect(() => {
    if (!selectedRole || userSearch.length < 2) {
      setUserResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}&page=1`)
        if (!res.ok) return
        const data = await res.json()
        setUserResults(data.users ?? [])
      } catch {
        // silent
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [userSearch, selectedRole])

  // ── Assign user ──
  const assignUser = async (userId: string) => {
    if (!selectedRole) return
    setAssignLoading(userId)
    try {
      const res = await fetch('/api/admin/roles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roleId: selectedRole.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        console.error('Atama hatasi:', data.error)
        return
      }
      // Move from results to assigned
      const user = userResults.find(u => u.id === userId)
      if (user) {
        setAssignedUsers(prev => [...prev, { ...user, role_id: selectedRole.id }])
      }
      // Update role user count
      setRoles(prev =>
        prev.map(r =>
          r.id === selectedRole.id ? { ...r, user_count: r.user_count + 1 } : r
        )
      )
    } catch (err) {
      console.error('Kullanici atama hatasi:', err)
    } finally {
      setAssignLoading(null)
    }
  }

  // ── Remove user from role ──
  const removeUser = async (userId: string) => {
    if (!selectedRole) return
    setAssignLoading(userId)
    try {
      const res = await fetch('/api/admin/roles/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roleId: selectedRole.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        console.error('Kaldirma hatasi:', data.error)
        return
      }
      setAssignedUsers(prev => prev.filter(u => u.id !== userId))
      setRoles(prev =>
        prev.map(r =>
          r.id === selectedRole.id
            ? { ...r, user_count: Math.max(0, r.user_count - 1) }
            : r
        )
      )
    } catch (err) {
      console.error('Kullanici kaldirma hatasi:', err)
    } finally {
      setAssignLoading(null)
    }
  }

  // ── Helpers ──
  const getIcon = (slug: string) => SLUG_ICONS[slug] || '\u{1F464}'
  const hasChanges = selectedRole
    ? JSON.stringify(Array.from(editPerms).sort()) !== JSON.stringify(Array.from(selectedRole.permissions).sort())
    : false

  // ── Render ──────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Roller & Yetkiler</h1>
        <p className="text-sm text-[var(--text-sub)]">
          Rolleri yonetin, izinleri duzenleyin ve kullanicilara rol atayin.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left: Role Cards Grid ── */}
        <div className="w-full lg:w-[380px] shrink-0">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-[var(--border)]" />
              ))}
            </div>
          ) : roles.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--text-sub)]">
              Henuz rol tanimlanmamis.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => selectRole(role)}
                  className={`group relative rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                    selectedRole?.id === role.id
                      ? 'border-[var(--focus)] bg-[var(--focus-bg)] shadow-md'
                      : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--focus-light)]'
                  }`}
                >
                  {/* Icon */}
                  <div className="mb-2 text-2xl">{getIcon(role.slug)}</div>

                  {/* Name */}
                  <div className="text-sm font-bold leading-tight">{role.name}</div>

                  {/* Description */}
                  {role.description && (
                    <div className="mt-1 text-[11px] leading-snug text-[var(--text-sub)] line-clamp-2">
                      {role.description}
                    </div>
                  )}

                  {/* Badges */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-sub)]">
                      {role.user_count} kullanici
                    </span>
                    {role.is_system && (
                      <span className="rounded-full bg-[var(--wisdom)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--wisdom)]">
                        Sistem
                      </span>
                    )}
                  </div>

                  {/* Selected indicator */}
                  {selectedRole?.id === role.id && (
                    <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--focus)]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Permissions Panel ── */}
        <div className="flex-1 min-w-0">
          {!selectedRole ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]">
              <p className="text-sm text-[var(--text-sub)]">
                Izinleri goruntulemek icin bir rol secin
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              {/* Panel header */}
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getIcon(selectedRole.slug)}</span>
                  <h2 className="font-display text-base font-bold">{selectedRole.name}</h2>
                  {selectedRole.is_system && (
                    <span className="rounded-full bg-[var(--wisdom)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--wisdom)]">
                      Sistem Rolu
                    </span>
                  )}
                </div>
                {hasChanges && (
                  <span className="text-[10px] font-bold text-[var(--reward)]">Kaydedilmemis degisiklikler</span>
                )}
              </div>

              {/* Permission groups */}
              <div className="divide-y divide-[var(--border)] px-5">
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.label} className="py-3">
                    <div className="mb-2 text-xs font-bold text-[var(--text-sub)] uppercase tracking-wider">
                      {group.label}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                      {group.permissions.map(perm => (
                        <label
                          key={perm.key}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-[var(--surface)]"
                        >
                          <input
                            type="checkbox"
                            checked={editPerms.has(perm.key)}
                            onChange={() => togglePerm(perm.key)}
                            className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--focus)]"
                          />
                          <span className="select-none">{perm.label}</span>
                          <span className="hidden text-[10px] text-[var(--text-sub)] sm:inline">
                            {perm.key.split('.').pop()}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Save button */}
              <div className="border-t border-[var(--border)] px-5 py-3">
                <button
                  onClick={savePermissions}
                  disabled={saving || !hasChanges}
                  className="rounded-lg bg-[var(--focus)] px-5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? 'Kaydediliyor...' : 'Izinleri Kaydet'}
                </button>
              </div>
            </div>
          )}

          {/* ── User Assignment Section ── */}
          {selectedRole && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="border-b border-[var(--border)] px-5 py-3">
                <h3 className="text-sm font-bold">Kullanici Ata</h3>
                <p className="text-[11px] text-[var(--text-sub)]">
                  {selectedRole.name} rolune kullanici ekleyin veya kaldirin.
                </p>
              </div>

              <div className="px-5 py-3">
                {/* Search input */}
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Kullanici ara (en az 2 karakter)..."
                  className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
                />

                {/* Search results */}
                {searchLoading && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-sub)]">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--focus)] border-t-transparent" />
                    Araniyor...
                  </div>
                )}

                {userResults.length > 0 && (
                  <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    {userResults.map(user => {
                      const alreadyAssigned = assignedUsers.some(a => a.id === user.id)
                      return (
                        <div
                          key={user.id}
                          className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt=""
                                className="h-6 w-6 rounded-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--focus-bg)] text-xs">
                                {'\u{1F464}'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium">
                                {user.display_name || user.username || 'Isimsiz'}
                              </div>
                              {user.username && (
                                <div className="truncate text-[10px] text-[var(--text-sub)]">@{user.username}</div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => assignUser(user.id)}
                            disabled={alreadyAssigned || assignLoading === user.id}
                            className="shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus-bg)] disabled:opacity-40"
                          >
                            {assignLoading === user.id ? '...' : alreadyAssigned ? 'Atandi' : '+ Ata'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Assigned users */}
                {assignedUsers.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] font-bold text-[var(--text-sub)] uppercase tracking-wider">
                      Atanmis Kullanicilar
                    </div>
                    <div className="space-y-1">
                      {assignedUsers.map(user => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt=""
                                className="h-6 w-6 rounded-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--focus-bg)] text-xs">
                                {'\u{1F464}'}
                              </div>
                            )}
                            <span className="truncate text-xs font-medium">
                              {user.display_name || user.username || 'Isimsiz'}
                            </span>
                          </div>
                          <button
                            onClick={() => removeUser(user.id)}
                            disabled={assignLoading === user.id}
                            className="shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold text-[var(--urgency)] transition-colors hover:bg-[var(--urgency)]/10 disabled:opacity-40"
                          >
                            {assignLoading === user.id ? '...' : 'Kaldir'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state for assigned */}
                {assignedUsers.length === 0 && !searchLoading && userResults.length === 0 && (
                  <p className="py-2 text-center text-[11px] text-[var(--text-sub)]">
                    Kullanici aramak icin yukariya yazmaya baslayin.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
