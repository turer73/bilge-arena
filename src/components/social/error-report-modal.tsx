'use client'

import { useId, useState } from 'react'
import { errorReportSchema, LIMITS } from '@/lib/validations/schemas'
import { ERROR_REPORT_COIN_REWARD } from '@/lib/constants/rewards'

const REPORT_TYPES = [
  { value: 'wrong_answer', label: 'Yanlis cevap', icon: '❌' },
  { value: 'typo', label: 'Yazim hatasi', icon: '✏️' },
  { value: 'unclear', label: 'Anlasilmiyor', icon: '❓' },
  { value: 'duplicate', label: 'Tekrar soru', icon: '♻️' },
  { value: 'offensive', label: 'Uygunsuz icerik', icon: '🚫' },
  { value: 'other', label: 'Diger', icon: '📝' },
] as const

type ReportType = typeof REPORT_TYPES[number]['value']

// onSubmit artık sonucu döndürebilir: {ok:false} -> modal HATA gösterir (sahte
// başarı YOK). void/undefined dönerse (eski çağıranlar) başarı sayılır (geri-uyum).
type ReportSubmitResult = { ok: boolean; error?: string; rewardEligible?: boolean } | void

interface ErrorReportModalProps {
  questionId: string
  isOpen: boolean
  onClose: () => void
  onSubmit?: (data: { type: ReportType; description: string }) => ReportSubmitResult | Promise<ReportSubmitResult>
}

export function ErrorReportModal({
  questionId: _questionId,
  isOpen,
  onClose,
  onSubmit,
}: ErrorReportModalProps) {
  const [selectedType, setSelectedType] = useState<ReportType | null>(null)
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [rewardEligible, setRewardEligible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const descriptionHelpId = useId()
  const errorId = useId()

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!selectedType || submitting) return

    // Zod ile dogrula
    const parsed = errorReportSchema.safeParse({
      report_type: selectedType,
      description,
    })
    if (!parsed.success) return

    // P1 fix (Codex PR#242): onSubmit'i AWAIT et, başarıyı yalnız {ok} ise göster.
    // Eski fire-and-forget guest'e (401) sahte "gönderildi" gösterip raporu düşürüyordu.
    setErrorMsg(null)
    setSubmitting(true)
    try {
      const result = await onSubmit?.({ type: selectedType, description: parsed.data.description ?? '' })
      if (result && result.ok === false) {
        setErrorMsg(result.error ?? 'Rapor gönderilemedi. Tekrar dene.')
        setSubmitting(false)
        return
      }
      setRewardEligible(result?.rewardEligible === true)
    } catch {
      setErrorMsg('Rapor gönderilemedi. Tekrar dene.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    // 2 saniye sonra kapat
    setTimeout(() => {
      setSubmitted(false)
      setSubmitting(false)
      setSelectedType(null)
      setDescription('')
      setRewardEligible(false)
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
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-2xl">
        {submitted ? (
          /* Basarili mesaji */
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="text-4xl">✅</div>
            <div id={titleId} role="status" className="text-sm font-bold">Bildirimin bize ulaştı!</div>
            <div className="text-center text-xs leading-5 text-[var(--text-sub)]">
              {rewardEligible ? <>
                Ekibimiz inceleyecek. Haklı çıkarsan hesabına{' '}
                <strong className="text-[var(--gold-text,var(--text))]">{ERROR_REPORT_COIN_REWARD} altın</strong>{' '}
                eklenecek ve bildirimin sonucunu bildirim olarak göreceksin.
              </> : <>
                Ekibimiz revizyon kanıtıyla birlikte inceleyecek. İtiraz durumunu profilindeki
                soru bildirimlerinden takip edebilirsin.
              </>}
            </div>
          </div>
        ) : (
          <>
            {/* Baslik */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🐛</span>
                <h2 id={titleId} className="text-sm font-bold">Hata Bildir</h2>
              </div>
              <button
                onClick={onClose}
                type="button"
                aria-label="Hata bildirimini kapat"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)]"
              >
                ✕
              </button>
            </div>

            <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] leading-5 text-[var(--text-sub)]">
              Bildirimin, sorunun gördüğün revizyonuyla birlikte incelenir. Ödül uygunluğu
              yalnız sunucunun kullandığı bildirim kanalına göre belirlenir.
            </p>

            {/* Tip secimi */}
            <fieldset className="mb-4">
              <legend className="mb-2 text-[10px] font-bold tracking-wider text-[var(--text-sub)]">
                HATA TURU
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                {REPORT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setSelectedType(type.value)}
                    aria-pressed={selectedType === type.value}
                    className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
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
            </fieldset>

            {/* Aciklama */}
            <div className="mb-4">
              <label htmlFor={descriptionId} className="mb-2 block text-[10px] font-bold tracking-wider text-[var(--text-sub)]">
                ACIKLAMA (OPSIYONEL)
              </label>
              <textarea
                id={descriptionId}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Hatanin detaylarini aciklayabilirsin..."
                maxLength={LIMITS.REPORT_DESCRIPTION_MAX_LENGTH}
                aria-describedby={`${descriptionHelpId}${errorMsg ? ` ${errorId}` : ''}`}
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-sub)] focus:border-[var(--focus)] focus:outline-none"
              />
              <div id={descriptionHelpId} className="mt-1 text-right text-[9px] text-[var(--text-sub)]">
                {description.length}/{LIMITS.REPORT_DESCRIPTION_MAX_LENGTH}
              </div>
            </div>

            {/* Hata mesajı (P1: sahte başarı yerine gerçek geri-bildirim) */}
            {errorMsg && (
              <div id={errorId} role="alert" className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {errorMsg}
              </div>
            )}

            {/* Butonlar */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 flex-1 rounded-lg border border-[var(--border)] px-3 py-2.5 text-xs font-bold text-[var(--text-sub)] transition-colors hover:bg-[var(--card)]"
              >
                Vazgec
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedType || submitting}
                className="min-h-11 flex-1 rounded-lg bg-[var(--reward)] px-3 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? 'Gonderiliyor...' : 'Gonder'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
