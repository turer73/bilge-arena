'use client'

/**
 * Bilge Arena Oda: <KickMemberButton> uye cikar butonu
 * Sprint 1 PR4d
 *
 * Per-member kick butonu. Sadece host gorur, kendi disinda + non-host +
 * lobby/active/reveal state'inde aktif. window.confirm ile basit onay
 * (native dialog overhead yok, JS olmadan da form submit calisir —
 * progressive enhancement).
 *
 * Realtime MEMBER_UPDATE event ile UI is_kicked=true opacity dusuk gosterir.
 */

import { useActionState } from 'react'
import {
  kickMemberAction,
  type KickMemberActionState,
} from '@/lib/rooms/actions'

const initialState: KickMemberActionState = {}

interface KickMemberButtonProps {
  roomId: string
  targetUserId: string
  targetName: string
}

export function KickMemberButton({
  roomId,
  targetUserId,
  targetName,
}: KickMemberButtonProps) {
  const [state, formAction, isPending] = useActionState(
    kickMemberAction,
    initialState,
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof window === 'undefined') return
    const ok = window.confirm(
      `${targetName} adli üyeyi odadan çıkarmak istediğine emin misin?`,
    )
    if (!ok) e.preventDefault()
  }

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <input type="hidden" name="room_id" value={roomId} />
      <input type="hidden" name="target_user_id" value={targetUserId} />
      <button
        type="submit"
        disabled={isPending}
        aria-label={`${targetName} adli üyeyi çıkar`}
        className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-700 transition-colors hover:bg-red-500/20 disabled:opacity-40 dark:text-red-300"
        title={state.error ?? 'Üyeyi odadan çıkar'}
      >
        {isPending ? '…' : 'Çıkar'}
      </button>
    </form>
  )
}
