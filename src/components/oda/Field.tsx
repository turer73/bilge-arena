/**
 * Bilge Arena Oda: <Field> form atomu
 * Sprint 1 PR4a Task 3
 *
 * Label + input/select + opsiyonel error slot. ARIA-compliant.
 * - role="alert" error gostermesi screen reader bildirir
 * - aria-describedby input'u error'a baglar (hata varsa)
 * - htmlFor + id eslesmesi label-input link
 *
 * Children prop: <select> gibi non-input elemanlar icin (NumField defaul kullanir).
 */

import { cn } from '@/lib/utils/cn'

interface FieldProps {
  label: string
  name: string
  type?: string
  defaultValue?: string | number
  required?: boolean
  maxLength?: number
  error?: string
  children?: React.ReactNode
  className?: string
}

export function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  maxLength,
  error,
  children,
  className,
}: FieldProps) {
  const id = `field-${name}`
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={cn('space-y-1', className)}>
      <label
        htmlFor={id}
        className="block text-xs font-bold text-[var(--text-sub)]"
      >
        {label}
      </label>
      {children ?? (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={errorId}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--urgency)]">
          {error}
        </p>
      )}
    </div>
  )
}
