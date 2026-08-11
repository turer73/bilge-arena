/**
 * Bilge Arena Oda: <EmptyState> /oda list bos durum
 * Sprint 1 PR4a Task 3 + 2026-05-03 "(yakinda)" stale fix
 *
 * Ana karar kartlari sayfanin ustunde oldugu icin burada tek, yonlendirici
 * mesaj kullanilir; yinelenen CTA hiyerarsisi olusturulmaz.
 */

import { DoorOpen } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-7 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--text-sub)]">
        <DoorOpen aria-hidden="true" className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-sm font-extrabold">Henüz devam eden odan yok</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--text-sub)]">
        Yukarıdan hızlı antrenman başlatabilir, bir koda katılabilir veya yeni
        oda kurabilirsin.
      </p>
    </div>
  )
}
