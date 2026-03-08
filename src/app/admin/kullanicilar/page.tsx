'use client'

import { useState } from 'react'

interface MockUser {
  id: string
  displayName: string
  email: string
  avatar: string
  role: 'user' | 'admin'
  totalXP: number
  gamesPlayed: number
  joinedAt: string
  lastActive: string
  isBanned: boolean
}

const MOCK_USERS: MockUser[] = [
  { id: 'u1', displayName: 'Zeynep K.', email: 'zeynep@mail.com', avatar: '🦊', role: 'admin', totalXP: 8420, gamesPlayed: 87, joinedAt: '2024-01-10', lastActive: '5dk once', isBanned: false },
  { id: 'u2', displayName: 'Emre T.', email: 'emre@mail.com', avatar: '🐉', role: 'user', totalXP: 5230, gamesPlayed: 54, joinedAt: '2024-01-12', lastActive: '2sa once', isBanned: false },
  { id: 'u3', displayName: 'Selin M.', email: 'selin@mail.com', avatar: '🌟', role: 'user', totalXP: 3100, gamesPlayed: 32, joinedAt: '2024-01-15', lastActive: '1g once', isBanned: false },
  { id: 'u4', displayName: 'Kaan O.', email: 'kaan@mail.com', avatar: '⚔️', role: 'user', totalXP: 1870, gamesPlayed: 19, joinedAt: '2024-01-18', lastActive: '3g once', isBanned: true },
  { id: 'u5', displayName: 'Deniz A.', email: 'deniz@mail.com', avatar: '🦉', role: 'user', totalXP: 950, gamesPlayed: 8, joinedAt: '2024-01-20', lastActive: '12dk once', isBanned: false },
]

export default function AdminUsersPage() {
  const [users, setUsers] = useState(MOCK_USERS)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'user'>('all')

  const filtered = users.filter((u) => {
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (search) {
      const q = search.toLowerCase()
      return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    }
    return true
  })

  const toggleBan = (id: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, isBanned: !u.isBanned } : u))
    )
  }

  const promoteToAdmin = (id: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role: u.role === 'admin' ? 'user' : 'admin' } : u))
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Kullanici Yonetimi</h1>
        <p className="text-sm text-[var(--text-sub)]">{users.length} kayitli kullanici</p>
      </div>

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Isim veya email ara..."
          className="w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        />

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as 'all' | 'admin' | 'user')}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="all">Tum Roller</option>
          <option value="admin">Admin</option>
          <option value="user">Kullanici</option>
        </select>

        <span className="text-xs text-[var(--text-sub)]">{filtered.length} sonuc</span>
      </div>

      {/* Tablo */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              <th className="px-4 py-3 font-bold text-[var(--text-sub)]">Kullanici</th>
              <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Rol</th>
              <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">XP</th>
              <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Oyun</th>
              <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Son Aktif</th>
              <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-center">Islemler</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr
                key={u.id}
                className={`border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--surface)] ${
                  u.isBanned ? 'opacity-50' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{u.avatar}</span>
                    <div>
                      <div className="font-medium">
                        {u.displayName}
                        {u.isBanned && (
                          <span className="ml-1.5 rounded bg-[var(--urgency)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                            BAN
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--text-sub)]">{u.email}</div>
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
                  {u.totalXP.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right font-mono">{u.gamesPlayed}</td>
                <td className="px-3 py-3 text-[var(--text-sub)]">{u.lastActive}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => promoteToAdmin(u.id)}
                      className="rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus-bg)]"
                      title={u.role === 'admin' ? 'Kullaniciya dondur' : 'Admin yap'}
                    >
                      {u.role === 'admin' ? '👤' : '⭐'}
                    </button>
                    <button
                      onClick={() => toggleBan(u.id)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                        u.isBanned
                          ? 'text-[var(--growth)] hover:bg-[var(--growth-bg)]'
                          : 'text-[var(--urgency)] hover:bg-[color-mix(in_srgb,var(--urgency)_10%,transparent)]'
                      }`}
                      title={u.isBanned ? 'Ban kaldir' : 'Banla'}
                    >
                      {u.isBanned ? '✓' : '🚫'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
