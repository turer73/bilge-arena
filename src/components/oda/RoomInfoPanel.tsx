/**
 * Bilge Arena Oda: <RoomInfoPanel> oda meta bilgi karti
 * Sprint 1 PR4b Task 6
 *
 * Server component. Kategori, zorluk, soru sayisi, soru suresi, mod info.
 */

import type { Room } from '@/lib/rooms/room-state-reducer'

const CATEGORY_LABELS: Record<string, string> = {
  'genel-kultur': 'Genel Kültür',
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  edebiyat: 'Edebiyat',
  matematik: 'Matematik',
  fen: 'Fen Bilimleri',
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
