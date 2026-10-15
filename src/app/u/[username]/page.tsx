import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { FriendRequestButton } from '@/components/profile/friend-request-button'
import { AvatarDecoration } from '@/components/profile/avatar-decoration'
import { Nameplate } from '@/components/profile/nameplate'

// Arkadaslara ozel profiller cookie'deki izleyiciye baglidir; ortak ISR cache'i
// kullanmak yetki sonucunu baska ziyaretcilere sizdirabilir.
export const dynamic = 'force-dynamic'

interface PublicProfile {
  id: string
  username: string
  avatar_url: string | null
  level: number
  level_name: string | null
  total_xp: number
  current_streak: number
  longest_streak: number
  total_questions: number
  correct_answers: number
  selected_nameplate: string | null
  selected_avatar_decorations: string[] | null
  created_at: string
  relationship_status?: string | null
}

/** Migration 185: whitelist kolonlar + private/friends/public hedef kitle kapisi. */
async function fetchVisibleProfile(username: string, viewerId: string | null): Promise<PublicProfile | null> {
  // username basit guard (RPC zaten lower-match + parametreli; injection yok)
  if (!username || username.length > 40) return null
  const svc = createServiceRoleClient()
  const viewerArgs = viewerId
    ? { p_username: username, p_viewer_id: viewerId }
    : { p_username: username }
  let { data, error } = await svc.rpc('get_public_profile', viewerArgs)

  // App-first rollout: migration 185 uygulanana kadar eski public-only RPC ile
  // sadece daha once paylasilabilir olan profiller calismaya devam eder.
  if (error) {
    const legacy = await svc.rpc('get_public_profile', { p_username: username })
    data = legacy.data
    error = legacy.error
  }
  if (error) return null
  return (data && data[0]) || null
}

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params
  // Metadata herkese aciktir; arkadas/ozel profil bilgisi baslikta sizmaz.
  const p = await fetchVisibleProfile(decodeURIComponent(username), null)
  if (!p) {
    return { title: 'Profil bulunamadı — Bilge Arena', robots: { index: false } }
  }
  const title = `${p.username} — Bilge Arena`
  const description = `${p.username}: ${p.total_xp} XP · ${p.level_name ?? 'Acemi'} · 🔥 ${p.current_streak} gün seri. Bilge Arena'da YKS · LGS · AYT yarış!`
  return {
    title,
    description,
    alternates: { canonical: `/u/${p.username}` },
    openGraph: { ...OG_DEFAULTS, title, description, url: `/u/${p.username}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicProfilePage(
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const p = await fetchVisibleProfile(decodeURIComponent(username), user?.id ?? null)
  if (!p) notFound()

  const accuracy = p.total_questions > 0
    ? Math.round((p.correct_answers / p.total_questions) * 100)
    : 0
  const memberSince = new Date(p.created_at).getFullYear()

  return (
    <main data-public-profile-screen className="mx-auto max-w-md px-4 py-10 md:max-w-[900px] md:px-6 md:py-12">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center md:overflow-hidden md:rounded-[26px] md:border-2 md:border-[var(--app-border)] md:bg-[var(--app-card)] md:p-0 md:shadow-[0_6px_0_var(--app-border)]">
        <div className="hidden h-2 bg-gradient-to-r from-[var(--app-accent)] via-[var(--app-accent-text)] to-[var(--app-warn)] md:block" aria-hidden="true" />
        <div className="md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-8 md:p-8 md:text-left">
          <section className="flex flex-col items-center md:border-r-2 md:border-[var(--app-border-soft)] md:pr-8" aria-label="Profil kimliği">
            <div className="md:hidden">
              {p.avatar_url ? (
                <img
                  src={p.avatar_url}
                  alt={p.username}
                  className="h-24 w-24 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--focus)] text-3xl font-bold text-white">
                  {p.username.charAt(0).toLocaleUpperCase('tr-TR')}
                </div>
              )}
            </div>
            <div className="hidden md:block">
              <AvatarDecoration decorationIds={p.selected_avatar_decorations} size={112}>
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt=""
                    className="h-28 w-28 rounded-full border-4 border-[var(--app-accent-border)] object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-[var(--app-accent-border)] bg-[var(--app-accent)] text-4xl font-black text-white" aria-hidden="true">
                    {p.username.charAt(0).toLocaleUpperCase('tr-TR')}
                  </div>
                )}
              </AvatarDecoration>
            </div>

            <h1 className="mt-4 max-w-full truncate text-xl font-bold md:mt-5 md:text-2xl md:font-black">
              <span className="md:hidden">{p.username}</span>
              <span className="hidden md:inline"><Nameplate nameplateId={p.selected_nameplate}>{p.username}</Nameplate></span>
            </h1>
            <p className="mt-1 text-sm text-[var(--text-sub)] md:font-bold md:text-[var(--app-text-sub)]">
              <span className="md:hidden">{p.level_name ?? 'Acemi'} · {p.total_xp.toLocaleString('tr-TR')} XP</span>
              <span className="hidden md:inline">{p.level_name ?? 'Acemi'} · Seviye {p.level}</span>
            </p>
            <p className="mt-1 hidden text-xs font-semibold text-[var(--app-accent-text)] md:block">
              {p.total_xp.toLocaleString('tr-TR')} XP
            </p>
            <p className="mt-4 text-[11px] text-[var(--text-muted)] md:leading-5 md:text-[var(--app-text-muted)]">
              <span className="md:hidden">{`${memberSince}'ten beri arenada · En uzun seri: ${p.longest_streak} gün`}</span>
              <span className="hidden md:inline">{`${memberSince}'ten beri arenada`}<br />En uzun seri: {p.longest_streak} gün</span>
            </p>
          </section>

          <section className="min-w-0 md:mt-0" aria-label="Paylaşılan profil özeti">
            <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-[var(--app-accent-text)] md:block">Paylaşılan profil</p>
            <h2 className="mt-1 hidden text-xl font-black text-[var(--app-text)] md:block">Arena ilerlemesi</h2>
            <p className="mt-2 hidden text-xs font-semibold leading-5 text-[var(--app-text-sub)] md:block">
              Yalnız kullanıcının paylaşmayı seçtiği oyun istatistikleri gösterilir.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Stat label="Doğruluk" value={`%${accuracy}`} />
              <Stat label="Seri" value={`🔥 ${p.current_streak}`} />
              <Stat label="Soru" value={p.total_questions.toLocaleString('tr-TR')} />
            </div>

            <div className="md:max-w-sm">
              {user?.id && user.id !== p.id && p.relationship_status === 'accepted' && (
                <p className="mt-5 rounded-xl bg-[var(--growth)]/15 px-4 py-3 text-sm font-bold text-[var(--growth)]">✓ Arkadaşsınız</p>
              )}
              {user?.id && user.id !== p.id && p.relationship_status === 'pending' && (
                <p className="mt-5 rounded-xl bg-[var(--reward)]/15 px-4 py-3 text-sm font-bold text-[var(--reward)]">Arkadaşlık isteği bekliyor</p>
              )}
              {user?.id && user.id !== p.id && !p.relationship_status && (
                <FriendRequestButton targetId={p.id} />
              )}
              {!user && (
                <Link href="/giris" className="mt-5 inline-flex min-h-11 items-center rounded-xl border-2 border-[var(--border)] px-4 text-sm font-bold md:border-[var(--app-border)]">
                  Arkadaş eklemek için giriş yap
                </Link>
              )}
            </div>

            <Link
              href="/arena"
              className="btn-primary mt-6 inline-block rounded-xl px-6 py-3 text-sm font-bold tracking-wide md:inline-flex md:min-h-12 md:items-center md:justify-center"
            >
              <span className="md:hidden">Sen de Katıl</span>
              <span className="hidden md:inline">{user ? 'Arenaya dön' : 'Sen de katıl'}</span>
            </Link>
          </section>
        </div>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center md:min-w-0 md:border-2 md:border-[var(--app-border)] md:bg-[var(--app-card-sunken)]">
      <div className="text-base font-extrabold text-[var(--focus-light)] md:truncate md:text-lg md:text-[var(--app-accent-text)]">{value}</div>
      <div className="mt-0.5 text-[10px] text-[var(--text-muted)] md:font-bold md:text-[var(--app-text-muted)]">{label}</div>
    </div>
  )
}
