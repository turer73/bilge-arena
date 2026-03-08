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
    description: 'Sayilar, problemler, geometri, denklemler ve daha fazlasi',
    color: 'focus',
    colorHex: '#2563EB',
    icon: 'calculator',
    categories: ['sayilar', 'problemler', 'geometri', 'denklemler', 'fonksiyonlar', 'olasilik'],
  },
  turkce: {
    slug: 'turkce',
    name: 'Turkce',
    description: 'Paragraf, dil bilgisi, sozcuk ve anlam',
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
    description: 'Tarih, cografya ve felsefe',
    color: 'wisdom',
    colorHex: '#7C3AED',
    icon: 'globe',
    categories: ['tarih', 'cografya', 'felsefe'],
  },
  wordquest: {
    slug: 'wordquest',
    name: 'Ingilizce',
    description: 'Vocabulary, grammar ve reading',
    color: 'focus',
    colorHex: '#3B82F6',
    icon: 'languages',
    categories: ['vocabulary', 'grammar', 'cloze_test', 'dialogue', 'restatement', 'sentence_completion', 'phrasal_verbs'],
  },
} as const

export const GAME_LIST = Object.values(GAMES)

export const GAME_SLUGS = Object.keys(GAMES) as GameSlug[]
