'use client'

import Link from 'next/link'
import { Palette, Pencil, RotateCcw, ShoppingBag, UserPlus } from 'lucide-react'

interface ProfileActionsProps {
  onEdit: () => void
}

const actionClass =
  'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] px-1.5 text-center text-[11px] font-bold leading-none text-[var(--text-sub)] transition-colors hover:border-[var(--focus-border)] hover:bg-[var(--focus-bg)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-xs'

export function ProfileActions({ onEdit }: ProfileActionsProps) {
  return (
    <div role="group" aria-label="Profil işlemleri" className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-5">
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
