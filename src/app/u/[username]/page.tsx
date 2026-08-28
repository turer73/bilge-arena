import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { FriendRequestButton } from '@/components/profile/friend-request-button'

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
  let { data, error } = await svc.rpc('get_public_profile', {
    p_username: username,
    p_viewer_id: viewerId,
  })

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
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        {p.avatar_url ? (
          <img
            src={p.avatar_url}
            alt={p.username}
            className="mx-auto h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--focus)] text-3xl font-bold text-white">
            {p.username.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className="mt-4 text-xl font-bold">{p.username}</h1>
        <p className="mt-1 text-sm text-[var(--text-sub)]">
          {p.level_name ?? 'Acemi'} · {p.total_xp.toLocaleString('tr-TR')} XP
        </p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Doğruluk" value={`%${accuracy}`} />
          <Stat label="Seri" value={`🔥 ${p.current_streak}`} />
          <Stat label="Soru" value={p.total_questions.toLocaleString('tr-TR')} />
        </div>

        <p className="mt-4 text-[11px] text-[var(--text-muted)]">
          {`${memberSince}'ten beri arenada · En uzun seri: ${p.longest_streak} gün`}
        </p>

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
          <Link href="/giris" className="mt-5 inline-flex min-h-11 items-center rounded-xl border-2 border-[var(--border)] px-4 text-sm font-bold">
            Arkadaş eklemek için giriş yap
          </Link>
        )}

        <Link
          href="/arena"
          className="btn-primary mt-6 inline-block rounded-xl px-6 py-3 text-sm font-bold tracking-wide"
        >
          Sen de Katıl
        </Link>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-base font-extrabold text-[var(--focus-light)]">{value}</div>
      <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{label}</div>
    </div>
  )
}
