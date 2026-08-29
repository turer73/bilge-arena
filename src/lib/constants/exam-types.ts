import { GAME_LIST, type GameDefinition, type GameSlug } from './games'

/**
 * Sınav türü — YKS (üniversite) vs LGS (lise).
 * Profilde kalıcı tercih (profiles.exam_type); içeriği (oyun listesi + soru
 * exam_ref default'u) buna göre filtreler. null = belirlenmemiş -> YKS-default
 * (geriye uyumlu: mevcut kullanıcılar tüm içeriği görmeye devam eder).
 */
export type ExamType = 'yks' | 'lgs'

export const EXAM_TYPES: ExamType[] = ['yks', 'lgs']

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  yks: 'YKS — Üniversite',
  lgs: 'LGS — Lise',
}

export const EXAM_TYPE_SHORT: Record<ExamType, string> = {
  yks: 'YKS',
  lgs: 'LGS',
}

/** Sınav türünün kapsadığı exam_ref'ler (oyun examTags eşleşmesi için). */
const EXAM_REFS: Record<ExamType, readonly string[]> = {
  yks: ['TYT', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT'],
  lgs: ['LGS'],
}

/**
 * Soru çekiminde kullanılacak DEFAULT exam_ref (MVP eşlemesi):
 *   YKS -> TYT, LGS -> LGS. (Oyun-içi seçici ile değiştirilebilir.)
 */
export const DEFAULT_EXAM_REF: Record<ExamType, string> = {
  yks: 'TYT',
  lgs: 'LGS',
}

function isExamType(v: unknown): v is ExamType {
  return v === 'yks' || v === 'lgs'
}

/**
 * Verilen sınav türüne ait oyunlar (examTags kesişimi).
 * null/geçersiz -> tüm oyunlar (belirlenmemiş = YKS-default geriye uyum).
 * Örn: LGS -> matematik/türkçe/fen/sosyal (İngilizce YDT-only, LGS'de yok).
 */
export function gamesForExamType(examType: ExamType | null | undefined): GameDefinition[] {
  if (!isExamType(examType)) return GAME_LIST
  const refs = EXAM_REFS[examType]
  return GAME_LIST.filter((g) => g.examTags.some((t) => refs.includes(t)))
}

/**
 * Soru çekimi için default exam_ref. null/geçersiz -> null (filtresiz / 'all').
 */
export function defaultExamRefForType(examType: ExamType | null | undefined): string | null {
  return isExamType(examType) ? DEFAULT_EXAM_REF[examType] : null
}

/**
 * Soru bankasi kapsami ile kullanicinin paylasilan sinav tercihini ayirir.
 * Wordquest sorulari exam_ref=NULL saklandigi icin isteklerde filtre gondermez;
 * diger dersler kullanicinin secimini aynen korur.
 */
export function questionExamRefForGame(
  game: GameSlug,
  examRef: string | null | undefined,
): string | null {
  return game === 'wordquest' ? null : examRef ?? null
}

/** Profil turu degistiginde sakli kalan exam_ref'i dogrulamak icin izinli kapsam. */
export function examRefsForType(examType: ExamType): readonly string[] {
  return EXAM_REFS[examType]
}
