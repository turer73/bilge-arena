'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import Link from 'next/link'
import { GAME_LIST } from '@/lib/constants/games'
import { trUpper } from '@/lib/utils/tr-text'

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

interface BlockedItem {
  friendshipId: string
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

type ReportType = 'harassment' | 'inappropriate' | 'impersonation' | 'spam' | 'other'

const REPORT_REASONS: { value: ReportType; label: string }[] = [
  { value: 'harassment', label: 'Taciz / zorbalık' },
  { value: 'inappropriate', label: 'Uygunsuz isim / avatar' },
  { value: 'impersonation', label: 'Taklit / sahtekârlık' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Diğer' },
]

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
  const [blocked, setBlocked] = useState<BlockedItem[]>([])
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)

  const fetchFriends = useCallback(async () => {
    const res = await fetch('/api/friends')
    if (!res.ok) return
    const data = await res.json()
    setFriends(data.friends || [])
    setPendingReceived(data.pendingReceived || [])
    setPendingSent(data.pendingSent || [])
    setBlocked(data.blocked || [])
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

  const blockUser = async (targetId: string, name: string) => {
    if (!confirm(`${name} engellensin mi? Arkadaşlığınız kaldırılır ve birbirinizi arayamazsınız.`)) return
    const res = await fetch('/api/friends/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId }),
    })
    if (res.ok) {
      toast.info(`${name} engellendi`)
      fetchFriends()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Engellenemedi')
    }
  }

  const unblockUser = async (targetId: string) => {
    const res = await fetch('/api/friends/block', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId }),
    })
    if (res.ok) {
      toast.info('Engel kaldırıldı')
      fetchFriends()
    }
  }

  const submitReport = async (reportType: ReportType, reason: string) => {
    if (!reportTarget) return
    const res = await fetch('/api/users/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportedUserId: reportTarget.id, reportType, reason: reason || undefined }),
    })
    setReportTarget(null)
    if (res.ok) toast.success('Şikayetin alındı, teşekkürler')
    else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || 'Şikayet gönderilemedi')
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
                  {trUpper(displayName(u).charAt(0))}
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
                  <button
                    onClick={() => blockUser(f.profile.id, displayName(f.profile))}
                    className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--urgency)]"
                    title="Engelle"
                  >
                    🚫
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
                  onClick={() => setReportTarget({ id: f.profile.id, name: displayName(f.profile) })}
                  className="text-sm text-[var(--muted)] hover:text-[var(--reward)]"
                  title="Şikayet et"
                >
                  ⚑
                </button>
                <button
                  onClick={() => blockUser(f.profile.id, displayName(f.profile))}
                  className="text-sm text-[var(--muted)] hover:text-[var(--urgency)]"
                  title="Engelle"
                >
                  🚫
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

      {/* Engellenenler */}
      {blocked.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-bold tracking-wider text-[var(--text-sub)]">
            ENGELLENENLER ({blocked.length})
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
            {blocked.map((b) => (
              <div key={b.friendshipId} className="flex items-center gap-3 px-4 py-3">
                <ProfileAvatar profile={b.profile} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--muted)]">{displayName(b.profile)}</div>
                </div>
                <button
                  onClick={() => unblockUser(b.profile.id)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Engeli kaldır
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sikayet modali */}
      {reportTarget && (
        <ReportModal
          name={reportTarget.name}
          onClose={() => setReportTarget(null)}
          onSubmit={submitReport}
        />
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
      {trUpper(name.charAt(0))}
    </div>
  )
}

function ReportModal({
  name,
  onClose,
  onSubmit,
}: {
  name: string
  onClose: () => void
  onSubmit: (type: ReportType, reason: string) => void
}) {
  const [type, setType] = useState<ReportType>('harassment')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-bold">Kullanıcıyı şikayet et</h3>
        <p className="mb-4 truncate text-xs text-[var(--muted)]">{name}</p>

        <div className="mb-4 space-y-1.5">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="report-reason"
                checked={type === r.value}
                onChange={() => setType(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 1000))}
          placeholder="İstersen kısaca açıkla (opsiyonel)"
          rows={3}
          className="mb-4 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--focus)]"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)]"
          >
            Vazgeç
          </button>
          <button
            disabled={submitting}
            onClick={() => { setSubmitting(true); onSubmit(type, reason) }}
            className="rounded-lg bg-[var(--urgency)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Şikayet et
          </button>
        </div>
      </div>
    </div>
  )
}
