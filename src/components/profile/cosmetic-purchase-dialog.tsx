'use client'

/**
 * Kozmetik satın alma onay modalı — mağaza istemcilerindeki modalın ortak hali.
 *
 * Yanlışlıkla harcamayı önler ve kalan bakiyeyi işlemden ÖNCE gösterir. Beş
 * mağaza istemcisi bu diyaloğun neredeyse birebir kopyasını taşıyordu; stüdyo
 * da satın alma kazandığı için tek yere alındı.
 */
export function CosmeticPurchaseDialog({
  open,
  itemName,
  cost,
  balance,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  itemName: string
  cost: number
  balance: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label="Satın almayı onayla"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-black text-[var(--text)]">Satın almayı onayla</h3>
        <p className="mt-2 text-sm text-[var(--text-sub)]">
          <strong className="text-[var(--text)]">{itemName}</strong> ürününü{' '}
          <span className="font-bold text-[var(--reward)]">🪙 {cost}</span> coin karşılığında
          alıyorsun (otomatik uygulanır).
        </p>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
          <span className="text-[var(--text-sub)]">Kalan bakiye</span>
          <strong className="text-[var(--reward)]">
            🪙 {(balance - cost).toLocaleString('tr-TR')}
          </strong>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-sub)] disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-lg bg-gradient-to-r from-[var(--urgency)] to-[var(--reward)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Alınıyor…' : 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  )
}
