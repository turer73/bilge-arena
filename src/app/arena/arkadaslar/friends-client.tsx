'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import Link from 'next/link'

interface FriendProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  total_xp: number
  current_streak?: number
}

interface FriendItem {
  friendshipId: string
  status: string
  isSentByMe: boolean
  profile: FriendProfile
  createdAt: string
}

interface SearchUser {
  id: string
  display_name: string | null
  avatar_url: string | null
  total_xp: number
}

export default function FriendsClient() {
  const { user } = useAuthStore()
  const [friends, setFriends] = useState<FriendItem[]>([])
  const [pendingReceived, setPendingReceived] = useState<FriendItem[]>([])
  const [pendingSent, setPendingSent] = useState<FriendItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchFriends = useCallback(async () => {
    const res = await fetch('/api/friends')
    if (!res.ok) return
    const data = await res.json()
    setFriends(data.friends || [])
    setPendingReceived(data.pendingReceived || [])
    setPendingSent(data.pendingSent || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (user) fetchFriends()
    else setLoading(false)
  }, [user, fetchFriends])

  // Kullanici arama (debounce)
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.users || [])
      }
      setSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const sendRequest = async (friendId: string) => {
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId }),
    })
    if (res.ok) {
      toast.success('Arkadas istegi gonderildi!')
      setSearchQuery('')
      setSearchResults([])
      fetchFriends()
    } else {
      const err = await res.json()
      toast.error(err.error || 'Istek gonderilemedi')
    }
  }

  const acceptRequest = async (friendshipId: string) => {
    const res = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId }),
    })
    if (res.ok) {
      toast.success('Arkadas istegi kabul edildi!')
      fetchFriends()
    }
  }

  const removeFriend = async (friendshipId: string, label: string) => {
    const res = await fetch('/api/friends', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId }),
    })
    if (res.ok) {
      toast.info(label)
      fetchFriends()
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">👥</div>
        <h1 className="mb-2 text-xl font-bold">Arkadaslar</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">Arkadaslarini gormek icin giris yap.</p>
        <Link href="/giris" className="btn-primary inline-block rounded-[10px] px-8 py-3 font-display text-sm font-bold tracking-wider">
          Giris Yap
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
      </div>
    )
  }

  // Zaten arkadas veya bekleyen olan ID'leri topla
  const existingIds = new Set([
    ...friends.map(f => f.profile.id),
    ...pendingSent.map(f => f.profile.id),
    ...pendingReceived.map(f => f.profile.id),
  ])

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-6 text-xl font-bold">Arkadaslar</h1>

      {/* Arama */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Kullanici ara..."
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--focus)]"
        />
        {searching && <p className="mt-2 text-xs text-[var(--muted)]">Araniyor...</p>}
        {searchResults.length > 0 && (
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--focus)] text-xs font-bold text-white">
                  {(u.display_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{u.display_name || 'Arenaci'}</div>
                  <div className="text-[10px] text-[var(--muted)]">{u.total_xp} XP</div>
                </div>
                {existingIds.has(u.id) ? (
                  <span className="text-[10px] text-[var(--muted)]">Eklendi</span>
                ) : (
                  <button
                    onClick={() => sendRequest(u.id)}
                    className="rounded-lg bg-[var(--focus)] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Ekle
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gelen istekler */}
      {pendingReceived.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-xs font-bold tracking-wider text-[var(--reward)]">
            GELEN ISTEKLER ({pendingReceived.length})
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {pendingReceived.map((f) => (
              <div key={f.friendshipId} className="flex items-center gap-3 px-4 py-3">
                <ProfileAvatar profile={f.profile} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{f.profile.display_name || 'Arenaci'}</div>
                  <div className="text-[10px] text-[var(--muted)]">{f.profile.total_xp} XP</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptRequest(f.friendshipId)}
                    className="rounded-lg bg-[var(--growth)] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Kabul
                  </button>
                  <button
                    onClick={() => removeFriend(f.friendshipId, 'Istek reddedildi')}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
                  >
                    Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gonderilen istekler */}
      {pendingSent.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-xs font-bold tracking-wider text-[var(--text-sub)]">
            GONDERILEN ISTEKLER ({pendingSent.length})
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {pendingSent.map((f) => (
              <div key={f.friendshipId} className="flex items-center gap-3 px-4 py-3">
                <ProfileAvatar profile={f.profile} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{f.profile.display_name || 'Arenaci'}</div>
                </div>
                <button
                  onClick={() => removeFriend(f.friendshipId, 'Istek iptal edildi')}
                  className="text-xs text-[var(--muted)] underline"
                >
                  Iptal
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Arkadaslar */}
      <h2 className="mb-2 text-xs font-bold tracking-wider text-[var(--text-sub)]">
        ARKADASLAR ({friends.length})
      </h2>
      {friends.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <div className="mb-2 text-3xl">👥</div>
          <p className="text-sm text-[var(--muted)]">Henuz arkadasin yok. Yukaridaki arama ile kullanici bul!</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
          {friends.map((f) => (
            <div key={f.friendshipId} className="flex items-center gap-3 px-4 py-3">
              <ProfileAvatar profile={f.profile} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{f.profile.display_name || 'Arenaci'}</div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                  <span>{f.profile.total_xp} XP</span>
                  {f.profile.current_streak ? (
                    <span className="text-[var(--reward)]">🔥 {f.profile.current_streak} gun</span>
                  ) : null}
                </div>
              </div>
              <button
                onClick={async () => {
                  const game = prompt('Hangi oyun? (matematik, turkce, fen, sosyal, wordquest)', 'matematik')
                  if (!game) return
                  const res = await fetch('/api/challenges', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ opponentId: f.profile.id, game }),
                  })
                  if (res.ok) {
                    toast.success('Meydan okuma gonderildi! ⚔️')
                  } else {
                    const data = await res.json()
                    toast.error(data.error || 'Duello olusturulamadi')
                  }
                }}
                className="rounded-lg bg-[var(--reward)]/15 px-2.5 py-1 text-[10px] font-bold text-[var(--reward)] hover:bg-[var(--reward)]/25"
                title="Meydan Oku"
              >
                ⚔️
              </button>
              <button
                onClick={() => removeFriend(f.friendshipId, 'Arkadas kaldirildi')}
                className="text-xs text-[var(--muted)] hover:text-[var(--urgency)]"
                title="Arkadasliktan cikar"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProfileAvatar({ profile }: { profile: FriendProfile }) {
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.display_name || ''}
        className="h-8 w-8 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--focus)] text-xs font-bold text-white">
      {(profile.display_name || '?').charAt(0).toUpperCase()}
    </div>
  )
}
