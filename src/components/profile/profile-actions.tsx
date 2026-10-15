'use client'

import Link from 'next/link'
import { Palette, Pencil, RotateCcw, ShoppingBag, UserPlus } from 'lucide-react'

interface ProfileActionsProps {
  onEdit: () => void
}

const actionClass =
  'flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[9px] font-black leading-none text-[var(--app-text-sub)] transition-all hover:-translate-y-0.5 hover:bg-[var(--app-accent-tint)] hover:text-[var(--app-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] sm:min-h-[54px] sm:flex-row sm:gap-1.5 sm:px-2 sm:text-[11px]'

export function ProfileActions({ onEdit }: ProfileActionsProps) {
  return (
    <div data-profile-actions role="group" aria-label="Profil işlemleri" className="grid grid-cols-5 gap-1 rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-2 shadow-[0_4px_0_var(--app-border)] sm:gap-2">
      <Link href="/arena/yanlislarim" className={actionClass}>
        <RotateCcw aria-hidden size={17} strokeWidth={2.2} />
        <span>Yanlışlarım</span>
      </Link>
      <Link href="/arena/arkadaslar" className={actionClass}>
        <UserPlus aria-hidden size={17} strokeWidth={2.2} />
        <span>Arkadaşlar</span>
      </Link>
      <Link href="/arena/magaza" className={actionClass}>
        <ShoppingBag aria-hidden size={17} strokeWidth={2.2} />
        <span>Mağaza</span>
      </Link>
      <Link href="/arena/kisisellestir" className={actionClass}>
        <Palette aria-hidden size={17} strokeWidth={2.2} />
        <span>Stüdyo</span>
      </Link>
      <button type="button" onClick={onEdit} className={actionClass}>
        <Pencil aria-hidden size={17} strokeWidth={2.2} />
        <span>Düzenle</span>
      </button>
    </div>
  )
}
