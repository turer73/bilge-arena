/**
 * Bilge Arena Oda: <EmptyState> /oda list bos durum
 * Sprint 1 PR4a Task 3 + 2026-05-03 "(yakinda)" stale fix
 *
 * 2 CTA: "Yeni Oda Kur" + "Kod ile Katil" (her ikisi de aktif Link).
 * 4b'de eklenmis /oda/kod sayfasi referansi — disabled durumu kaldirildi.
 */

import Link from 'next/link'

export function EmptyState() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
      <p className="text-sm text-[var(--text-sub)]">Henuz aktif odan yok.</p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <Link href="/oda/yeni" className="btn-primary px-4 py-2 text-sm">
          + Yeni Oda Kur
        </Link>
        <Link
          href="/oda/kod"
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--card)]"
        >
          Kod ile Katil
        </Link>
      </div>
    </div>
  )
}
