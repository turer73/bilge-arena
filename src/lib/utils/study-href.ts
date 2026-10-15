import { GAMES, type GameSlug } from '@/lib/constants/games'

/** A study link carries its context even in a fresh tab; WordQuest stays exam-independent. */
export function studyHref(game: GameSlug, examRef: string | null, category?: string | null) {
  const params = new URLSearchParams()
  if (game !== 'wordquest' && examRef && GAMES[game].examTags.includes(examRef)) {
    params.set('exam_ref', examRef)
  }
  if (category) params.set('category', category)
  return `/arena/${game}${params.size ? `?${params}` : ''}`
}
