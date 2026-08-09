export const REVIEW_ERROR_REASON_CODES = [
  'knowledge_gap',
  'misread',
  'calculation',
  'time_management',
  'careless',
  'guess',
] as const

export const REVIEW_ERROR_REASON_OPTIONS = [
  { code: 'knowledge_gap', label: 'Bilgi eksiği' },
  { code: 'misread', label: 'Soruyu yanlış okuma' },
  { code: 'calculation', label: 'Hesaplama hatası' },
  { code: 'time_management', label: 'Süre yönetimi' },
  { code: 'careless', label: 'Dikkat hatası' },
  { code: 'guess', label: 'Tahmin' },
] as const

export type ReviewErrorReasonCode = (typeof REVIEW_ERROR_REASON_OPTIONS)[number]['code']

const REVIEW_ERROR_REASON_LABELS = new Map<ReviewErrorReasonCode, string>(
  REVIEW_ERROR_REASON_OPTIONS.map((option) => [option.code, option.label]),
)

export function isReviewErrorReasonCode(value: unknown): value is ReviewErrorReasonCode {
  return typeof value === 'string' && REVIEW_ERROR_REASON_LABELS.has(value as ReviewErrorReasonCode)
}

export function getReviewErrorReasonLabel(code: ReviewErrorReasonCode): string {
  return REVIEW_ERROR_REASON_LABELS.get(code) ?? code
}
