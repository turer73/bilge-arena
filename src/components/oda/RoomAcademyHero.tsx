'use client'

import Image from 'next/image'
import { Sparkles, UsersRound } from 'lucide-react'
import { bilgeImage } from '@/lib/bilge/characters'
import { useBilgeCharacter } from '@/lib/bilge/use-bilge-character'

export function RoomAcademyHero() {
  const { character } = useBilgeCharacter()

  return (
    <section
      data-room-academy-hero
      className="relative mb-6 hidden min-h-[250px] overflow-hidden rounded-[24px] border border-[var(--app-border)] bg-[var(--app-card)] p-7 text-[var(--app-text)] shadow-[0_6px_0_var(--app-border)] md:block lg:min-h-[270px] lg:p-9"
      aria-labelledby="room-academy-title"
    >
      <Image
        src="/academy/academy-landscape.png"
        alt=""
        fill
        sizes="(min-width: 1024px) 1132px, 728px"
        className="pointer-events-none object-cover object-center opacity-55"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--app-card)] via-[var(--app-card)] to-[var(--app-card)]/25" />
      <div className="relative z-10 max-w-[62%] lg:max-w-[58%]">
        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--app-accent-text)]">
          <UsersRound size={17} aria-hidden="true" /> Oda Modu
        </p>
        <h1 id="room-academy-title" className="mt-3 text-3xl font-black leading-tight tracking-tight lg:text-4xl">
          Birlikte çöz, birlikte yüksel.
        </h1>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-[var(--app-text-sub)] lg:text-base">
          Bilge Arena’nın birlikte çalışma alanı. Arkadaşlarınla oda kur, kodla katıl veya beklemeden antrenmana başla.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-black text-[var(--app-text-sub)]">
          {['Kodla katıl', 'Oda kur', 'Hızlı antrenman'].map((item) => (
            <span key={item} className="rounded-full border border-[var(--app-border)] bg-[var(--app-card)] px-3 py-1.5">
              <Sparkles size={12} className="mr-1 inline text-[var(--app-accent-text)]" aria-hidden="true" />{item}
            </span>
          ))}
        </div>
      </div>
      <Image
        data-room-bilge
        src={bilgeImage(character, 'neseli')}
        alt={(character === 'male' ? 'Erkek' : 'Kadın') + ' Bilge, oda modu rehberin'}
        width={300}
        height={300}
        sizes="(min-width: 1024px) 250px, 210px"
        className="pointer-events-none absolute -bottom-8 right-4 z-[1] h-[230px] w-auto object-contain drop-shadow-[0_14px_26px_rgba(0,0,0,0.4)] lg:right-10 lg:h-[270px]"
      />
    </section>
  )
}
