'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import Link from 'next/link'
import { GAME_LIST, type GameSlug } from '@/lib/constants/games'

interface FriendProfile {
  id: string
  username?: string | null
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
  username?: string | null
  display_name: string | null
  avatar_url: string | null
  total_xp: number
}

/** Username > display_name > fallback */
function displayName(p: { username?: string | null; display_name?: string | null }): string {
  return p.username || p.display_name || 'Arenaci'
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
  const [challengeTarget, setChallengeTarget] = useState<string | null>(null)
  const [sendingChallenge, setSendingChallenge] = useState(false)

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
      toast.success('Arkadaş isteği gönderildi!')
      setSearchQuery('')
      setSearchResults([])
      fetchFriends()
    } else {
      const err = await res.json()
      toast.error(err.error || 'İstek gönderilemedi')
    }
  }

  const acceptRequest = async (friendshipId: string) => {
    const res = await fetch('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId }),
    })
    if (res.ok) {
      toast.success('Arkadaş isteği kabul edildi!')
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
        <h1 className="mb-2 text-xl font-bold">Arkadaşlar</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">Arkadaşlarını görmek için giriş yap.</p>
        <Link href="/giris" className="btn-primary inline-block rounded-[10px] px-8 py-3 font-display text-sm font-bold tracking-wider">
          Giriş Yap
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
      <h1 className="mb-6 text-xl font-bold">Arkadaşlar</h1>

      {/* Arama */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Kullanıcı ara..."
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--focus)]"
        />
        {searching && <p className="mt-2 text-xs text-[var(--muted)]">Aranıyor...</p>}
        {searchResults.length > 0 && (
          <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--focus)] text-xs font-bold text-white">
                  {displayName(u).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{displayName(u)}</div>
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
            GELEN İSTEKLER ({pendingReceived.length})
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {pendingReceived.map((f) => (
              <div key={f.friendshipId} className="flex items-center gap-3 px-4 py-3">
                <ProfileAvatar profile={f.profile} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{displayName(f.profile)}</div>
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
                    onClick={() => removeFriend(f.friendshipId, 'İstek reddedildi')}
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
            GÖNDERİLEN İSTEKLER ({pendingSent.length})
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {pendingSent.map((f) => (
              <div key={f.friendshipId} className="flex items-center gap-3 px-4 py-3">
                <ProfileAvatar profile={f.profile} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{displayName(f.profile)}</div>
                </div>
                <button
                  onClick={() => removeFriend(f.friendshipId, 'İstek iptal edildi')}
                  className="text-xs text-[var(--muted)] underline"
                >
                  İptal
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Arkadaslar */}
      <h2 className="mb-2 text-xs font-bold tracking-wider text-[var(--text-sub)]">
        ARKADAŞLAR ({friends.length})
      </h2>
      {friends.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <div className="mb-2 text-3xl">👥</div>
          <p className="text-sm text-[var(--muted)]">Henüz arkadaşın yok. Yukarıdaki arama ile kullanıcı bul!</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
          {friends.map((f) => (
            <div key={f.friendshipId}>
              <div className="flex items-center gap-3 px-4 py-3">
                <ProfileAvatar profile={f.profile} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{displayName(f.profile)}</div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                    <span>{f.profile.total_xp} XP</span>
                    {f.profile.current_streak ? (
                      <span className="text-[var(--reward)]">🔥 {f.profile.current_streak} gün</span>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => setChallengeTarget(challengeTarget === f.profile.id ? null : f.profile.id)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors ${
                    challengeTarget === f.profile.id
                      ? 'bg-[var(--reward)] text-white'
                      : 'bg-[var(--reward)]/15 text-[var(--reward)] hover:bg-[var(--reward)]/25'
                  }`}
                  title="Meydan Oku"
                >
                  ⚔️
                </button>
                <button
                  onClick={() => removeFriend(f.friendshipId, 'Arkadaş kaldırıldı')}
                  className="text-xs text-[var(--muted)] hover:text-[var(--urgency)]"
                  title="Arkadaşlıktan çıkar"
                >
                  ✕
                </button>
              </div>
              {/* Oyun secim paneli */}
              {challengeTarget === f.profile.id && (
                <div className="grid grid-cols-5 gap-1.5 px-4 pb-3">
                  {GAME_LIST.map((g) => (
                    <button
                      key={g.slug}
                      disabled={sendingChallenge}
                      onClick={async () => {
                        setSendingChallenge(true)
                        const res = await fetch('/api/challenges', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ opponentId: f.profile.id, game: g.slug }),
                        })
                        setSendingChallenge(false)
                        if (res.ok) {
                          toast.success(`${g.name} duellosu gönderildi!`)
                          setChallengeTarget(null)
                        } else {
                          const data = await res.json()
                          toast.error(data.error || 'Duello oluşturulamadı')
                        }
                      }}
                      className="flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-center transition-all hover:border-[var(--focus)] hover:bg-[var(--focus)]/10 disabled:opacity-50"
                    >
                      <span className="text-base" style={{ color: g.colorHex }}>
                        {g.slug === 'matematik' ? '🔢' : g.slug === 'turkce' ? '📖' : g.slug === 'fen' ? '🔬' : g.slug === 'sosyal' ? '🌍' : '🇬🇧'}
                      </span>
                      <span className="text-[9px] font-medium leading-tight">{g.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProfileAvatar({ profile }: { profile: FriendProfile }) {
  const name = displayName(profile)
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        className="h-8 w-8 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--focus)] text-xs font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
