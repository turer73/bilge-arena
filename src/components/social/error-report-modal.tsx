'use client'

import { useState } from 'react'

const REPORT_TYPES = [
  { value: 'wrong_answer', label: 'Yanlis cevap', icon: '❌' },
  { value: 'typo', label: 'Yazim hatasi', icon: '✏️' },
  { value: 'unclear', label: 'Anlasilmiyor', icon: '❓' },
  { value: 'duplicate', label: 'Tekrar soru', icon: '♻️' },
  { value: 'offensive', label: 'Uygunsuz icerik', icon: '🚫' },
  { value: 'other', label: 'Diger', icon: '📝' },
] as const

type ReportType = typeof REPORT_TYPES[number]['value']

interface ErrorReportModalProps {
  questionId: string
  isOpen: boolean
  onClose: () => void
  onSubmit?: (data: { type: ReportType; description: string }) => void
}

export function ErrorReportModal({
  questionId,
  isOpen,
  onClose,
  onSubmit,
}: ErrorReportModalProps) {
  const [selectedType, setSelectedType] = useState<ReportType | null>(null)
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (!isOpen) return null

  const handleSubmit = () => {
    if (!selectedType) return

    onSubmit?.({ type: selectedType, description: description.trim() })
    setSubmitted(true)

    // 2 saniye sonra kapat
    setTimeout(() => {
      setSubmitted(false)
      setSelectedType(null)
      setDescription('')
      onClose()
    }, 2000)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeUp"
      onClick={handleBackdropClick}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-2xl">
        {submitted ? (
          /* Basarili mesaji */
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="text-4xl">✅</div>
            <div className="text-sm font-bold">Raporun gonderildi!</div>
            <div className="text-xs text-[var(--text-sub)]">
              Ekibimiz en kisa surede inceleyecek. Tesekkurler!
            </div>
          </div>
        ) : (
          <>
            {/* Baslik */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🐛</span>
                <span className="text-sm font-bold">Hata Bildir</span>
              </div>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)]"
              >
                ✕
              </button>
            </div>

            {/* Tip secimi */}
            <div className="mb-4">
              <div className="mb-2 text-[10px] font-bold tracking-wider text-[var(--text-sub)]">
                HATA TURU
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {REPORT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                      selectedType === type.value
                        ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus)] font-bold'
                        : 'border-[var(--border)] text-[var(--text-sub)] hover:border-[var(--focus)] hover:bg-[var(--surface)]'
                    }`}
                  >
                    <span className="text-sm">{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Aciklama */}
            <div className="mb-4">
              <div className="mb-2 text-[10px] font-bold tracking-wider text-[var(--text-sub)]">
                ACIKLAMA (OPSIYONEL)
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Hatanin detaylarini aciklayabilirsin..."
                maxLength={1000}
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-sub)] focus:border-[var(--focus)] focus:outline-none"
              />
              <div className="mt-1 text-right text-[9px] text-[var(--text-sub)]">
                {description.length}/1000
              </div>
            </div>

            {/* Butonlar */}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2.5 text-xs font-bold text-[var(--text-sub)] transition-colors hover:bg-[var(--card)]"
              >
                Vazgec
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedType}
                className="flex-1 rounded-lg bg-[var(--reward)] px-3 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Gonder
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
