export type GameSlug = 'matematik' | 'turkce' | 'fen' | 'sosyal' | 'wordquest'

export interface GameDefinition {
  slug: GameSlug
  name: string
  description: string
  color: string        // Tailwind CSS variable key
  colorHex: string     // Dogrudan hex (gradient/fallback icin)
  icon: string         // Lucide icon adi
  categories: string[]
  /** Hangi sınav(lar)a kaynaklık ediyor — lobby filtre etiketleriyle eşleşmeli */
  examTags: string[]
}

export const GAMES: Record<GameSlug, GameDefinition> = {
  matematik: {
    slug: 'matematik',
    name: 'Matematik',
    description: 'Sayılar, problemler, geometri, denklemler, fonksiyonlar, türev ve integral',
    color: 'focus',
    colorHex: '#2563EB',
    icon: 'calculator',
    categories: ['sayilar', 'problemler', 'geometri', 'denklemler', 'fonksiyonlar', 'olasilik'],
    examTags: ['TYT', 'AYT-SAY', 'AYT-EA', 'LGS'],
  },
  turkce: {
    slug: 'turkce',
    name: 'Türkçe',
    description: 'Paragraf, dil bilgisi, edebiyat, sözcük ve anlam bilgisi',
    color: 'reward',
    colorHex: '#D97706',
    icon: 'book-open',
    categories: ['paragraf', 'dil_bilgisi', 'sozcuk', 'anlam_bilgisi', 'yazim_kurallari', 'edebiyat'],
    examTags: ['TYT', 'AYT-EA', 'AYT-SOZ', 'LGS'],
  },
  fen: {
    slug: 'fen',
    name: 'Fen Bilimleri',
    description: 'Fizik, kimya ve biyoloji — TYT temelinden AYT Sayısal düzeyine',
    color: 'growth',
    colorHex: '#059669',
    icon: 'flask-conical',
    categories: ['fizik', 'kimya', 'biyoloji'],
    examTags: ['TYT', 'AYT-SAY', 'LGS'],
  },
  sosyal: {
    slug: 'sosyal',
    name: 'Sosyal Bilimler',
    description: 'Tarih, coğrafya, felsefe, sosyoloji ve din kültürü',
    color: 'wisdom',
    colorHex: '#7C3AED',
    icon: 'globe',
    categories: ['tarih', 'cografya', 'felsefe', 'sosyoloji', 'din_kulturu'],
    examTags: ['TYT', 'AYT-SOZ', 'LGS'],
  },
  wordquest: {
    slug: 'wordquest',
    name: 'İngilizce',
    description: 'Vocabulary, grammar ve reading — YDT İngilizce hazırlık',
    color: 'focus',
    colorHex: '#3B82F6',
    icon: 'languages',
    categories: ['vocabulary', 'grammar', 'cloze_test', 'dialogue', 'restatement', 'sentence_completion', 'phrasal_verbs'],
    examTags: ['YDT'],
  },
} as const

export const GAME_LIST = Object.values(GAMES)

export const GAME_SLUGS = Object.keys(GAMES) as GameSlug[]

const EXAM_CATEGORY_OVERRIDES: Partial<Record<GameSlug, Record<string, readonly string[]>>> = {
  // TYT Türkçe v2 intentionally excludes the AYT literature leaf. Keep the
  // global game catalogue broad because the same game also serves AYT-EA/SOZ.
  turkce: {
    TYT: ['paragraf', 'dil_bilgisi', 'sozcuk', 'anlam_bilgisi', 'yazim_kurallari'],
    LGS: ['paragraf', 'dil_bilgisi', 'sozcuk', 'anlam_bilgisi', 'yazim_kurallari'],
  },
  // LGS Sosyal yüzeyi kanonikleştirilmiş İnkılap Tarihi ve Din Kültürü
  // bankalarından oluşur. TYT/AYT felsefe-coğrafya-sosyoloji yapraklarını
  // LGS filtresinde sunmak boş veya sınav dışı seçim üretir.
  sosyal: {
    LGS: ['tarih', 'din_kulturu'],
  },
}

/** Return the canonical categories that are valid for one exact exam scope. */
export function getCategoriesForExam(game: GameSlug, examRef: string | null | undefined): readonly string[] {
  const normalizedExamRef = examRef?.trim().toUpperCase()
  if (!normalizedExamRef) return GAMES[game].categories
  return EXAM_CATEGORY_OVERRIDES[game]?.[normalizedExamRef] ?? GAMES[game].categories
}

/** Normalize explicit legacy request aliases before they reach database filters. */
export function normalizeCategoryAlias(game: GameSlug, category: string | null): string | null {
  if (game === 'sosyal' && category === 'din') return 'din_kulturu'
  return category
}

/**
 * DB slug'lari ASCII (URL-safe, stable). Display icin Turkce karakterlerle map.
 * Yeni kategori eklenirse buraya da eklenmeli — yoksa fallback ASCII gosterir.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  // matematik
  sayilar: 'Sayılar',
  problemler: 'Problemler',
  geometri: 'Geometri',
  denklemler: 'Denklemler',
  fonksiyonlar: 'Fonksiyonlar',
  olasilik: 'Olasılık',
  // turkce
  paragraf: 'Paragraf',
  dil_bilgisi: 'Dil Bilgisi',
  sozcuk: 'Sözcük',
  anlam_bilgisi: 'Anlam Bilgisi',
  yazim_kurallari: 'Yazım Kuralları',
  edebiyat: 'Edebiyat',
  // fen
  fizik: 'Fizik',
  kimya: 'Kimya',
  biyoloji: 'Biyoloji',
  // sosyal
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  felsefe: 'Felsefe',
  sosyoloji: 'Sosyoloji',
  din_kulturu: 'Din Kültürü',
  // ingilizce — orijinal terimler korundu (pedagojik)
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  cloze_test: 'Cloze Test',
  dialogue: 'Dialogue',
  restatement: 'Restatement',
  sentence_completion: 'Sentence Completion',
  phrasal_verbs: 'Phrasal Verbs',
}

/** Slug'i Turkce display'e cevir. Bulamazsa eski fallback (capitalize + underscore to space). */
export function getCategoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? (slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, ' '))
}
