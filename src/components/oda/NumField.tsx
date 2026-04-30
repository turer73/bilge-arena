/**
 * Bilge Arena Oda: <NumField> number input atomu
 * Sprint 1 PR4a Task 3
 *
 * Field wrapper'i + min/max/step + type=number. createRoomSchema'daki
 * 4 sayisal alan icin ortak: difficulty, question_count, max_players,
 * per_question_seconds.
 *
 * NOT: HTML5 native min/max validation gosterir, ama kesin dogrulama
 * Server Action'da Zod ile yapilir (defense in depth).
 */

import { Field } from './Field'

interface NumFieldProps {
  label: string
  name: string
  min: number
  max: number
  defaultValue: number
  step?: number
  error?: string
}

export function NumField({
  label,
  name,
  min,
  max,
  defaultValue,
  step = 1,
  error,
}: NumFieldProps) {
  const id = `field-${name}`
  return (
    <Field label={label} name={name} error={error}>
      <input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
      />
    </Field>
  )
}
