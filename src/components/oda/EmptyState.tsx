/**
 * Bilge Arena Oda: <EmptyState> /oda list bos durum
 * Sprint 1 PR4a Task 3
 *
 * 2 CTA: "Yeni Oda Kur" (aktif Link) + "Kod ile Katil" (4a'da disabled,
 * 4b'de aktif olacak). BilgiArena referansi (memory id=324) kod-paylas
 * akisinin ilk dokunusu.
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
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-sub)] opacity-60"
          title="4b'de aktif olur"
        >
          Kod ile Katil <span className="ml-1 text-[10px]">(yakinda)</span>
        </button>
      </div>
    </div>
  )
}
