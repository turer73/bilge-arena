/** Exact text selection only. Never guess, trim, normalize, or choose the nearest option. */
export function exactOptionIndex(options: readonly string[], selected: string | null): number | null {
  if (options.length < 2 || options.some((s) => !s.trim()) || new Set(options).size !== options.length) {
    throw new Error('secenek metinleri bos veya tekil degil')
  }
  if (selected === null) return null
  const index = options.indexOf(selected)
  if (index < 0) throw new Error('secilen metin seceneklerde birebir yok')
  return index
}

// Bounded ASCII decimal scalar, not a formula, locale parser, or unit converter.
// String canonicalization avoids Number rounding for large integers/decimals.
function scalar(value: string | null): string | null {
  if (value === null) return null
  const match = /^-?(?:0|[1-9]\d{0,79})(?:\.\d{1,40})?$/.exec(value)
  if (!match || match[0] !== value) return null
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const tail = fraction.replace(/0+$/, '')
  const normalized = `${whole}${tail ? `.${tail}` : ''}`
  return negative && normalized !== '0' ? `-${normalized}` : normalized
}

export type SelectionAssessment = 'numeric_match' | 'numeric_conflict' | 'value_without_selection' | 'not_checked'

/** Negative consistency check, NOT verification that either model statement is correct. */
export function assessOptionSelection(options: readonly string[], selected: string | null, computed: string | null): SelectionAssessment {
  exactOptionIndex(options, selected)
  const value = scalar(computed)
  if (selected === null) {
    return computed !== null && options.some((o) => o === computed || (value !== null && scalar(o) === value))
      ? 'value_without_selection' : 'not_checked'
  }
  const chosen = scalar(selected)
  if (value === null || chosen === null) return 'not_checked'
  return value === chosen ? 'numeric_match' : 'numeric_conflict'
}
