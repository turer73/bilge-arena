/**
 * Bilge Arena Oda: <HostActionsPlaceholder> host eylemleri yer tutar
 * Sprint 1 PR4b Task 6
 *
 * Server component. Host kullanici icin gosterilir. PR4c'de start/cancel/
 * kick butonlari ile doldurulur. Suanda sadece info banner.
 */

interface HostActionsPlaceholderProps {
  isHost: boolean
}

export function HostActionsPlaceholder({
  isHost,
}: HostActionsPlaceholderProps) {
  if (!isHost) return null
  return (
    <section
      aria-label="Host eylemleri"
      className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 p-4"
    >
      <h2 className="mb-1 text-sm font-bold text-[var(--text-sub)]">
        Host Paneli (yakinda)
      </h2>
      <p className="text-xs text-[var(--text-sub)]">
        {'Oyun başlat, oyun iptal et ve üye çıkar işlemleri 4c’de eklenecek.'}
      </p>
    </section>
  )
}
