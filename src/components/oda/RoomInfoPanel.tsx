/**
 * Bilge Arena Oda: <RoomInfoPanel> oda meta bilgi karti
 * Sprint 1 PR4b Task 6
 *
 * Server component. Kategori, zorluk, soru sayisi, soru suresi, mod info.
 */

import type { Room } from '@/lib/rooms/room-state-reducer'
import { CATEGORY_GROUPS } from '@/lib/rooms/validations'

// Yeni taxonomy (validations.ts CATEGORY_GROUPS) + legacy slug'lar
// (pre-2026-05-03 oda kayitlari raw slug gozukmesin — Codex P2 PR #92 fix).
const CATEGORY_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => [c.value, c.label])),
  ),
  // Legacy (pre-2026-05-03): oda yaratan eski kullanicilarin RoomInfoPanel'i
  // raw 'genel-kultur' yerine 'Genel Kültür' goruyor.
  'genel-kultur': 'Genel Kültür',
  matematik: 'Matematik',
  fen: 'Fen Bilimleri',
  edebiyat: 'Edebiyat',
  ingilizce: 'İngilizce',
  vatandaslik: 'Vatandaşlık',
  futbol: 'Futbol',
  sinema: 'Sinema',
}

const MODE_LABELS = {
  sync: 'Senkron',
  async: 'Asenkron',
} as const

interface RoomInfoPanelProps {
  room: Room
}

export function RoomInfoPanel({ room }: RoomInfoPanelProps) {
  const items = [
    {
      label: 'Kategori',
      value: CATEGORY_LABELS[room.category] ?? room.category,
    },
    { label: 'Zorluk', value: `${room.difficulty} / 5` },
    { label: 'Soru', value: `${room.question_count}` },
    { label: 'Sure', value: `${room.per_question_seconds} sn` },
    { label: 'Mod', value: MODE_LABELS[room.mode] },
  ]
  return (
    <section
      aria-label="Oda bilgileri"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <h2 className="mb-3 text-sm font-bold">Bilgiler</h2>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col">
            <dt className="text-[var(--text-sub)]">{item.label}</dt>
            <dd className="font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
