export type GameSlug = 'matematik' | 'turkce' | 'fen' | 'sosyal' | 'wordquest'

export interface GameDefinition {
  slug: GameSlug
  name: string
  description: string
  color: string        // Tailwind CSS variable key
  colorHex: string     // Dogrudan hex (gradient/fallback icin)
  icon: string         // Lucide icon adi
  categories: string[]
}

export const GAMES: Record<GameSlug, GameDefinition> = {
  matematik: {
    slug: 'matematik',
    name: 'Matematik',
    description: 'Sayılar, problemler, geometri, denklemler ve daha fazlası',
    color: 'focus',
    colorHex: '#2563EB',
    icon: 'calculator',
    categories: ['sayilar', 'problemler', 'geometri', 'denklemler', 'fonksiyonlar', 'olasilik'],
  },
  turkce: {
    slug: 'turkce',
    name: 'Türkçe',
    description: 'Paragraf, dil bilgisi, sözcük ve anlam',
    color: 'reward',
    colorHex: '#D97706',
    icon: 'book-open',
    categories: ['paragraf', 'dil_bilgisi', 'sozcuk', 'anlam_bilgisi', 'yazim_kurallari'],
  },
  fen: {
    slug: 'fen',
    name: 'Fen Bilimleri',
    description: 'Fizik, kimya ve biyoloji',
    color: 'growth',
    colorHex: '#059669',
    icon: 'flask-conical',
    categories: ['fizik', 'kimya', 'biyoloji'],
  },
  sosyal: {
    slug: 'sosyal',
    name: 'Sosyal Bilimler',
    description: 'Tarih, coğrafya ve felsefe',
    color: 'wisdom',
    colorHex: '#7C3AED',
    icon: 'globe',
    categories: ['tarih', 'cografya', 'felsefe'],
  },
  wordquest: {
    slug: 'wordquest',
    name: 'İngilizce',
    description: 'Vocabulary, grammar ve reading',
    color: 'focus',
    colorHex: '#3B82F6',
    icon: 'languages',
    categories: ['vocabulary', 'grammar', 'cloze_test', 'dialogue', 'restatement', 'sentence_completion', 'phrasal_verbs'],
  },
} as const

export const GAME_LIST = Object.values(GAMES)

export const GAME_SLUGS = Object.keys(GAMES) as GameSlug[]

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
  // fen
  fizik: 'Fizik',
  kimya: 'Kimya',
  biyoloji: 'Biyoloji',
  // sosyal
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  felsefe: 'Felsefe',
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
