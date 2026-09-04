'use client'

import { useId, useState } from 'react'
import {
  useTytSocialExamPolicy,
  type TytSocialExamPolicyState,
  type TytSocialVariant,
} from '@/lib/hooks/use-tyt-social-exam-policy'

const OPTIONS: ReadonlyArray<{ value: TytSocialVariant; label: string }> = [
  { value: 'questions_16_20', label: '16–20 Din Kültürü ve Ahlak Bilgisi soruları' },
  { value: 'questions_21_25', label: '21–25 İlave Felsefe soruları' },
]

export interface TytSocialExamPolicyCardProps {
  game?: string | null
  examRef?: string | null
  className?: string
}

/** TYT Sosyal candidate-route choice; deliberately contains no reason field. */
export function TytSocialExamPolicyCard({
  game = 'sosyal',
  examRef = 'TYT',
  className = '',
}: TytSocialExamPolicyCardProps) {
  const policy = useTytSocialExamPolicy({ game, examRef })

  return <TytSocialExamPolicyCardView policy={policy} className={className} />
}

export interface TytSocialExamPolicyCardViewProps {
  policy: TytSocialExamPolicyState
  className?: string
}

/** Presentational form for parents that already own the policy hook state. */
export function TytSocialExamPolicyCardView({
  policy,
  className = '',
}: TytSocialExamPolicyCardViewProps) {
  const [draft, setDraft] = useState<TytSocialVariant | null>(null)
  const titleId = useId()
  const groupId = useId()

  if (!policy.eligible) return null

  const selected = draft ?? policy.variantCode
  const isSetup = policy.status === 'setup_required'
  const busy = policy.loading || policy.saving

  if (policy.loading) {
    return (
      <section
        className={`rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 ${className}`}
        aria-labelledby={titleId}
        aria-busy="true"
      >
        <h2 id={titleId} className="text-base font-black text-[var(--app-text)]">TYT Sosyal cevaplama düzeni</h2>
        <p className="mt-2 text-sm text-[var(--app-text-muted)]" role="status">Cevaplama düzenin yükleniyor…</p>
      </section>
    )
  }

  return (
    <section
      className={`rounded-2xl border border-[var(--app-border)] bg-[var(--app-card)] p-4 ${className}`}
      aria-labelledby={titleId}
      aria-busy={policy.saving}
    >
      <h2 id={titleId} className="text-base font-black text-[var(--app-text)]">
        TYT Sosyal cevaplama düzeni
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-sub)]">
        Bu seçim yalnız yeni oluşturulan çalışma/denemelerde geçerlidir; inanç veya muafiyet nedeni kaydedilmez.
      </p>

      {policy.error && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-[var(--app-text)]" role="alert">
          <p>{policy.error}</p>
          <button
            type="button"
            onClick={policy.retry}
            className="mt-2 min-h-10 rounded-lg border border-current px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Yeniden dene
          </button>
        </div>
      )}

      {policy.status !== 'error' && (
        <fieldset className="mt-4" role="radiogroup" aria-labelledby={groupId}>
          <legend id={groupId} className="sr-only">TYT Sosyal cevaplama seçimi</legend>
          <div className="space-y-2">
            {OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-text)] has-[:checked]:border-[var(--app-accent)] has-[:checked]:bg-[var(--app-accent)]/10"
              >
                <input
                  type="radio"
                  name={groupId}
                  value={option.value}
                  checked={selected === option.value}
                  onChange={() => setDraft(option.value)}
                  disabled={busy}
                  className="h-4 w-4 accent-[var(--app-accent)]"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {policy.status !== 'error' && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              if (selected && await policy.saveSelection(selected)) setDraft(null)
            }}
            disabled={busy || selected == null || (!isSetup && selected === policy.variantCode)}
            className="min-h-11 rounded-xl bg-[var(--app-accent)] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {policy.saving ? 'Kaydediliyor…' : isSetup ? 'Seçimi kaydet' : 'Seçimi güncelle'}
          </button>
          {policy.status === 'active' && draft == null && (
            <span className="text-xs font-semibold text-[var(--app-text-muted)]" role="status">Kayıtlı seçim</span>
          )}
        </div>
      )}
    </section>
  )
}
