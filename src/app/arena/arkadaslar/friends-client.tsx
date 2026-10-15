'use client'

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import Image from 'next/image'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'
import Link from 'next/link'
import {
  Ban,
  BookOpen,
  Calculator,
  Check,
  Clock3,
  Flag,
  Flame,
  FlaskConical,
  Globe2,
  Languages,
  LogIn,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Swords,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { GAME_LIST, type GameSlug } from '@/lib/constants/games'
import { trUpper } from '@/lib/utils/tr-text'
import { bilgeImage } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'

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
  profile_viewable?: boolean
}

type ReportType = 'harassment' | 'inappropriate' | 'impersonation' | 'spam' | 'other'

const REPORT_REASONS: { value: ReportType; label: string }[] = [
  { value: 'harassment', label: 'Taciz / zorbalık' },
  { value: 'inappropriate', label: 'Uygunsuz isim / avatar' },
  { value: 'impersonation', label: 'Taklit / sahtekârlık' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Diğer' },
]

const GAME_ICONS: Record<GameSlug, LucideIcon> = {
  matematik: Calculator,
  turkce: BookOpen,
  fen: FlaskConical,
  sosyal: Globe2,
  wordquest: Languages,
}

/** Username > display_name > fallback */
function displayName(p: { username?: string | null; display_name?: string | null }): string {
  return p.username || p.display_name || 'Arenaci'
}

export default function FriendsClient() {
  const { user } = useAuthStore()
  const { character } = useBilgeCharacter()
  const [friends, setFriends] = useState<FriendItem[]>([])
  const [pendingReceived, setPendingReceived] = useState<FriendItem[]>([])
  const [pendingSent, setPendingSent] = useState<FriendItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [challengeTarget, setChallengeTarget] = useState<string | null>(null)
  const [sendingChallenge, setSendingChallenge] = useState(false)
  const [blocked, setBlocked] = useState<BlockedItem[]>([])
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const fetchFriends = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/friends')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Arkadaşlar yüklenemedi')
        return
      }
      setFriends(data.friends || [])
      setPendingReceived(data.pendingReceived || [])
      setPendingSent(data.pendingSent || [])
      setBlocked(data.blocked || [])
    } catch {
      setLoadError('Bağlantı kurulamadı. Tekrar deneyebilirsin.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) fetchFriends()
    else setLoading(false)
  }, [user, fetchFriends])

  // Kullanici arama (debounce)
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      setSearchError('')
      setSearching(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      setSearchError('')
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, { signal: controller.signal })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setSearchResults([])
          setSearchError(data.error || 'Arama şu anda kullanılamıyor')
          return
        }
        setSearchResults(data.users || [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSearchResults([])
          setSearchError('Arama bağlantısı kurulamadı')
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery])

  const sendRequest = async (friendId: string) => {
    if (requestingId) return
    setRequestingId(friendId)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId }),
      })
      if (res.ok) {
        toast.success('Arkadaş isteği gönderildi!')
        setSearchQuery('')
        setSearchResults([])
        await fetchFriends()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'İstek gönderilemedi')
      }
    } catch {
      toast.error('Bağlantı kurulamadı')
    } finally {
      setRequestingId(null)
    }
  }

  const acceptRequest = async (friendshipId: string) => {
    try {
      const res = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId }),
      })
      if (res.ok) {
        toast.success('Arkadaş isteği kabul edildi!')
        await fetchFriends()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'İstek kabul edilemedi')
      }
    } catch {
      toast.error('Bağlantı kurulamadı')
    }
  }

  const removeFriend = async (friendshipId: string, label: string) => {
    try {
      const res = await fetch('/api/friends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId }),
      })
      if (res.ok) {
        toast.info(label)
        await fetchFriends()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'İşlem tamamlanamadı')
      }
    } catch {
      toast.error('Bağlantı kurulamadı')
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
      <div data-friends-screen className="min-h-[100dvh] bg-[var(--app-bg)] pb-24 text-[var(--app-text)] lg:bg-transparent lg:pb-10">
        <style>{`@media (max-width: 1023px) { [data-app-navbar] { display: none !important; } [data-arena-main] { padding-top: 0 !important; } }`}</style>
        <header className="sticky top-0 z-30 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)]/95 backdrop-blur-xl lg:static lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2.5 px-4 lg:h-auto lg:px-6 lg:pb-5 lg:pt-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><UsersRound size={22} strokeWidth={2.7} /></span>
            <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Birlikte öğren</p><h1 className="text-lg font-black leading-5 md:text-2xl">Arkadaşlar</h1></div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-3 pt-3 md:px-5 lg:px-6 lg:pt-0">
          <section className="relative min-h-[330px] overflow-hidden rounded-[28px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-6 shadow-[0_7px_0_var(--app-border)] md:min-h-[390px] md:p-10">
            <Image src="/academy/academy-landscape.png" alt="" fill priority sizes="(min-width: 1024px) 1120px, 100vw" className="pointer-events-none object-cover object-center opacity-35" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--app-card)] via-[var(--app-card)]/95 to-[var(--app-card)]/20" />
            <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[42px] border-[var(--app-accent)]/10" />
            <Image src={bilgeImage(character, 'destekleyici')} alt="Bilge, arkadaşlık rehberin" width={310} height={310} sizes="(min-width: 768px) 290px, 190px" className="pointer-events-none absolute -bottom-5 right-0 z-[1] h-[200px] w-auto object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,.28)] md:right-10 md:h-[300px]" />
            <div className="relative z-10 max-w-xl">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]"><Sparkles size={14} /> Bilge Arena topluluğu</p>
              <h2 className="mt-3 max-w-lg text-3xl font-black leading-[1.08] md:text-5xl">Birlikte öğren, birlikte yüksel.</h2>
              <p className="mt-4 max-w-lg text-sm font-semibold leading-6 text-[var(--app-text-sub)] md:text-base">Arkadaşlarını bul, ilerlemenizi takip edin ve kısa ders düellolarıyla birbirinizi motive edin.</p>
              <Link href="/giris?next=%2Farena%2Farkadaslar" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-6 text-sm font-black text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-0.5 active:shadow-none">
                <LogIn size={18} /> Giriş yap ve arkadaşlarını bul
              </Link>
            </div>
          </section>

          <div className="mt-5 grid gap-3 md:grid-cols-3 md:gap-5">
            {[
              { Icon: Search, title: 'Arkadaşlarını bul', text: 'Kullanıcı adıyla güvenli biçimde ara ve istek gönder.' },
              { Icon: Swords, title: 'Düelloya davet et', text: 'Bir ders seç, kısa bir mücadele başlat ve birlikte ilerle.' },
              { Icon: ShieldCheck, title: 'Kontrol sende', text: 'Gizlilik, engelleme ve şikâyet araçları her zaman yanında.' },
            ].map(({ Icon, title, text }) => (
              <article key={title} className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-[0_5px_0_var(--app-border)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><Icon size={22} strokeWidth={2.5} /></span>
                <h3 className="mt-4 text-base font-black">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">{text}</p>
              </article>
            ))}
          </div>
        </main>
      </div>
    )
  }

  if (loading) {
    return (
      <div data-friends-screen className="min-h-[100dvh] bg-[var(--app-bg)] text-[var(--app-text)] lg:bg-transparent">
        <style>{`@media (max-width: 1023px) { [data-app-navbar] { display: none !important; } [data-arena-main] { padding-top: 0 !important; } }`}</style>
        <header className="border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)] lg:border-0 lg:bg-transparent"><div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2.5 px-4 lg:h-auto lg:px-6 lg:pb-5 lg:pt-8"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><UsersRound size={22} /></span><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Birlikte öğren</p><h1 className="text-lg font-black">Arkadaşlar</h1></div></div></header>
        <div className="mx-auto flex min-h-[55vh] max-w-[1180px] items-center justify-center px-4"><div className="flex items-center gap-3 rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card)] px-5 py-4 text-sm font-black shadow-[0_5px_0_var(--app-border)]"><span className="h-6 w-6 animate-spin rounded-full border-[3px] border-[var(--app-border)] border-t-[var(--app-accent)]" /> Arkadaş çevren hazırlanıyor</div></div>
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
    <div data-friends-screen className="min-h-[100dvh] bg-[var(--app-bg)] pb-24 text-[var(--app-text)] lg:bg-transparent lg:pb-10">
      <style>{`@media (max-width: 1023px) { [data-app-navbar] { display: none !important; } [data-arena-main] { padding-top: 0 !important; } }`}</style>
      <header className="sticky top-0 z-30 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)]/95 backdrop-blur-xl lg:static lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 lg:h-auto lg:px-6 lg:pb-5 lg:pt-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><UsersRound size={22} strokeWidth={2.7} /></span>
            <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Birlikte öğren</p><h1 className="text-lg font-black leading-5 md:text-2xl">Arkadaşlar</h1></div>
          </div>
          {pendingReceived.length > 0 && <span className="rounded-xl bg-[var(--app-warn-tint)] px-2.5 py-1.5 text-[10px] font-black text-[var(--app-warn-ink)]">{pendingReceived.length} yeni istek</span>}
        </div>
      </header>

      <main data-friends-content className="mx-auto w-full max-w-[1180px] px-3 pt-3 md:px-5 lg:px-6 lg:pt-0">
        <section data-friends-hero className="relative min-h-[188px] overflow-hidden rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-5 shadow-[0_6px_0_var(--app-border)] md:min-h-[220px] md:p-7">
          <Image src="/academy/academy-landscape.png" alt="" fill priority sizes="(min-width: 1024px) 1120px, 100vw" className="pointer-events-none object-cover object-center opacity-35" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--app-card)] via-[var(--app-card)]/95 to-[var(--app-card)]/20" />
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[32px] border-[var(--app-accent)]/10" />
          <Image src={bilgeImage(character, 'neseli')} alt="Bilge, arkadaşlık rehberin" width={240} height={240} sizes="(min-width: 768px) 220px, 150px" className="pointer-events-none absolute -bottom-8 right-0 z-[1] h-[155px] w-auto object-contain drop-shadow-[0_12px_22px_rgba(15,23,42,.28)] md:right-8 md:h-[225px]" />
          <div className="relative z-10 max-w-[70%] md:max-w-[62%]">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--app-accent-text)]"><Sparkles size={14} /> Senin çalışma çevren</p>
            <h2 className="mt-2 text-2xl font-black leading-tight md:text-3xl">Birlikte ilerlemek daha güçlü.</h2>
            <p className="mt-2 hidden max-w-xl text-sm font-semibold leading-6 text-[var(--app-text-sub)] sm:block">Arkadaşlarının ilerlemesini gör, uygun dersi seç ve kısa bir düelloyla çalışma ritmini paylaş.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black">
              <span className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card)]/85 px-3 py-2"><UserRoundCheck size={13} className="mr-1.5 inline" />{friends.length} arkadaş</span>
              <span className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card)]/85 px-3 py-2"><Clock3 size={13} className="mr-1.5 inline" />{pendingReceived.length + pendingSent.length} bekleyen</span>
            </div>
          </div>
        </section>

      {loadError && (
        <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-[18px] border-2 border-[var(--app-danger-border)] bg-[var(--app-danger-tint)] p-4 text-xs font-bold text-[var(--app-danger-ink)]">
          <span>{loadError}</span>
          <button type="button" onClick={fetchFriends} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-current px-3 font-black"><RotateCcw size={15} /> Tekrar dene</button>
        </div>
      )}

      <div
        data-friends-layout
        className="mt-5 grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6"
      >
        <aside
          data-friends-sidebar
          className="space-y-4 md:col-start-2 md:row-start-1 lg:sticky lg:top-[calc(var(--navbar-h)+1.5rem)]"
          aria-label="Arkadaş arama ve istekler"
        >
      <section data-friends-search className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-border)]">
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><UserPlus size={21} strokeWidth={2.6} /></span>
          <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">Yeni bağlantı</p><h2 className="mt-0.5 text-base font-black">Arkadaş bul</h2></div>
        </div>
        <label className="relative block">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]" />
          <input ref={searchInputRef} type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Kullanıcı ara..." className="min-h-12 w-full rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] pl-10 pr-4 text-sm font-semibold outline-none transition-colors placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)]" />
        </label>
        {searching && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--app-text-muted)]"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--app-border)] border-t-[var(--app-accent)]" /> Aranıyor...</p>}
        {searchError && <p role="alert" className="mt-2 text-xs font-bold text-[var(--app-danger-ink)]">{searchError}</p>}
        {searchResults.length > 0 && (
          <div className="mt-3 divide-y divide-[var(--app-border-soft)] overflow-hidden rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)]">
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-3 py-3">
                <ProfileAvatar profile={u} compact />
                <div className="min-w-0 flex-1">
                  {u.username && u.profile_viewable ? <Link href={`/u/${u.username}`} className="block truncate text-sm font-black hover:text-[var(--app-accent)]">{displayName(u)}</Link> : <div className="truncate text-sm font-black">{displayName(u)}</div>}
                  {u.total_xp > 0 && <div className="text-[10px] font-semibold text-[var(--app-text-muted)]">{u.total_xp.toLocaleString()} XP</div>}
                </div>
                {existingIds.has(u.id) ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--app-success-tint)] px-2 py-1 text-[10px] font-black text-[var(--app-success-ink)]"><Check size={12} /> Eklendi</span>
                ) : (
                  <button onClick={() => sendRequest(u.id)} disabled={requestingId !== null} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--app-accent)] px-3 text-xs font-black text-white shadow-[0_3px_0_var(--app-accent-strong)] disabled:opacity-60"><Send size={13} /> {requestingId === u.id ? 'Gönderiliyor…' : 'Ekle'}</button>
                )}
              </div>
            ))}
          </div>
        )}
        {searchQuery.length > 0 && searchQuery.length < 2 && <p className="mt-2 text-[10px] font-semibold text-[var(--app-text-muted)]">Aramak için en az 2 karakter yaz.</p>}
      </section>

      {pendingReceived.length > 0 && (
        <section className="rounded-[22px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-warn-border)]">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-warn-ink)]">Seni bekliyor</p><h2 className="mt-0.5 text-sm font-black">Gelen istekler</h2></div><span className="rounded-lg bg-[var(--app-warn-tint)] px-2 py-1 text-[10px] font-black text-[var(--app-warn-ink)]">{pendingReceived.length}</span></div>
          <div className="space-y-2">
            {pendingReceived.map((f) => (
              <article key={f.friendshipId} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-sunken)] p-3">
                <div className="flex items-center gap-3"><ProfileAvatar profile={f.profile} compact /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{displayName(f.profile)}</p><p className="text-[10px] font-semibold text-[var(--app-text-muted)]">{f.profile.total_xp.toLocaleString()} XP</p></div></div>
                <div className="mt-3 grid grid-cols-[1fr_1fr_42px] gap-2">
                  <button onClick={() => acceptRequest(f.friendshipId)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-[var(--app-success-solid)] px-2 text-xs font-black text-white"><Check size={14} /> Kabul</button>
                  <button onClick={() => removeFriend(f.friendshipId, 'İstek reddedildi')} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-card)] px-2 text-xs font-black text-[var(--app-text-sub)]"><X size={14} /> Reddet</button>
                  <button aria-label={`${displayName(f.profile)} adlı kullanıcıyı engelle`} onClick={() => blockUser(f.profile.id, displayName(f.profile))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-danger)]" title="Engelle"><Ban size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {pendingSent.length > 0 && (
        <section className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-border)]">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[0.14em] text-[var(--app-text-sub)]">Gönderilen istekler</h2><span className="text-[10px] font-black text-[var(--app-text-muted)]">{pendingSent.length}</span></div>
          <div className="space-y-2">{pendingSent.map((f) => <div key={f.friendshipId} className="flex items-center gap-3 rounded-2xl bg-[var(--app-card-sunken)] p-3"><ProfileAvatar profile={f.profile} compact /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{displayName(f.profile)}</p><p className="text-[10px] font-semibold text-[var(--app-text-muted)]">Yanıt bekleniyor</p></div><button aria-label={`${displayName(f.profile)} isteğini iptal et`} onClick={() => removeFriend(f.friendshipId, 'İstek iptal edildi')} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-danger)]"><X size={15} /></button></div>)}</div>
        </section>
      )}
        </aside>

        <section
          data-friends-main
          className="min-w-0 rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-border)] md:col-start-1 md:row-start-1 md:p-5"
          aria-labelledby="friends-list-title"
        >
      <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--app-accent-text)]">Çalışma çevren</p><h2 id="friends-list-title" className="mt-1 text-lg font-black">Arkadaşların <span className="text-[var(--app-text-muted)]">({friends.length})</span></h2><p className="mt-1 text-xs font-semibold leading-5 text-[var(--app-text-sub)]">İlerlemeyi gör veya kısa bir ders düellosu başlat.</p></div><span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent)] sm:flex"><UserRoundCheck size={22} /></span></div>
      {friends.length === 0 ? (
        <div className="flex min-h-[270px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-[var(--app-border)] bg-[var(--app-card-sunken)] px-6 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[var(--app-accent-tint)] text-[var(--app-accent)]"><UsersRound size={30} strokeWidth={2.3} /></span>
          <h3 className="mt-4 text-lg font-black">İlk çalışma arkadaşını bul</h3>
          <p className="mt-1 max-w-sm text-sm font-semibold leading-6 text-[var(--app-text-sub)]">Henüz arkadaşın yok. Yukarıdaki arama ile kullanıcı bul!</p>
          <button type="button" onClick={() => searchInputRef.current?.focus()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--app-accent)] px-5 text-xs font-black text-white shadow-[0_4px_0_var(--app-accent-strong)]"><Search size={16} /> Arkadaş ara</button>
        </div>
      ) : (
        <div className="space-y-3">
          {friends.map((f) => (
            <article key={f.friendshipId} className="overflow-hidden rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] transition-colors hover:border-[var(--app-accent-border)]">
              <div className="flex flex-wrap items-center gap-3 p-3.5 md:flex-nowrap md:p-4">
                <ProfileAvatar profile={f.profile} />
                <div className="min-w-0 flex-1">
                  {f.profile.username ? <Link href={`/u/${f.profile.username}`} className="block truncate text-sm font-black hover:text-[var(--app-accent)]">{displayName(f.profile)}</Link> : <div className="truncate text-sm font-black">{displayName(f.profile)}</div>}
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-[var(--app-text-muted)]">
                    <span>{f.profile.total_xp.toLocaleString()} XP</span>
                    {f.profile.current_streak ? <span className="inline-flex items-center gap-1 text-[var(--app-warn-ink)]"><Flame size={11} fill="currentColor" /> {f.profile.current_streak} gün</span> : null}
                  </div>
                </div>
                <button
                  aria-label={`${displayName(f.profile)} adlı kullanıcıya meydan oku`}
                  onClick={() => setChallengeTarget(challengeTarget === f.profile.id ? null : f.profile.id)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-black transition-colors ${
                    challengeTarget === f.profile.id
                      ? 'bg-[var(--app-warn)] text-[#342000] shadow-[0_3px_0_var(--app-warn-strong)]'
                      : 'bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)] hover:bg-[var(--app-warn-border)]'
                  }`}
                  title="Meydan Oku"
                >
                  <Swords size={15} /> <span className="hidden sm:inline">Meydan oku</span>
                </button>
                <div className="ml-auto flex items-center gap-1 sm:ml-0">
                  <button aria-label={`${displayName(f.profile)} adlı kullanıcıyı şikâyet et`} onClick={() => setReportTarget({ id: f.profile.id, name: displayName(f.profile) })} className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-warn)]" title="Şikâyet et"><Flag size={16} /></button>
                  <button aria-label={`${displayName(f.profile)} adlı kullanıcıyı engelle`} onClick={() => blockUser(f.profile.id, displayName(f.profile))} className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:bg-[var(--app-danger-tint)] hover:text-[var(--app-danger)]" title="Engelle"><Ban size={16} /></button>
                  <button aria-label={`${displayName(f.profile)} adlı kullanıcıyı arkadaşlıktan çıkar`} onClick={() => removeFriend(f.friendshipId, 'Arkadaş kaldırıldı')} className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:bg-[var(--app-danger-tint)] hover:text-[var(--app-danger)]" title="Arkadaşlıktan çıkar"><UserRoundX size={17} /></button>
                </div>
              </div>
              {challengeTarget === f.profile.id && (
                <div className="border-t-2 border-[var(--app-border)] bg-[var(--app-card)] p-3.5">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Düello dersini seç</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {GAME_LIST.map((g) => {
                    const GameIcon = GAME_ICONS[g.slug]
                    return (
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
                      style={{ '--duel-color': g.colorHex } as CSSProperties}
                      className="flex min-h-[70px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-2 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--duel-color)] disabled:opacity-50"
                    >
                      <GameIcon size={19} style={{ color: g.colorHex }} />
                      <span className="text-[9px] font-black leading-tight">{g.name}</span>
                    </button>
                  )})}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
        </section>
      </div>

      {blocked.length > 0 && (
        <details className="mt-5 rounded-[20px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 text-[var(--app-text-sub)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-black"><Ban size={16} /> Engellenen kullanıcılar <span className="ml-auto rounded-lg bg-[var(--app-card-sunken)] px-2 py-1 text-[10px]">{blocked.length}</span></summary>
          <div className="mt-3 divide-y divide-[var(--app-border-soft)] border-t border-[var(--app-border-soft)]">{blocked.map((b) => <div key={b.friendshipId} className="flex items-center gap-3 py-3"><ProfileAvatar profile={b.profile} compact /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{displayName(b.profile)}</p></div><button onClick={() => unblockUser(b.profile.id)} className="min-h-10 rounded-xl border border-[var(--app-border)] px-3 text-xs font-black hover:text-[var(--app-text)]">Engeli kaldır</button></div>)}</div>
        </details>
      )}

      {/* Sikayet modali */}
      {reportTarget && (
        <ReportModal
          name={reportTarget.name}
          onClose={() => setReportTarget(null)}
          onSubmit={submitReport}
        />
      )}
      </main>
    </div>
  )
}

function ProfileAvatar({ profile, compact = false }: { profile: FriendProfile | SearchUser; compact?: boolean }) {
  const name = displayName(profile)
  const sizeClass = compact ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base'
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        loading="lazy"
        className={`${sizeClass} shrink-0 rounded-2xl border-2 border-[var(--app-border)] object-cover`}
      />
    )
  }
  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--app-accent)] to-[var(--app-accent-strong)] font-black text-white shadow-[0_3px_0_var(--app-accent-strong)]`}>
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
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const returnFocus = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    focusables()[0]?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocus?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--app-overlay)] p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="w-full max-w-md rounded-[26px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-5 text-[var(--app-text)] shadow-[0_8px_0_var(--app-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-danger-tint)] text-[var(--app-danger)]"><Flag size={21} strokeWidth={2.5} /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--app-danger-ink)]">Güvenlik bildirimi</p><h3 id="report-dialog-title" className="mt-0.5 text-lg font-black">Kullanıcıyı şikâyet et</h3><p className="truncate text-xs font-semibold text-[var(--app-text-muted)]">{name}</p></div>
          <button type="button" aria-label="Şikâyet penceresini kapat" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--app-text-muted)] hover:bg-[var(--app-hover)]"><X size={18} /></button>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-xs font-bold ${type === r.value ? 'border-[var(--app-danger)] bg-[var(--app-danger-tint)] text-[var(--app-danger-ink)]' : 'border-[var(--app-border)] bg-[var(--app-card-sunken)] text-[var(--app-text-sub)]'}`}>
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
          className="mb-4 w-full resize-none rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] px-3 py-3 text-sm outline-none placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)]"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="min-h-11 rounded-xl border-2 border-[var(--app-border)] px-4 text-sm font-black text-[var(--app-text-sub)]"
          >
            Vazgeç
          </button>
          <button
            disabled={submitting}
            onClick={() => { setSubmitting(true); onSubmit(type, reason) }}
            className="min-h-11 rounded-xl bg-[var(--app-danger-strong)] px-4 text-sm font-black text-white shadow-[0_4px_0_var(--app-danger)] disabled:opacity-50"
          >
            Şikâyet et
          </button>
        </div>
      </div>
    </div>
  )
}
