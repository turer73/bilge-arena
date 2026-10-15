'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, GraduationCap, Palette, ShieldCheck } from 'lucide-react'
import { bilgeImage } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'

type ProfileVisibility = 'private' | 'friends' | 'public'

interface DesktopProfileContextProps {
  examType?: 'yks' | 'lgs' | null
  profileVisibility?: ProfileVisibility | null
  onEditProfile: () => void
}

const visibilityCopy: Record<ProfileVisibility, { label: string; description: string }> = {
  private: { label: 'Sadece ben', description: 'Profil bağlantın başkalarına kapalı.' },
  friends: { label: 'Arkadaşlarım', description: 'Yalnız kabul ettiğin arkadaşların görebilir.' },
  public: { label: 'Herkes', description: 'Bağlantıya sahip herkes profilini görebilir.' },
}

/**
 * Tablet/desktop identity summary. Profile avatar, local Bilge guide and
 * sharing scope are deliberately separate concepts; mobile keeps its existing
 * compact profile flow.
 */
export function DesktopProfileContext({
  examType,
  profileVisibility,
  onEditProfile,
}: DesktopProfileContextProps) {
  const { character } = useBilgeCharacter()
  const visibility = visibilityCopy[profileVisibility ?? 'private']
  const target = examType === 'lgs'
    ? { label: 'LGS · Lise hazırlık', description: 'LGS kapsamındaki ders ve sorular gösterilir.' }
    : examType === 'yks'
      ? { label: 'YKS · Üniversite hazırlık', description: 'YKS kapsamındaki ders ve sorular gösterilir.' }
      : { label: 'Hazırlık hedefini belirle', description: 'Ders ve kapsam önerilerini kişiselleştir.' }

  const cardClass = 'flex min-w-0 items-center gap-3 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-border)]'
  const actionClass = 'mt-2 inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-xs font-black text-[var(--app-accent-text)] hover:bg-[var(--app-accent-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]'

  return (
    <section
      data-desktop-profile-context
      aria-label="Profil bağlamı"
      className="mb-5 hidden gap-3 md:grid md:grid-cols-3"
    >
      <article className={cardClass}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]">
          <GraduationCap size={24} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--app-text-muted)]">Hazırlık hedefin</p>
          <h2 className="mt-1 text-sm font-black text-[var(--app-text)]">{target.label}</h2>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-[var(--app-text-sub)]">{target.description}</p>
          <button type="button" onClick={onEditProfile} className={actionClass}>
            Hedefi düzenle <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </article>

      <article className={cardClass}>
        <Image
          src={bilgeImage(character)}
          alt=""
          width={56}
          height={56}
          sizes="56px"
          className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--app-accent-border)] object-cover"
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.13em] text-[var(--app-text-muted)]"><Palette size={13} aria-hidden="true" /> Bilge rehberin</p>
          <h2 className="mt-1 text-sm font-black text-[var(--app-text)]">{character === 'male' ? 'Erkek Bilge' : 'Kadın Bilge'}</h2>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-[var(--app-text-sub)]">Profil resminden ayrı çalışma rehberin.</p>
          <Link href="/arena/kisisellestir" className={actionClass}>
            Rehberi seç <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </article>

      <article className={cardClass}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--app-success-tint)] text-[var(--app-success-ink)]">
          <ShieldCheck size={24} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--app-text-muted)]">Profil görünürlüğü</p>
          <h2 className="mt-1 text-sm font-black text-[var(--app-text)]">{visibility.label}</h2>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-[var(--app-text-sub)]">{visibility.description}</p>
          <Link href="#profile-privacy" className={actionClass}>
            Görünürlüğü düzenle <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </article>
    </section>
  )
}
