import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

// ISR: public profil 5 dk cache (RPC yükü + tazelik dengesi)
export const revalidate = 300

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
}

/** get_public_profile RPC (migration 073) — yalnız güvenli kolonlar, is_discoverable-gate'li */
async function fetchPublicProfile(username: string): Promise<PublicProfile | null> {
  // username basit guard (RPC zaten lower-match + parametreli; injection yok)
  if (!username || username.length > 40) return null
  const svc = createServiceRoleClient()
  const { data } = await svc.rpc('get_public_profile', { p_username: username })
  return (data && data[0]) || null
}

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params
  const p = await fetchPublicProfile(decodeURIComponent(username))
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
  const p = await fetchPublicProfile(decodeURIComponent(username))
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
