/**
 * Bilge Arena Oda: <StateBadge> oda state rozeti
 * Sprint 1 PR4a (PR4b'de DB enum'a hizalandi)
 *
 * 5 state mapping (rooms.state CHECK constraint chk_rooms_state ile birebir):
 *   - lobby     -> Bekliyor   (emerald) - host + members beklerken
 *   - active    -> Oyunda     (blue)    - current round live
 *   - reveal    -> Sonuc      (purple)  - reveal hold suresi
 *   - completed -> Bitti      (gray)    - oyun bitti / cancel
 *   - archived  -> Arsivlenmis(slate)   - 30+ gun retention sonrasi
 *
 * PR4a'de yanlislikla 'in_progress'/'finished'/'cancelled' kullaniliyordu;
 * DB'de YOK, types.ts ve 2_rooms.sql:133 dogrudur. PR4b-5 hot-fix.
 */

import { cn } from '@/lib/utils/cn'

type State = 'lobby' | 'active' | 'reveal' | 'completed' | 'archived'

const styles: Record<State, { label: string; className: string }> = {
  lobby: {
    label: 'Bekliyor',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  active: {
    label: 'Oyunda',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  },
  reveal: {
    label: 'Sonuc',
    className: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  },
  completed: {
    label: 'Bitti',
    className: 'bg-gray-500/15 text-gray-700 dark:text-gray-300',
  },
  archived: {
    label: 'Arsivlenmis',
    className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  },
}

export function StateBadge({ state }: { state: State }) {
  const s = styles[state]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold',
        s.className,
      )}
    >
      {s.label}
    </span>
  )
}
