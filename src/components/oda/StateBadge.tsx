/**
 * Bilge Arena Oda: <StateBadge> oda state rozeti
 * Sprint 1 PR4a Task 3
 *
 * 4 state mapping (rooms.state CHECK constraint ile birebir):
 *   - lobby      -> Bekliyor (emerald)
 *   - in_progress-> Oyunda   (blue)
 *   - finished   -> Bitti    (gray)
 *   - cancelled  -> Iptal    (red)
 *
 * Color: bg-{color}-500/15 + text-{color}-700|300 (dark mode).
 */

import { cn } from '@/lib/utils/cn'

type State = 'lobby' | 'in_progress' | 'finished' | 'cancelled'

const styles: Record<State, { label: string; className: string }> = {
  lobby: {
    label: 'Bekliyor',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  in_progress: {
    label: 'Oyunda',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  },
  finished: {
    label: 'Bitti',
    className: 'bg-gray-500/15 text-gray-700 dark:text-gray-300',
  },
  cancelled: {
    label: 'Iptal',
    className: 'bg-red-500/15 text-red-700 dark:text-red-300',
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
