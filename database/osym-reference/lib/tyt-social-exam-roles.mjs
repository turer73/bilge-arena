export const TYT_SOCIAL_EXAM_ROLES = Object.freeze({
  COMMON_HISTORY: 'common_history',
  COMMON_GEOGRAPHY: 'common_geography',
  COMMON_PHILOSOPHY: 'common_philosophy',
  STANDARD_RELIGION: 'standard_religion',
  ALTERNATE_PHILOSOPHY: 'alternate_philosophy',
})

const QUESTION_RANGES = Object.freeze([
  { start: 1, end: 5, category: 'tarih', examRole: TYT_SOCIAL_EXAM_ROLES.COMMON_HISTORY },
  { start: 6, end: 10, category: 'cografya', examRole: TYT_SOCIAL_EXAM_ROLES.COMMON_GEOGRAPHY },
  { start: 11, end: 15, category: 'felsefe', examRole: TYT_SOCIAL_EXAM_ROLES.COMMON_PHILOSOPHY },
  { start: 16, end: 20, category: 'din_kulturu', examRole: TYT_SOCIAL_EXAM_ROLES.STANDARD_RELIGION },
  { start: 21, end: 25, category: 'felsefe', examRole: TYT_SOCIAL_EXAM_ROLES.ALTERNATE_PHILOSOPHY },
])

/**
 * Map the official TYT Social booklet position to two independent facts:
 * content taxonomy (`category`) and candidate-dependent booklet role
 * (`examRole`). The latter must never be encoded by mutating the category.
 */
export function classifyTytSocialQuestion(questionNumber) {
  if (!Number.isInteger(questionNumber)) return null
  const range = QUESTION_RANGES.find(({ start, end }) => questionNumber >= start && questionNumber <= end)
  return range ? { category: range.category, examRole: range.examRole } : null
}
