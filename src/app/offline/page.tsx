'use client'

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="text-6xl mb-6">📡</span>
      <h1 className="text-2xl font-bold mb-3">Çevrimdışısınız</h1>
      <p className="text-[var(--text-sub)] max-w-md mb-6">
        İnternet bağlantınız kesilmiş görünüyor. Bilge Arena&apos;yı kullanmak için
        internet bağlantınızı kontrol edip tekrar deneyin.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-xl bg-[var(--focus)] px-6 py-3 font-semibold text-white transition-all hover:opacity-90"
      >
        Tekrar Dene
      </button>
    </div>
  )
}
